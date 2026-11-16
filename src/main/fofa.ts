import { app, ipcMain, safeStorage } from 'electron'
import { readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  FofaDataSourceStatus,
  FofaKeyValidation,
  FofaProvider,
  FofaProviderStatus,
  FofaSearchRequest,
  FofaSearchResponse
} from '../shared/types'
import { recordUsage } from './stats'

const RELAY_API_BASE = 'https://fafaapi.info'
const OFFICIAL_API_BASE = 'https://fofa.info'
const API_KEY_PATTERN = /^[a-fA-F0-9]{32}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const REQUEST_TIMEOUT_MS = 45_000
/** 中转服务端约 3 秒限流；官方接口约 1 QPS */
const PROVIDER_INTERVAL_MS: Record<FofaProvider, number> = { relay: 3_100, official: 1_200 }
const PROVIDER_SIZE_CAP: Record<FofaProvider, number> = { relay: 200, official: 10_000 }
/** 与渲染层 recordsFromResponse 消费的字段保持一致 */
const SEARCH_FIELDS =
  'ip,port,protocol,country_name,title,link,server,product,product_category,domain,org,lastupdatetime'
const SEARCH_FIELD_NAMES = SEARCH_FIELDS.split(',')

type StoredCredential = { format: 'safe' | 'plain'; data: string; email?: string }
type ProviderStore = { active: FofaProvider; relay?: StoredCredential; official?: StoredCredential }
type ResolvedCredential = { key: string; email: string; source: FofaProviderStatus['source']; encrypted: boolean }
type JsonRecord = Record<string, unknown>

/** 官方 /api/v1/search/all 原始响应：results 是按 fields 顺序的数组行 */
type OfficialSearchRaw = { error?: boolean; errmsg?: string; size?: number; page?: number; results?: unknown[][] }
/** 官方 /api/v1/info/my 原始响应 */
type OfficialAccountRaw = {
  error?: boolean
  errmsg?: string
  username?: string
  isvip?: boolean
  vip_level?: number
  fofa_point?: number
  remain_free_point?: number
  remain_api_query?: number
  remain_api_data?: number
  expiration?: string
}

let businessQueue: Promise<void> = Promise.resolve()
const lastBusinessRequestAt: Record<FofaProvider, number> = { relay: 0, official: 0 }

function storeFilePath(): string {
  return join(app.getPath('userData'), 'fofa-providers.json')
}

function legacyKeyFilePath(): string {
  return join(app.getPath('userData'), 'fofa-api-key.json')
}

function isProvider(value: unknown): value is FofaProvider {
  return value === 'official' || value === 'relay'
}

function parseCredential(raw: unknown): StoredCredential | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Partial<StoredCredential>
  if ((record.format === 'safe' || record.format === 'plain') && typeof record.data === 'string') {
    return { format: record.format, data: record.data, email: typeof record.email === 'string' ? record.email : undefined }
  }
  return null
}

