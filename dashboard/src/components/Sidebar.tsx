import { useState, useEffect } from 'react';
import type { Page } from '../App';
import { fetchApi } from '../api';
import { IconOverview, IconSessions, IconModels, IconActivity, IconExternalLink, IconBarChart } from './Icons';

const NAV: { page: Page; icon: React.ReactNode; label: string }[] = [
  { page: 'overview', icon: <IconOverview size={16} />, label: 'Overview' },
  { page: 'sessions', icon: <IconSessions size={16} />, label: 'Sessions' },
  { page: 'models', icon: <IconModels size={16} />, label: 'Models' },
  { page: 'insights', icon: <IconBarChart size={16} />, label: 'Insights' },
];

interface Props {
  page: Page;
  onNavigate: (p: Page) => void;
}

export default function Sidebar({ page, onNavigate }: Props) {
  const [version, setVersion] = useState('...');
  useEffect(() => {
    fetchApi<{ version: string }>('/api/version').then(d => setVersion(d.version)).catch(() => {});
  }, []);

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-icon"><IconActivity size={18} /></span>
        <span className="brand-text">codesession</span>
      </div>

      <nav className="sidebar-nav">
        {NAV.map((n) => (
          <button
            key={n.page}
            className={`nav-item${page === n.page ? ' active' : ''}`}
            onClick={() => onNavigate(n.page)}
          >
            <span className="nav-icon">{n.icon}</span>
            <span>{n.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <a href="https://github.com/brian-mwirigi/codesession-cli" target="_blank" rel="noreferrer" className="sidebar-link star-cta">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25z"/></svg>
          {' '}Star on GitHub
        </a>
        <span className="sidebar-version">v{version}</span>
      </div>
    </aside>
  );
}
