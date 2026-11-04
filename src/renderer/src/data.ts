import type { FofaResultItem } from '../../shared/types'

export interface Fingerprint {
  id: string
  name: string
  query: string
  product: string
  category: string
  country: string
  server: string
  title: string
  vendor: string
  model: string
  note: string
  folder: string
  favorite: boolean
  createdAt: string
  updatedAt: string
}

export interface KnowledgeEntry {
  id: string
  parent: string
  name: string
  server: string
  title: string
  note: string
  folder: string
  updatedAt: string
}

export interface AssetRecord {
  ip: string
  port: string
  protocol: string
  country: string
  title: string
  link: string
  server: string
  product: string
  category: string
  domain: string
  org: string
  updatedAt: string
  raw: Record<string, unknown>
}

export interface AssetGroup {
  ip: string
  title: string
  records: AssetRecord[]
  ports: string[]
  protocols: string[]
  products: string[]
  countries: string[]
  servers: string[]
  domains: string[]
  orgs: string[]
  avatarUrl: string
  primaryLink: string
}

export interface InsightItem {
  name: string
  count: number
}

export interface InsightSection {
  key: string
  label: string
  items: InsightItem[]
}

const STORAGE = {
  fingerprints: 'iot-worktable-fingerprints',
  knowledge: 'iot-worktable-knowledge',
  query: 'iot-worktable-last-query'
} as const

function parseStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // localStorage 可能因配额或隐私策略失败，界面仍可继续工作。
  }
}

export function loadFingerprints(): Fingerprint[] {
  const values = parseStorage<Fingerprint[]>(STORAGE.fingerprints, [])
  return Array.isArray(values) ? values.filter((item) => item && typeof item.query === 'string') : []
}

export function saveFingerprints(items: Fingerprint[]): void {
  writeStorage(STORAGE.fingerprints, items)
}

export function loadKnowledge(): KnowledgeEntry[] {
  const values = parseStorage<KnowledgeEntry[]>(STORAGE.knowledge, [])
  return Array.isArray(values) ? values.filter((item) => item && typeof item.name === 'string') : []
}

export function saveKnowledge(items: KnowledgeEntry[]): void {
  writeStorage(STORAGE.knowledge, items)
}

export function loadLastQuery(): string {
  try {
    return localStorage.getItem(STORAGE.query) || ''
  } catch {
    return ''
  }
}

export function saveLastQuery(query: string): void {
  try {
    localStorage.setItem(STORAGE.query, query)
  } catch {
    // ignore
  }
}

export function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function formatDate(date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function oneMonthAgo(date = new Date()): string {
  const value = new Date(date.getFullYear(), date.getMonth() - 1, 1)
  const lastDay = new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate()
  value.setDate(Math.min(date.getDate(), lastDay))
  return formatDate(value)
}

export function getText(value: unknown): string {
  if (value == null) return ''
  if (Array.isArray(value)) return value.map(getText).filter(Boolean).join('、')
  return String(value).trim()
}

export function productFromQuery(query: string): string {
  const match = /(?:^|[^A-Za-z_.])(?:app|product)\s*={1,2}(?!=)\s*"([^"]+)"/.exec(query)
  return match?.[1] || ''
}

