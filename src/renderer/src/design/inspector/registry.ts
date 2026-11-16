import { collectUnits, type UnitInfo } from './ids'

/**
 * 元素注册表：DOM 变化时全量重算语义单元并同步 data-des-id 属性，
 * 向检视器发布快照。条件元素（弹窗、浮层、toast、加载态）出现即入表。
 */

export interface RegistryEntry extends UnitInfo {
  visible: boolean
}

export interface RegistrySnapshot {
  entries: RegistryEntry[]
  version: number
}

let snapshot: RegistrySnapshot = { entries: [], version: 0 }
let lastEls: HTMLElement[] = []
const listeners = new Set<() => void>()
let scheduled = false
let started = false

export function subscribeRegistry(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getRegistrySnapshot(): RegistrySnapshot {
  return snapshot
}

export function startRegistry(): void {
  if (started) return
  started = true
  recompute()
  const observer = new MutationObserver((mutations) => {
    // 自己写入的 data-des-id、以及检视器自身 DOM 的变化都不触发重算
    const meaningful = mutations.filter((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'data-des-id') return false
      const target = mutation.target
      if (target instanceof Element && target.closest('.des-root')) return false
      return true
    })
    if (meaningful.length === 0) return
    schedule()
  })
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-des-id'] })
}

/** 调试计数：重算次数 / 最后一次时间戳（挂到 window 便于排查死循环） */
const debug = { recomputes: 0, lastAt: 0 }
declare global {
  interface Window { __desDebug?: { recomputes: number; lastAt: number } }
}
window.__desDebug = debug

function schedule(): void {
  if (scheduled) return
  scheduled = true
  // rAF 在后台/被遮挡的浏览器视图中会被暂停，用短延时兜底保证重算总能执行
  let done = false
  const run = () => {
    if (done) return
    done = true
    scheduled = false
    recompute()
  }
  requestAnimationFrame(run)
  window.setTimeout(run, 120)
}

function isVisible(el: HTMLElement): boolean {
  if (typeof el.checkVisibility === 'function') return el.checkVisibility()
  return el.getClientRects().length > 0
}

function recompute(): void {
  for (const el of lastEls) {
    if (el.isConnected && el.getAttribute('data-des-id')) el.removeAttribute('data-des-id')
  }

  const units = collectUnits()
  const usedEls = new Set<HTMLElement>()
  const entries: RegistryEntry[] = []
  for (const unit of units) {
    if (usedEls.has(unit.el)) continue
    usedEls.add(unit.el)
    try { unit.el.setAttribute('data-des-id', unit.id) } catch { /* 极端情况下元素可能已移除 */ }
    entries.push({ ...unit, visible: isVisible(unit.el) })
  }

  lastEls = [...usedEls]
  debug.recomputes += 1
  debug.lastAt = Date.now()
  snapshot = { entries, version: snapshot.version + 1 }
  listeners.forEach((listener) => listener())
}
