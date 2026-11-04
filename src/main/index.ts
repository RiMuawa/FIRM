import { app, BrowserWindow, Menu, ipcMain, safeStorage, shell } from 'electron'
import { readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  FofaAiQueryResponse,
  FofaKeyStatus,
  FofaKeyValidation,
  FofaSearchRequest,
  FofaSearchResponse,
  FofaStatsRequest,
  FofaStatsResponse
} from '../shared/types'

const DOCUMENTATION_URL = 'https://www.electronjs.org/docs/latest/'
const FOFA_WEB_URL = 'https://fafaapi.info/fofa.html'
const FOFA_API_BASE = 'https://fafaapi.info'
const API_KEY_PATTERN = /^[a-fA-F0-9]{32}$/
const REQUEST_TIMEOUT_MS = 45_000
const BUSINESS_INTERVAL_MS = 3_100

type StoredKey = { format: 'safe' | 'plain'; data: string }
type JsonRecord = Record<string, unknown>

let businessQueue: Promise<void> = Promise.resolve()
let lastBusinessRequestAt = 0

function keyFilePath(): string {
  return join(app.getPath('userData'), 'fofa-api-key.json')
}

async function readStoredKey(): Promise<StoredKey | null> {
  try {
    const raw = await readFile(keyFilePath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<StoredKey>
    if ((parsed.format === 'safe' || parsed.format === 'plain') && typeof parsed.data === 'string') {
      return parsed as StoredKey
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') console.warn('[FOFA] 无法读取本地 Key：', error)
  }
  return null
}

async function resolveApiKey(): Promise<{ key: string; source: FofaKeyStatus['source']; encrypted: boolean }> {
  const envKey = process.env.FAFA_API_KEY?.trim()
  if (envKey && API_KEY_PATTERN.test(envKey)) {
    return { key: envKey, source: 'env', encrypted: false }
  }

  const stored = await readStoredKey()
  if (!stored) return { key: '', source: 'none', encrypted: false }

  let key = stored.data
  if (stored.format === 'safe') {
    try {
      key = safeStorage.decryptString(Buffer.from(stored.data, 'base64'))
    } catch (error) {
      console.warn('[FOFA] 本地 Key 解密失败：', error)
      return { key: '', source: 'none', encrypted: true }
    }
  }

  return { key, source: 'file', encrypted: stored.format === 'safe' }
}

async function getKeyStatus(): Promise<FofaKeyStatus> {
  const resolved = await resolveApiKey()
  return {
    configured: API_KEY_PATTERN.test(resolved.key),
    encrypted: resolved.encrypted,
    source: resolved.source
  }
}

async function saveApiKey(rawKey: string): Promise<FofaKeyStatus> {
  const key = rawKey.trim()
  if (!API_KEY_PATTERN.test(key)) {
    throw new Error('API Key 必须是 32 位十六进制字符串')
  }

  const canEncrypt = safeStorage.isEncryptionAvailable()
  const record: StoredKey = canEncrypt
    ? { format: 'safe', data: safeStorage.encryptString(key).toString('base64') }
    : { format: 'plain', data: key }

  await writeFile(keyFilePath(), JSON.stringify(record), { encoding: 'utf8', mode: 0o600 })
  return getKeyStatus()
}

async function clearApiKey(): Promise<void> {
  try {
    await unlink(keyFilePath())
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

function apiError(body: JsonRecord, fallback: string): Error {
  const message = typeof body.errmsg === 'string' ? body.errmsg : typeof body.message === 'string' ? body.message : fallback
  return new Error(message)
}

async function requestJson<T>(path: string, params?: URLSearchParams, init?: RequestInit): Promise<T> {
  const url = new URL(path, FOFA_API_BASE)
  if (params) url.search = params.toString()

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let response: Response

  try {
    response = await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new Error(`第三方 API 请求超时（${REQUEST_TIMEOUT_MS / 1000} 秒）`)
    }
    throw new Error(`无法连接第三方 API：${(error as Error).message}`)
  } finally {
    clearTimeout(timeout)
  }

  const text = await response.text()
  let body: JsonRecord

  try {
    body = JSON.parse(text) as JsonRecord
  } catch {
    throw new Error(`HTTP ${response.status}：接口返回的不是 JSON（${text.slice(0, 180)}）`)
  }

  if (!response.ok) throw apiError(body, `HTTP ${response.status}`)
  if (body.error === true) throw apiError(body, 'FOFA API 业务错误')
  return body as T
}

async function requireApiKey(): Promise<string> {
  const { key } = await resolveApiKey()
  if (!API_KEY_PATTERN.test(key)) {
    throw new Error('尚未配置第三方 FOFA API Key，请先在设置中保存并验证')
  }
  return key
}

function enqueueBusinessRequest<T>(task: () => Promise<T>): Promise<T> {
  const run = businessQueue.then(async () => {
    const waitMs = Math.max(0, BUSINESS_INTERVAL_MS - (Date.now() - lastBusinessRequestAt))
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs))
    lastBusinessRequestAt = Date.now()
    return task()
  })

  businessQueue = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

function b64(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64')
}

async function validateFofaKey(): Promise<FofaKeyValidation> {
  let key: string
  try {
    key = await requireApiKey()
  } catch (error) {
    return { valid: false, message: (error as Error).message }
  }

  const data = await requestJson<FofaKeyValidation & { errmsg?: string }>(
    '/fofaapi/v1/validate-key',
    new URLSearchParams({ key })
  )

  if (!data.valid) {
    return { valid: false, message: data.message || data.errmsg || 'Key 无效或已过期' }
  }

  return data
}

async function searchFofa(request: FofaSearchRequest): Promise<FofaSearchResponse> {
  const query = request.query.trim()
  if (!query) throw new Error('搜索语句不能为空')

  return enqueueBusinessRequest(async () => {
    const key = await requireApiKey()
    const page = Math.max(1, Math.trunc(request.page || 1))
    const size = Math.min(200, Math.max(1, Math.trunc(request.size || 50)))
    const params = new URLSearchParams({
      key,
      queryStr: b64(query),
      fields:
        'ip,port,protocol,country_name,title,link,server,product,product_category,domain,org,lastupdatetime',
      page: String(page),
      size: String(size),
      route: '1',
      full: 'false'
    })
    return requestJson<FofaSearchResponse>('/fofaapi', params)
  })
}

async function getFofaStats(request: FofaStatsRequest): Promise<FofaStatsResponse> {
  const query = request.query.trim()
  if (!query) throw new Error('统计语句不能为空')

  return enqueueBusinessRequest(async () => {
    const key = await requireApiKey()
    const fields = request.fields?.length ? request.fields : ['country', 'port', 'server', 'protocol', 'title']
    const params = new URLSearchParams({
      key,
      q: b64(query),
      fields: fields.join(','),
      route: '1'
    })
    return requestJson<FofaStatsResponse>('/fofaapi/stats', params)
  })
}

async function generateFofaQuery(question: string): Promise<FofaAiQueryResponse> {
  const trimmed = question.trim()
  if (!trimmed) throw new Error('请先描述要查询的资产')
  if (trimmed.length > 200) throw new Error('自然语言描述不能超过 200 个字符')

  return enqueueBusinessRequest(async () => {
    const key = await requireApiKey()
    return requestJson<FofaAiQueryResponse>('/fofaapi/ai/query', undefined, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ key, question: trimmed }).toString()
    })
  })
}

