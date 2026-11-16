import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { installNamespacedStorage, seedDemoData } from './storage'
import { installMockApi } from './mockApi'
import { installWebviewStub } from './webviewStub'
import Inspector from './inspector/Inspector'
import '../styles.css'

/**
 * 设计复刻页入口：与主应用共享全部 React 组件，但在挂载前完成
 * localStorage 隔离与播种、Electron API mock、<webview> 桩注入，
 * 再叠加独立的检视器 React 树（#inspector-root），互不干扰。
 */

installNamespacedStorage()
seedDemoData()
installMockApi()
installWebviewStub()

const appRoot = document.getElementById('root')
const inspectorRoot = document.getElementById('inspector-root')

if (appRoot && inspectorRoot) {
  // 动态引入 App，确保上述注入先于任何渲染层模块求值
  void import('../App').then(({ default: App }) => {
    createRoot(appRoot).render(<StrictMode><App /></StrictMode>)
    createRoot(inspectorRoot).render(<Inspector />)
  })
}
