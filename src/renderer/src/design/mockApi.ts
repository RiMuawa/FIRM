import type {
  AppInfo,
  ElectronAPI,
  FofaDataSourceStatus,
  FofaProvider,
  FofaProviderStatus,
  FofaKeyValidation,
  FofaSearchResponse,
  UsageDayStats,
  UsageStatsSnapshot
} from '../../../shared/types'
import { buildDemoRecords, initialUsage } from './demoData'

/**
 * window.electronAPI 的浏览器 mock：完整实现 16 个方法，行为对齐主进程
 * （错误抛中文 Error、validateFofaKey 永不抛、searchFofa 按 provider 成形等）。
 * 窗口系与外链系调用会向 bus 广播 toast，由检视器负责展示。
 */

export type SearchOverride = null | 'empty' | 'loading' | 'error'

/** 检视器「状态切换器」的控制面 */
export const mockControls: { searchOverride: SearchOverride } = {
  searchOverride: null
}

/** mock 层 → 检视器 的事件总线（目前只有 toast） */
export const bus = new EventTarget()

function emitToast(text: string, tone: 'ok' | 'warn' | 'error' = 'ok'): void {
  bus.dispatchEvent(new CustomEvent('des-toast', { detail: { text, tone } }))
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function localDate(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

// ---- 内部可变状态 ----------------------------------------------------------

const demoRecords = buildDemoRecords()

const relayQuota = { todayRemaining: 180, totalRemaining: 2400 }
const officialQuota = { remainFreePoint: 8000, fofaPoint: 0 }

const fofaStore: FofaDataSourceStatus = {
  active: 'relay',
  relay: { configured: true, encrypted: true, source: 'file' },
  official: { configured: true, encrypted: true, source: 'file', emailConfigured: true }
}

const usageStore = initialUsage()

const windowStore = { bounds: { x: 120, y: 80, width: 1440, height: 860 }, maximized: false }

function unconfigured(): FofaProviderStatus {
  return { configured: false, encrypted: false, source: 'none' }
}

function recordUsage(kind: 'search' | 'searchFailed', count: number): void {
  const today = usageStore.today
  if (kind === 'search') {
    today.searches += 1
    today.records += count
    usageStore.totalSearches += 1
    usageStore.totalRecords += count
  } else {
    today.failedSearches += 1
  }
}

function usageSnapshot(): UsageStatsSnapshot {
  const recent: UsageDayStats[] = usageStore.recent.map((day, index, all) =>
    index === all.length - 1 ? { date: localDate(), ...todayNumbers() } : { ...day })
  const today = { date: localDate(), ...todayNumbers() }
  return {
    today,
    recent,
    totalSearches: usageStore.totalSearches,
    totalRecords: usageStore.totalRecords,
    trackedDays: usageStore.trackedDays
  }
}

function todayNumbers(): Omit<UsageDayStats, 'date'> {
  return {
    searches: usageStore.today.searches,
    failedSearches: usageStore.today.failedSearches,
    records: usageStore.today.records
  }
}

// ---- ElectronAPI mock -----------------------------------------------------

const mockApi: ElectronAPI = {
  async getAppInfo(): Promise<AppInfo> {
    return { name: 'IoT Worktable', version: '0.1.0', platform: 'win32', arch: 'x64', electron: '45.2.2', chrome: '140.0.7339', node: '22.12.0' }
  },
  async openDocumentation(): Promise<void> {
    emitToast('复刻页：外部文档已拦截（openDocumentation）', 'warn')
  },
  async openExternal(url: string): Promise<void> {
    if (!/^https?:\/\//i.test(url)) throw new Error('仅允许打开 HTTP/HTTPS 链接')
    emitToast(`复刻页：外部链接已拦截 → ${url}`, 'warn')
  },
  async minimizeWindow(): Promise<void> {
    emitToast('复刻页：窗口控制已拦截（最小化）', 'warn')
  },
  async getWindowBounds(): Promise<{ x: number; y: number; width: number; height: number }> {
    return { ...windowStore.bounds }
  },
  async setWindowPosition(x: number, y: number): Promise<void> {
    windowStore.bounds.x = x
    windowStore.bounds.y = y
  },
  async isWindowMaximized(): Promise<boolean> {
    return windowStore.maximized
  },
  async toggleMaximizeWindow(): Promise<boolean> {
    windowStore.maximized = !windowStore.maximized
    emitToast('复刻页：窗口控制已拦截（最大化切换）', 'warn')
    return windowStore.maximized
  },
  async closeWindow(): Promise<void> {
    emitToast('复刻页：窗口控制已拦截（关闭）', 'warn')
  },
  async getFofaStatus(): Promise<FofaDataSourceStatus> {
    return clone(fofaStore)
  },
  async setActiveFofaProvider(provider: FofaProvider): Promise<FofaDataSourceStatus> {
    fofaStore.active = provider
    return clone(fofaStore)
  },
  async saveFofaKey(provider: FofaProvider, key: string, email?: string): Promise<FofaDataSourceStatus> {
    if (!/^[0-9a-fA-F]{32}$/.test(key)) throw new Error('API Key 必须为 32 位十六进制字符串')
    if (provider === 'official' && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('账号邮箱格式不正确')
    fofaStore[provider] = { configured: true, encrypted: true, source: 'file', emailConfigured: provider === 'official' ? Boolean(email) : undefined }
    return clone(fofaStore)
  },
  async clearFofaKey(provider: FofaProvider): Promise<FofaDataSourceStatus> {
    fofaStore[provider] = unconfigured()
    return clone(fofaStore)
  },
  async validateFofaKey(provider?: FofaProvider): Promise<FofaKeyValidation> {
    const target = provider ?? fofaStore.active
    if (!fofaStore[target].configured) {
      return { valid: false, provider: target, message: '未配置 API Key，请先保存后再验证。' }
    }
    if (target === 'official') {
      return {
        valid: true,
        provider: 'official',
        username: 'demo@iot-worktable.cn',
        isvip: true,
        vipLevel: 3,
        remainFreePoint: officialQuota.remainFreePoint,
        fofaPoint: officialQuota.fofaPoint,
        remainApiQuery: -1,
        remainApiData: -1,
        expiration: '2027-06-30'
      }
    }
    return {
      valid: true,
      provider: 'relay',
      firstUsedAt: '2026-07-12',
      expireTime: '2027-07-12',
      todayRemaining: relayQuota.todayRemaining,
      totalRemaining: relayQuota.totalRemaining
    }
  },
  async searchFofa(request: { query: string; page?: number; size?: number; provider?: FofaProvider }): Promise<FofaSearchResponse> {
    const provider = request.provider ?? fofaStore.active
    if (!request.query.trim()) throw new Error('搜索语句不能为空')
    if (!fofaStore[provider].configured) throw new Error('请先在设置中配置该数据源的 API Key')
    if (mockControls.searchOverride === 'error') {
      recordUsage('searchFailed', 0)
      throw new Error('模拟错误：上游接口返回 403 Forbidden（设计复刻页强制错误状态）')
    }
    if (mockControls.searchOverride === 'loading') {
      return new Promise<FofaSearchResponse>(() => { /* 状态切换器：挂起展示 loading 态 */ })
    }
    await delay(900)
    const page = Math.max(1, request.page ?? 1)
    const size = Math.min(200, Math.max(1, request.size ?? 50))
    const slice = mockControls.searchOverride === 'empty'
      ? []
      : demoRecords.slice((page - 1) * size, page * size)
    recordUsage('search', slice.length)
    const total = mockControls.searchOverride === 'empty' ? 0 : demoRecords.length
    if (provider === 'official') {
      return {
        provider: 'official',
        finalResults: clone(slice),
        total,
        size,
        remainFreePoint: officialQuota.remainFreePoint,
        fofaPoint: officialQuota.fofaPoint
      }
    }
    relayQuota.todayRemaining = Math.max(0, relayQuota.todayRemaining - 1)
    relayQuota.totalRemaining = Math.max(0, relayQuota.totalRemaining - 1)
    return {
      provider: 'relay',
      data: clone(slice),
      total,
      size,
      newTodayRemaining: relayQuota.todayRemaining,
      newTotalRemaining: relayQuota.totalRemaining
    }
  },
  async getUsageStats(): Promise<UsageStatsSnapshot> {
    return usageSnapshot()
  }
}

export function installMockApi(): void {
  window.electronAPI = mockApi
}
