import { app, ipcMain } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { UsageDayStats, UsageStatsSnapshot } from '../shared/types'

/** 本地保留的天数上限，超过后写入时清理最旧的记录 */
const MAX_KEEP_DAYS = 180
/** getUsageStats 返回的近期天数窗口 */
const RECENT_DAYS = 14

type UsageStore = { version: 1; days: Record<string, UsageDayStats> }

export type UsageEvent = 'search' | 'searchFailed'

let storeCache: UsageStore | null = null
let ioQueue: Promise<void> = Promise.resolve()

function storeFilePath(): string {
  return join(app.getPath('userData'), 'usage-stats.json')
}

/** 以本地时区生成 YYYY-MM-DD，保证“当天”与用户感知一致 */
function localDateKey(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function emptyDay(date: string): UsageDayStats {
  return { date, searches: 0, failedSearches: 0, records: 0 }
}

async function readStore(): Promise<UsageStore> {
  try {
    const raw = JSON.parse(await readFile(storeFilePath(), 'utf8')) as Partial<UsageStore>
    if (raw && raw.version === 1 && raw.days && typeof raw.days === 'object') {
      const days: Record<string, UsageDayStats> = {}
      for (const [key, value] of Object.entries(raw.days)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !value || typeof value !== 'object') continue
        const day = value as Partial<UsageDayStats>
        days[key] = {
          date: key,
          searches: Math.max(0, Math.trunc(day.searches ?? 0)),
          failedSearches: Math.max(0, Math.trunc(day.failedSearches ?? 0)),
          records: Math.max(0, Math.trunc(day.records ?? 0))
        }
      }
      return { version: 1, days }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('[STATS] 无法读取使用统计：', error)
  }
  return { version: 1, days: {} }
}

/** 序列化读改写，避免并发写丢失 */
function withStore<T>(task: (store: UsageStore) => Promise<T> | T): Promise<T> {
  const run = ioQueue.then(async () => {
    if (!storeCache) storeCache = await readStore()
    return task(storeCache)
  })
  ioQueue = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

async function persist(store: UsageStore): Promise<void> {
  const keys = Object.keys(store.days).sort()
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_KEEP_DAYS))) delete store.days[key]
  await writeFile(storeFilePath(), JSON.stringify(store), 'utf8')
}

/**
 * 记录一次业务用量。
 * @param event 业务类型；search 时可通过 records 带回本次拉取的数据条数
 */
export function recordUsage(event: UsageEvent, records = 0): void {
  void withStore(async (store) => {
    const key = localDateKey()
    const day = store.days[key] ?? emptyDay(key)
    if (event === 'searchFailed') day.failedSearches += 1
    else {
      day.searches += 1
      day.records += Math.max(0, Math.trunc(records) || 0)
    }
    store.days[key] = day
    await persist(store)
  }).catch((error) => console.warn('[STATS] 写入使用统计失败：', error))
}

export function getUsageStats(): Promise<UsageStatsSnapshot> {
  return withStore((store) => {
    const todayKey = localDateKey()
    const recent: UsageDayStats[] = []
    for (let offset = RECENT_DAYS - 1; offset >= 0; offset -= 1) {
      const date = new Date()
      date.setDate(date.getDate() - offset)
      const key = localDateKey(date)
      recent.push(store.days[key] ?? emptyDay(key))
    }

    let totalSearches = 0
    let totalRecords = 0
    for (const day of Object.values(store.days)) {
      totalSearches += day.searches
      totalRecords += day.records
    }

    return {
      today: store.days[todayKey] ?? emptyDay(todayKey),
      recent,
      totalSearches,
      totalRecords,
      trackedDays: Object.keys(store.days).length
    }
  })
}

export function registerUsageStatsIpc(): void {
  ipcMain.handle('stats:get-usage', () => getUsageStats())
}