async function readStore(): Promise<ProviderStore> {
  try {
    const raw = await readFile(storeFilePath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<ProviderStore>
    const relay = parseCredential(parsed.relay)
    const official = parseCredential(parsed.official)
    return { active: isProvider(parsed.active) ? parsed.active : 'relay', relay: relay ?? undefined, official: official ?? undefined }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('[FOFA] 无法读取数据源配置：', error)
  }

  // 旧版单 Key 文件迁移为中转数据源凭据
  try {
    const raw = await readFile(legacyKeyFilePath(), 'utf8')
    const legacy = parseCredential(JSON.parse(raw))
    if (legacy) {
      const migrated: ProviderStore = { active: 'relay', relay: legacy }
      await writeStore(migrated)
      await rename(legacyKeyFilePath(), `${legacyKeyFilePath()}.bak`).catch(() => unlink(legacyKeyFilePath()).catch(() => undefined))
      console.info('[FOFA] 已把旧版 Key 文件迁移为第三方中转数据源配置')
      return migrated
    }
  } catch {
    // 无旧文件，直接使用默认配置
  }

  return { active: 'relay' }
}

async function writeStore(store: ProviderStore): Promise<void> {
  await writeFile(storeFilePath(), JSON.stringify(store), { encoding: 'utf8', mode: 0o600 })
}

function decryptCredential(stored: StoredCredential): { key: string; encrypted: boolean } {
  if (stored.format !== 'safe') return { key: stored.data, encrypted: false }
  try {
    return { key: safeStorage.decryptString(Buffer.from(stored.data, 'base64')), encrypted: true }
  } catch (error) {
    console.warn('[FOFA] 本地 Key 解密失败：', error)
    return { key: '', encrypted: true }
  }
}

async function resolveCredential(provider: FofaProvider): Promise<ResolvedCredential> {
  const trimmedEmail = process.env.FOFA_EMAIL?.trim() || ''

  if (provider === 'official') {
    const envKey = process.env.FOFA_API_KEY?.trim()
    if (envKey && API_KEY_PATTERN.test(envKey)) {
      return { key: envKey, email: EMAIL_PATTERN.test(trimmedEmail) ? trimmedEmail : '', source: 'env', encrypted: false }
    }
  } else {
    const envKey = process.env.FAFA_API_KEY?.trim()
    if (envKey && API_KEY_PATTERN.test(envKey)) {
      return { key: envKey, email: '', source: 'env', encrypted: false }
    }
  }

  const store = await readStore()
  const stored = provider === 'official' ? store.official : store.relay
  if (!stored) return { key: '', email: '', source: 'none', encrypted: false }

  const { key, encrypted } = decryptCredential(stored)
  return { key, email: stored.email?.trim() || '', source: 'file', encrypted }
}

async function providerStatus(provider: FofaProvider): Promise<FofaProviderStatus> {
  const resolved = await resolveCredential(provider)
  return {
    configured: API_KEY_PATTERN.test(resolved.key),
    encrypted: resolved.encrypted,
    source: resolved.source,
    ...(provider === 'official' ? { emailConfigured: Boolean(resolved.email) } : {})
  }
}

async function getStatus(): Promise<FofaDataSourceStatus> {
  const [store, relay, official] = await Promise.all([readStore(), providerStatus('relay'), providerStatus('official')])
  return { active: store.active, relay, official }
}

async function setActiveProvider(provider: FofaProvider): Promise<FofaDataSourceStatus> {
  const store = await readStore()
  await writeStore({ ...store, active: provider })
  return getStatus()
}

async function saveCredential(provider: FofaProvider, rawKey: string, rawEmail?: string): Promise<FofaDataSourceStatus> {
  const key = rawKey.trim()
  if (!API_KEY_PATTERN.test(key)) throw new Error('API Key 必须是 32 位十六进制字符串')

  const email = provider === 'official' ? (rawEmail || '').trim() : ''
  if (email && !EMAIL_PATTERN.test(email)) throw new Error('邮箱格式不正确')

  const canEncrypt = safeStorage.isEncryptionAvailable()
  const record: StoredCredential = canEncrypt
    ? { format: 'safe', data: safeStorage.encryptString(key).toString('base64'), ...(email ? { email } : {}) }
    : { format: 'plain', data: key, ...(email ? { email } : {}) }

  const store = await readStore()
  await writeStore({ ...store, [provider]: record })
  return getStatus()
}

async function clearCredential(provider: FofaProvider): Promise<FofaDataSourceStatus> {
  const store = await readStore()
  const next: ProviderStore = { ...store }
  if (provider === 'official') delete next.official
  else delete next.relay
  await writeStore(next)
  return getStatus()
}

function apiError(body: JsonRecord, fallback: string): Error {
  const message = typeof body.errmsg === 'string' ? body.errmsg : typeof body.message === 'string' ? body.message : fallback
  return new Error(message)
}

async function requestJson<T>(baseUrl: string, path: string, params?: URLSearchParams, init?: RequestInit): Promise<T> {
  const url = new URL(path, baseUrl)
  if (params) url.search = params.toString()

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let response: Response

  try {
    response = await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new Error(`FOFA API 请求超时（${REQUEST_TIMEOUT_MS / 1000} 秒）`)
    }
    throw new Error(`无法连接 FOFA API：${(error as Error).message}`)
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

async function requireCredential(provider: FofaProvider): Promise<ResolvedCredential> {
  const resolved = await resolveCredential(provider)
  if (!API_KEY_PATTERN.test(resolved.key)) {
    throw new Error(
      provider === 'official'
        ? '尚未配置官方 FOFA API Key，请先在设置中保存并验证'
        : '尚未配置第三方中转 Key，请先在设置中保存并验证'
    )
  }
  return resolved
}

function enqueueBusinessRequest<T>(provider: FofaProvider, task: () => Promise<T>): Promise<T> {
  const run = businessQueue.then(async () => {
    const waitMs = Math.max(0, PROVIDER_INTERVAL_MS[provider] - (Date.now() - lastBusinessRequestAt[provider]))
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs))
    lastBusinessRequestAt[provider] = Date.now()
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

// ---------------------------------------------------------------------------
// 官方 API（fofa.info）：仅 Key 即可认证，email 可选；结果为数组行，需归一化
// ---------------------------------------------------------------------------

async function officialAccountInfo(credential: ResolvedCredential): Promise<OfficialAccountRaw> {
  const params = new URLSearchParams({ key: credential.key })
  if (credential.email) params.set('email', credential.email)
  return requestJson<OfficialAccountRaw>(OFFICIAL_API_BASE, '/api/v1/info/my', params)
}

async function validateOfficial(): Promise<FofaKeyValidation> {
  let credential: ResolvedCredential
  try {
    credential = await requireCredential('official')
  } catch (error) {
    return { valid: false, provider: 'official', message: (error as Error).message }
  }

  try {
    const info = await officialAccountInfo(credential)
    return {
      valid: true,
      provider: 'official',
      username: info.username,
      isvip: info.isvip,
      vipLevel: info.vip_level,
      remainFreePoint: info.remain_free_point,
      fofaPoint: info.fofa_point,
      remainApiQuery: info.remain_api_query,
      remainApiData: info.remain_api_data,
      expiration: info.expiration
    }
  } catch (error) {
    return { valid: false, provider: 'official', message: (error as Error).message }
  }
}

function normalizeOfficialSearch(data: OfficialSearchRaw): FofaSearchResponse {
  const rows = Array.isArray(data.results) ? data.results : []
  const finalResults = rows.map((row) => {
    const fields: Record<string, unknown> = {}
    SEARCH_FIELD_NAMES.forEach((field, index) => {
      fields[field] = Array.isArray(row) ? (row[index] ?? '') : ''
    })
    return { fields }
  })
  return {
    provider: 'official',
    finalResults,
    total: typeof data.size === 'number' ? data.size : finalResults.length,
    size: data.size
  }
}

async function searchOfficial(request: FofaSearchRequest): Promise<FofaSearchResponse> {
  const credential = await requireCredential('official')
  const page = Math.max(1, Math.trunc(request.page || 1))
  const size = Math.min(PROVIDER_SIZE_CAP.official, Math.max(1, Math.trunc(request.size || 50)))
  const params = new URLSearchParams({
    key: credential.key,
    qbase64: b64(request.query),
    size: String(size),
    page: String(page),
    fields: SEARCH_FIELDS,
    full: 'false'
  })
  if (credential.email) params.set('email', credential.email)

  const data = await requestJson<OfficialSearchRaw>(OFFICIAL_API_BASE, '/api/v1/search/all', params)
  const response = normalizeOfficialSearch(data)

  // 官方搜索响应不含余额，免费补一次账号信息（失败不影响结果）
  try {
    const info = await officialAccountInfo(credential)
    response.remainFreePoint = info.remain_free_point
    response.fofaPoint = info.fofa_point
  } catch {
    /* 忽略配额查询失败 */
  }

  return response
}

// ---------------------------------------------------------------------------
// 第三方中转（fafaapi.info）
// ---------------------------------------------------------------------------

async function validateRelay(): Promise<FofaKeyValidation> {
  let credential: ResolvedCredential
  try {
    credential = await requireCredential('relay')
  } catch (error) {
    return { valid: false, provider: 'relay', message: (error as Error).message }
  }

  try {
    const data = await requestJson<FofaKeyValidation & { errmsg?: string }>(
      RELAY_API_BASE,
      '/fofaapi/v1/validate-key',
      new URLSearchParams({ key: credential.key })
    )
    if (!data.valid) {
      return { valid: false, provider: 'relay', message: data.message || data.errmsg || 'Key 无效或已过期' }
    }
    return { ...data, provider: 'relay' }
  } catch (error) {
    return { valid: false, provider: 'relay', message: (error as Error).message }
  }
}

async function searchRelay(request: FofaSearchRequest): Promise<FofaSearchResponse> {
  const credential = await requireCredential('relay')
  const page = Math.max(1, Math.trunc(request.page || 1))
  const size = Math.min(PROVIDER_SIZE_CAP.relay, Math.max(1, Math.trunc(request.size || 50)))
  const params = new URLSearchParams({
    key: credential.key,
    queryStr: b64(request.query),
    fields: SEARCH_FIELDS,
    page: String(page),
    size: String(size),
    route: '1',
    full: 'false'
  })
  const data = await requestJson<FofaSearchResponse>(RELAY_API_BASE, '/fofaapi', params)
  return { ...data, provider: 'relay' }
}

// ---------------------------------------------------------------------------
// 对外业务入口
// ---------------------------------------------------------------------------

async function resolveActiveProvider(explicit?: FofaProvider): Promise<FofaProvider> {
  if (explicit === 'official' || explicit === 'relay') return explicit
  return (await readStore()).active
}

async function searchFofa(request: FofaSearchRequest): Promise<FofaSearchResponse> {
  const query = request.query.trim()
  if (!query) throw new Error('搜索语句不能为空')
  const provider = await resolveActiveProvider(request.provider)

  try {
    const response = await enqueueBusinessRequest(provider, () => (provider === 'official' ? searchOfficial({ ...request, query }) : searchRelay({ ...request, query })))
    recordUsage('search', response.finalResults?.length ?? response.data?.length ?? 0)
    return response
  } catch (error) {
    recordUsage('searchFailed')
    throw error
  }
}

export function registerFofaIpc(): void {
  ipcMain.handle('fofa:status', () => getStatus())
  ipcMain.handle('fofa:set-active-provider', (_event, provider: FofaProvider) => setActiveProvider(provider))
  ipcMain.handle('fofa:key-save', (_event, provider: FofaProvider, key: string, email?: string) =>
    saveCredential(provider, key, email)
  )
  ipcMain.handle('fofa:key-clear', (_event, provider: FofaProvider) => clearCredential(provider))
  ipcMain.handle('fofa:key-validate', async (_event, provider?: FofaProvider) => {
    const target = provider === 'official' || provider === 'relay' ? provider : await resolveActiveProvider()
    return target === 'official' ? validateOfficial() : validateRelay()
  })
  ipcMain.handle('fofa:search', (_event, request: FofaSearchRequest) => searchFofa(request))
}
