import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI } from '../shared/types'

const electronAPI: ElectronAPI = {
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  openDocumentation: () => ipcRenderer.invoke('shell:open-docs'),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  getWindowBounds: () => ipcRenderer.invoke('window:get-bounds'),
  setWindowPosition: (x, y) => ipcRenderer.invoke('window:set-position', x, y),
  isWindowMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  getFofaStatus: () => ipcRenderer.invoke('fofa:status'),
  setActiveFofaProvider: (provider) => ipcRenderer.invoke('fofa:set-active-provider', provider),
  saveFofaKey: (provider, key, email) => ipcRenderer.invoke('fofa:key-save', provider, key, email),
  clearFofaKey: (provider) => ipcRenderer.invoke('fofa:key-clear', provider),
  validateFofaKey: (provider) => ipcRenderer.invoke('fofa:key-validate', provider),
  searchFofa: (request) => ipcRenderer.invoke('fofa:search', request),
  getUsageStats: () => ipcRenderer.invoke('stats:get-usage')
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
