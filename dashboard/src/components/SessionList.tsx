import { useState, useEffect, useMemo } from 'react';
import { fetchApi } from '../api';
import { formatCost, formatDuration, formatDate, formatTokens } from '../utils/format';
import { IconDownload } from './Icons';

interface Session {
  id: number;
  name: string;
  status: 'active' | 'completed';
  startTime: string;
  endTime?: string;
  duration?: number;
  filesChanged: number;
  commits: number;
  aiTokens: number;
  aiCost: number;
}

interface Props {
  onSessionClick: (id: number) => void;
}

type SortKey = 'startTime' | 'name' | 'duration' | 'filesChanged' | 'commits' | 'aiTokens' | 'aiCost';

export default function SessionList({ onSessionClick }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>('startTime');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const limit = 25;

  useEffect(() => {
    fetchApi<{ sessions: Session[]; total: number }>('/api/sessions', {
      limit: String(limit),
      offset: String(page * limit),
      status,
      search,
    }).then((data) => {
      setSessions(data.sessions);
      setTotal(data.total);
    });
  }, [status, search, page]);

  const sorted = useMemo(() => {
    return [...sessions].sort((a, b) => {
      const aVal = a[sortKey] ?? '';
      const bVal = b[sortKey] ?? '';
      const cmp = typeof aVal === 'number' ? aVal - (bVal as number) : String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [sessions, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const totalPages = Math.ceil(total / limit);
  const arrow = (key: SortKey) =>
    sortKey === key ? (sortDir === 'desc' ? ' \u2193' : ' \u2191') : '';

  const costPerHour = (s: Session) => {
    if (!s.duration || s.duration === 0 || !s.aiCost) return null;
    return s.aiCost / (s.duration / 3600);
  };

  const handleExport = (format: 'json' | 'csv') => {
    window.open(`/api/export?format=${format}`, '_blank');
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Sessions</h1>
        <div className="page-subtitle">All recorded coding sessions</div>
      </div>

      <div className="filters">
        <input
          type="text"
          className="filter-input"
          placeholder="Search by name\u2026"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        />
        <select
          className="filter-select"
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(0); }}
        >
          <option value="all">All statuses</option>
          <option value="completed">Completed</option>
          <option value="active">Active</option>
        </select>
        <span className="filter-meta">{total} session{total !== 1 ? 's' : ''}</span>
        <button className="export-btn" onClick={() => handleExport('json')} title="Export as JSON">
          <IconDownload size={14} /> JSON
        </button>
        <button className="export-btn" onClick={() => handleExport('csv')} title="Export as CSV">
          <IconDownload size={14} /> CSV
        </button>
      </div>

      <div className="card">
        <div className="card-body--flush">
          <div className="table-wrap">
            <table className="tbl tbl--clickable">
              <thead>
                <tr>
                  <th className="sortable" onClick={() => toggleSort('name')}>Name{arrow('name')}</th>
                  <th>Status</th>
                  <th className="sortable r" onClick={() => toggleSort('startTime')}>Started{arrow('startTime')}</th>
                  <th className="sortable r" onClick={() => toggleSort('duration')}>Duration{arrow('duration')}</th>
                  <th className="sortable r" onClick={() => toggleSort('filesChanged')}>Files{arrow('filesChanged')}</th>
                  <th className="sortable r" onClick={() => toggleSort('commits')}>Commits{arrow('commits')}</th>
                  <th className="sortable r" onClick={() => toggleSort('aiTokens')}>Tokens{arrow('aiTokens')}</th>
                  <th className="sortable r" onClick={() => toggleSort('aiCost')}>Cost{arrow('aiCost')}</th>
                  <th className="r">$/hr</th>
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 ? (
                  <tr><td colSpan={9} className="empty">No sessions found</td></tr>
                ) : sorted.map((s) => (
                  <tr key={s.id} onClick={() => onSessionClick(s.id)}>
                    <td className="ellipsis" title={s.name}>{s.name}</td>
                    <td><span className={`badge badge-${s.status}`}>{s.status}</span></td>
                    <td className="r mono">{formatDate(s.startTime)}</td>
                    <td className="r mono">{formatDuration(s.duration)}</td>
                    <td className="r mono">{s.filesChanged}</td>
                    <td className="r mono">{s.commits}</td>
                    <td className="r mono">{formatTokens(s.aiTokens)}</td>
                    <td className="r mono cost">{formatCost(s.aiCost)}</td>
                    <td className="r mono">{costPerHour(s) !== null ? formatCost(costPerHour(s)!) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)}>Prev</button>
          <span className="page-info">{page + 1} / {totalPages}</span>
          <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
