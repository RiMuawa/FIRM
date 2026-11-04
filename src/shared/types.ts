export interface AppInfo {
  name: string
  version: string
  platform: string
  arch: string
  electron: string
  chrome: string
  node: string
}

export interface FofaKeyStatus {
  configured: boolean
  encrypted: boolean
  source: 'file' | 'env' | 'none'
}

export interface FofaKeyValidation {
  valid: boolean
  firstUsedAt?: string
  expireTime?: string
  todayRemaining?: number
  totalRemaining?: number
  message?: string
}

export interface FofaQuota {
  newTodayRemaining?: number
  newTotalRemaining?: number
}

export interface FofaSearchRequest {
  query: string
  page?: number
  size?: number
}

export interface FofaResultItem {
  fields: Record<string, unknown>
}

export interface FofaSearchResponse extends FofaQuota {
  finalResults?: FofaResultItem[]
  data?: FofaResultItem[]
  total?: number
  size?: number
  error?: boolean
  errmsg?: string | null
}

export interface FofaStatsRequest {
  query: string
  fields?: string[]
}

export interface FofaAggregateItem {
  name: string
  count: number
  detail?: Record<string, unknown>
}

export interface FofaStatsResponse extends FofaQuota {
  query?: string
  distinct?: Record<string, number>
  aggs?: Record<string, FofaAggregateItem[]>
  size?: number
  time?: number
  error?: boolean
  errmsg?: string | null
}

export interface FofaAiQueryResponse extends FofaQuota {
  invalid?: boolean
  syntax?: string
  message?: string | null
  error?: boolean
  errmsg?: string | null
  todayRemaining?: number
  totalRemaining?: number
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
  getFofaKeyStatus: () => Promise<FofaKeyStatus>
  saveFofaKey: (key: string) => Promise<FofaKeyStatus>
  clearFofaKey: () => Promise<void>
  validateFofaKey: () => Promise<FofaKeyValidation>
  searchFofa: (request: FofaSearchRequest) => Promise<FofaSearchResponse>
  getFofaStats: (request: FofaStatsRequest) => Promise<FofaStatsResponse>
  generateFofaQuery: (question: string) => Promise<FofaAiQueryResponse>
}
