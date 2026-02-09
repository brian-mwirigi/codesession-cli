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
        <a href="https://github.com/brian-mwirigi/codesession-cli" target="_blank" rel="noreferrer" className="sidebar-link">
          GitHub <IconExternalLink size={12} />
        </a>
        <span className="sidebar-version">v{version}</span>
      </div>
    </aside>
  );
}
