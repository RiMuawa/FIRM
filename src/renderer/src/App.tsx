import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import type {
  AppInfo,
  FofaKeyStatus,
  FofaKeyValidation,
  FofaQuota,
  FofaSearchResponse
} from '../../shared/types'
import {
  aggregateAssets,
  createFingerprint,
  formatDate,
  groupAssets,
  loadFingerprints,
  loadKnowledge,
  loadLastQuery,
  makeId,
  productFromQuery,
  recordsFromResponse,
  saveFingerprints,
  saveKnowledge,
  saveLastQuery,
  type Fingerprint,
  type KnowledgeEntry
} from './data'
import TabTree from './components/TabTree'
import QueryEditor from './components/QueryEditor'
import PresetManager from './components/PresetManager'
import { cardsToQuery, dedupeQuery, mergeCards, parseQueryToCards } from './query/editorModel'
import EmbeddedBrowser from './components/EmbeddedBrowser'
import type { BrowserMeta } from './components/EmbeddedBrowser'

type IconName =
  | 'radar' | 'search' | 'settings' | 'library' | 'knowledge' | 'plus' | 'close'
  | 'play' | 'external' | 'star' | 'edit' | 'trash' | 'save' | 'download'
  | 'upload' | 'copy' | 'refresh' | 'folder' | 'server' | 'chevron' | 'spark'
  | 'terminal' | 'minimize' | 'maximize' | 'check' | 'layout'

type SessionStatus = 'idle' | 'loading' | 'success' | 'error'

interface SearchSession {
  kind: 'search' | 'browser'
  id: string
  parentId?: string
  label: string
  query: string
  page: number
  size: number
  status: SessionStatus
  data?: FofaSearchResponse
  error?: string
  quota?: FofaQuota
  url?: string
}

interface ToastMessage {
  id: string
  text: string
  tone: 'ok' | 'warn' | 'error'
}

type PanelSide = 'left' | 'right'
type EditorDock = 'top' | 'bottom'
interface DockedPanel { visible: boolean; side: PanelSide }
interface WorkbenchLayout {
  rail: boolean
  sessionBar: boolean
  viewer: boolean
  sidebar: DockedPanel
  tabtree: DockedPanel
  insights: DockedPanel
  editor: { visible: boolean; dock: EditorDock }
}

const LAYOUT_STORAGE_KEY = 'iot-worktable-layout-v1'

const defaultLayout: WorkbenchLayout = {
  rail: true,
  sessionBar: true,
  viewer: true,
  sidebar: { visible: true, side: 'left' },
  tabtree: { visible: true, side: 'left' },
  insights: { visible: true, side: 'right' },
  editor: { visible: true, dock: 'bottom' }
}

function loadLayout(): WorkbenchLayout {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (!raw) return defaultLayout
    const parsed = JSON.parse(raw) as Partial<WorkbenchLayout>
    return {
      ...defaultLayout,
      ...parsed,
      sidebar: { ...defaultLayout.sidebar, ...parsed.sidebar },
      tabtree: { ...defaultLayout.tabtree, ...parsed.tabtree },
      insights: { ...defaultLayout.insights, ...parsed.insights },
      editor: { ...defaultLayout.editor, ...parsed.editor }
    }
  } catch {
    return defaultLayout
  }
}

function saveLayout(layout: WorkbenchLayout) {
  try { localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout)) } catch { /* 忽略写入失败 */ }
}

const platformLabels: Record<string, string> = {
  win32: 'Windows',
  darwin: 'macOS',
  linux: 'Linux'
}

const iconPaths: Record<IconName, ReactNode> = {
  radar: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 4v2M20 12h-2M12 20v-2M4 12h2" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.2 4.2" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.37a1.7 1.7 0 0 0-1 .63 1.7 1.7 0 0 0-.36 1.06V21h-4v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.23 15a1.7 1.7 0 0 0-.63-1A1.7 1.7 0 0 0 2.54 14H2v-4h.54A1.7 1.7 0 0 0 3.6 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 8 4.63a1.7 1.7 0 0 0 1-.63A1.7 1.7 0 0 0 9.36 3V3h4v.09A1.7 1.7 0 0 0 14.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 18.77 9a1.7 1.7 0 0 0 .63 1 1.7 1.7 0 0 0 1.06.36H21v4h-.54A1.7 1.7 0 0 0 19.4 15Z" /></>,
  library: <><path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4Z" /><path d="M8 8h7M8 12h7M8 16h4" /></>,
  knowledge: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" /><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  play: <path d="m8 5 11 7-11 7V5Z" />,
  external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></>,
  star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" />,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" /></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6" /></>,
  save: <><path d="M5 3h12l3 3v15H4V3h1Z" /><path d="M8 3v6h8V3M8 21v-7h8v7" /></>,
  download: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M4 21h16" /></>,
  upload: <><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 21h16" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" /></>,
  refresh: <><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M6.1 9A7 7 0 0 1 18.5 6L20 8M4 16l1.5 2A7 7 0 0 0 17.9 15" /></>,
  folder: <path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z" />,
  server: <><rect x="4" y="4" width="16" height="6" rx="2" /><rect x="4" y="14" width="16" height="6" rx="2" /><path d="M8 7h.01M8 17h.01M12 7h4M12 17h4" /></>,
  chevron: <path d="m9 18 6-6-6-6" />,
  spark: <><path d="m12 3 1.4 4.1L18 8.5l-4.6 1.4L12 14l-1.4-4.1L6 8.5l4.6-1.4L12 3Z" /><path d="m18 15 .8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8L18 15Z" /></>,
  terminal: <><path d="m4 7 5 5-5 5M12 17h8" /></>,
  minimize: <path d="M5 12h14" />,
  maximize: <rect x="5" y="5" width="14" height="14" rx="1" />,
  check: <path d="m5 12 4 4L19 6" />,
  layout: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M10 4v16M3 9.5h7" /></>
}

function Icon({ name, size = 16, className = '' }: { name: IconName; size?: number; className?: string }) {
  return <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg>
}

function BrandMark() {
  return <svg viewBox="0 0 36 36" aria-hidden="true"><path d="M8 10.5 18 5l10 5.5v15L18 31 8 25.5v-15Z" /><path d="M13 14.5 18 12l5 2.5v7L18 24l-5-2.5v-7Z" /><path d="M18 5v7M8 10.5l5 3M28 10.5l-5 3" /></svg>
}

function Modal({ title, onClose, children, width = 560 }: { title: string; onClose: () => void; children: ReactNode; width?: number }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal-card" style={{ width }} role="dialog" aria-modal="true" aria-label={title}><header className="modal-head"><h2>{title}</h2><button className="icon-button" type="button" onClick={onClose} title="关闭"><Icon name="close" /></button></header>{children}</section></div>
}

