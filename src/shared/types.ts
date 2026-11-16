export interface AppInfo {
  name: string
  version: string
  platform: string
  arch: string
  electron: string
  chrome: string
  node: string
}

/** FOFA 数据源：官方 API 或第三方中转 */
export type FofaProvider = 'official' | 'relay'

export interface FofaProviderStatus {
  configured: boolean
  encrypted: boolean
  source: 'file' | 'env' | 'none'
  /** 仅官方数据源：是否配置了邮箱 */
  emailConfigured?: boolean
}

export interface FofaDataSourceStatus {
  active: FofaProvider
  relay: FofaProviderStatus
  official: FofaProviderStatus
}

export interface FofaKeyValidation {
  valid: boolean
  provider: FofaProvider
  message?: string
  // 中转数据源字段
  firstUsedAt?: string
  expireTime?: string
  todayRemaining?: number
  totalRemaining?: number
  // 官方数据源字段
  username?: string
  isvip?: boolean
  vipLevel?: number
  remainFreePoint?: number
  fofaPoint?: number
  /** -1 表示不限制 */
  remainApiQuery?: number
  remainApiData?: number
  expiration?: string
}

export interface FofaQuota {
  /** 中转：调用后当天剩余次数 */
  newTodayRemaining?: number
  /** 中转：调用后总剩余次数 */
  newTotalRemaining?: number
  /** 官方：剩余免费 F 点 */
  remainFreePoint?: number
  /** 官方：剩余 F 点 */
  fofaPoint?: number
}

export interface FofaSearchRequest {
  /** 不传时使用当前启用的数据源 */
  provider?: FofaProvider
  query: string
  page?: number
  size?: number
}

export interface FofaResultItem {
  fields: Record<string, unknown>
}

export interface FofaSearchResponse extends FofaQuota {
  provider?: FofaProvider
  finalResults?: FofaResultItem[]
  data?: FofaResultItem[]
  total?: number
  size?: number
  error?: boolean
  errmsg?: string | null
}

/** 单日使用统计（date 为本地时区 YYYY-MM-DD） */
export interface UsageDayStats {
  date: string
  /** 成功的 FOFA 搜索次数 */
  searches: number
  /** 失败的搜索次数 */
  failedSearches: number
  /** 累计拉取的数据条数 */
  records: number
}

export interface UsageStatsSnapshot {
  today: UsageDayStats
  /** 最近 14 天（含今天，空档补零） */
  recent: UsageDayStats[]
  totalSearches: number
  totalRecords: number
  /** 已累计记录的天数 */
  trackedDays: number
}

export interface ElectronAPI {
  getAppInfo: () => Promise<AppInfo>
  openDocumentation: () => Promise<void>
  openExternal: (url: string) => Promise<void>
  minimizeWindow: () => Promise<void>
  getWindowBounds: () => Promise<{ x: number; y: number; width: number; height: number }>
  setWindowPosition: (x: number, y: number) => Promise<void>
  isWindowMaximized: () => Promise<boolean>
  toggleMaximizeWindow: () => Promise<boolean>
  closeWindow: () => Promise<void>
  getFofaStatus: () => Promise<FofaDataSourceStatus>
  setActiveFofaProvider: (provider: FofaProvider) => Promise<FofaDataSourceStatus>
  saveFofaKey: (provider: FofaProvider, key: string, email?: string) => Promise<FofaDataSourceStatus>
  clearFofaKey: (provider: FofaProvider) => Promise<FofaDataSourceStatus>
  validateFofaKey: (provider?: FofaProvider) => Promise<FofaKeyValidation>
  searchFofa: (request: FofaSearchRequest) => Promise<FofaSearchResponse>
  getUsageStats: () => Promise<UsageStatsSnapshot>
}
