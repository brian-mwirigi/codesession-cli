import { useState, useEffect } from 'react';
import type { Page } from '../App';
import { fetchApi, postApi } from '../api';
import { IconOverview, IconSessions, IconModels, IconActivity, IconBarChart, IconBell, IconHeart, IconTag, IconRefreshCw } from './Icons';

const NAV: { page: Page; icon: React.ReactNode; label: string }[] = [
  { page: 'overview', icon: <IconOverview size={16} />, label: 'Overview' },
  { page: 'sessions', icon: <IconSessions size={16} />, label: 'Sessions' },
  { page: 'models', icon: <IconModels size={16} />, label: 'Models' },
  { page: 'insights', icon: <IconBarChart size={16} />, label: 'Insights' },
  { page: 'alerts', icon: <IconBell size={16} />, label: 'Alerts' },
  { page: 'donate', icon: <IconHeart size={16} />, label: 'Donate' },
  { page: 'pricing', icon: <IconTag size={16} />, label: 'Pricing' },
];

interface Props {
  page: Page;
  onNavigate: (p: Page) => void;
}

export default function Sidebar({ page, onNavigate }: Props) {
  const [version, setVersion] = useState('...');
  const [showReset, setShowReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    fetchApi<{ version: string }>('/api/version').then(d => setVersion(d.version)).catch(() => {});
  }, []);

  const handleReset = async () => {
    setResetting(true);
    try {
      await postApi('/api/reset');
      // Clear alert thresholds from localStorage too
      localStorage.removeItem('cs-spend-thresholds');
      setShowReset(false);
      window.location.reload();
    } catch {
      setResetting(false);
    }
  };

  return (
    <>
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
          <button className="sidebar-link start-fresh-btn" onClick={() => setShowReset(true)}>
            <IconRefreshCw size={13} />
            {' '}Start Fresh
          </button>
          <div className="sidebar-footer-row">
            <a href="https://github.com/brian-mwirigi/codesession-cli" target="_blank" rel="noreferrer" className="sidebar-link star-cta">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25z"/></svg>
              {' '}Star on GitHub
            </a>
            <span className="sidebar-version">v{version}</span>
          </div>
        </div>
      </aside>

      {/* Reset confirmation modal */}
      {showReset && (
        <div className="modal-overlay" onClick={() => !resetting && setShowReset(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <IconRefreshCw size={20} />
              <h2>Start Fresh</h2>
            </div>
            <div className="modal-body">
              <p>This will permanently delete <strong>all session data</strong> including:</p>
              <ul>
                <li>All tracked sessions and their history</li>
                <li>AI usage and cost records</li>
                <li>File change logs and commit history</li>
                <li>Alert threshold settings</li>
              </ul>
              <p className="modal-warn">This action cannot be undone.</p>
            </div>
            <div className="modal-actions">
              <button className="modal-btn modal-btn--cancel" onClick={() => setShowReset(false)} disabled={resetting}>
                Cancel
              </button>
              <button className="modal-btn modal-btn--danger" onClick={handleReset} disabled={resetting}>
                {resetting ? 'Clearing...' : 'Clear All Data'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