function SettingsDialog({ onClose, keyStatus, onKeyStatusChange, notify }: { onClose: () => void; keyStatus: FofaKeyStatus; onKeyStatusChange: (status: FofaKeyStatus) => void; notify: (text: string, tone?: ToastMessage['tone']) => void }) {
  const [keyDraft, setKeyDraft] = useState('')
  const [validation, setValidation] = useState<FofaKeyValidation | null>(null)
  const [busy, setBusy] = useState(false)

  async function saveAndValidate() {
    if (!keyDraft.trim()) { notify('请先输入 32 位 API Key', 'warn'); return }
    setBusy(true); setValidation(null)
    try {
      const status = await window.electronAPI.saveFofaKey(keyDraft)
      onKeyStatusChange(status)
      const result = await window.electronAPI.validateFofaKey()
      setValidation(result)
      if (result.valid) { setKeyDraft(''); notify('API Key 已保存并通过验证', 'ok') }
      else notify(result.message || 'Key 验证失败', 'error')
    } catch (error) { notify(error instanceof Error ? error.message : 'Key 保存失败', 'error') }
    finally { setBusy(false) }
  }

  async function validateExisting() {
    setBusy(true); setValidation(null)
    try {
      const result = await window.electronAPI.validateFofaKey()
      setValidation(result)
      notify(result.valid ? 'Key 有效' : result.message || 'Key 验证失败', result.valid ? 'ok' : 'error')
    } catch (error) { notify(error instanceof Error ? error.message : '验证失败', 'error') }
    finally { setBusy(false) }
  }

  async function clearKey() {
    if (!window.confirm('确认删除本机保存的 API Key？')) return
    setBusy(true)
    try {
      await window.electronAPI.clearFofaKey()
      onKeyStatusChange(await window.electronAPI.getFofaKeyStatus())
      setValidation(null)
      notify('已删除本地 API Key', 'ok')
    } finally { setBusy(false) }
  }

  return <Modal title="数据源与安全设置" onClose={onClose} width={620}><div className="modal-body settings-body">
    <div className={`source-card ${keyStatus.configured ? 'is-ready' : ''}`}><div className="source-icon"><Icon name="radar" size={22} /></div><div><strong>fafaapi.info 第三方中转</strong><p>业务请求只在 Electron 主进程发出，Key 不会进入渲染层日志或构建产物。</p></div><span className="status-pill">{keyStatus.configured ? '已配置' : '未配置'}</span></div>
    {keyStatus.configured && <div className="key-summary"><span><Icon name="server" /> 来源：{keyStatus.source === 'env' ? '环境变量 FAFA_API_KEY' : '本机加密存储'}</span><span><Icon name={keyStatus.encrypted ? 'check' : 'settings'} /> {keyStatus.encrypted ? '系统级加密' : keyStatus.source === 'env' ? '环境变量' : '仅文件权限保护'}</span></div>}
    <label className="field-label" htmlFor="api-key">API Key</label>
    <div className="key-input-row"><input id="api-key" type="password" value={keyDraft} onChange={(event) => setKeyDraft(event.target.value)} placeholder={keyStatus.configured ? '输入新 Key 可覆盖当前配置' : '粘贴 32 位十六进制 API Key'} spellCheck={false} autoComplete="off" /><button className="button primary" type="button" disabled={busy} onClick={() => void saveAndValidate()}>{busy ? '处理中…' : '保存并验证'}</button></div>
    <div className="settings-actions"><button className="button ghost" type="button" disabled={busy || !keyStatus.configured} onClick={() => void validateExisting()}><Icon name="refresh" /> 验证当前 Key</button><button className="button ghost danger" type="button" disabled={busy || !keyStatus.configured || keyStatus.source === 'env'} onClick={() => void clearKey()}><Icon name="trash" /> 删除本地 Key</button><button className="button ghost" type="button" onClick={() => void window.electronAPI.openExternal('https://fafaapi.info/fofa.html')}><Icon name="external" /> 获取 Key</button></div>
    {validation && <div className={`validation-card ${validation.valid ? 'ok' : 'error'}`}><strong>{validation.valid ? '验证通过' : '验证失败'}</strong>{validation.valid ? <div className="quota-grid"><span>今日剩余 <b>{validation.todayRemaining ?? '--'}</b></span><span>总剩余 <b>{validation.totalRemaining ?? '--'}</b></span><span>到期时间 <b>{validation.expireTime || '--'}</b></span></div> : <p>{validation.message || '请检查 Key 是否正确或是否过期。'}</p>}</div>}
    <p className="security-note">第三方接口不稳定且每次搜索/统计都可能消耗次数。应用会串行请求，并在两次业务请求间保留约 3 秒间隔。</p>
  </div></Modal>
}

function FingerprintPanel({ items, activeQuery, onUse, onRun, onEdit, onDelete, onToggleFavorite, onCreate, onImport, onExport }: {
  items: Fingerprint[]
  activeQuery: string
  onUse: (item: Fingerprint) => void
  onRun: (item: Fingerprint) => void
  onEdit: (item: Fingerprint) => void
  onDelete: (item: Fingerprint) => void
  onToggleFavorite: (item: Fingerprint) => void
  onCreate: () => void
  onImport: (event: ChangeEvent<HTMLInputElement>) => void
  onExport: () => void
}) {
  const [filter, setFilter] = useState('')
  const importRef = useRef<HTMLInputElement>(null)
  const visible = useMemo(() => {
    const keyword = filter.trim().toLowerCase()
    const sorted = [...items].sort((left, right) => Number(right.favorite) - Number(left.favorite))
    if (!keyword) return sorted
    return sorted.filter((item) => [item.name, item.query, item.product, item.category, item.country, item.server, item.title, item.folder, item.note].join(' ').toLowerCase().includes(keyword))
  }, [filter, items])

  return <div className="side-panel">
    <div className="side-toolbar"><div className="side-search"><Icon name="search" size={14} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="搜索指纹、语句、厂商…" /></div><button className="icon-button accent" type="button" onClick={onCreate} title="把当前查询存入指纹库"><Icon name="plus" /></button></div>
    <div className="side-summary"><span>{visible.length} 条指纹</span><span>当前语句 {activeQuery ? `${activeQuery.length} 字符` : '为空'}</span></div>
    <div className="fingerprint-list">{visible.length === 0 ? <div className="panel-empty"><Icon name="library" size={28} /><strong>还没有指纹</strong><p>在查询编辑器里输入语句，然后点击右上角 + 保存。</p></div> : visible.map((item) => <article className="fingerprint-card" key={item.id}>
      <div className="fingerprint-top"><button className={`star-button ${item.favorite ? 'is-on' : ''}`} type="button" onClick={() => onToggleFavorite(item)} title="收藏"><Icon name="star" size={14} /></button><button className="fingerprint-name" type="button" onClick={() => onUse(item)}>{item.name || '未命名指纹'}</button><span className="fingerprint-folder">{item.folder || '未归档'}</span></div>
      <code className="fingerprint-query" title={item.query}>{item.query}</code>
      <div className="fingerprint-tags">{item.product && <span>{item.product}</span>}{item.server && <span>{item.server}</span>}{item.country && <span>{item.country}</span>}{!item.product && !item.server && !item.country && <span>通用查询</span>}</div>
      <div className="fingerprint-actions"><button type="button" onClick={() => onRun(item)}><Icon name="play" size={13} /> 搜索</button><button type="button" onClick={() => onUse(item)}><Icon name="edit" size={13} /> 编辑</button><button type="button" onClick={() => void navigator.clipboard.writeText(item.query)}><Icon name="copy" size={13} /> 复制</button><button type="button" onClick={() => onDelete(item)} title="删除"><Icon name="trash" size={13} /></button></div>
    </article>)}</div>
    <div className="side-footer"><button type="button" onClick={onExport}><Icon name="download" /> 导出</button><button type="button" onClick={() => importRef.current?.click()}><Icon name="upload" /> 导入</button><input ref={importRef} type="file" accept="application/json,.json" hidden onChange={onImport} /></div>
  </div>
}

