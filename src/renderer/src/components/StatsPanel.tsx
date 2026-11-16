import { useCallback, useEffect, useState } from 'react'
import type { UsageStatsSnapshot } from '../../../shared/types'

function RefreshIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M6.1 9A7 7 0 0 1 18.5 6L20 8M4 16l1.5 2A7 7 0 0 0 17.9 15" /></svg>
}

function formatDayLabel(dateKey: string): string {
  const [, month, day] = dateKey.split('-')
  return `${Number(month)}/${Number(day)}`
}

/**
 * 使用统计页：当天查询次数与数据量 + 近 14 天趋势。
 * 数据由主进程在 FOFA 业务入口自动记录，此处只负责展示。
 */
export default function StatsPanel() {
  const [snapshot, setSnapshot] = useState<UsageStatsSnapshot | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setSnapshot(await window.electronAPI.getUsageStats())
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '读取统计失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 30_000)
    return () => window.clearInterval(timer)
  }, [refresh])

  const today = snapshot?.today
  const maxSearches = Math.max(1, ...(snapshot?.recent.map((day) => day.searches) ?? [1]))

  return (
    <section className="stats-view" aria-label="使用统计">
      <header className="stats-head">
        <div>
          <p className="eyebrow">USAGE OVERVIEW</p>
          <h2>使用统计</h2>
        </div>
        <div className="stats-head-meta">
          <span>{snapshot ? `${snapshot.today.date} · 已累计 ${snapshot.trackedDays} 天` : loading ? '正在读取…' : '暂无数据'}</span>
          <button type="button" onClick={() => void refresh()} disabled={loading}><RefreshIcon />刷新</button>
        </div>
      </header>

      {error && <div className="stats-error">{error}</div>}

      <div className="stats-hero-grid">
        <div className="stat-card is-accent">
          <small>今日查询</small>
          <strong>{today ? today.searches.toLocaleString() : '—'}</strong>
          <span>{today ? `成功 ${today.searches} 次 · 失败 ${today.failedSearches} 次` : 'FOFA 搜索次数'}</span>
        </div>
        <div className="stat-card">
          <small>今日数据量</small>
          <strong>{today ? today.records.toLocaleString() : '—'}</strong>
          <span>累计拉取资产记录（条）</span>
        </div>
        <div className="stat-card">
          <small>累计查询</small>
          <strong>{snapshot ? snapshot.totalSearches.toLocaleString() : '—'}</strong>
          <span>已记录 {snapshot?.trackedDays ?? 0} 天</span>
        </div>
        <div className="stat-card">
          <small>累计数据量</small>
          <strong>{snapshot ? snapshot.totalRecords.toLocaleString() : '—'}</strong>
          <span>历史拉取资产记录（条）</span>
        </div>
      </div>

      <div className="stats-chart-card">
        <div className="stats-chart-head">
          <strong>近 14 天查询次数</strong>
          <span>{snapshot ? `累计 ${snapshot.totalSearches.toLocaleString()} 次查询 · ${snapshot.totalRecords.toLocaleString()} 条数据` : ''}</span>
        </div>
        {snapshot && (
          <div className="stats-chart">
            {snapshot.recent.map((day) => (
              <div
                className={`stats-bar-col ${day.date === snapshot.today.date ? 'is-today' : ''}`}
                key={day.date}
                title={`${day.date}｜查询 ${day.searches} 次（失败 ${day.failedSearches}）· 数据 ${day.records} 条`}
              >
                <span className="stats-bar-value">{day.searches > 0 ? day.searches : ''}</span>
                <div className="stats-bar-track">
                  <div className="stats-bar" style={{ height: `${Math.max(4, Math.round((day.searches / maxSearches) * 100))}%` }} />
                </div>
                <span className="stats-bar-day">{formatDayLabel(day.date)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="stats-footnote">统计由主进程在查询链路自动记录（本地存储，按天保留 180 天）。框架已就绪，后续可扩展按指纹来源、会话分布等维度。</p>
    </section>
  )
}
