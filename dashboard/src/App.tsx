import { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Overview from './components/Overview';
import SessionList from './components/SessionList';
import SessionDetail from './components/SessionDetail';
import ModelBreakdown from './components/ModelBreakdown';
import Insights from './components/Insights';
import Alerts from './components/Alerts';

export type Page = 'overview' | 'sessions' | 'models' | 'insights' | 'alerts';

// ── URL-based routing (no react-router needed) ─────────────

function parseRoute(): { page: Page; sessionId: number | null } {
  const path = window.location.pathname;
  if (path.match(/^\/sessions\/\d+/)) {
    const id = parseInt(path.split('/')[2]);
    if (!isNaN(id)) return { page: 'sessions', sessionId: id };
  }
  if (path === '/sessions') return { page: 'sessions', sessionId: null };
  if (path === '/models') return { page: 'models', sessionId: null };
  if (path === '/insights') return { page: 'insights', sessionId: null };
  if (path === '/alerts') return { page: 'alerts', sessionId: null };
  return { page: 'overview', sessionId: null };
}

function buildPath(page: Page, sessionId?: number | null): string {
  if (sessionId) return `/sessions/${sessionId}`;
  if (page === 'overview') return '/';
  return `/${page}`;
}

export default function App() {
  const initial = parseRoute();
  const [page, setPage] = useState<Page>(initial.page);
  const [selectedSession, setSelectedSession] = useState<number | null>(initial.sessionId);

  // Sync state on browser back/forward
  useEffect(() => {
    const onPopState = () => {
      const route = parseRoute();
      setPage(route.page);
      setSelectedSession(route.sessionId);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((p: Page) => {
    window.history.pushState(null, '', buildPath(p));
    setPage(p);
    setSelectedSession(null);
  }, []);

  const selectSession = useCallback((id: number) => {
    window.history.pushState(null, '', buildPath('sessions', id));
    setSelectedSession(id);
    setPage('sessions');
  }, []);

  const goBackToSessions = useCallback(() => {
    window.history.pushState(null, '', '/sessions');
    setSelectedSession(null);
  }, []);

  return (
    <div className="app">
      <Sidebar page={page} onNavigate={navigate} />
      <main className="main-content">
        {selectedSession !== null ? (
          <SessionDetail sessionId={selectedSession} onBack={goBackToSessions} />
        ) : page === 'overview' ? (
          <Overview onSessionClick={selectSession} />
        ) : page === 'sessions' ? (
          <SessionList onSessionClick={selectSession} />
        ) : page === 'insights' ? (
          <Insights />
        ) : page === 'alerts' ? (
          <Alerts />
        ) : (
          <ModelBreakdown />
        )}
      </main>
    </div>
  );
}
