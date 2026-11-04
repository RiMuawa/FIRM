import { useMemo, useRef, useState } from 'react'
import QueryEditor from './QueryEditor'
import {
  loadPresets,
  mergePresets,
  savePresets,
  type Preset
} from '../query/editorModel'

interface PresetManagerProps {
  onClose: () => void
  onInsert: (content: string) => void
  onOverwrite: (content: string) => void
  onNotify: (text: string, tone?: 'ok' | 'warn' | 'error') => void
}

function nextId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function sortPresets(items: Preset[]): Preset[] {
  return items.slice().sort((left, right) => {
    const group = left.group.localeCompare(right.group, 'zh')
    if (group !== 0) return group
    return (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER)
      || left.name.localeCompare(right.name, 'zh')
  })
}

export default function PresetManager({ onClose, onInsert, onOverwrite, onNotify }: PresetManagerProps) {
  const [presets, setPresets] = useState<Preset[]>(() => sortPresets(loadPresets()))
  const [filter, setFilter] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  const visible = useMemo(() => {
    const keyword = filter.trim().toLowerCase()
    return sortPresets(presets.filter((preset) => !keyword
      || [preset.name, preset.content, preset.group].some((value) => value.toLowerCase().includes(keyword))))
  }, [filter, presets])

  const grouped = useMemo(() => {
    const groups = new Map<string, Preset[]>()
    for (const preset of visible) {
      const group = preset.group.trim() || '未分组'
      groups.set(group, [...(groups.get(group) || []), preset])
    }
    return [...groups.entries()]
  }, [visible])

  function persist(next: Preset[]): void {
    const sorted = sortPresets(next)
    setPresets(sorted)
    savePresets(sorted)
  }

  function patchPreset(id: string, patch: Partial<Preset>): void {
    persist(presets.map((preset) => preset.id === id ? { ...preset, ...patch } : preset))
  }

  function addPreset(): void {
    const preset: Preset = { id: nextId(), name: '新预设', content: '', group: '', ts: new Date().toLocaleString(), order: presets.length }
    persist([...presets, preset])
    setEditingId(preset.id)
    setEditingContent('')
  }

  function removePreset(id: string): void {
    if (!window.confirm('删除此预设？')) return
    persist(presets.filter((preset) => preset.id !== id))
    if (editingId === id) setEditingId(null)
  }

  function saveEditing(): void {
    if (!editingId) return
    patchPreset(editingId, { content: editingContent.trim(), ts: new Date().toLocaleString() })
    setEditingId(null)
    onNotify('预设已保存', 'ok')
  }

  function exportJson(): void {
    const blob = new Blob([JSON.stringify(presets, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'iot-worktable-query-presets.json'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function importJson(file: File): Promise<void> {
    try {
      const parsed = JSON.parse((await file.text()).replace(/^\ufeff/, '')) as unknown
      if (!Array.isArray(parsed)) throw new Error('JSON 内容不是预设数组')
      const result = mergePresets(parsed, presets)
      persist(result.list)
      onNotify(`预设导入：新增 ${result.added} 条，跳过 ${result.skipped} 条`, 'ok')
    } catch (error) {
      onNotify(error instanceof Error ? error.message : '预设导入失败', 'error')
    }
  }

  function dropOn(targetId: string): void {
    if (!dragId || dragId === targetId) return
    const source = presets.find((preset) => preset.id === dragId)
    const target = presets.find((preset) => preset.id === targetId)
    if (!source || !target || source.group.trim() !== target.group.trim()) return
    const next = presets.filter((preset) => preset.id !== dragId)
    const targetIndex = next.findIndex((preset) => preset.id === targetId)
    next.splice(targetIndex, 0, source)
    const group = groupKey(source)
    let order = 0
    const ordered = next.map((preset) => groupKey(preset) === group ? { ...preset, order: order++ } : preset)
    persist(ordered)
  }

  function groupKey(preset: Preset): string {
    return preset.group.trim() || '未分组'
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="preset-manager" role="dialog" aria-modal="true" aria-label="管理查询预设">
      <header className="preset-manager-head">
        <div><span className="eyebrow">QUERY PRESETS</span><h2>管理预设</h2></div>
        <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="搜索名称 / 查询串 / 分组" spellCheck={false} autoFocus />
        <button className="icon-button" type="button" onClick={onClose} title="关闭">×</button>
      </header>
      <div className="preset-manager-toolbar">
        <span>{visible.length} / {presets.length} 条</span>
        <button type="button" onClick={addPreset}>+ 新建</button>
        <button type="button" onClick={exportJson}>导出 JSON</button>
        <button type="button" onClick={() => importRef.current?.click()}>导入 JSON</button>
        <input ref={importRef} type="file" accept=".json,application/json" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importJson(file) }} />
      </div>
      <div className="preset-manager-body">
        {grouped.length === 0 ? <div className="preset-empty">暂无预设。新建后可保存整卡、单条条件或完整查询语句。</div> : grouped.map(([group, items]) => <section className="preset-group" key={group}>
          <div className="preset-group-head"><span>{group}</span><small>{items.length}</small></div>
          {items.map((preset) => <div className="preset-row-wrap" key={preset.id}>
            <div className={`preset-row ${editingId === preset.id ? 'is-editing' : ''}`} draggable onDragStart={() => setDragId(preset.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => { dropOn(preset.id); setDragId(null) }}>
              <span className="preset-drag" title="拖动调整同组顺序">⠿</span>
              <input className="preset-name" value={preset.name} spellCheck={false} onChange={(event) => patchPreset(preset.id, { name: event.target.value })} />
              <code className="preset-content" title={preset.content} onClick={() => { setEditingId(preset.id); setEditingContent(preset.content) }}>{preset.content || '（空查询串）'}</code>
              <input className="preset-group-input" value={preset.group} placeholder="分组" spellCheck={false} onChange={(event) => patchPreset(preset.id, { group: event.target.value })} />
              <div className="preset-row-actions"><button type="button" onClick={() => onInsert(preset.content)}>插入</button><button type="button" onClick={() => {
                if (window.confirm('用该预设整条覆盖当前查询编辑器？')) onOverwrite(preset.content)
              }}>覆盖</button><button type="button" onClick={() => { setEditingId(editingId === preset.id ? null : preset.id); setEditingContent(preset.content) }}>编辑</button><button className="danger" type="button" onClick={() => removePreset(preset.id)}>删除</button></div>
            </div>
            {editingId === preset.id && <div className="preset-inline-editor">
              <QueryEditor compact query={editingContent} onChange={setEditingContent} onSearch={() => undefined} onSaveFingerprint={() => undefined} onNotify={onNotify} />
              <div className="preset-inline-actions"><button type="button" onClick={() => setEditingId(null)}>收起</button><button type="button" onClick={saveEditing}>保存到预设</button></div>
            </div>}
          </div>)}
        </section>)}
      </div>
    </section>
  </div>
}
