/**
 * <webview> 浏览器桩。纯浏览器中该 Electron 标签只是未知元素，且 "webview"
 * 不含连字符、无法用 customElements.define 注册，因此改用实例补丁方案：
 * 监听 DOM 中出现的每个 <webview>，直接在元素上挂载 EmbeddedBrowser 依赖的
 * loadURL / getURL / reload / stop / goBack / goForward / canGoBack / canGoForward
 * 方法，并按需派发 did-start-loading / did-navigate / page-title-updated /
 * did-stop-loading 等事件；内容区渲染占位 UI，使地址栏、前进 / 后退 / 刷新、
 * 加载进度条等交互全部真实可用。
 */

interface StubState {
  history: string[]
  index: number
  timer: number
  booted: boolean
}

const stubStates = new WeakMap<HTMLElement, StubState>()
let observer: MutationObserver | null = null

function titleForUrl(url: string): string {
  if (!url || url === 'about:blank') return '空白页'
  try { return new URL(url).hostname || url } catch { return url }
}

const PLACEHOLDER_HTML = `
<div class="des-webview-stub">
  <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="8.5"></circle><path d="M3.5 12h17M12 3.5c2.4 2.3 3.7 5.1 3.7 8.5s-1.3 6.2-3.7 8.5c-2.4-2.3-3.7-5.1-3.7-8.5s1.3-6.2 3.7-8.5Z"></path>
  </svg>
  <strong>内嵌浏览器 · 设计复刻占位</strong>
  <p>复刻页不加载真实网页；地址栏、前进 / 后退 / 刷新与加载进度均为真实交互。</p>
  <code class="des-webview-stub-url">about:blank</code>
</div>`

function runNavigation(el: HTMLElement, state: StubState, url: string): void {
  window.clearTimeout(state.timer)
  state.booted = true
  const urlLabel = el.querySelector('.des-webview-stub-url')
  if (urlLabel) urlLabel.textContent = url
  el.dispatchEvent(new Event('did-start-loading'))
  state.timer = window.setTimeout(() => {
    el.dispatchEvent(new CustomEvent('did-navigate', { detail: { url } }))
    el.dispatchEvent(new CustomEvent('did-navigate-in-page', { detail: { url } }))
    el.dispatchEvent(new CustomEvent('page-title-updated', { detail: { title: titleForUrl(url) } }))
    el.dispatchEvent(new Event('did-stop-loading'))
  }, 450)
}

type StubbedWebview = HTMLElement & {
  loadURL: (url: string) => Promise<void>
  getURL: () => string
  reload: () => void
  stop: () => void
  goBack: () => void
  goForward: () => void
  canGoBack: () => boolean
  canGoForward: () => boolean
}

function stubWebview(el: HTMLElement): void {
  if (stubStates.has(el)) return
  const state: StubState = { history: [], index: -1, timer: 0, booted: false }
  stubStates.set(el, state)
  if (!el.innerHTML.trim()) el.innerHTML = PLACEHOLDER_HTML

  const view = el as StubbedWebview
  view.loadURL = async (url: string): Promise<void> => {
    state.history = state.history.slice(0, state.index + 1)
    state.history.push(url)
    state.index = state.history.length - 1
    runNavigation(el, state, url)
  }
  view.getURL = (): string => state.history[state.index] || ''
  view.reload = (): void => {
    const current = view.getURL()
    if (current) runNavigation(el, state, current)
  }
  view.stop = (): void => {
    window.clearTimeout(state.timer)
    el.dispatchEvent(new Event('did-stop-loading'))
  }
  view.goBack = (): void => {
    if (!view.canGoBack()) return
    state.index -= 1
    runNavigation(el, state, state.history[state.index])
  }
  view.goForward = (): void => {
    if (!view.canGoForward()) return
    state.index += 1
    runNavigation(el, state, state.history[state.index])
  }
  view.canGoBack = (): boolean => state.index > 0
  view.canGoForward = (): boolean => state.index >= 0 && state.index < state.history.length - 1

  const src = el.getAttribute('src')
  if (src) {
    state.history = [src]
    state.index = 0
    // 延迟到 React 事件监听挂好之后再走一次导航事件流
    window.setTimeout(() => runNavigation(el, state, src), 120)
  }
}

function isWebview(node: Node): node is HTMLElement {
  return node instanceof HTMLElement && node.tagName.toLowerCase() === 'webview'
}

export function installWebviewStub(): void {
  if (observer) return
  document.querySelectorAll('webview').forEach((el) => { if (isWebview(el)) stubWebview(el) })
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue
          if (isWebview(node)) stubWebview(node)
          else node.querySelectorAll?.('webview').forEach((el) => { if (isWebview(el)) stubWebview(el) })
        }
        continue
      }
      if (mutation.type === 'attributes' && mutation.attributeName === 'src' && isWebview(mutation.target)) {
        const el = mutation.target
        const next = el.getAttribute('src')
        const state = stubStates.get(el)
        if (!next || !state) continue
        const current = state.history[state.index] || ''
        if (next !== current) {
          state.history = state.history.slice(0, state.index + 1)
          state.history.push(next)
          state.index = state.history.length - 1
          runNavigation(el, state, next)
        }
      }
    }
  })
  observer.observe(document.body, { childList: true, subtree: true, attributeFilter: ['src'] })
}
