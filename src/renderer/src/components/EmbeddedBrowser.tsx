import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'

interface EmbeddedWebviewElement extends HTMLElement {
  loadURL: (url: string) => Promise<void>
  getURL: () => string
  reload: () => void
  stop: () => void
  goBack: () => void
  goForward: () => void
  canGoBack: () => boolean
  canGoForward: () => boolean
}

export interface BrowserMeta {
  url: string
  title: string
}

interface EmbeddedBrowserProps {
  tabId: string
  initialUrl: string
  onMeta: (tabId: string, meta: BrowserMeta) => void
  onNewTab: (url: string) => void
}

function normalizeUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return 'about:blank'
  if (/^about:blank$/i.test(trimmed)) return 'about:blank'
  if (/^(https?|file):\/\//i.test(trimmed)) return trimmed
  if (/^[\w.-]+(:\d+)?(?:\/|$)/.test(trimmed)) return `http://${trimmed}`
  return `https://${trimmed}`
}

function BrowserIcon({ name }: { name: 'back' | 'forward' | 'reload' | 'stop' | 'external' | 'go' | 'globe' | 'plus' }) {
  const paths = {
    back: <path d="m15 18-6-6 6-6" />,
    forward: <path d="m9 18 6-6-6-6" />,
    reload: <><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M6.1 9A7 7 0 0 1 18.5 6L20 8M4 16l1.5 2A7 7 0 0 0 17.9 15" /></>,
    stop: <path d="M6 6h12v12H6z" />,
    external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></>,
    go: <path d="m5 12 14 0m-5-5 5 5-5 5" />,
    globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.4 2.3 3.7 5.1 3.7 8.5S14.4 18.2 12 20.5C9.6 18.2 8.3 15.4 8.3 12S9.6 5.8 12 3.5Z" /></>,
    plus: <path d="M12 5v14M5 12h14" />
  }
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

export default function EmbeddedBrowser({ tabId, initialUrl, onMeta, onNewTab }: EmbeddedBrowserProps) {
  const webviewRef = useRef<EmbeddedWebviewElement | null>(null)
  const [address, setAddress] = useState(initialUrl || 'about:blank')
  const [loading, setLoading] = useState(false)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [error, setError] = useState('')

  function syncNavigationState() {
    const view = webviewRef.current
    if (!view) return
    try {
      setCanGoBack(view.canGoBack())
      setCanGoForward(view.canGoForward())
      const currentUrl = view.getURL()
      if (currentUrl) setAddress(currentUrl)
    } catch {
      // webview 尚未完成初始化时忽略。
    }
  }

  useEffect(() => {
    const view = webviewRef.current
    if (!view) return

    const onStart = () => { setLoading(true); setError('') }
    const onStop = () => { setLoading(false); syncNavigationState() }
    const onNavigate = (event: Event) => {
      const detail = event as Event & { url?: string }
      if (detail.url) {
        setAddress(detail.url)
        onMeta(tabId, { url: detail.url, title: detail.url })
      }
    }
    const onTitle = (event: Event) => {
      const detail = event as Event & { title?: string }
      if (detail.title) onMeta(tabId, { url: view.getURL() || address, title: detail.title })
    }
    const onFail = (event: Event) => {
      const detail = event as Event & { errorCode?: number; errorDescription?: string; validatedURL?: string }
      if (detail.errorCode === -3) return
      setLoading(false)
      setError(detail.errorDescription || `页面加载失败${detail.validatedURL ? `：${detail.validatedURL}` : ''}`)
    }

    view.addEventListener('did-start-loading', onStart)
    view.addEventListener('did-stop-loading', onStop)
    view.addEventListener('did-navigate', onNavigate)
    view.addEventListener('did-navigate-in-page', onNavigate)
    view.addEventListener('page-title-updated', onTitle)
    view.addEventListener('did-fail-load', onFail)
    return () => {
      view.removeEventListener('did-start-loading', onStart)
      view.removeEventListener('did-stop-loading', onStop)
      view.removeEventListener('did-navigate', onNavigate)
      view.removeEventListener('did-navigate-in-page', onNavigate)
      view.removeEventListener('page-title-updated', onTitle)
      view.removeEventListener('did-fail-load', onFail)
    }
  }, [address, onMeta, tabId])

  function navigate(value = address) {
    const view = webviewRef.current
    const target = normalizeUrl(value)
    setAddress(target)
    setError('')
    if (!view) return
    void view.loadURL(target).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : '无法打开页面'))
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    navigate()
  }

  return <section className="embedded-browser">
    <div className="browser-toolbar">
      <div className="browser-nav-buttons">
        <button type="button" disabled={!canGoBack} onClick={() => webviewRef.current?.goBack()} title="后退"><BrowserIcon name="back" /></button>
        <button type="button" disabled={!canGoForward} onClick={() => webviewRef.current?.goForward()} title="前进"><BrowserIcon name="forward" /></button>
        <button type="button" onClick={() => loading ? webviewRef.current?.stop() : webviewRef.current?.reload()} title={loading ? '停止' : '刷新'}><BrowserIcon name={loading ? 'stop' : 'reload'} /></button>
      </div>
      <form className="browser-address" onSubmit={submit}>
        <span className="browser-lock"><BrowserIcon name="globe" /></span>
        <input value={address} onChange={(event) => setAddress(event.target.value)} spellCheck={false} placeholder="输入 IP、域名或 URL" />
        <button type="submit" title="打开"><BrowserIcon name="go" /></button>
      </form>
      <div className="browser-actions">
        <button type="button" onClick={() => onNewTab(address)} title="在新标签打开当前地址"><BrowserIcon name="plus" /></button>
        <button type="button" disabled={!address || address === 'about:blank'} onClick={() => void window.electronAPI.openExternal(address)} title="用系统浏览器打开"><BrowserIcon name="external" /></button>
      </div>
    </div>
    {loading && <div className="browser-progress"><span /></div>}
    {error && <div className="browser-error"><strong>页面无法加载</strong><span>{error}</span><button type="button" onClick={() => navigate(address)}>重试</button></div>}
    <div className="browser-surface">
      <webview
        ref={(element) => { webviewRef.current = element as EmbeddedWebviewElement | null }}
        src={initialUrl || 'about:blank'}
        partition="persist:iot-worktable-browser"
        webpreferences="contextIsolation=yes,nodeIntegration=no,sandbox=yes"
      />
      {address === 'about:blank' && !loading && <div className="browser-welcome"><div className="browser-welcome-icon"><BrowserIcon name="globe" /></div><strong>内嵌浏览器</strong><p>输入设备 IP、域名或 URL。通过 FOFA 资产卡片打开的页面会自动成为当前搜索标签的子标签。</p><button type="button" onClick={() => onNewTab('https://fofa.info')}>打开 FOFA 官网</button></div>}
    </div>
  </section>
}
