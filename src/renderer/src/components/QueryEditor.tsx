import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  cardTextSpans,
  cardToQuery,
  cardsToQuery,
  completeCandidates,
  detectConflicts,
  hasQuickCondition,
  loadPresets,
  mergeCards,
  parseQueryToCards,
  resolveBuiltinDates,
  savePresets,
  textCompleteContext,
  toggleQuickCondition,
  valueLabel,
  type CompletionContext,
  type FieldCard,
  type Preset,
  type QueryCard,
  type QueryRow
} from '../query/editorModel'

type AutoKind = 'text' | 'field' | 'value'

interface AutoState {
  kind: AutoKind
  element: HTMLInputElement | HTMLTextAreaElement
  context: CompletionContext
  candidates: string[]
  index: number
  cardIndex?: number
  rowIndex?: number
  field?: string
}

interface QueryEditorProps {
  query: string
  onChange: (query: string) => void
  onSearch: (query: string) => void
  onSaveFingerprint: (query: string) => void
  onNotify: (text: string, tone?: 'ok' | 'warn' | 'error') => void
  height?: number
  compact?: boolean
  onOpenPresetManager?: () => void
}

function cloneCard(card: QueryCard): QueryCard {
  return card.kind === 'raw' ? { ...card } : { ...card, rows: card.rows.map((row) => ({ ...row })) }
}

function PlusIcon(): ReactNode {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
}

function CloseIcon(): ReactNode {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
}

function SearchIcon(): ReactNode {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.2 4.2" /></svg>
}

function calculateAuto(kind: AutoKind, element: HTMLInputElement | HTMLTextAreaElement, field = '', cardIndex?: number, rowIndex?: number): AutoState | null {
  if (document.activeElement !== element) return null
  if (element.selectionStart !== element.selectionEnd) return null
  const caret = element.selectionStart ?? 0
  const context: CompletionContext = kind === 'text'
    ? textCompleteContext(element.value, caret)
    : kind === 'field'
      ? { kind: 'field', token: element.value.slice(0, caret) }
      : { kind: 'value', field, token: element.value.slice(0, caret), quoted: false, atClose: false }
  const candidates = completeCandidates(context).slice(0, 10)
  if (!candidates.length) return null
  return { kind, element, context, candidates, index: 0, cardIndex, rowIndex, field }
}