function KnowledgePanel({ items, onUse, onEdit, onDelete, onCreate, onImport, onExport }: {
  items: KnowledgeEntry[]
  onUse: (item: KnowledgeEntry) => void
  onEdit: (item: KnowledgeEntry) => void
  onDelete: (item: KnowledgeEntry) => void
  onCreate: () => void
  onImport: (event: ChangeEvent<HTMLInputElement>) => void
  onExport: () => void
}) {
  const [filter, setFilter] = useState('')
  const importRef = useRef<HTMLInputElement>(null)
  const visible = useMemo(() => {
    const keyword = filter.trim().toLowerCase()
    return [...items].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).filter((item) => !keyword || [item.parent, item.name, item.server, item.title, item.note, item.folder].join(' ').toLowerCase().includes(keyword))
  }, [filter, items])

  return <div className="side-panel">
    <div className="side-toolbar"><div className="side-search"><Icon name="search" size={14} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="搜索厂商、Server、Title…" /></div><button className="icon-button accent" type="button" onClick={onCreate} title="新建知识库记录"><Icon name="plus" /></button></div>
    <div className="side-summary"><span>{visible.length} 条知识</span><span>厂商贴牌与资产线索</span></div>
    <div className="knowledge-list">{visible.length === 0 ? <div className="panel-empty"><Icon name="knowledge" size={28} /><strong>知识库为空</strong><p>记录母厂、贴牌名称、Server 和 Title，后续可一键转为查询。</p></div> : visible.map((item) => <article className="knowledge-card" key={item.id}>
      <div className="knowledge-head"><span className="knowledge-dot" /><button className="fingerprint-name" type="button" onClick={() => onEdit(item)}>{item.name || '未命名记录'}</button><span>{item.folder || '默认'}</span></div>
      {item.parent && <p className="knowledge-parent">母厂 / 关系：{item.parent}</p>}
      <div className="knowledge-meta">{item.server && <span><Icon name="server" size={12} /> {item.server}</span>}{item.title && <span><Icon name="terminal" size={12} /> {item.title}</span>}</div>
      {item.note && <p className="knowledge-note">{item.note}</p>}
      <div className="fingerprint-actions"><button type="button" onClick={() => onUse(item)}><Icon name="search" size={13} /> 转为查询</button><button type="button" onClick={() => onEdit(item)}><Icon name="edit" size={13} /> 编辑</button><button type="button" onClick={() => onDelete(item)} title="删除"><Icon name="trash" size={13} /></button></div>
    </article>)}</div>
    <div className="side-footer"><button type="button" onClick={onExport}><Icon name="download" /> 导出</button><button type="button" onClick={() => importRef.current?.click()}><Icon name="upload" /> 导入</button><input ref={importRef} type="file" accept="application/json,.json" hidden onChange={onImport} /></div>
  </div>
}

function AssetCard({ group, onOpenBrowser }: { group: ReturnType<typeof groupAssets>[number]; onOpenBrowser: (url: string) => void }) {
  const [imageFailed, setImageFailed] = useState(false)
  const initials = group.title ? group.title.slice(0, 1).toUpperCase() : group.ip.slice(0, 1)
  const targetUrl = group.primaryLink || (group.ports[0] ? `http://${group.ip}:${group.ports[0]}` : `http://${group.ip}`)
  return <article className="asset-card">
    <div className="asset-avatar">{group.avatarUrl && !imageFailed ? <img src={group.avatarUrl} alt="" onError={() => setImageFailed(true)} /> : <span>{initials}</span>}</div>
    <div className="asset-body">
      <div className="asset-heading"><div><div className="asset-ip-row"><h3>{group.ip}</h3><button type="button" title="复制 IP" onClick={() => void navigator.clipboard.writeText(group.ip)}><Icon name="copy" size={12} /></button><button type="button" title="在内嵌浏览器中打开" onClick={() => onOpenBrowser(targetUrl)}><Icon name="external" size={12} /></button></div><p className="asset-title">{group.title || '无页面标题'}</p></div><span className="asset-count">{group.records.length} 条</span></div>
      <div className="asset-badges">{group.ports.slice(0, 8).map((port) => <span className="port-badge" key={port}>:{port}</span>)}{group.protocols.slice(0, 5).map((protocol) => <span className="protocol-badge" key={protocol}>{protocol}</span>)}</div>
      <div className="asset-footer"><span><Icon name="radar" size={13} /> {group.products.slice(0, 2).join(' / ') || group.orgs[0] || '未知产品'}</span><span><Icon name="server" size={13} /> {group.servers.slice(0, 2).join(' / ') || 'Server 未知'}</span><span>{group.countries.join(' / ') || '地区未知'}</span></div>
    </div>
  </article>
}

function InsightsPanel({ records, side = 'right' }: { records: ReturnType<typeof recordsFromResponse>; side?: PanelSide }) {
  const sections = aggregateAssets(records)
  return <aside className={`insights-panel ${side === 'left' ? 'is-left' : ''}`}>
    <div className="insights-head"><div><p className="eyebrow">LIVE AGGREGATION</p><h3>当前页画像</h3></div><span>{records.length} 条资产</span></div>
    <p className="insights-copy">无需额外消耗配额，直接汇总当前结果页。</p>
    <div className="insight-sections">{sections.length === 0 ? <div className="panel-empty compact"><Icon name="radar" /><p>执行搜索后显示产品、国家、端口和 Server 排名。</p></div> : sections.map((section) => <section className="insight-section" key={section.key}><div className="insight-title"><span>{section.label}</span><small>TOP 5</small></div>{section.items.map((item, index) => <div className="insight-row" key={item.name}><span className="insight-rank">{String(index + 1).padStart(2, '0')}</span><span className="insight-name" title={item.name}>{item.name}</span><span className="insight-count">{item.count}</span></div>)}</section>)}</div>
  </aside>
}

