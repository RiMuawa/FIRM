import { demoFingerprints, demoKnowledge, demoLastQuery, demoPresets } from './demoData'

/**
 * 设计复刻页的 localStorage 隔离层。
 * 用 design: 前缀代理替换 window.localStorage，使复刻页与主应用（及同源的 index 页）
 * 的持久化完全互不干扰；首次进入时播种演示数据。
 */

const PREFIX = 'design:'

export function installNamespacedStorage(): void {
  const native = window.localStorage
  const scoped: Storage = {
    get length() {
      let count = 0
      for (let index = 0; index < native.length; index++) {
        if (native.key(index)?.startsWith(PREFIX)) count++
      }
      return count
    },
    clear() {
      const keys: string[] = []
      for (let index = 0; index < native.length; index++) {
        const key = native.key(index)
        if (key?.startsWith(PREFIX)) keys.push(key)
      }
      keys.forEach((key) => native.removeItem(key))
    },
    getItem(key: string) {
      return native.getItem(PREFIX + key)
    },
    setItem(key: string, value: string) {
      native.setItem(PREFIX + key, String(value))
    },
    removeItem(key: string) {
      native.removeItem(PREFIX + key)
    },
    key(index: number) {
      let seen = -1
      for (let cursor = 0; cursor < native.length; cursor++) {
        const key = native.key(cursor)
        if (key?.startsWith(PREFIX)) {
          seen++
          if (seen === index) return key.slice(PREFIX.length)
        }
      }
      return null
    }
  }
  Object.defineProperty(window, 'localStorage', {
    get: () => scoped,
    configurable: true
  })
}

/** 各 key 独立判断：缺失才播种，用户在复刻页里的操作结果可以跨刷新保留 */
export function seedDemoData(): void {
  const seed = (key: string, value: string) => {
    if (window.localStorage.getItem(key) == null) window.localStorage.setItem(key, value)
  }
  seed('iot-worktable-fingerprints', JSON.stringify(demoFingerprints))
  seed('iot-worktable-knowledge', JSON.stringify(demoKnowledge))
  seed('iot-worktable-last-query', demoLastQuery)
  seed('iot-worktable-query-presets', JSON.stringify(demoPresets))
}