export default function QueryEditor({ query, onChange, onSearch, onSaveFingerprint, onNotify, height, compact = false, onOpenPresetManager }: QueryEditorProps) {
  const [cards, setCards] = useState<QueryCard[]>(() => parseQueryToCards(query))
  const [activeCard, setActiveCard] = useState<number | null>(null)
  const [focusCell, setFocusCell] = useState<{ ci: number; ri: number } | null>(null)
  const [auto, setAuto] = useState<AutoState | null>(null)
  const [autoGhostRef, setAutoGhostRef] = useState<HTMLDivElement | null>(null)
  const [presetOpen, setPresetOpen] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [presets, setPresets] = useState<Preset[]>(() => loadPresets())
  const [pendingFocus, setPendingFocus] = useState<{ ci: number; ri?: number; role: 'field' | 'value' } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lastQueryRef = useRef(query)
  const conflicts = useMemo(() => detectConflicts(query), [query])
  const monthActive = useMemo(() => hasQuickCondition(query, 'month'), [query])
  const cloudActive = useMemo(() => hasQuickCondition(query, 'cloud'), [query])

  useEffect(() => {
    if (query === lastQueryRef.current) return
    lastQueryRef.current = query
    setCards(parseQueryToCards(query))
    setActiveCard(null)
    setFocusCell(null)
  }, [query])

  useEffect(() => {
    const close = (): void => setAuto(null)
    window.addEventListener('resize', close)
    return () => window.removeEventListener('resize', close)
  }, [])

  useEffect(() => {
    if (!pendingFocus) return
    const selector = pendingFocus.role === 'field'
      ? `[data-card-index="${pendingFocus.ci}"][data-role="field"]`
      : `[data-card-index="${pendingFocus.ci}"][data-row-index="${pendingFocus.ri}"][data-role="value"]`
    const target = rootRef.current?.querySelector<HTMLInputElement>(selector)
    target?.focus()
    setPendingFocus(null)
  }, [cards, pendingFocus])

  useLayoutEffect(() => {
    if (!auto || !autoGhostRef) return
    autoGhostRef.scrollTop = auto.element.scrollTop
    autoGhostRef.scrollLeft = auto.element.scrollLeft
  }, [auto, autoGhostRef])

  function emitCards(next: QueryCard[]): void {
    setCards(next)
    const nextQuery = cardsToQuery(next)
    lastQueryRef.current = nextQuery
    onChange(nextQuery)
  }

  function emitText(nextQuery: string): void {
    lastQueryRef.current = nextQuery
    setCards(parseQueryToCards(nextQuery))
    onChange(nextQuery)
  }

  function applyQuery(nextQuery: string): void {
    emitText(nextQuery)
    setActiveCard(null)
    setFocusCell(null)
    setAuto(null)
  }

  function openAuto(kind: AutoKind, element: HTMLInputElement | HTMLTextAreaElement, field = '', cardIndex?: number, rowIndex?: number): void {
    setAuto(calculateAuto(kind, element, field, cardIndex, rowIndex))
  }

  function replaceAutoValue(nextValue: string, nextCaret?: number): void {
    if (!auto) return
    const target = auto.element
    if (auto.kind === 'text') emitText(nextValue)
    else if (auto.kind === 'field' && auto.cardIndex !== undefined) updateCardField(auto.cardIndex, nextValue)
    else if (auto.kind === 'value' && auto.cardIndex !== undefined && auto.rowIndex !== undefined) updateCardValue(auto.cardIndex, auto.rowIndex, nextValue)
    setAuto(null)
    window.requestAnimationFrame(() => {
      target.focus()
      if (nextCaret !== undefined) target.setSelectionRange(nextCaret, nextCaret)
    })
  }

  function applyAuto(index = auto?.index ?? 0): void {
    if (!auto) return
    const candidate = auto.candidates[index]
    if (!candidate) return
    const caret = auto.element.selectionStart ?? 0
    const start = Math.max(0, caret - auto.context.token.length)
    const nextValue = auto.element.value.slice(0, start) + candidate + auto.element.value.slice(caret)
    replaceAutoValue(nextValue, start + candidate.length)
  }

  function handleAutoKey(event: ReactKeyboardEvent<HTMLElement>, searchOnEnter = true): boolean {
    if (!auto || event.target !== auto.element) return false
    if (event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.shiftKey) {
      event.preventDefault()
      event.stopPropagation()
      if (auto.candidates.length) applyAuto()
      return true
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      event.stopPropagation()
      setAuto((current) => current ? {
        ...current,
        index: (current.index + (event.key === 'ArrowDown' ? 1 : current.candidates.length - 1)) % current.candidates.length
      } : current)
      return true
    }
    if (event.key === 'Enter' && !event.altKey && !event.ctrlKey && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      event.stopPropagation()
      if (auto.candidates.length) applyAuto()
      else if (searchOnEnter) search()
      return true
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setAuto(null)
      return true
    }
    return false
  }

  function search(): void {
    const resolved = resolveBuiltinDates(cardsToQuery(cards))
    if (!resolved) {
      onNotify('搜索语句不能为空', 'warn')
      return
    }
    if (resolved !== query) applyQuery(resolved)
    onSearch(resolved)
  }

  function saveFingerprint(): void {
    const current = resolveBuiltinDates(cardsToQuery(cards))
    if (!current) {
      onNotify('当前查询为空，无法保存', 'warn')
      return
    }
    onSaveFingerprint(current)
  }

  function updateCardField(cardIndex: number, value: string): void {
    const next = cards.map((card, index) => index === cardIndex && card.kind === 'field'
      ? { ...card, field: value.trim().toLowerCase() }
      : card)
    emitCards(next)
  }

  function updateCardValue(cardIndex: number, rowIndex: number, value: string): void {
    const next = cards.map((card, index) => index === cardIndex && card.kind === 'field'
      ? { ...card, rows: card.rows.map((row, ri) => ri === rowIndex ? { ...row, value } : row) }
      : card)
    emitCards(next)
  }

  function updateCardRow(cardIndex: number, rowIndex: number, patch: Partial<QueryRow>): void {
    const next = cards.map((card, index) => index === cardIndex && card.kind === 'field'
      ? { ...card, rows: card.rows.map((row, ri) => ri === rowIndex ? { ...row, ...patch } : row) }
      : card)
    emitCards(next)
  }

  function updateCard(cardIndex: number, updater: (card: QueryCard) => QueryCard): void {
    emitCards(cards.map((card, index) => index === cardIndex ? updater(cloneCard(card)) : card))
  }

  function addCard(): void {
    const at = activeCard === null ? cards.length : activeCard + 1
    const next = cards.slice()
    next.splice(at, 0, { kind: 'field', field: '', join: '&&', rows: [{ op: '=', value: '' }] })
    emitCards(next)
    setPendingFocus({ ci: at, role: 'field' })
  }

  function addValue(): void {
    let cardIndex = activeCard
    if (cardIndex === null) cardIndex = cards.length - 1
    const card = cardIndex >= 0 ? cards[cardIndex] : undefined
    if (!card || card.kind === 'raw') {
      addCard()
      return
    }
    const reference = focusCell?.ci === cardIndex && focusCell.ri >= 0 ? card.rows[focusCell.ri] : card.rows[card.rows.length - 1]
    const rowIndex = card.rows.length
    const next = cards.map((entry, index) => index === cardIndex && entry.kind === 'field'
      ? { ...entry, rows: [...entry.rows, { op: reference?.op || '=', value: '' }] }
      : entry)
    emitCards(next)
    setPendingFocus({ ci: cardIndex, ri: rowIndex, role: 'value' })
  }

  function deleteCard(cardIndex: number): void {
    emitCards(cards.filter((_card, index) => index !== cardIndex))
    setActiveCard(null)
    setFocusCell(null)
    setAuto(null)
  }

  function deleteRow(cardIndex: number, rowIndex: number): void {
    const card = cards[cardIndex]
    if (!card || card.kind === 'raw') return
    if (card.rows.length <= 1) {
      deleteCard(cardIndex)
      return
    }
    const next = cards.map((entry, index) => index === cardIndex && entry.kind === 'field'
      ? { ...entry, rows: entry.rows.filter((_row, ri) => ri !== rowIndex) }
      : entry)
    emitCards(next)
    setFocusCell(null)
    setAuto(null)
  }

  function focusCard(cardIndex: number, rowIndex = -1): void {
    setActiveCard(cardIndex)
    setFocusCell({ ci: cardIndex, ri: rowIndex })
    const textarea = textareaRef.current
    if (!textarea) return
    const span = cardTextSpans(cards, query).spanOfCard(cardIndex)
    if (span) textarea.setSelectionRange(span.start, span.end)
  }

  function handleTextClick(textarea: HTMLTextAreaElement): void {
    const match = cardTextSpans(cards, textarea.value).leafAt(textarea.selectionStart)
    if (!match) return
    setActiveCard(match.ci)
    setFocusCell({ ci: match.ci, ri: match.ri })
    const cardElement = rootRef.current?.querySelector<HTMLElement>(`[data-card-index="${match.ci}"]`)
    cardElement?.scrollIntoView({ block: 'nearest' })
  }

  function saveCurrentAsPreset(): void {
    let content = ''
    let defaultName = '预设'
    const card = activeCard === null ? null : cards[activeCard]
    if (card?.kind === 'field' && focusCell?.ci === activeCard && focusCell.ri >= 0) {
      content = cardToQuery({ ...card, rows: [card.rows[focusCell.ri]] })
      defaultName = card.field || '关键词'
    } else if (card) {
      content = cardToQuery(card)
      if (card.kind === 'field') defaultName = card.field || '关键词'
      else defaultName = '原样片段'
    } else {
      content = cardsToQuery(cards)
    }
    if (!content) {
      onNotify('没有可保存的内容', 'warn')
      return
    }
    const name = presetName.trim() || defaultName
    const next = [...presets, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, content, group: '', ts: new Date().toLocaleString() }]
    savePresets(next)
    setPresets(next)
    setPresetName('')
    onNotify(`已存预设「${name}」`, 'ok')
  }

  function insertPreset(preset: Preset): void {
    emitCards(mergeCards(cards, parseQueryToCards(preset.content)))
    onNotify(`已并入预设「${preset.name}」`, 'ok')
  }

  function removePreset(id: string): void {
    const next = presets.filter((preset) => preset.id !== id)
    savePresets(next)
    setPresets(next)
  }

  function renderAutoLayer(): ReactNode {
    if (!auto || !auto.candidates.length) return null
    const element = auto.element
    const rect = element.getBoundingClientRect()
    const computed = window.getComputedStyle(element)
    const isTextarea = element instanceof HTMLTextAreaElement
    const insertion = auto.candidates[auto.index].slice(auto.context.token.length)
    const dropdownWidth = Math.max(260, Math.min(420, rect.width))
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - dropdownWidth - 8))
    const spaceBelow = window.innerHeight - rect.bottom - 10
    const openAbove = spaceBelow < 150 && rect.top > spaceBelow
    const maxHeight = Math.min(250, Math.max(110, openAbove ? rect.top - 10 : spaceBelow))
    const top = openAbove ? Math.max(8, rect.top - maxHeight - 4) : rect.bottom + 4
    const ghostStyle = isTextarea ? {
      position: 'fixed' as const,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      padding: computed.padding,
      border: '1px solid transparent',
      boxSizing: 'border-box' as const,
      font: computed.font,
      lineHeight: computed.lineHeight,
      letterSpacing: computed.letterSpacing,
      whiteSpace: 'pre-wrap' as const,
      wordBreak: 'break-word' as const,
      overflow: 'hidden',
      pointerEvents: 'none' as const,
      color: 'transparent',
      zIndex: 310
    } : {
      position: 'fixed' as const,
      left: rect.left + element.clientLeft + Number.parseFloat(computed.paddingLeft || '0'),
      top: rect.top,
      height: rect.height,
      font: computed.font,
      lineHeight: `${rect.height}px`,
      whiteSpace: 'pre' as const,
      overflow: 'hidden',
      pointerEvents: 'none' as const,
      color: 'transparent',
      zIndex: 310
    }
    const caret = element.selectionStart ?? 0
    return createPortal(<>
      <div ref={setAutoGhostRef} className="query-ac-ghost" style={ghostStyle}>
        <span>{element.value.slice(0, caret)}</span><span className="query-ac-suggestion">{insertion}</span><span>{element.value.slice(caret)}{'\u200b'}</span>
      </div>
      <div className="query-ac-menu" style={{ left, top, width: dropdownWidth, maxHeight }} onMouseDown={(event) => event.preventDefault()}>
        <div className="query-ac-hint">TAB 补全 · ↑↓ 切换 · Enter 应用</div>
        {auto.candidates.map((candidate, index) => {
          const label = valueLabel(auto.field || auto.context.field || '', candidate.replace(/"$/, ''))
          return <button
            className={index === auto.index ? 'is-active' : ''}
            type="button"
            key={`${candidate}-${index}`}
            onMouseEnter={() => setAuto((current) => current ? { ...current, index } : current)}
            onMouseDown={(event: ReactMouseEvent) => {
              event.preventDefault()
              applyAuto(index)
            }}
          >{candidate}{label && <i>{label}</i>}</button>
        })}
      </div>
    </>, document.body)
  }

  return <section ref={rootRef} className={`query-dock ${compact ? 'is-compact' : ''}`} style={height ? { height } : undefined}>
    <div className="query-head">
      <div className="query-title"><span className="terminal-dots"><i /><i /><i /></span><strong>查询编辑器</strong><small>{cards.length} 张字段卡</small></div>
      <div className="query-head-actions">
        {!compact && <>
          <button className={monthActive ? 'is-on' : ''} type="button" onClick={() => applyQuery(toggleQuickCondition(query, 'month'))}>一个月内</button>
          <button className={cloudActive ? 'is-on' : ''} type="button" onClick={() => applyQuery(toggleQuickCondition(query, 'cloud'))}>排除云服务</button>
          <button type="button" onClick={() => {
            if (query.trim() && !window.confirm('编辑器里已有内容，清空并新建空白查询？')) return
            applyQuery('')
          }}>新建空白</button>
          <button type="button" onClick={saveFingerprint}>存为指纹</button>
          <button type="button" onClick={() => setPresetOpen((open) => !open)}>预设 ({presets.length})</button>
        </>}
        {!compact && <button className="button primary small" type="button" onClick={search}><SearchIcon /> 搜索</button>}
      </div>
    </div>

    {!compact && presetOpen && <div className="query-preset-box">
      <div className="query-preset-head"><input value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder="预设名称，例如：地区-中亚" spellCheck={false} /><button type="button" onClick={saveCurrentAsPreset}>存为预设</button><button type="button" onClick={onOpenPresetManager}>管理预设…</button></div>
      <div className="query-preset-list">{presets.length === 0 ? <span>暂无预设。保存焦点行、焦点卡或整条语句。</span> : presets.map((preset) => <div className="query-preset-item" key={preset.id}><b title={preset.name}>{preset.name}</b><code title={preset.content} onClick={() => insertPreset(preset)}>{preset.content}</code><button type="button" onClick={() => insertPreset(preset)}>插入</button><button type="button" title="删除预设" onClick={() => removePreset(preset.id)}>×</button></div>)}</div>
    </div>}

    <div className="query-card-scroll">
      {cards.length === 0 ? <div className="query-card-empty">（无条件）在下方直接输入语句，或点击「字段卡」「值」开始组装。</div> : cards.map((card, cardIndex) => {
        const isActive = activeCard === cardIndex
        if (card.kind === 'raw') {
          return <div className={`query-card is-raw ${isActive ? 'is-active' : ''}`} data-card-index={cardIndex} key={`raw-${cardIndex}`}>
            <div className="query-card-head"><span className="query-card-tag">原样片段</span><button className="query-icon-button danger" type="button" title="删除此卡" onClick={() => deleteCard(cardIndex)}><CloseIcon /></button></div>
            <input className="query-raw-input" value={card.raw} spellCheck={false} onFocus={() => focusCard(cardIndex)} onChange={(event) => updateCard(cardIndex, (current) => current.kind === 'raw' ? { ...current, raw: event.target.value } : current)} onKeyDown={(event) => { if (!handleAutoKey(event)) { if (event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.nativeEvent.isComposing) { event.preventDefault(); search() } } }} />
          </div>
        }
        const isOr = card.join === '||' && card.rows.length > 1
        return <div className={`query-card ${isOr ? 'is-or' : ''} ${isActive ? 'is-active' : ''}`} data-card-index={cardIndex} key={`field-${cardIndex}`}>
          <div className="query-card-head">
            <input className="query-field-input" data-card-index={cardIndex} data-role="field" value={card.field} placeholder="字段（留空=关键词）" spellCheck={false}
              onFocus={(event) => { focusCard(cardIndex); openAuto('field', event.currentTarget, '', cardIndex) }}
              onBlur={() => setAuto(null)}
              onClick={(event) => openAuto('field', event.currentTarget, '', cardIndex)}
              onKeyUp={(event) => openAuto('field', event.currentTarget, '', cardIndex)}
              onChange={(event) => { const element = event.currentTarget; const value = element.value; updateCardField(cardIndex, value); window.requestAnimationFrame(() => openAuto('field', element, '', cardIndex)) }}
              onKeyDown={(event) => { if (!handleAutoKey(event) && event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.nativeEvent.isComposing) { event.preventDefault(); search() } }}
            />
            <select className="query-join-select" value={card.join} onChange={(event) => updateCard(cardIndex, (current) => current.kind === 'field' ? { ...current, join: event.target.value as '&&' | '||' } : current)} title="卡内多值如何拼接">
              <option value="&&">且 &&</option>
              <option value="||">或 ||</option>
            </select>
            <span className="query-card-tag">{isOr ? '( 或卡自动加括号 )' : `${card.rows.length} 值`}</span>
            <span className="query-card-actions"><button type="button" title="在本卡追加一个值（Alt+O）" onClick={addValue}><PlusIcon />值</button><button className="danger" type="button" title="删除整卡" onClick={() => deleteCard(cardIndex)}><CloseIcon /></button></span>
          </div>
          {card.rows.map((row, rowIndex) => <div className="query-card-row" key={`${cardIndex}-${rowIndex}`}>
            {rowIndex > 0 && <span className={card.join === '||' ? 'query-row-or' : 'query-row-and'}>{card.join === '||' ? '‖ 或' : '且 &&'}</span>}
            <select value={row.op} title="运算符" onChange={(event) => updateCardRow(cardIndex, rowIndex, { op: event.target.value as QueryRow['op'] })}>
              <option value="=">模糊 =</option>
              <option value="==">精确 ==</option>
              <option value="!=">排除 !=</option>
            </select>
            <input className="query-value-input" data-card-index={cardIndex} data-row-index={rowIndex} data-role="value" value={row.value} placeholder="值" spellCheck={false}
              onFocus={(event) => { focusCard(cardIndex, rowIndex); openAuto('value', event.currentTarget, card.field, cardIndex, rowIndex) }}
              onBlur={() => setAuto(null)}
              onClick={(event) => openAuto('value', event.currentTarget, card.field, cardIndex, rowIndex)}
              onKeyUp={(event) => openAuto('value', event.currentTarget, card.field, cardIndex, rowIndex)}
              onChange={(event) => { const element = event.currentTarget; const value = element.value; updateCardValue(cardIndex, rowIndex, value); window.requestAnimationFrame(() => openAuto('value', element, card.field, cardIndex, rowIndex)) }}
              onKeyDown={(event) => { if (!handleAutoKey(event) && event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.nativeEvent.isComposing) { event.preventDefault(); search() } }}
            />
            <button className="query-icon-button danger" type="button" title="删除此值" onClick={() => deleteRow(cardIndex, rowIndex)}><CloseIcon /></button>
          </div>)}
        </div>
      })}
    </div>

    <div className="query-card-toolbar">
      <button type="button" onClick={addCard}><PlusIcon /> 字段卡 <kbd>Alt+A</kbd></button>
      <button type="button" onClick={addValue}><PlusIcon /> 值 <kbd>Alt+O</kbd></button>
      {conflicts.length > 0 && <span className="query-conflict" title={conflicts.map((conflict) => conflict.msg).join('\n')}>⚠ {conflicts.length} 个语义冲突</span>}
      <span className="query-card-hint">语句和字段卡实时互通 · 单击语句可定位卡片</span>
    </div>

    <div className="query-statement-wrap">
      <textarea ref={textareaRef} className="query-statement" value={query} spellCheck={false} placeholder="FOFA 查询语句（与上方字段卡实时互通）— 回车搜索，Shift+回车换行，TAB 补齐"
        onChange={(event) => { const element = event.currentTarget; emitText(element.value); window.requestAnimationFrame(() => openAuto('text', element)) }}
        onBlur={() => setAuto(null)}
        onClick={(event) => { handleTextClick(event.currentTarget); openAuto('text', event.currentTarget) }}
        onKeyUp={(event) => { if (!['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'].includes(event.key)) openAuto('text', event.currentTarget) }}
        onFocus={(event) => openAuto('text', event.currentTarget)}
        onKeyDown={(event) => {
          if (handleAutoKey(event)) return
          if (event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            search()
          }
          if (event.altKey && event.key.toLowerCase() === 'a') {
            event.preventDefault()
            addCard()
          }
          if (event.altKey && event.key.toLowerCase() === 'o') {
            event.preventDefault()
            addValue()
          }
        }}
      />
      <div className="query-statement-footer"><span>Enter 搜索 · Shift+Enter 换行 · TAB 语法补齐</span><span>{resolveBuiltinDates(query) !== query ? 'YESTERDAY / LastMonth 将在搜索时解析' : '请求由主进程串行发送'}</span></div>
    </div>
    {renderAutoLayer()}
  </section>
}