function LayoutMenu({ layout, onChange, onReset, onClose }: {
  layout: WorkbenchLayout
  onChange: (layout: WorkbenchLayout) => void
  onReset: () => void
  onClose: () => void
}) {
  const toggleFlag = (key: 'rail' | 'sessionBar' | 'viewer') => onChange({ ...layout, [key]: !layout[key] })
  const toggleDocked = (key: 'sidebar' | 'tabtree' | 'insights') => onChange({ ...layout, [key]: { ...layout[key], visible: !layout[key].visible } })
  const setSide = (key: 'sidebar' | 'tabtree' | 'insights', side: PanelSide) => onChange({ ...layout, [key]: { ...layout[key], side, visible: true } })
  const toggleEditor = () => onChange({ ...layout, editor: { ...layout.editor, visible: !layout.editor.visible } })
  const setEditorDock = (dock: EditorDock) => onChange({ ...layout, editor: { ...layout.editor, dock, visible: true } })

  function switchButton(on: boolean, onClick: () => void, label: string) {
    return <button className={`layout-switch ${on ? 'is-on' : ''}`} type="button" role="switch" aria-checked={on} title={on ? `隐藏${label}` : `显示${label}`} onClick={onClick}><span /></button>
  }

  function sideSeg(key: 'sidebar' | 'tabtree' | 'insights') {
    return <div className="seg-group">
      <button className={layout[key].side === 'left' ? 'is-active' : ''} type="button" onClick={() => setSide(key, 'left')}>左</button>
      <button className={layout[key].side === 'right' ? 'is-active' : ''} type="button" onClick={() => setSide(key, 'right')}>右</button>
    </div>
  }

  const dockedRow = (key: 'sidebar' | 'tabtree' | 'insights', name: string, hint: string) => (
    <div className="layout-row" key={key}>
      <div className="layout-row-info"><strong>{name}</strong><small>{hint}</small></div>
      <div className="layout-row-actions">{sideSeg(key)}{switchButton(layout[key].visible, () => toggleDocked(key), name)}</div>
    </div>
  )

  const flagRow = (key: 'rail' | 'sessionBar' | 'viewer', name: string, hint: string) => (
    <div className="layout-row" key={key}>
      <div className="layout-row-info"><strong>{name}</strong><small>{hint}</small></div>
      <div className="layout-row-actions">{switchButton(layout[key], () => toggleFlag(key), name)}</div>
    </div>
  )

  return <div className="layout-menu-overlay" onMouseDown={onClose}>
    <div className="layout-menu" role="dialog" aria-label="面板布局" onMouseDown={(event) => event.stopPropagation()}>
      <div className="layout-menu-head"><strong>面板布局</strong><button type="button" onClick={onReset}>重置默认</button></div>
      {dockedRow('sidebar', '资源侧栏', '指纹库 / 知识库（Ctrl+B）')}
      {dockedRow('tabtree', '标签树', '会话树形导航')}
      {dockedRow('insights', '画像面板', '当前页聚合信息')}
      <div className="layout-row">
        <div className="layout-row-info"><strong>查询编辑器</strong><small>底部语法编辑器（Ctrl+J）</small></div>
        <div className="layout-row-actions">
          <div className="seg-group">
            <button className={layout.editor.dock === 'top' ? 'is-active' : ''} type="button" onClick={() => setEditorDock('top')}>上</button>
            <button className={layout.editor.dock === 'bottom' ? 'is-active' : ''} type="button" onClick={() => setEditorDock('bottom')}>下</button>
          </div>
          {switchButton(layout.editor.visible, toggleEditor, '查询编辑器')}
        </div>
      </div>
      {flagRow('viewer', '结果视图', '主查看窗口（资产列表）')}
      {flagRow('sessionBar', '会话栏', '面包屑与配额信息')}
      {flagRow('rail', '活动栏', '最左侧图标栏')}
      <p className="layout-menu-tip">所有面板均可自由显隐；侧栏类面板可停靠左右两侧，查询编辑器可停靠上下，布局会自动保存。</p>
    </div>
  </div>
}