export function recordsFromResponse(items: FofaResultItem[]): AssetRecord[] {
  return items
    .map((item) => item?.fields || {})
    .map((fields) => ({
      ip: getText(fields.ip),
      port: getText(fields.port),
      protocol: getText(fields.protocol),
      country: getText(fields.country_name) || getText(fields.country),
      title: getText(fields.title),
      link: getText(fields.link),
      server: getText(fields.server),
      product: getText(fields.product),
      category: getText(fields.product_category),
      domain: getText(fields.domain),
      org: getText(fields.org),
      updatedAt: getText(fields.lastupdatetime),
      raw: fields
    }))
    .filter((record) => record.ip)
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function first(values: string[]): string {
  return unique(values)[0] || ''
}

export function groupAssets(records: AssetRecord[]): AssetGroup[] {
  const groups = new Map<string, AssetRecord[]>()
  for (const record of records) {
    const current = groups.get(record.ip) || []
    current.push(record)
    groups.set(record.ip, current)
  }

  return [...groups.entries()]
    .map(([ip, groupRecords]) => {
      const link = groupRecords.map((record) => record.link).find(Boolean) || ''
      let avatarUrl = ''
      if (link) {
        try {
          avatarUrl = `${new URL(link).origin}/favicon.ico`
        } catch {
          avatarUrl = ''
        }
      }

      return {
        ip,
        title: first(groupRecords.map((record) => record.title)),
        records: groupRecords,
        ports: unique(groupRecords.map((record) => record.port)),
        protocols: unique(groupRecords.map((record) => record.protocol)),
        products: unique(groupRecords.map((record) => record.product)),
        countries: unique(groupRecords.map((record) => record.country)),
        servers: unique(groupRecords.map((record) => record.server)),
        domains: unique(groupRecords.map((record) => record.domain)),
        orgs: unique(groupRecords.map((record) => record.org)),
        avatarUrl,
        primaryLink: link
      }
    })
    .sort((left, right) => right.records.length - left.records.length)
}

function aggregate(values: string[], limit = 5): InsightItem[] {
  const counts = new Map<string, number>()
  for (const value of values) {
    for (const part of value.split(/[、,，]/).map((entry) => entry.trim()).filter(Boolean)) {
      counts.set(part, (counts.get(part) || 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .slice(0, limit)
}

export function aggregateAssets(records: AssetRecord[]): InsightSection[] {
  return [
    { key: 'product', label: '产品规则', items: aggregate(records.map((record) => record.product)) },
    { key: 'category', label: '分类排名', items: aggregate(records.map((record) => record.category)) },
    { key: 'country', label: '国家地区', items: aggregate(records.map((record) => record.country)) },
    { key: 'port', label: '端口排名', items: aggregate(records.map((record) => record.port)) },
    { key: 'server', label: 'Server', items: aggregate(records.map((record) => record.server)) },
    { key: 'protocol', label: '协议', items: aggregate(records.map((record) => record.protocol)) }
  ].filter((section) => section.items.length > 0)
}

export function splitQuery(query: string): string[] {
  const parts: string[] = []
  let current = ''
  let quote = ''
  let escaped = false

  for (let index = 0; index < query.length; index += 1) {
    const char = query[index]
    if (escaped) {
      current += char
      escaped = false
      continue
    }
    if (char === '\\') {
      current += char
      escaped = true
      continue
    }
    if (quote) {
      current += char
      if (char === quote) quote = ''
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      current += char
      continue
    }
    if (char === '&' && query[index + 1] === '&') {
      if (current.trim()) parts.push(current.trim())
      current = ''
      index += 1
      continue
    }
    current += char
  }

  if (current.trim()) parts.push(current.trim())
  return parts
}

export function toggleCondition(condition: string): string {
  const trimmed = condition.trim()
  const negative = /^(\s*)([A-Za-z_][\w.]*)\s*!=(?!=)\s*/.exec(trimmed)
  if (negative) return `${negative[1]}${negative[2]}=${trimmed.slice(negative[0].length)}`
  const positive = /^(\s*)([A-Za-z_][\w.]*)\s*={1,2}(?!=)\s*/.exec(trimmed)
  if (positive) return `${positive[1]}${positive[2]}!=${trimmed.slice(positive[0].length)}`
  return trimmed.startsWith('!') ? trimmed.slice(1).trim() : `!${trimmed}`
}

export function createFingerprint(query: string): Fingerprint {
  const now = new Date().toISOString()
  const product = productFromQuery(query)
  return {
    id: makeId(),
    name: product || '未命名指纹',
    query,
    product,
    category: '',
    country: '',
    server: '',
    title: '',
    vendor: '',
    model: '',
    note: '',
    folder: '',
    favorite: false,
    createdAt: now,
    updatedAt: now
  }
}
