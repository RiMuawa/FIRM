import { useMemo, useState } from 'react'
import type { DragEvent, ReactNode } from 'react'

export type WorkTabKind = 'search' | 'browser'
export type WorkTabStatus = 'idle' | 'loading' | 'success' | 'error'

export interface TabTreeNode {
  id: string
  parentId?: string
  kind: WorkTabKind
  label: string
  status: WorkTabStatus
  url?: string
}

interface TabTreeProps {
  tabs: TabTreeNode[]
  activeId: string
  collapsed: Set<string>
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onToggleCollapse: (id: string) => void
  onNewSearch: () => void
  onNewBrowser: () => void
  onReparent: (sourceId: string, parentId?: string) => void
}

function SmallIcon({ name }: { name: 'search' | 'browser' | 'chevron' | 'close' | 'plus' | 'tree' }) {
  const paths = {
    search: <><circle cx="10.5" cy="10.5" r="5.8" /><path d="m15 15 3.6 3.6" /></>,
    browser: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.4 2.3 3.7 5.1 3.7 8.5S14.4 18.2 12 20.5C9.6 18.2 8.3 15.4 8.3 12S9.6 5.8 12 3.5Z" /></>,
    chevron: <path d="m9 6 6 6-6 6" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    plus: <path d="M12 5v14M5 12h14" />,
    tree: <><path d="M6 4v13a3 3 0 0 0 3 3h7" /><rect x="3" y="3" width="6" height="5" rx="1" /><rect x="15" y="17" width="6" height="5" rx="1" /><path d="M17 8h-4a3 3 0 0 0-3 3v4" /></>
  }
  return <svg className="tree-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

export default function TabTree({ tabs, activeId, collapsed, onSelect, onClose, onToggleCollapse, onNewSearch, onNewBrowser, onReparent }: TabTreeProps) {
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const { roots, childrenByParent } = useMemo(() => {
    const childMap = new Map<string, TabTreeNode[]>()
    for (const tab of tabs) {
      if (!tab.parentId) continue
      const children = childMap.get(tab.parentId) || []
      children.push(tab)
      childMap.set(tab.parentId, children)
    }
    return { roots: tabs.filter((tab) => !tab.parentId), childrenByParent: childMap }
  }, [tabs])

  function sourceId(event: DragEvent<HTMLElement>): string {
    return event.dataTransfer.getData('application/x-iot-worktab') || event.dataTransfer.getData('text/plain')
  }

  function handleDrop(event: DragEvent<HTMLElement>, parentId?: string) {
    event.preventDefault()
    event.stopPropagation()
    const id = sourceId(event)
    setDropTarget(null)
    if (id) onReparent(id, parentId)
  }

  function renderNode(tab: TabTreeNode, depth: number): ReactNode {
    const children = childrenByParent.get(tab.id) || []
    const isCollapsed = collapsed.has(tab.id)
    return <div className="tree-branch-wrap" key={tab.id}>
      <div
        className={`tree-tab-row ${tab.id === activeId ? 'is-active' : ''} ${dropTarget === tab.id ? 'is-drop-target' : ''} ${tab.kind}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'move'
          event.dataTransfer.setData('application/x-iot-worktab', tab.id)
          event.dataTransfer.setData('text/plain', tab.id)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
          setDropTarget(tab.id)
        }}
        onDragLeave={() => setDropTarget((current) => current === tab.id ? null : current)}
        onDrop={(event) => handleDrop(event, tab.id)}
        onClick={() => onSelect(tab.id)}
        title={tab.url ? `${tab.label}\n${tab.url}` : tab.label}
      >
        <button
          className={`tree-expander ${children.length ? '' : 'is-empty'} ${isCollapsed ? '' : 'is-open'}`}
          type="button"
          onClick={(event) => { event.stopPropagation(); if (children.length) onToggleCollapse(tab.id) }}
          tabIndex={children.length ? 0 : -1}
          aria-label={isCollapsed ? '展开子标签' : '折叠子标签'}
        ><SmallIcon name="chevron" /></button>
        <span className={`tree-kind-dot ${tab.kind}`}><SmallIcon name={tab.kind === 'browser' ? 'browser' : 'search'} /></span>
        <span className="tree-tab-label">{tab.label || (tab.kind === 'browser' ? '新页面' : '新搜索')}</span>
        {children.length > 0 && <span className="tree-child-count">{children.length}</span>}
        <span className={`tree-tab-state ${tab.status}`} />
        <button className="tree-tab-close" type="button" onClick={(event) => { event.stopPropagation(); onClose(tab.id) }} title="关闭标签"><SmallIcon name="close" /></button>
      </div>
      {!isCollapsed && children.map((child) => renderNode(child, depth + 1))}
    </div>
  }

  return <aside className="tab-tree-panel">
    <div className="tab-tree-head">
      <div><span className="tab-tree-title"><SmallIcon name="tree" /> 标签树</span><small>{tabs.length} 个窗口</small></div>
      <div className="tab-tree-tools">
        <button type="button" onClick={onNewSearch} title="新建搜索子标签"><SmallIcon name="plus" /><span>搜索</span></button>
        <button type="button" onClick={onNewBrowser} title="新建内嵌浏览器子标签"><SmallIcon name="browser" /><span>网页</span></button>
      </div>
    </div>
    <div
      className={`tree-root-drop ${dropTarget === 'root' ? 'is-drop-target' : ''}`}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropTarget('root') }}
      onDragLeave={() => setDropTarget((current) => current === 'root' ? null : current)}
      onDrop={(event) => handleDrop(event)}
    >
      {roots.length === 0 ? <p>暂无标签，新建一个搜索或网页。</p> : roots.map((tab) => renderNode(tab, 0))}
    </div>
    <div className="tab-tree-hint">拖拽标签到另一个标签上可建立父子关系，拖到此处变为根标签。</div>
  </aside>
}
