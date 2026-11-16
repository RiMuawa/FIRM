/**
 * 语义单元识别与分层编号。
 *
 * 单元粒度（与需求确认一致）：
 *  - 控件（button / a / role=button|switch|tab / splitter）整体一个编号，内部图标与文字不再拆分；
 *  - 输入（input / select / textarea）；
 *  - 独立图标（svg）、图片（img）；
 *  - 文本单元：子节点仅含文字与行内装饰（i/b/em/kbd/br/svg 等）且有可见文字。
 * 容器（div/section/...）不单独编号，只作为编号路径段；卡片等重复列表项按
 * 「同类兄弟 ≥2 时追加 1-based 序号」消歧。编号由 DOM 结构确定性推导，跨会话稳定。
 */

export type UnitKind = 'control' | 'input' | 'icon' | 'text' | 'image'

export interface UnitInfo {
  id: string
  region: string
  kind: UnitKind
  el: HTMLElement
  tag: string
  label: string
}

const CONTROL_SELECTOR = 'button, a, [role="button"], [role="switch"], [role="tab"], .splitter'
const INPUT_SELECTOR = 'input, select, textarea'
const SKIP_TAGS = new Set(['script', 'style', 'link', 'meta', 'noscript', 'template', 'title'])
const TEXT_INLINE_TAGS = new Set(['i', 'b', 'em', 'kbd', 'br', 'cite', 'u', 'svg'])

/** 明确不作路径段的通用容器类 */
const DROP_EXACT = new Set([
  'app-shell', 'workbench', 'main-dock', 'main-body', 'tab-content', 'results-layout',
  'editor-slot', 'modal-backdrop', 'browser-surface', 'browser-tab-view'
])
const DROP_SUFFIX = /(wrap|list|body|layout|content|dock|shell|pane|slot|box|root|panel)$/

const FALLBACK_SUFFIX: Record<UnitKind, string> = {
  control: 'btn',
  input: 'input',
  icon: 'icon',
  text: 'text',
  image: 'img'
}

/** 已知弹窗 aria-label → 可读区域名 */
const MODAL_REGIONS: Record<string, string> = {
  '数据源与安全设置': 'modal-settings',
  '指纹详情': 'modal-fingerprint',
  '知识库记录': 'modal-knowledge'
}

const REGION_ROOTS: Array<[string, (el: Element) => string]> = [
  ['.preset-manager', () => 'preset-manager'],
  ['.modal-card', (el) => MODAL_REGIONS[el.getAttribute('aria-label') || ''] || 'modal'],
  ['.titlebar', () => 'titlebar'],
  ['.layout-menu', () => 'layout-menu'],
  ['.activity-rail', () => 'rail'],
  ['.left-dock', () => 'sidebar'],
  ['.session-bar', () => 'sessionbar'],
  ['.tab-tree-panel', () => 'tabtree'],
  ['.search-command', () => 'searchbar'],
  ['.query-dock', () => 'editor'],
  ['.result-pane', () => 'viewer'],
  ['.insights-panel', () => 'insights'],
  ['.embedded-browser', () => 'browser'],
  ['.stats-view', () => 'stats'],
  ['.toast-stack', () => 'toast'],
  ['.query-ac-menu', () => 'autocomplete'],
  ['.query-ac-ghost', () => 'autocomplete']
]

/** 高频引用元素的手工别名（选择器命中即整体替换编号，区域随别名） */
const ALIASES: Array<[string, string]> = [
  ['.titlebar-icon[title="面板布局"]', 'titlebar.btn.layout'],
  ['.titlebar-icon[title="最小化"]', 'titlebar.btn.minimize'],
  ['.titlebar-icon[title="最大化"]', 'titlebar.btn.maximize'],
  ['.titlebar-icon[title="关闭"]', 'titlebar.btn.close'],
  ['.key-chip', 'titlebar.key-chip'],
  ['.brand-mark svg', 'titlebar.brand-mark'],
  ['.rail-logo', 'rail.logo'],
  ['.rail-button[title*="指纹库"]', 'rail.button.fingerprints'],
  ['.rail-button[title*="知识库"]', 'rail.button.knowledge'],
  ['.rail-button[title*="使用统计"]', 'rail.button.stats'],
  ['.rail-button[title="设置"]', 'rail.button.settings'],
  ['.tree-toggle', 'sessionbar.tree-toggle'],
  ['.command-run', 'searchbar.run'],
  ['.command-save', 'searchbar.save-fingerprint']
]

function classToken(el: Element): string {
  for (const token of el.classList) {
    if (token.startsWith('is-')) continue
    if (DROP_EXACT.has(token)) continue
    if (DROP_SUFFIX.test(token)) continue
    return token
  }
  return ''
}

function aliasId(el: HTMLElement): string {
  for (const [selector, id] of ALIASES) {
    try { if (el.matches(selector)) return id } catch { /* 动态 class 导致的非法选择器，忽略 */ }
  }
  return ''
}

function regionOf(el: Element): string | null {
  for (const [selector, resolve] of REGION_ROOTS) {
    if (el.matches(selector)) return resolve(el)
  }
  return null
}

function shouldSkip(el: Element): boolean {
  if (!(el instanceof HTMLElement || el instanceof SVGElement)) return true
  if (SKIP_TAGS.has(el.tagName.toLowerCase())) return true
  if (el.closest('.des-root') || el.closest('.des-webview-stub')) return true
  return false
}