function registerIpcHandlers(): void {
  ipcMain.handle('app:get-info', () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  }))

  ipcMain.handle('shell:open-docs', async () => {
    await shell.openExternal(DOCUMENTATION_URL)
  })

  ipcMain.handle('shell:open-external', async (_event, url: string) => {
    if (!/^https?:\/\//i.test(url)) throw new Error('仅允许打开 HTTP/HTTPS 链接')
    await shell.openExternal(url)
  })

  ipcMain.handle('shell:open-fofa-provider', async () => {
    await shell.openExternal(FOFA_WEB_URL)
  })

  ipcMain.handle('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.handle('window:toggle-maximize', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return false
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
    return window.isMaximized()
  })

  ipcMain.handle('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  ipcMain.handle('fofa:key-status', () => getKeyStatus())
  ipcMain.handle('fofa:key-save', (_event, key: string) => saveApiKey(key))
  ipcMain.handle('fofa:key-clear', () => clearApiKey())
  ipcMain.handle('fofa:key-validate', () => validateFofaKey())
  ipcMain.handle('fofa:search', (_event, request: FofaSearchRequest) => searchFofa(request))
  ipcMain.handle('fofa:stats', (_event, request: FofaStatsRequest) => getFofaStats(request))
  ipcMain.handle('fofa:ai-query', (_event, question: string) => generateFofaQuery(question))
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    frame: false,
    backgroundColor: '#090d14',
    title: 'IoT Worktable',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.setName('IoT Worktable')

void app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  app.setAppUserModelId('com.iot.worktable')
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event, webPreferences, params) => {
    delete webPreferences.preload
    webPreferences.nodeIntegration = false
    webPreferences.contextIsolation = true
    webPreferences.sandbox = true
    webPreferences.webSecurity = true
    webPreferences.allowRunningInsecureContent = false

    if (params.src !== 'about:blank' && !/^https?:\/\//i.test(params.src)) {
      event.preventDefault()
    }
  })

  if (contents.getType() === 'webview') {
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })

    contents.on('will-navigate', (event, url) => {
      if (!/^https?:\/\//i.test(url)) event.preventDefault()
    })
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

