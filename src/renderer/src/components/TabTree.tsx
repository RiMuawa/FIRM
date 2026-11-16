import { useMemo, useState } from 'react'
import type { DragEvent, ReactNode } from 'react'
import { groupByFolder } from '../data'

export type WorkTabKind = 'search' | 'browser'
export type WorkTabStatus = 'idle' | 'loading' | 'success' | 'error'

export interface TabTreeNode {
  id: string
  parentId?: string
  folder?: string
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
  onFolderRename: (from: string, to: string) => void
  onFolderDelete: (folder: string) => void
  /** 把标签放入文件夹（同时成为该文件夹的根标签） */
  onTabFolder: (tabId: string, folder: string) => void
}

const UNFILED = ''
const folderKey = (folder: string): string => `folder:${folder}`

function SmallIcon({ name }: { name: 'search' | 'browser' | 'chevron' | 'close' | 'plus' | 'tree' | 'folder' | 'edit' | 'trash' }) {
  const paths = {
    search: <><circle cx="10.5" cy="10.5" r="5.8" /><path d="m15 15 3.6 3.6" /></>,
    browser: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.4 2.3 3.7 5.1 3.7 8.5S14.4 18.2 12 20.5C9.6 18.2 8.3 15.4 8.3 12S9.6 5.8 12 3.5Z" /></>,
    chevron: <path d="m9 6 6 6-6 6" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    plus: <path d="M12 5v14M5 12h14" />,
    tree: <><path d="M6 4v13a3 3 0 0 0 3 3h7" /><rect x="3" y="3" width="6" height="5" rx="1" /><rect x="15" y="17" width="6" height="5" rx="1" /><path d="M17 8h-4a3 3 0 0 0-3 3v4" /></>,
    folder: <path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z" />,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" /></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6" /></>
  }
  return <svg className="tree-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

export default function TabTree({ tabs, activeId, collapsed, onSelect, onClose, onToggleCollapse, onNewSearch, onNewBrowser, onReparent, onFolderRename, onFolderDelete, onTabFolder }: TabTreeProps) {
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const { rootGroups, childrenByParent } = useMemo(() => {
    const childMap = new Map<string, TabTreeNode[]>()
    for (const tab of tabs) {
      if (!tab.parentId) continue
      const children = childMap.get(tab.parentId) || []
      children.push(tab)
      childMap.set(tab.parentId, children)
    }
    const groups = groupByFolder(tabs.filter((tab) => !tab.parentId).map((tab) => ({ folder: tab.folder || '', tab })))
      .map((group) => ({ folder: group.folder, tabs: group.items.map((entry) => entry.tab) }))
    return { rootGroups: groups, childrenByParent: childMap }
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

  function handleFolderDrop(event: DragEvent<HTMLElement>, folder: string) {
    event.preventDefault()
    event.stopPropagation()
    const id = sourceId(event)
    setDropTarget(null)
    if (id) onTabFolder(id, folder)
  }

  function promptFolderName(prompt: string, initial = ''): string | null {
    const name = window.prompt(prompt, initial)
    return name === null ? null : name.trim()
  }

  function createFolderFor(tabId: string) {
    const name = promptFolderName('输入新文件夹名称')
    if (name) onTabFolder(tabId, name)
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
      <div><span className="tab-tree-title"><SmallIcon name="tree" /> 标签树</span><small>{tabs.length} 个窗口 · {rootGroups.filter((group) => group.folder).length} 个文件夹</small></div>
      <div className="tab-tree-tools">
        <button type="button" onClick={onNewSearch} title="新建搜索子标签"><SmallIcon name="plus" /><span>搜索</span></button>
        <button type="button" onClick={onNewBrowser} title="新建内嵌浏览器子标签"><SmallIcon name="browser" /><span>网页</span></button>
      </div>
    </div>
    <div className="tree-root-drop">
      {rootGroups.length === 0 && <p>暂无标签，新建一个搜索或网页。</p>}
      {rootGroups.map((group) => {
        const key = folderKey(group.folder)
        const isCollapsed = collapsed.has(key)
        return <section className="tree-folder" key={group.folder}>
          <div
            className={`tree-folder-head ${dropTarget === key ? 'is-drop-target' : ''}`}
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropTarget(key) }}
            onDragLeave={() => setDropTarget((current) => current === key ? null : current)}
            onDrop={(event) => handleFolderDrop(event, group.folder)}
            title={group.folder ? `拖拽标签到此处放入「${group.folder}」` : '拖拽标签到此处移入未分组'}
          >
            <button
              className={`tree-expander ${isCollapsed ? '' : 'is-open'}`}
              type="button"
              onClick={(event) => { event.stopPropagation(); onToggleCollapse(key) }}
              aria-label={isCollapsed ? '展开文件夹' : '折叠文件夹'}
            ><SmallIcon name="chevron" /></button>
            <span className="tree-folder-icon"><SmallIcon name="folder" /></span>
            <span className="tree-folder-name">{group.folder || '未分组'}</span>
            <span className="tree-child-count">{group.tabs.length}</span>
            {group.folder !== UNFILED && <span className="tree-folder-actions">
              <button type="button" title="重命名文件夹" onClick={(event) => {
                event.stopPropagation()
                const next = promptFolderName(`重命名文件夹「${group.folder}」`, group.folder)
                if (next && next !== group.folder) onFolderRename(group.folder, next)
              }}><SmallIcon name="edit" /></button>
              <button type="button" title="删除文件夹（标签移入未分组）" onClick={(event) => {
                event.stopPropagation()
                onFolderDelete(group.folder)
              }}><SmallIcon name="trash" /></button>
            </span>}
          </div>
          {!isCollapsed && group.tabs.map((tab) => renderNode(tab, 0))}
        </section>
      })}
      <div
        className={`tree-new-folder ${dropTarget === 'new-folder' ? 'is-drop-target' : ''}`}
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropTarget('new-folder') }}
        onDragLeave={() => setDropTarget((current) => current === 'new-folder' ? null : current)}
        onDrop={(event) => {
          event.preventDefault()
          event.stopPropagation()
          const id = sourceId(event)
          setDropTarget(null)
          if (!id) return
          const name = promptFolderName('输入新文件夹名称，拖入的标签将移入该文件夹')
          if (name) onTabFolder(id, name)
        }}
        onClick={() => createFolderFor(activeId)}
        title="点击为当前标签新建文件夹；或把标签拖到此处"
      >
        <SmallIcon name="plus" /> 新建文件夹
      </div>
    </div>
    <div className="tab-tree-hint">拖拽标签到文件夹可归类，拖到其他标签上建立父子关系，拖到「新建文件夹」创建新分类。</div>
  </aside>
}
