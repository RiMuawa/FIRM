import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties } from 'react'
import { bus, mockControls } from '../mockApi'
import type { SearchOverride } from '../mockApi'
import { getRegistrySnapshot, startRegistry, subscribeRegistry } from './registry'
import type { RegistryEntry } from './registry'
import type { UnitKind } from './ids'
import './inspector.css'

/**
 * 设计复刻页检视器：悬浮工具条（检视开关 / 状态切换器 / 弹窗快捷开关）、
 * hover 高亮、右键编号卡片、元素映射表面板（双向联动）、自身 toast。
 */

interface Rect { left: number; top: number; width: number; height: number }

interface OverlayToast { key: number; text: string; tone: 'ok' | 'warn' | 'error' }

interface CtxCard { entry: RegistryEntry; x: number; y: number }

const KIND_LABELS: Record<UnitKind, string> = { control: '按钮', input: '输入', icon: '图标', text: '文本', image: '图片' }

const KIND_FILTERS: Array<{ value: 'all' | UnitKind; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'control', label: '按钮' },
  { value: 'input', label: '输入' },
  { value: 'icon', label: '图标' },
  { value: 'text', label: '文本' },
  { value: 'image', label: '图片' }
]

const OVERRIDE_OPTIONS: Array<{ value: SearchOverride; label: string }> = [
  { value: null, label: '正常' },
  { value: 'empty', label: '空结果' },
  { value: 'loading', label: '加载中' },
  { value: 'error', label: '错误' }
]

function rectOf(el: HTMLElement): Rect {
  const rect = el.getBoundingClientRect()
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}

function boxStyle(rect: Rect): CSSProperties {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}

function isElementVisible(el: HTMLElement): boolean {
  if (typeof el.checkVisibility === 'function') return el.checkVisibility()
  return el.getClientRects().length > 0
}

