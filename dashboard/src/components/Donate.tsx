import { IconHeart, IconExternalLink } from './Icons';

const LINKS = [
  {
    name: 'GitHub Sponsors',
    url: 'https://github.com/sponsors/brian-mwirigi',
    description: 'Monthly or one-time sponsorship via GitHub',
    color: '#db61a2',
    icon: (
      <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
        <path d="M4.25 2.5c-1.336 0-2.75 1.164-2.75 3 0 2.15 1.58 4.144 3.365 5.682A20.6 20.6 0 0 0 8 13.393a20.6 20.6 0 0 0 3.135-2.211C12.92 9.644 14.5 7.65 14.5 5.5c0-1.836-1.414-3-2.75-3-1.373 0-2.609.986-3.029 2.456a.749.749 0 0 1-1.442 0C6.859 3.486 5.623 2.5 4.25 2.5z"/>
      </svg>
    ),
  },
  {
    name: 'Buy Me a Coffee',
    url: 'https://buymeacoffee.com/brianmwirigi',
    description: 'Quick one-time support',
    color: '#ffdd00',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 8h1a4 4 0 1 1 0 8h-1"/>
        <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/>
        <path d="M6 2v2"/><path d="M10 2v2"/><path d="M14 2v2"/>
      </svg>
    ),
  },
  {
    name: 'M-Pesa',
    url: null,
    description: 'Send to +254 748665079 (Kenya)',
    color: '#4caf50',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
      </svg>
    ),
  },
];

export default function Donate() {
  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Support codesession-cli</h1>
        <p className="page-subtitle">
          If this tool saves you money on AI costs, consider supporting its development
        </p>
      </div>

      <div className="donate-grid">
        {LINKS.map((link) => (
          <div key={link.name} className="donate-card card">
            <div className="donate-card-inner">
              <div className="donate-icon" style={{ color: link.color }}>
                {link.icon}
              </div>
              <div className="donate-info">
                <h3 className="donate-name">{link.name}</h3>
                <p className="donate-desc">{link.description}</p>
              </div>
              {link.url ? (
                <a href={link.url} target="_blank" rel="noreferrer" className="donate-btn">
                  Open <IconExternalLink size={13} />
                </a>
              ) : (
                <span className="donate-btn donate-btn--static">
                  Direct
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-body">
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
            codesession-cli is free and open source, built and maintained by{' '}
            <a href="https://github.com/brian-mwirigi" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
              Brian Mwirigi
            </a>{' '}
            in Nairobi, Kenya. Every contribution helps keep the project going.
          </p>
        </div>
      </div>
    </>
  );
}
