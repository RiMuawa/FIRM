import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI } from '../shared/types'

const electronAPI: ElectronAPI = {
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  openDocumentation: () => ipcRenderer.invoke('shell:open-docs'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  getFofaKeyStatus: () => ipcRenderer.invoke('fofa:key-status'),
  saveFofaKey: (key: string) => ipcRenderer.invoke('fofa:key-save', key),
  clearFofaKey: () => ipcRenderer.invoke('fofa:key-clear'),
  validateFofaKey: () => ipcRenderer.invoke('fofa:key-validate'),
  searchFofa: (request) => ipcRenderer.invoke('fofa:search', request),
  getFofaStats: (request) => ipcRenderer.invoke('fofa:stats', request),
  generateFofaQuery: (question: string) => ipcRenderer.invoke('fofa:ai-query', question)
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
