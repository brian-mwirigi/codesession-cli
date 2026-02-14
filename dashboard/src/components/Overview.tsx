import { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { fetchApi } from '../api';
import { useInterval } from '../hooks/useInterval';
import { formatCost, formatDuration, formatTokens, formatDay } from '../utils/format';
import { IconSessions, IconDollar, IconClock, IconTrendUp, IconCircleDot, IconFile, IconGitCommit } from './Icons';

// ── Spend Threshold Alerts ──────────────────────────────────

interface Thresholds {
  dailyCost: number;
  totalCost: number;
  sessionCost: number;
}

const THRESHOLDS_KEY = 'cs-spend-thresholds';

function loadThresholds(): Thresholds {
  try {
    const raw = localStorage.getItem(THRESHOLDS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { dailyCost: 0, totalCost: 0, sessionCost: 0 };
}

function saveThresholds(t: Thresholds) {
  localStorage.setItem(THRESHOLDS_KEY, JSON.stringify(t));
}

interface Alert {
  level: 'warning' | 'danger';
  message: string;
}

function computeAlerts(stats: Stats, daily: DailyCost[], top: TopSession[], thresholds: Thresholds): Alert[] {
  const alerts: Alert[] = [];
  if (thresholds.totalCost > 0 && stats.totalAICost >= thresholds.totalCost) {
    alerts.push({
      level: stats.totalAICost >= thresholds.totalCost * 1.5 ? 'danger' : 'warning',
      message: `Total spend ${formatCost(stats.totalAICost)} has exceeded your ${formatCost(thresholds.totalCost)} threshold`,
    });
  }
  if (thresholds.dailyCost > 0 && daily.length > 0) {
    const today = daily[daily.length - 1];
    if (today && today.cost >= thresholds.dailyCost) {
      alerts.push({
        level: today.cost >= thresholds.dailyCost * 1.5 ? 'danger' : 'warning',
        message: `Today's spend ${formatCost(today.cost)} has exceeded your ${formatCost(thresholds.dailyCost)}/day threshold`,
      });
    }
  }
  if (thresholds.sessionCost > 0 && top.length > 0) {
    const expensive = top.filter(s => s.aiCost >= thresholds.sessionCost);
    if (expensive.length > 0) {
      alerts.push({
        level: 'warning',
        message: `${expensive.length} session${expensive.length > 1 ? 's' : ''} exceeded your ${formatCost(thresholds.sessionCost)}/session threshold`,
      });
    }
  }
  return alerts;
}

interface Stats {
  totalSessions: number;
  totalTime: number;
  totalFiles: number;
  totalCommits: number;
  totalAICost: number;
  avgSessionTime: number;
  activeSessions: number;
}

interface DailyCost {
  day: string;
  cost: number;
  sessions: number;
  tokens: number;
}

interface DailyToken {
  day: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface TopSession {
  id: number;
  name: string;
  aiCost: number;
  duration: number;
  startTime: string;
}

interface CostVelocityItem {
  id: number;
  name: string;
  startTime: string;
  duration: number;
  aiCost: number;
  costPerHour: number;
}

interface Props {
  onSessionClick: (id: number) => void;
}

export default function Overview({ onSessionClick }: Props) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [daily, setDaily] = useState<DailyCost[]>([]);
  const [dailyTokens, setDailyTokens] = useState<DailyToken[]>([]);
  const [top, setTop] = useState<TopSession[]>([]);
  const [velocity, setVelocity] = useState<CostVelocityItem[]>([]);
  const [thresholds, setThresholds] = useState<Thresholds>(loadThresholds);
  const [showThresholdConfig, setShowThresholdConfig] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = useCallback(() => {
    fetchApi<Stats>('/api/stats').then(setStats);
    fetchApi<DailyCost[]>('/api/daily-costs', { days: '30' }).then(setDaily);
    fetchApi<DailyToken[]>('/api/daily-tokens', { days: '30' }).then(setDailyTokens);
    fetchApi<TopSession[]>('/api/top-sessions', { limit: '5' }).then(setTop);
    fetchApi<CostVelocityItem[]>('/api/cost-velocity', { limit: '20' }).then(setVelocity);
  }, []);

  useInterval(fetchAll, 30_000);

  if (!stats) return <div className="loading">Loading…</div>;

  const avgCost = stats.totalSessions > 0 ? stats.totalAICost / stats.totalSessions : 0;
  const totalDailyCost = daily.reduce((s, d) => s + d.cost, 0);
  const avgDailyCost = daily.length > 0 ? totalDailyCost / daily.length : 0;
  const projectedMonthly = avgDailyCost * 30;

  const alerts = computeAlerts(stats, daily, top, thresholds);
  const visibleAlerts = alerts.filter(a => !dismissed.has(a.message));

  const updateThreshold = (key: keyof Thresholds, value: string) => {
    const num = parseFloat(value) || 0;
    const updated = { ...thresholds, [key]: num };
    setThresholds(updated);
    saveThresholds(updated);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 className="page-title">Overview</h1>
            <div className="page-subtitle">Aggregate metrics across all completed sessions</div>
          </div>
          <button className="btn-threshold-config" onClick={() => setShowThresholdConfig(!showThresholdConfig)}>
            Alerts {thresholds.dailyCost > 0 || thresholds.totalCost > 0 || thresholds.sessionCost > 0 ? '(on)' : '(off)'}
          </button>
        </div>
      </div>

      {/* Threshold config */}
      {showThresholdConfig && (
        <div className="card alert-config" style={{ marginBottom: 12 }}>
          <div className="card-header"><div className="card-title">Spend Alert Thresholds</div></div>
          <div className="card-body">
            <div className="threshold-grid">
              <label>Daily spend limit</label>
              <div className="threshold-input">
                <span>$</span>
                <input type="number" min="0" step="0.5" value={thresholds.dailyCost || ''} placeholder="off"
                  onChange={e => updateThreshold('dailyCost', e.target.value)} />
              </div>
              <label>Total spend limit</label>
              <div className="threshold-input">
                <span>$</span>
                <input type="number" min="0" step="1" value={thresholds.totalCost || ''} placeholder="off"
                  onChange={e => updateThreshold('totalCost', e.target.value)} />
              </div>
              <label>Per-session limit</label>
              <div className="threshold-input">
                <span>$</span>
                <input type="number" min="0" step="0.5" value={thresholds.sessionCost || ''} placeholder="off"
                  onChange={e => updateThreshold('sessionCost', e.target.value)} />
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>Set to 0 or clear to disable. Thresholds are stored locally in your browser.</div>
          </div>
        </div>
      )}

      {/* Spend alerts */}
      {visibleAlerts.map((alert) => (
        <div key={alert.message} className={`alert-banner alert-banner--${alert.level}`}>
          <span>{alert.message}</span>
          <button className="alert-dismiss" onClick={() => setDismissed(prev => new Set(prev).add(alert.message))}>Dismiss</button>
        </div>
      ))}

      {/* All KPIs */}
      <div className="stat-row">
        <div className="stat-cell">
          <div className="stat-label"><IconSessions size={14} /> Sessions</div>
          <div className="stat-value">{stats.totalSessions}</div>
        </div>
        <div className="stat-cell">
          <div className="stat-label"><IconDollar size={14} /> Total Cost</div>
          <div className="stat-value">{formatCost(stats.totalAICost)}</div>
        </div>
        <div className="stat-cell">
          <div className="stat-label"><IconClock size={14} /> Total Time</div>
          <div className="stat-value">{formatDuration(stats.totalTime)}</div>
        </div>
        <div className="stat-cell">
          <div className="stat-label"><IconClock size={14} /> Avg Duration</div>
          <div className="stat-value">{formatDuration(Math.round(stats.avgSessionTime))}</div>
        </div>
        <div className="stat-cell">
          <div className="stat-label"><IconTrendUp size={14} /> Avg Cost</div>
          <div className="stat-value">{formatCost(avgCost)}</div>
        </div>
        <div className="stat-cell">
          <div className="stat-label"><IconFile size={14} /> Files Changed</div>
          <div className="stat-value">{stats.totalFiles}</div>
        </div>
        <div className="stat-cell">
          <div className="stat-label"><IconGitCommit size={14} /> Commits</div>
          <div className="stat-value">{stats.totalCommits}</div>
        </div>
        {stats.activeSessions > 0 && (
          <div className="stat-cell">
            <div className="stat-label"><IconCircleDot size={14} /> Active Now</div>
            <div className="stat-value">{stats.activeSessions}</div>
          </div>
        )}
      </div>

      {/* Burn rate projection */}
      {daily.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div className="card-title">Spend Projection</div>
            <div className="card-meta">based on last {daily.length} days</div>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', gap: 32, fontSize: 13, color: 'var(--text-secondary)' }}>
              <div>
                <span style={{ color: 'var(--text-tertiary)' }}>Avg daily: </span>
                <span className="mono" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatCost(avgDailyCost)}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-tertiary)' }}>Projected monthly: </span>
                <span className="mono" style={{ color: projectedMonthly > 100 ? 'var(--danger)' : 'var(--text-primary)', fontWeight: 600 }}>{formatCost(projectedMonthly)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Daily Cost */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Daily Cost</div>
          <div className="card-meta">last 30 days</div>
        </div>
        <div className="card-body">
          {daily.length === 0 ? (
            <div className="empty">No data yet — run some sessions first</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={daily}>
                <defs>
                  <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tickFormatter={formatDay} tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => `$${v}`} tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} width={50} />
                <Tooltip content={<CostTooltip />} />
                <Area type="monotone" dataKey="cost" stroke="#22c55e" strokeWidth={1.5} fill="url(#costGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Daily Token Trend */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Daily Token Usage</div>
          <div className="card-meta">prompt vs completion</div>
        </div>
        <div className="card-body">
          {dailyTokens.length === 0 ? (
            <div className="empty">No token data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dailyTokens}>
                <XAxis dataKey="day" tickFormatter={formatDay} tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => formatTokens(v)} tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} width={50} />
                <Tooltip content={<TokenTooltip />} />
                <Bar dataKey="promptTokens" stackId="a" fill="#3b82f6" name="Prompt" />
                <Bar dataKey="completionTokens" stackId="a" fill="#8b5cf6" radius={[3, 3, 0, 0]} name="Completion" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Two-column */}
      <div className="grid grid--2">
        <div className="card">
          <div className="card-header"><div className="card-title">Sessions per Day</div></div>
          <div className="card-body">
            {daily.length === 0 ? (
              <div className="empty">No data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={daily}>
                  <XAxis dataKey="day" tickFormatter={formatDay} tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} width={30} />
                  <Tooltip content={<SessionCountTooltip />} />
                  <Bar dataKey="sessions" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">Most Expensive Sessions</div></div>
          <div className="card-body--flush">
            {top.length === 0 ? (
              <div className="empty">No sessions with cost yet</div>
            ) : (
              <table className="tbl tbl--compact tbl--clickable">
                <thead><tr><th>Session</th><th className="r">Cost</th><th className="r">Time</th></tr></thead>
                <tbody>
                  {top.map((s) => (
                    <tr key={s.id} onClick={() => onSessionClick(s.id)}>
                      <td className="ellipsis" title={s.name}>{s.name}</td>
                      <td className="r mono cost">{formatCost(s.aiCost)}</td>
                      <td className="r mono">{formatDuration(s.duration)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Cost Velocity */}
      {velocity.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Cost Velocity</div>
            <div className="card-meta">$/hr per session</div>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={velocity.slice().reverse()}>
                <XAxis dataKey="name" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tickFormatter={(v) => `$${v}`} tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} width={45} />
                <Tooltip content={<VelocityTooltip />} />
                <Bar dataKey="costPerHour" fill="#eab308" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

function CostTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="tt-label">{label}</div>
      <div className="tt-value" style={{ color: '#22c55e' }}>Cost: {formatCost(payload[0].value)}</div>
    </div>
  );
}

function TokenTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="tt-label">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="tt-value" style={{ color: p.color }}>{p.name}: {formatTokens(p.value)}</div>
      ))}
    </div>
  );
}

function SessionCountTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="tt-label">{label}</div>
      <div className="tt-value" style={{ color: '#3b82f6' }}>Sessions: {payload[0].value}</div>
    </div>
  );
}

function VelocityTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <div className="tt-label">{d.name}</div>
      <div className="tt-value">{formatCost(d.costPerHour)}/hr · {formatCost(d.aiCost)} total · {formatDuration(d.duration)}</div>
    </div>
  );
}