function App() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [keyStatus, setKeyStatus] = useState<FofaKeyStatus>({ configured: false, encrypted: false, source: 'none' })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [leftTab, setLeftTab] = useState<'fingerprints' | 'knowledge'>('fingerprints')
  const [leftWidth, setLeftWidth] = useState(306)
  const [layout, setLayout] = useState<WorkbenchLayout>(() => loadLayout())
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false)
  const [collapsedTabs, setCollapsedTabs] = useState<Set<string>>(() => new Set())
  const [editorHeight, setEditorHeight] = useState(232)
  const [presetManagerOpen, setPresetManagerOpen] = useState(false)
  const [fingerprints, setFingerprints] = useState<Fingerprint[]>(() => loadFingerprints())
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>(() => loadKnowledge())
  const [fingerprintDraft, setFingerprintDraft] = useState<Fingerprint | null>(null)
  const [knowledgeDraft, setKnowledgeDraft] = useState<KnowledgeEntry | null>(null)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [quota, setQuota] = useState<FofaQuota>({})
  const initialQuery = loadLastQuery()
  const [sessions, setSessions] = useState<SearchSession[]>([{ kind: 'search', id: makeId(), label: '新搜索', query: initialQuery, page: 1, size: 50, status: 'idle' }])
  const [activeSessionId, setActiveSessionId] = useState(() => sessions[0].id)
  const [queryDraft, setQueryDraft] = useState(initialQuery)
  const activeSession = sessions.find((session) => session.id === activeSessionId) || sessions[0]

  function notify(text: string, tone: ToastMessage['tone'] = 'ok') {
    const toast = { id: makeId(), text, tone }
    setToasts((current) => [...current, toast])
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== toast.id)), 3400)
  }

  function updateSession(id: string, patch: Partial<SearchSession> | ((session: SearchSession) => SearchSession)) {
    setSessions((current) => current.map((session) => session.id === id ? typeof patch === 'function' ? patch(session) : { ...session, ...patch } : session))
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [appInfo, status] = await Promise.all([window.electronAPI.getAppInfo(), window.electronAPI.getFofaKeyStatus()])
        if (cancelled) return
        setInfo(appInfo)
        setKeyStatus(status)
        if (!status.configured) setSettingsOpen(true)
      } catch (error) {
        notify(error instanceof Error ? error.message : '初始化失败', 'error')
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  useEffect(() => { if (activeSession.kind === 'search') setQueryDraft(activeSession.query) }, [activeSession.id])
  useEffect(() => { saveFingerprints(fingerprints) }, [fingerprints])
  useEffect(() => { saveKnowledge(knowledge) }, [knowledge])
  useEffect(() => { saveLayout(layout) }, [layout])

  const activeRecords = useMemo(() => {
    const response = activeSession.data
    if (!response) return []
    return recordsFromResponse(response.finalResults || response.data || [])
  }, [activeSession.data])
  const groups = useMemo(() => groupAssets(activeRecords), [activeRecords])
  const total = activeSession.data?.total ?? activeSession.data?.size ?? 0
  const browserTabs = useMemo(() => sessions.filter((session) => session.kind === 'browser'), [sessions])
  const activePath = useMemo(() => {
    const path: SearchSession[] = []
    let current: SearchSession | undefined = activeSession
    const seen = new Set<string>()
    while (current && !seen.has(current.id)) {
      seen.add(current.id)
      path.unshift(current)
      current = current.parentId ? sessions.find((tab) => tab.id === current?.parentId) : undefined
    }
    return path
  }, [activeSession, sessions])

  function createSession(parentId?: string, initialQuery = queryDraft) {
    const next: SearchSession = { kind: 'search', id: makeId(), parentId, label: '新搜索', query: initialQuery, page: 1, size: 50, status: 'idle' }
    setSessions((current) => [...current, next])
    setActiveSessionId(next.id)
    setQueryDraft(initialQuery)
    return next.id
  }

  function createBrowserSession(url = 'about:blank', parentId = activeSession.id) {
    let label = '新页面'
    if (url && url !== 'about:blank') {
      try { label = new URL(url).hostname || '新页面' } catch { label = url.slice(0, 28) }
    }
    const next: SearchSession = { kind: 'browser', id: makeId(), parentId, label, query: '', page: 1, size: 50, status: 'idle', url }
    setSessions((current) => [...current, next])
    setActiveSessionId(next.id)
    setCollapsedTabs((current) => {
      const updated = new Set(current)
      updated.delete(parentId)
      return updated
    })
    return next.id
  }

  function startSearchTab(query: string, parentId = activeSession.id) {
    const id = createSession(parentId, query)
    void runSearch(id, query, 1)
  }

  function descendantIds(tabId: string): Set<string> {
    const result = new Set<string>()
    const queue = [tabId]
    while (queue.length) {
      const currentId = queue.shift()!
      for (const tab of sessions) {
        if (tab.parentId === currentId && !result.has(tab.id)) {
          result.add(tab.id)
          queue.push(tab.id)
        }
      }
    }
    return result
  }

  function closeSession(id: string) {
    const children = descendantIds(id)
    if (children.size > 0 && !window.confirm(`该标签还有 ${children.size} 个子标签，是否连同子树一起关闭？`)) return
    const closing = new Set([id, ...children])
    const remaining = sessions.filter((session) => !closing.has(session.id))
    if (remaining.length === 0) {
      const replacement: SearchSession = { kind: 'search', id: makeId(), label: '新搜索', query: '', page: 1, size: 50, status: 'idle' }
      setSessions([replacement])
      setActiveSessionId(replacement.id)
      setQueryDraft('')
      return
    }
    setSessions(remaining)
    if (closing.has(activeSessionId)) {
      const fallback = remaining[0]
      setActiveSessionId(fallback.id)
      if (fallback.kind === 'search') setQueryDraft(fallback.query)
    }
  }

  function reparentTab(sourceId: string, parentId?: string) {
    if (sourceId === parentId) return
    if (parentId && descendantIds(sourceId).has(parentId)) {
      notify('不能把父标签移动到自己的子标签下', 'warn')
      return
    }
    setSessions((current) => current.map((session) => session.id === sourceId ? { ...session, parentId } : session))
    if (parentId) {
      setCollapsedTabs((current) => {
        const updated = new Set(current)
        updated.delete(parentId)
        return updated
      })
    }
    notify(parentId ? '已调整父子标签关系' : '已移动为根标签', 'ok')
  }

  function handleBrowserMeta(tabId: string, meta: BrowserMeta) {
    let label = meta.title
    if (!label || label === meta.url) {
      try { label = new URL(meta.url).hostname || '新页面' } catch { label = meta.url.slice(0, 28) || '新页面' }
    }
    updateSession(tabId, { url: meta.url, label: label.slice(0, 60), status: 'success' })
  }

  async function runSearch(targetSessionId = activeSession.id, overrideQuery?: string, overridePage?: number) {
    const found = sessions.find((item) => item.id === targetSessionId)
    if (found?.kind === 'browser') {
      startSearchTab((overrideQuery ?? queryDraft).trim(), found.id)
      return
    }
    const session = found || ({ kind: 'search', id: targetSessionId, label: '新搜索', query: overrideQuery || '', page: 1, size: 50, status: 'idle' } as SearchSession)
    const query = (overrideQuery ?? (targetSessionId === activeSession.id ? queryDraft : session.query)).trim()
    const page = overridePage ?? session.page
    if (!query) { notify('搜索语句不能为空', 'warn'); return }
    if (!keyStatus.configured) { setSettingsOpen(true); notify('请先配置第三方 FOFA API Key', 'warn'); return }

    saveLastQuery(query)
    updateSession(targetSessionId, { query, page, status: 'loading', error: undefined, label: productFromQuery(query) || query.slice(0, 24) || '新搜索' })
    if (targetSessionId === activeSession.id) setQueryDraft(query)

    try {
      const data = await window.electronAPI.searchFofa({ query, page, size: session.size })
      const nextQuota = { newTodayRemaining: data.newTodayRemaining, newTotalRemaining: data.newTotalRemaining }
      setQuota(nextQuota)
      updateSession(targetSessionId, { query, page, status: 'success', data, error: undefined, quota: nextQuota, label: productFromQuery(query) || query.slice(0, 24) || '新搜索' })
      const count = data.finalResults?.length || data.data?.length || 0
      notify(`搜索完成，当前页 ${count} 条`, 'ok')
    } catch (error) {
      const message = error instanceof Error ? error.message : '搜索失败'
      updateSession(targetSessionId, { status: 'error', error: message })
      notify(message, 'error')
    }
  }

  function saveCurrentFingerprint(queryOverride?: string) {
    const query = dedupeQuery((queryOverride ?? queryDraft).trim())
    if (!query) { notify('当前查询为空，无法保存', 'warn'); return }
    if (fingerprints.some((item) => item.query === query)) { notify('该查询已经在指纹库中', 'warn'); return }
    const item = createFingerprint(query)
    setFingerprints((current) => [item, ...current])
    setFingerprintDraft(item)
    notify('已创建指纹，请补充名称和归档信息', 'ok')
  }

  function useFingerprint(item: Fingerprint, run: boolean) {
    if (activeSession.kind === 'browser') {
      if (run) startSearchTab(item.query, activeSession.id)
      else {
        createSession(activeSession.id, item.query)
        notify(`已在当前网页下新建搜索标签并载入「${item.name}」`, 'ok')
      }
      return
    }
    setQueryDraft(item.query)
    updateSession(activeSession.id, { query: item.query, label: item.name || '指纹查询' })
    if (run) void runSearch(activeSession.id, item.query, 1)
    else notify(`已载入「${item.name}」到查询编辑器`, 'ok')
  }

  function saveFingerprintDraft() {
    if (!fingerprintDraft) return
    const item = { ...fingerprintDraft, name: fingerprintDraft.name.trim() || '未命名指纹', updatedAt: new Date().toISOString() }
    setFingerprints((current) => current.some((entry) => entry.id === item.id) ? current.map((entry) => entry.id === item.id ? item : entry) : [item, ...current])
    setFingerprintDraft(null)
    notify('指纹已保存', 'ok')
  }

  function deleteFingerprint(item: Fingerprint) {
    if (!window.confirm(`删除指纹「${item.name}」？`)) return
    setFingerprints((current) => current.filter((entry) => entry.id !== item.id))
    notify('已删除指纹', 'ok')
  }

  function exportFingerprints() {
    const blob = new Blob([JSON.stringify(fingerprints, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `iot-worktable-fingerprints-${formatDate()}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function importFingerprints(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text()) as unknown
      if (!Array.isArray(parsed)) throw new Error('文件内容不是数组')
      const existing = new Set(fingerprints.map((item) => item.query))
      const incoming: Fingerprint[] = []
      for (const raw of parsed) {
        if (!raw || typeof raw !== 'object') continue
        const item = raw as Partial<Fingerprint>
        if (typeof item.query !== 'string' || !item.query.trim() || existing.has(item.query)) continue
        const now = new Date().toISOString()
        existing.add(item.query)
        incoming.push({ ...createFingerprint(item.query), ...item, id: typeof item.id === 'string' ? item.id : makeId(), name: typeof item.name === 'string' ? item.name : productFromQuery(item.query) || '导入指纹', favorite: Boolean(item.favorite), createdAt: typeof item.createdAt === 'string' ? item.createdAt : now, updatedAt: now })
      }
      setFingerprints((current) => [...incoming, ...current])
      notify(`已导入 ${incoming.length} 条指纹`, 'ok')
    } catch (error) { notify(error instanceof Error ? error.message : '导入失败', 'error') }
  }

  function runKnowledgeQuery(item: KnowledgeEntry) {
    const conditions = [
      item.server ? `server="${item.server.replace(/"/g, '\\"')}"` : '',
      item.title ? `title="${item.title.replace(/"/g, '\\"')}"` : ''
    ].filter(Boolean)
    if (conditions.length === 0) { notify('该记录没有可用于搜索的 Server 或 Title', 'warn'); return }
    const query = conditions.join(' && ')
    if (activeSession.kind === 'browser') {
      startSearchTab(query, activeSession.id)
      return
    }
    setQueryDraft(query)
    updateSession(activeSession.id, { query })
    void runSearch(activeSession.id, query, 1)
  }

  function saveKnowledgeDraft() {
    if (!knowledgeDraft) return
    const item = { ...knowledgeDraft, name: knowledgeDraft.name.trim() || '未命名记录', updatedAt: new Date().toISOString() }
    setKnowledge((current) => current.some((entry) => entry.id === item.id) ? current.map((entry) => entry.id === item.id ? item : entry) : [item, ...current])
    setKnowledgeDraft(null)
    notify('知识库记录已保存', 'ok')
  }

  function deleteKnowledge(item: KnowledgeEntry) {
    if (!window.confirm(`删除知识库记录「${item.name}」？`)) return
    setKnowledge((current) => current.filter((entry) => entry.id !== item.id))
    notify('已删除记录', 'ok')
  }

  function exportKnowledge() {
    const blob = new Blob([JSON.stringify(knowledge, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `iot-worktable-knowledge-${formatDate()}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function importKnowledge(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text()) as unknown
      if (!Array.isArray(parsed)) throw new Error('文件内容不是数组')
      const existing = new Set(knowledge.map((item) => `${item.parent}|${item.name}|${item.server}|${item.title}`))
      const incoming: KnowledgeEntry[] = []
      for (const raw of parsed) {
        if (!raw || typeof raw !== 'object') continue
        const item = raw as Partial<KnowledgeEntry>
        if (typeof item.name !== 'string') continue
        const key = `${item.parent || ''}|${item.name}|${item.server || ''}|${item.title || ''}`
        if (existing.has(key)) continue
        existing.add(key)
        incoming.push({ id: makeId(), parent: typeof item.parent === 'string' ? item.parent : '', name: item.name, server: typeof item.server === 'string' ? item.server : '', title: typeof item.title === 'string' ? item.title : '', note: typeof item.note === 'string' ? item.note : '', folder: typeof item.folder === 'string' ? item.folder : '', updatedAt: new Date().toISOString() })
      }
      setKnowledge((current) => [...incoming, ...current])
      notify(`已导入 ${incoming.length} 条知识`, 'ok')
    } catch (error) { notify(error instanceof Error ? error.message : '导入失败', 'error') }
  }

  function toggleSidebarTab(tab: 'fingerprints' | 'knowledge') {
    if (leftTab === tab && layout.sidebar.visible) {
      setLayout((current) => ({ ...current, sidebar: { ...current.sidebar, visible: false } }))
      return
    }
    setLeftTab(tab)
    setLayout((current) => ({ ...current, sidebar: { ...current.sidebar, visible: true } }))
  }

  function showSidebarTab(tab: 'fingerprints' | 'knowledge') {
    setLeftTab(tab)
    setLayout((current) => ({ ...current, sidebar: { ...current.sidebar, visible: true } }))
  }

  function startLeftResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = leftWidth
    const direction = layout.sidebar.side === 'right' ? -1 : 1
    const move = (moveEvent: PointerEvent) => setLeftWidth(Math.min(460, Math.max(244, startWidth + (moveEvent.clientX - startX) * direction)))
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  function startEditorResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = editorHeight
    const direction = layout.editor.dock === 'top' ? 1 : -1
    const move = (moveEvent: PointerEvent) => setEditorHeight(Math.min(430, Math.max(164, startHeight + (moveEvent.clientY - startY) * direction)))
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void runSearch() }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') { event.preventDefault(); createSession(activeSession.id) }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') { event.preventDefault(); setLayout((current) => ({ ...current, sidebar: { ...current.sidebar, visible: !current.sidebar.visible } })) }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'j') { event.preventDefault(); setLayout((current) => ({ ...current, editor: { ...current.editor, visible: !current.editor.visible } })) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const editorSlot = (
    <div className="editor-slot">
      {layout.editor.dock === 'bottom' && <div className="splitter horizontal" onPointerDown={startEditorResize} />}
      <QueryEditor query={queryDraft} onChange={(value) => { setQueryDraft(value); updateSession(activeSession.id, { query: value }) }} onSearch={(value) => void runSearch(activeSession.id, value, 1)} onSaveFingerprint={saveCurrentFingerprint} onNotify={notify} height={editorHeight} onOpenPresetManager={() => setPresetManagerOpen(true)} />
      {layout.editor.dock === 'top' && <div className="splitter horizontal" onPointerDown={startEditorResize} />}
    </div>
  )

  return (
    <div className="app-shell">
      <header className="titlebar">
        <div className="title-brand"><span className="brand-mark"><BrandMark /></span><div><strong>IoT Worktable</strong><small>FOFA 资产工作台</small></div></div>
        <div className="title-center"><span className="live-dot" /><span>{info ? `${platformLabels[info.platform] || info.platform} · Electron ${info.electron}` : '正在连接主进程…'}</span></div>
        <div className="title-actions"><button className="titlebar-icon" type="button" onClick={() => setLayoutMenuOpen((open) => !open)} title="面板布局"><Icon name="layout" size={15} /></button><button className={`key-chip ${keyStatus.configured ? 'is-ready' : ''}`} type="button" onClick={() => setSettingsOpen(true)}><span className="status-dot" /> {keyStatus.configured ? '数据源已连接' : '配置数据源'}</button><button className="titlebar-icon" type="button" onClick={() => void window.electronAPI.minimizeWindow()} title="最小化"><Icon name="minimize" size={14} /></button><button className="titlebar-icon" type="button" onClick={() => void window.electronAPI.toggleMaximizeWindow()} title="最大化"><Icon name="maximize" size={13} /></button><button className="titlebar-icon close" type="button" onClick={() => void window.electronAPI.closeWindow()} title="关闭"><Icon name="close" size={14} /></button></div>
      </header>

      {layoutMenuOpen && <LayoutMenu layout={layout} onChange={setLayout} onReset={() => { setLayout(defaultLayout); notify('已恢复默认布局', 'ok') }} onClose={() => setLayoutMenuOpen(false)} />}

      <div className="workbench">
        {layout.rail && <nav className="activity-rail" aria-label="工作区">
          <button className="rail-logo" type="button" title="工作台"><Icon name="radar" size={21} /></button>
          <button className={`rail-button ${leftTab === 'fingerprints' && layout.sidebar.visible ? 'is-active' : ''}`} type="button" onClick={() => toggleSidebarTab('fingerprints')} title="指纹库（再次点击隐藏侧栏）"><Icon name="library" size={19} /><span>指纹</span></button>
          <button className={`rail-button ${leftTab === 'knowledge' && layout.sidebar.visible ? 'is-active' : ''}`} type="button" onClick={() => toggleSidebarTab('knowledge')} title="知识库（再次点击隐藏侧栏）"><Icon name="knowledge" size={19} /><span>知识</span></button>
          <div className="rail-spacer" />
          <button className="rail-button" type="button" onClick={() => setSettingsOpen(true)} title="设置"><Icon name="settings" size={19} /><span>设置</span></button>
        </nav>}

        {layout.sidebar.visible && <aside className={`left-dock ${layout.sidebar.side === 'right' ? 'is-right' : ''}`} style={{ width: leftWidth }}>
          <div className="dock-tabs"><button className={leftTab === 'fingerprints' ? 'is-active' : ''} type="button" onClick={() => setLeftTab('fingerprints')}>指纹库 <small>{fingerprints.length}</small></button><button className={leftTab === 'knowledge' ? 'is-active' : ''} type="button" onClick={() => setLeftTab('knowledge')}>知识库 <small>{knowledge.length}</small></button></div>
          {leftTab === 'fingerprints' ? <FingerprintPanel items={fingerprints} activeQuery={queryDraft} onUse={(item) => useFingerprint(item, false)} onRun={(item) => useFingerprint(item, true)} onEdit={(item) => setFingerprintDraft({ ...item })} onDelete={deleteFingerprint} onToggleFavorite={(item) => setFingerprints((current) => current.map((entry) => entry.id === item.id ? { ...entry, favorite: !entry.favorite, updatedAt: new Date().toISOString() } : entry))} onCreate={saveCurrentFingerprint} onImport={(event) => void importFingerprints(event)} onExport={exportFingerprints} /> : <KnowledgePanel items={knowledge} onUse={runKnowledgeQuery} onEdit={(item) => setKnowledgeDraft({ ...item })} onDelete={deleteKnowledge} onCreate={() => setKnowledgeDraft({ id: makeId(), parent: '', name: '', server: '', title: '', note: '', folder: '', updatedAt: new Date().toISOString() })} onImport={(event) => void importKnowledge(event)} onExport={exportKnowledge} />}
        </aside>}

        {layout.sidebar.visible && <div className={`splitter vertical ${layout.sidebar.side === 'right' ? 'is-right' : ''}`} onPointerDown={startLeftResize} />}

        <main className="main-dock">
          {layout.sessionBar && <div className="session-bar">
            <button className={`tree-toggle ${layout.tabtree.visible ? 'is-on' : ''}`} type="button" onClick={() => setLayout((current) => ({ ...current, tabtree: { ...current.tabtree, visible: !current.tabtree.visible } }))} title="显示/隐藏标签树">
              <Icon name="folder" size={14} /> 标签树 <b>{sessions.length}</b>
            </button>
            <div className="session-breadcrumb">
              {activePath.map((tab, index) => <span className={`breadcrumb-item ${index === activePath.length - 1 ? 'is-current' : ''} ${tab.kind}`} key={tab.id}>{index > 0 && <i>/</i>}<Icon name={tab.kind === 'browser' ? 'external' : 'search'} size={12} />{tab.label}</span>)}
            </div>
            <div className="session-meta"><span>{activeSession.kind === 'browser' ? '内嵌浏览器' : 'FOFA 搜索'}</span><span>Quota {quota.newTodayRemaining ?? '--'} / {quota.newTotalRemaining ?? '--'}</span></div>
          </div>}

          <div className="main-body">
            {layout.tabtree.visible && <div className={`tabtree-wrap ${layout.tabtree.side === 'right' ? 'is-right' : ''}`}><TabTree
              tabs={sessions}
              activeId={activeSession.id}
              collapsed={collapsedTabs}
              onSelect={setActiveSessionId}
              onClose={closeSession}
              onToggleCollapse={(id) => setCollapsedTabs((current) => {
                const next = new Set(current)
                if (next.has(id)) next.delete(id)
                else next.add(id)
                return next
              })}
              onNewSearch={() => { createSession(activeSession.id) }}
              onNewBrowser={() => { createBrowserSession('about:blank', activeSession.id) }}
              onReparent={reparentTab}
            /></div>}

            <div className={`tab-content ${layout.editor.visible && layout.editor.dock === 'top' ? 'editor-top' : ''}`}>
              {activeSession.kind === 'search' && <>
                <section className="search-command">
                  <div className="command-brand"><span className="command-icon"><Icon name="search" size={19} /></span><div><small>FOFA QUERY</small><strong>资产搜索</strong></div></div>
                  <div className="command-input"><input value={queryDraft} onChange={(event) => { setQueryDraft(event.target.value); updateSession(activeSession.id, { query: event.target.value }) }} onKeyDown={(event) => { if (event.key === 'Enter') void runSearch() }} placeholder='app="Hikvision-综合安防管理平台" && country="CN"' spellCheck={false} /><kbd>Enter</kbd></div>
                  <button className="button primary command-run" type="button" disabled={activeSession.status === 'loading'} onClick={() => void runSearch()}>{activeSession.status === 'loading' ? <span className="spinner" /> : <Icon name="play" size={14} />}{activeSession.status === 'loading' ? '搜索中' : '搜索'}</button>
                  <button className="button ghost command-save" type="button" onClick={() => saveCurrentFingerprint()} title="保存当前语句"><Icon name="save" size={14} /></button>
                </section>

                {!keyStatus.configured && <div className="notice-banner"><Icon name="settings" /><span>尚未配置第三方数据源。保存 API Key 后即可搜索，Key 由主进程安全存储。</span><button type="button" onClick={() => setSettingsOpen(true)}>立即配置</button></div>}

                {layout.editor.visible && layout.editor.dock === 'top' && editorSlot}

                {(layout.viewer || layout.insights.visible) && <div className="results-layout">
                  {layout.viewer && <section className="result-pane">
                    <header className="result-toolbar">
                      <div className="result-heading"><div><p className="eyebrow">ASSET EXPLORER</p><h2>{activeSession.status === 'error' ? '搜索发生错误' : total > 0 ? `匹配 ${total.toLocaleString()} 条结果` : '主查看窗口'}</h2></div><div className="result-stats"><span><b>{groups.length}</b> 当前页独立 IP</span><span><b>{activeRecords.length}</b> 当前页资产</span>{activeSession.quota?.newTodayRemaining != null && <span><b>{activeSession.quota.newTodayRemaining}</b> 今日剩余</span>}</div></div>
                      <div className="result-controls"><select value={activeSession.size} onChange={(event) => updateSession(activeSession.id, { size: Number(event.target.value) })}><option value={20}>20 / 页</option><option value={50}>50 / 页</option><option value={100}>100 / 页</option><option value={200}>200 / 页</option></select><button type="button" disabled={activeSession.page <= 1 || activeSession.status === 'loading'} onClick={() => void runSearch(activeSession.id, queryDraft, activeSession.page - 1)}>上一页</button><span>{activeSession.page} / {Math.max(1, Math.ceil(total / activeSession.size))}</span><button type="button" disabled={activeSession.page * activeSession.size >= total || activeSession.status === 'loading'} onClick={() => void runSearch(activeSession.id, queryDraft, activeSession.page + 1)}>下一页</button><button className="icon-button" type="button" title="刷新当前页" disabled={activeSession.status === 'loading'} onClick={() => void runSearch(activeSession.id, queryDraft, activeSession.page)}><Icon name="refresh" /></button></div>
                    </header>

                    {activeSession.status === 'error' && <div className="error-state"><Icon name="terminal" size={30} /><strong>请求失败</strong><p>{activeSession.error}</p><button type="button" onClick={() => void runSearch()}>重试</button></div>}
                    {activeSession.status === 'loading' && <div className="loading-state"><span className="radar-spinner"><Icon name="radar" size={34} /></span><strong>正在查询第三方数据源</strong><p>请求已进入串行队列，约需 3–45 秒。</p></div>}
                    {activeSession.status !== 'loading' && activeSession.status !== 'error' && groups.length === 0 && <div className="empty-state"><div className="empty-orbit"><Icon name="radar" size={38} /></div><p className="eyebrow">READY TO INVESTIGATE</p><h3>从一个指纹或 FOFA 语句开始</h3><p>可以载入左侧指纹，或使用查询编辑器中的语法快速操作。结果会按 IP 聚合为资产卡片。</p><div className="empty-actions"><button type="button" onClick={() => showSidebarTab('fingerprints')}><Icon name="library" /> 浏览指纹库</button><button type="button" onClick={() => showSidebarTab('knowledge')}><Icon name="knowledge" /> 查看知识库</button></div></div>}
                    {activeSession.status !== 'loading' && groups.length > 0 && <div className="asset-list">{groups.map((group) => <AssetCard group={group} key={group.ip} onOpenBrowser={(url) => createBrowserSession(url, activeSession.id)} />)}</div>}
                  </section>}
                  {layout.insights.visible && <InsightsPanel records={activeRecords} side={layout.insights.side} />}
                </div>}
                {!layout.viewer && !layout.insights.visible && <div className="panels-hidden-hint"><Icon name="layout" size={26} /><p>主查看窗口与画像面板均已隐藏</p><button type="button" onClick={() => setLayoutMenuOpen(true)}>调整面板布局</button></div>}

                {layout.editor.visible && layout.editor.dock === 'bottom' && editorSlot}
              </>}

              {browserTabs.map((tab) => <div className={`browser-tab-view ${tab.id === activeSession.id ? 'is-active' : ''}`} key={tab.id}>
                <EmbeddedBrowser
                  tabId={tab.id}
                  initialUrl={tab.url || 'about:blank'}
                  onMeta={handleBrowserMeta}
                  onNewTab={(url) => { createBrowserSession(url, tab.id) }}
                />
              </div>)}
            </div>
          </div>
        </main>
      </div>

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} keyStatus={keyStatus} onKeyStatusChange={setKeyStatus} notify={notify} />}

      {presetManagerOpen && <PresetManager onClose={() => setPresetManagerOpen(false)} onInsert={(content) => { const merged = cardsToQuery(mergeCards(parseQueryToCards(queryDraft), parseQueryToCards(content))); setQueryDraft(merged); updateSession(activeSession.id, { query: merged }); notify('已并入查询编辑器', 'ok') }} onOverwrite={(content) => { setQueryDraft(content); updateSession(activeSession.id, { query: content }); notify('已用预设覆盖查询编辑器', 'ok') }} onNotify={notify} />}

      {fingerprintDraft && <Modal title="指纹详情" onClose={() => setFingerprintDraft(null)} width={650}><div className="modal-body form-grid">
        <label><span>名称</span><input autoFocus value={fingerprintDraft.name} onChange={(event) => setFingerprintDraft({ ...fingerprintDraft, name: event.target.value })} /></label>
        <label><span>文件夹</span><input value={fingerprintDraft.folder} onChange={(event) => setFingerprintDraft({ ...fingerprintDraft, folder: event.target.value })} placeholder="例如：摄像头 / 国产设备" /></label>
        <label className="full"><span>FOFA 查询语句</span><textarea value={fingerprintDraft.query} onChange={(event) => setFingerprintDraft({ ...fingerprintDraft, query: event.target.value })} /></label>
        <label><span>产品</span><input value={fingerprintDraft.product} onChange={(event) => setFingerprintDraft({ ...fingerprintDraft, product: event.target.value })} /></label>
        <label><span>分类</span><input value={fingerprintDraft.category} onChange={(event) => setFingerprintDraft({ ...fingerprintDraft, category: event.target.value })} /></label>
        <label><span>国家/地区</span><input value={fingerprintDraft.country} onChange={(event) => setFingerprintDraft({ ...fingerprintDraft, country: event.target.value })} /></label>
        <label><span>Server</span><input value={fingerprintDraft.server} onChange={(event) => setFingerprintDraft({ ...fingerprintDraft, server: event.target.value })} /></label>
        <label><span>Title</span><input value={fingerprintDraft.title} onChange={(event) => setFingerprintDraft({ ...fingerprintDraft, title: event.target.value })} /></label>
        <label><span>厂商</span><input value={fingerprintDraft.vendor} onChange={(event) => setFingerprintDraft({ ...fingerprintDraft, vendor: event.target.value })} /></label>
        <label><span>型号</span><input value={fingerprintDraft.model} onChange={(event) => setFingerprintDraft({ ...fingerprintDraft, model: event.target.value })} /></label>
        <label className="full"><span>备注</span><textarea value={fingerprintDraft.note} onChange={(event) => setFingerprintDraft({ ...fingerprintDraft, note: event.target.value })} /></label>
        <div className="modal-footer full"><button className="button ghost" type="button" onClick={() => setFingerprintDraft(null)}>取消</button><button className="button primary" type="button" onClick={saveFingerprintDraft}><Icon name="save" /> 保存指纹</button></div>
      </div></Modal>}

      {knowledgeDraft && <Modal title="知识库记录" onClose={() => setKnowledgeDraft(null)} width={600}><div className="modal-body form-grid">
        <label><span>名称 / 贴牌</span><input autoFocus value={knowledgeDraft.name} onChange={(event) => setKnowledgeDraft({ ...knowledgeDraft, name: event.target.value })} /></label>
        <label><span>母厂 / 关系</span><input value={knowledgeDraft.parent} onChange={(event) => setKnowledgeDraft({ ...knowledgeDraft, parent: event.target.value })} /></label>
        <label><span>Server</span><input value={knowledgeDraft.server} onChange={(event) => setKnowledgeDraft({ ...knowledgeDraft, server: event.target.value })} /></label>
        <label><span>Title</span><input value={knowledgeDraft.title} onChange={(event) => setKnowledgeDraft({ ...knowledgeDraft, title: event.target.value })} /></label>
        <label><span>文件夹</span><input value={knowledgeDraft.folder} onChange={(event) => setKnowledgeDraft({ ...knowledgeDraft, folder: event.target.value })} /></label>
        <label className="full"><span>备注</span><textarea value={knowledgeDraft.note} onChange={(event) => setKnowledgeDraft({ ...knowledgeDraft, note: event.target.value })} placeholder="记录 UI、默认口令线索、型号关系、验证过程…" /></label>
        <div className="modal-footer full"><button className="button ghost" type="button" onClick={() => setKnowledgeDraft(null)}>取消</button><button className="button primary" type="button" onClick={saveKnowledgeDraft}><Icon name="save" /> 保存记录</button></div>
      </div></Modal>}

      <div className="toast-stack">{toasts.map((toast) => <div className={`toast ${toast.tone}`} key={toast.id}><span>{toast.tone === 'ok' ? '✓' : '!'}</span>{toast.text}</div>)}</div>
    </div>
  )
}

export default App