function isTextUnit(el: HTMLElement): boolean {
  if (!el.textContent.trim()) return false
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) continue
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = (node as Element).tagName.toLowerCase()
      if (!TEXT_INLINE_TAGS.has(tag)) return false
      continue
    }
    return false
  }
  return true
}

function unitKindOf(el: Element): UnitKind | null {
  if (el instanceof HTMLElement) {
    if (el.matches(CONTROL_SELECTOR)) return 'control'
    if (el.matches(INPUT_SELECTOR)) return 'input'
    if (el.tagName === 'IMG') return 'image'
    if (isTextUnit(el)) return 'text'
    return null
  }
  if (el instanceof SVGElement && el.tagName.toLowerCase() === 'svg') return 'icon'
  return null
}

function unitLabel(el: HTMLElement, kind: UnitKind): string {
  const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
  if (kind === 'input') {
    const input = el as HTMLInputElement
    return el.getAttribute('placeholder') || input.value?.trim() || el.getAttribute('aria-label') || '输入控件'
  }
  if (kind === 'icon') {
    const owner = el.closest('button, a, [title]')
    const ownerTitle = owner?.getAttribute('title')
    return ownerTitle ? `图标（${ownerTitle}）` : '图标'
  }
  if (kind === 'image') return el.getAttribute('alt') || '图片'
  return el.getAttribute('title') || el.getAttribute('aria-label') || text
}

/** 追加路径段；同类兄弟 ≥2 时全部改为 base-N（1-based，按 DOM 顺序） */
function appendSegment(segments: string[], base: string, count: number, seen: Map<string, number>): string[] {
  if (!base) return segments
  let segment = base
  if (count > 1) segment = `${base}-${(seen.get(base) || 0) + 1}`
  seen.set(base, (seen.get(base) || 0) + 1)
  const next = [...segments, segment]
  return next.length > 3 ? next.slice(next.length - 3) : next
}

function pushUnit(out: UnitInfo[], usedIds: Set<string>, usedEls: Set<HTMLElement>, unit: UnitInfo): void {
  if (usedEls.has(unit.el)) return
  let id = unit.id
  if (usedIds.has(id)) {
    let suffix = 2
    while (usedIds.has(`${id}-${suffix}`)) suffix++
    id = `${id}-${suffix}`
    unit = { ...unit, id }
  }
  usedIds.add(id)
  usedEls.add(unit.el)
  out.push(unit)
}

function walkContainer(container: Element, region: string, segments: string[], out: UnitInfo[], usedIds: Set<string>, usedEls: Set<HTMLElement>): void {
  const children = Array.from(container.children).filter((child) => !shouldSkip(child))

  const segBase = new Map<Element, string>()
  const segCount = new Map<string, number>()
  for (const child of children) {
    const base = child instanceof HTMLElement ? classToken(child) : ''
    segBase.set(child, base)
    if (base) segCount.set(base, (segCount.get(base) || 0) + 1)
  }
  const segSeen = new Map<string, number>()

  const suffixBase = new Map<Element, string>()
  const suffixCount = new Map<string, number>()
  for (const child of children) {
    const kind = unitKindOf(child)
    if (!kind) continue
    const alias = child instanceof HTMLElement ? aliasId(child) : ''
    const base = alias ? '' : (child instanceof HTMLElement && classToken(child)) || FALLBACK_SUFFIX[kind]
    suffixBase.set(child, base)
    suffixCount.set(base, (suffixCount.get(base) || 0) + 1)
  }
  const suffixSeen = new Map<string, number>()

  for (const child of children) {
    const childRegion = regionOf(child)
    const kind = unitKindOf(child)
    if (kind && child instanceof HTMLElement) {
      // 单元本身：区域名进 ID 前缀，自身 class 只作后缀（不再进路径段，避免重复）
      const alias = aliasId(child)
      const id = alias || [childRegion || region, ...segments, numberedSuffix(suffixBase.get(child) || 'unit', suffixCount.get(suffixBase.get(child) || 'unit') || 1, suffixSeen)].join('.')
      pushUnit(out, usedIds, usedEls, {
        id,
        region: alias ? alias.split('.')[0] : (childRegion || region),
        kind,
        el: child,
        tag: child.tagName.toLowerCase(),
        label: unitLabel(child, kind)
      })
      continue
    }
    const nextSegments = childRegion ? [] : appendSegment(segments, segBase.get(child) || '', segCount.get(segBase.get(child) || '') || 0, segSeen)
    walkContainer(child, childRegion || region, nextSegments, out, usedIds, usedEls)
  }
}

function numberedSuffix(base: string, count: number, seen: Map<string, number>): string {
  if (count <= 1) return base
  const next = (seen.get(base) || 0) + 1
  seen.set(base, next)
  return `${base}-${next}`
}

/** #root 之外的 React portal 岛（如查询编辑器自动补全浮层） */
export function portalRoots(): HTMLElement[] {
  return Array.from(document.body.children).filter((el): el is HTMLElement =>
    el instanceof HTMLElement
    && el.id !== 'root' && el.id !== 'inspector-root'
    && !el.classList.contains('des-root')
    && !SKIP_TAGS.has(el.tagName.toLowerCase()))
}

export function collectUnits(): UnitInfo[] {
  const out: UnitInfo[] = []
  const usedIds = new Set<string>()
  const usedEls = new Set<HTMLElement>()
  const root = document.getElementById('root')
  if (root) walkContainer(root, 'page', [], out, usedIds, usedEls)
  for (const portal of portalRoots()) walkContainer(portal, 'page', [], out, usedIds, usedEls)
  return out
}
