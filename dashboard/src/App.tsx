import { useState } from 'react';
import Sidebar from './components/Sidebar';
import Overview from './components/Overview';
import SessionList from './components/SessionList';
import SessionDetail from './components/SessionDetail';
import ModelBreakdown from './components/ModelBreakdown';
import Insights from './components/Insights';

export type Page = 'overview' | 'sessions' | 'models' | 'insights';

export default function App() {
  const [page, setPage] = useState<Page>('overview');
  const [selectedSession, setSelectedSession] = useState<number | null>(null);

  const navigate = (p: Page) => {
    setPage(p);
    setSelectedSession(null);
  };

  return (
    <div className="app">
      <Sidebar page={page} onNavigate={navigate} />
      <main className="main-content">
        {selectedSession !== null ? (
          <SessionDetail sessionId={selectedSession} onBack={() => setSelectedSession(null)} />
        ) : page === 'overview' ? (
          <Overview onSessionClick={setSelectedSession} />
        ) : page === 'sessions' ? (
          <SessionList onSessionClick={setSelectedSession} />
        ) : page === 'insights' ? (
          <Insights />
        ) : (
          <ModelBreakdown />
        )}
      </main>
    </div>
  );
}