export default function Inspector() {
  const snapshot = useSyncExternalStore(subscribeRegistry, getRegistrySnapshot)
  const [inspectOn, setInspectOn] = useState(true)
  const [panelOpen, setPanelOpen] = useState(true)
  const [toolbarExpanded, setToolbarExpanded] = useState(false)
  const [override, setOverride] = useState<SearchOverride>(null)
  const [filter, setFilter] = useState('')
  const [kindFilter, setKindFilter] = useState<'all' | UnitKind>('all')
  const [hover, setHover] = useState<{ id: string; rect: Rect } | null>(null)
  const [rowHover, setRowHover] = useState<{ id: string; rect: Rect } | null>(null)
  const [ctx, setCtx] = useState<CtxCard | null>(null)
  const [flash, setFlash] = useState<Rect | null>(null)
  const [rowFlashId, setRowFlashId] = useState<string | null>(null)
  const [focus, setFocus] = useState<{ id: string; seq: number } | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [toasts, setToasts] = useState<OverlayToast[]>([])

  const entriesRef = useRef(snapshot)
  entriesRef.current = snapshot
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  const toastSeq = useRef(0)
  const focusSeq = useRef(0)
  const flashTimer = useRef(0)

  const toast = useCallback((text: string, tone: OverlayToast['tone'] = 'ok') => {
    const key = ++toastSeq.current
    setToasts((current) => [...current, { key, text, tone }])
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.key !== key)), 3200)
  }, [])

  // ---- 全局事件 ------------------------------------------------------------

  useEffect(() => { startRegistry() }, [])

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ text: string; tone?: OverlayToast['tone'] }>).detail
      if (detail) toast(detail.text, detail.tone || 'ok')
    }
    bus.addEventListener('des-toast', handler)
    return () => bus.removeEventListener('des-toast', handler)
  }, [toast])

  // hover 高亮（rAF 节流；仅检视模式开启时接管）
  useEffect(() => {
    if (!inspectOn) { setHover(null); return }
    let frame = 0
    const onMove = (event: PointerEvent) => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const target = event.target
        if (!(target instanceof Element) || target.closest('.des-root')) { setHover(null); return }
        const unit = target.closest('[data-des-id]')
        if (!(unit instanceof HTMLElement)) { setHover(null); return }
        setHover({ id: unit.getAttribute('data-des-id') || '', rect: rectOf(unit) })
      })
    }
    window.addEventListener('pointermove', onMove, true)
    return () => {
      window.removeEventListener('pointermove', onMove, true)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [inspectOn])

  // 右键 = 查看编号（接管默认菜单）
  useEffect(() => {
    const onContext = (event: MouseEvent) => {
      if (!inspectOn) return
      event.preventDefault()
      event.stopPropagation()
      const target = event.target
      if (!(target instanceof Element) || target.closest('.des-root')) return
      const unit = target.closest('[data-des-id]')
      if (!(unit instanceof HTMLElement)) { setCtx(null); return }
      const entry = entriesRef.current.entries.find((item) => item.el === unit)
        || { id: unit.getAttribute('data-des-id') || '', region: 'page', kind: 'control' as UnitKind, el: unit, tag: unit.tagName.toLowerCase(), label: '', visible: isElementVisible(unit) }
      setCtx({
        entry: { ...entry, visible: isElementVisible(unit) },
        x: Math.max(8, Math.min(event.clientX, window.innerWidth - 322)),
        y: Math.max(8, Math.min(event.clientY, window.innerHeight - 230))
      })
    }
    window.addEventListener('contextmenu', onContext, true)
    return () => window.removeEventListener('contextmenu', onContext, true)
  }, [inspectOn])

  // 点击空白 / Esc 关闭右键卡片
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('.des-ctx, .des-toolbar, .des-panel')) return
      setCtx(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setCtx(null); setHover(null) }
    }
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  // ---- 定位 / 联动 -----------------------------------------------------------

  const runFlash = useCallback((el: HTMLElement) => {
    window.clearTimeout(flashTimer.current)
    const start = performance.now()
    const tick = () => {
      if (!el.isConnected) { setFlash(null); return }
      setFlash(rectOf(el))
      if (performance.now() - start < 1300) flashTimer.current = window.setTimeout(tick, 80)
      else setFlash(null)
    }
    tick()
  }, [])

  const locateElement = useCallback((entry: RegistryEntry) => {
    if (!entry.el.isConnected) { toast('该元素已不在当前页面上', 'warn'); return }
    if (!isElementVisible(entry.el)) { toast('该元素当前不可见：请先打开对应面板 / 弹窗（可用工具条「打开」快捷键）', 'warn'); return }
    entry.el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    runFlash(entry.el)
  }, [runFlash, toast])

  const locateInPanel = useCallback((id: string) => {
    setKindFilter('all')
    setFilter('')
    setPanelOpen(true)
    window.setTimeout(() => setFocus({ id, seq: ++focusSeq.current }), 0)
  }, [])

  useEffect(() => {
    if (!focus) return
    const node = rowRefs.current.get(focus.id)
    if (!node) return
    node.scrollIntoView({ block: 'center' })
    setRowFlashId(focus.id)
    const timer = window.setTimeout(() => setRowFlashId(null), 1500)
    return () => window.clearTimeout(timer)
  }, [focus])

  const copyId = useCallback((id: string) => {
    void navigator.clipboard?.writeText(id)
      .then(() => toast(`编号已复制：${id}`))
      .catch(() => toast('复制失败：浏览器剪贴板不可用', 'error'))
  }, [toast])

  // ---- 状态切换器动作 --------------------------------------------------------

  const setOverrideValue = useCallback((value: SearchOverride) => {
    mockControls.searchOverride = value
    setOverride(value)
    const label = OVERRIDE_OPTIONS.find((option) => option.value === value)?.label || '正常'
    toast(value ? `下一次搜索将强制进入「${label}」状态` : '搜索状态已恢复正常', 'ok')
  }, [toast])

  const clickSelector = (selector: string): boolean => {
    const el = document.querySelector<HTMLElement>(selector)
    if (!el) return false
    el.click()
    return true
  }

  const openSettings = () => {
    if (!clickSelector('.rail-button[title="设置"]')) clickSelector('.key-chip')
  }
  const openLayoutMenu = () => { clickSelector('.titlebar-icon[title="面板布局"]') }
  const toggleStats = () => { clickSelector('.rail-button[title*="使用统计"]') }
  const openFingerprintModal = () => { clickSelector('.command-save') }
  const openPresetManager = () => {
    const manage = [...document.querySelectorAll<HTMLElement>('.query-preset-head button')]
      .find((button) => button.textContent?.includes('管理预设'))
    if (manage) { manage.click(); return }
    const toggle = [...document.querySelectorAll<HTMLElement>('.query-head-actions button')]
      .find((button) => button.textContent?.includes('预设'))
    toggle?.click()
    window.setTimeout(() => {
      [...document.querySelectorAll<HTMLElement>('.query-preset-head button')]
        .find((button) => button.textContent?.includes('管理预设'))?.click()
    }, 60)
  }
  const closeOverlays = () => {
    document.querySelectorAll<HTMLElement>('.modal-card .modal-head .icon-button').forEach((button) => button.click())
    document.querySelector('.layout-menu-overlay')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    toast('已尝试关闭全部弹窗与浮层')
  }

  // ---- 映射表数据 ------------------------------------------------------------

  const entries = snapshot.entries
  const filtered = useMemo(() => {
    const keyword = filter.trim().toLowerCase()
    return entries.filter((entry) =>
      (kindFilter === 'all' || entry.kind === kindFilter)
      && (!keyword
        || entry.id.toLowerCase().includes(keyword)
        || entry.label.toLowerCase().includes(keyword)
        || entry.tag.toLowerCase().includes(keyword)))
  }, [entries, filter, kindFilter])

  const groups = useMemo(() => {
    const map = new Map<string, RegistryEntry[]>()
    for (const entry of filtered) {
      const list = map.get(entry.region) || []
      list.push(entry)
      map.set(entry.region, list)
    }
    return [...map.entries()].map(([region, list]) => ({ region, list }))
  }, [filtered])

  const toggleGroup = (region: string) => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(region)) next.delete(region)
      else next.add(region)
      return next
    })
  }

  // ---- 渲染 ------------------------------------------------------------------

  return <div className="des-root">
    <div className="des-toolbar">
      {!toolbarExpanded && <>
        <button type="button" className={inspectOn ? 'is-on' : ''} onClick={() => setInspectOn((value) => !value)}>
          {inspectOn ? '◉ 检视 ON' : '○ 检视 OFF'}
        </button>
        <button type="button" className={panelOpen ? 'is-on' : ''} onClick={() => setPanelOpen((value) => !value)}>映射表</button>
        <button type="button" onClick={() => setToolbarExpanded(true)}>工具 ▾</button>
      </>}
      {toolbarExpanded && <>
        <button type="button" className={inspectOn ? 'is-on' : ''} onClick={() => setInspectOn((value) => !value)}>
          {inspectOn ? '◉ 检视 ON' : '○ 检视 OFF'}
        </button>
        <button type="button" className={panelOpen ? 'is-on' : ''} onClick={() => setPanelOpen((value) => !value)}>映射表</button>
        <span className="des-toolbar-sep" />
        <span className="des-toolbar-group"><em>搜索</em>
          {OVERRIDE_OPTIONS.map((option) => (
            <button key={option.label} type="button" className={override === option.value ? 'is-on' : ''} onClick={() => setOverrideValue(option.value)}>
              {option.label}
            </button>
          ))}
        </span>
        <span className="des-toolbar-sep" />
        <span className="des-toolbar-group"><em>打开</em>
          <button type="button" onClick={openSettings}>设置</button>
          <button type="button" onClick={openPresetManager}>预设管理</button>
          <button type="button" onClick={openFingerprintModal}>指纹弹窗</button>
          <button type="button" onClick={openLayoutMenu}>布局菜单</button>
          <button type="button" onClick={toggleStats}>统计页</button>
          <button type="button" onClick={closeOverlays}>收起弹窗</button>
        </span>
        <button type="button" onClick={() => setToolbarExpanded(false)}>▴ 收起</button>
      </>}
    </div>

    {panelOpen && <aside className="des-panel">
      <div className="des-panel-head">
        <strong>元素映射表</strong>
        <b>{filtered.length}/{entries.length}</b>
        <input className="des-panel-search" placeholder="搜索编号 / 文本 / 标签…" value={filter} onChange={(event) => setFilter(event.target.value)} spellCheck={false} />
        <button type="button" className="des-panel-close" onClick={() => setPanelOpen(false)}>收起</button>
      </div>
      <div className="des-panel-filters">
        {KIND_FILTERS.map((option) => (
          <button key={option.value} type="button" className={`des-chip ${kindFilter === option.value ? 'is-on' : ''}`} onClick={() => setKindFilter(option.value)}>
            {option.label}
          </button>
        ))}
      </div>
      <div className="des-panel-body">
        {groups.length === 0 && <div className="des-panel-foot">没有匹配的条目，试试清空搜索或切换过滤条件。</div>}
        {groups.map(({ region, list }) => {
          const isCollapsed = collapsed.has(region)
          return <div key={region}>
            <div className="des-group-head" onClick={() => toggleGroup(region)}>
              <strong>{region}</strong>
              <small>{list.length} 项</small>
              <span className="des-caret">{isCollapsed ? '▸' : '▾'}</span>
            </div>
            {!isCollapsed && list.map((entry) => (
              <div
                key={entry.id}
                ref={(node) => { if (node) rowRefs.current.set(entry.id, node); else rowRefs.current.delete(entry.id) }}
                className={`des-row ${entry.visible ? '' : 'is-hidden'} ${rowFlashId === entry.id ? 'is-flash' : ''}`}
                title={`${entry.id} · ${entry.label}`}
                onClick={() => locateElement(entry)}
                onMouseEnter={() => setRowHover({ id: entry.id, rect: rectOf(entry.el) })}
                onMouseLeave={() => setRowHover(null)}
              >
                <span className="des-dot" />
                <span className="des-id">{entry.id}</span>
                <span className="des-kind">{KIND_LABELS[entry.kind]}</span>
                <span className="des-label">{entry.label || '—'}</span>
              </div>
            ))}
          </div>
        })}
      </div>
      <div className="des-panel-foot">
        条件元素（弹窗、浮层、toast、加载态）出现后自动入表；隐藏元素可用工具条「打开」快捷唤出。点击行可在页面中定位，右键页面元素可查看编号。
      </div>
    </aside>}

    {inspectOn && hover && <div className="des-hl" style={boxStyle(hover.rect)}><div className="des-hl-label">{hover.id}</div></div>}
    {rowHover && <div className="des-hl des-hl--row" style={boxStyle(rowHover.rect)}><div className="des-hl-label">{rowHover.id}</div></div>}
    {flash && <div className="des-flash" style={boxStyle(flash)} />}

    {ctx && <div className="des-ctx" style={{ left: ctx.x, top: ctx.y }}>
      <div className="des-ctx-id" title="点击复制编号" onClick={() => copyId(ctx.entry.id)}>
        {ctx.entry.id}<span>复制</span>
      </div>
      <div className="des-ctx-meta">
        <span className="des-kind">{KIND_LABELS[ctx.entry.kind]}</span>
        <span className="des-kind">{ctx.entry.tag}</span>
        <span className={`des-ctx-vis ${ctx.entry.visible ? '' : 'is-hidden'}`}>{ctx.entry.visible ? '当前可见' : '当前不可见'}</span>
      </div>
      {ctx.entry.label && <div className="des-ctx-label">{ctx.entry.label}</div>}
      <div className="des-ctx-actions">
        <button type="button" onClick={() => locateInPanel(ctx.entry.id)}>在映射表中定位</button>
      </div>
    </div>}

    <div className="des-toasts">
      {toasts.map((item) => <div key={item.key} className={`des-toast ${item.tone}`}>{item.text}</div>)}
    </div>
  </div>
}
