import { useState, useEffect } from 'react';
import { IconExternalLink } from './Icons';

interface ChangelogEntry {
  version: string;
  date: string;
  sections: { heading: string; items: string[] }[];
}

/** Parse raw CHANGELOG.md into structured entries. */
function parseChangelog(raw: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let current: ChangelogEntry | null = null;
  let currentSection: { heading: string; items: string[] } | null = null;

  for (const line of raw.split('\n')) {
    // Version header: ## [2.5.1] - 2026-03-07
    const versionMatch = line.match(/^## \[(.+?)\]\s*-\s*(.+)/);
    if (versionMatch) {
      if (current) entries.push(current);
      current = { version: versionMatch[1], date: versionMatch[2].trim(), sections: [] };
      currentSection = null;
      continue;
    }

    if (!current) continue;

    // Section header: ### Added, ### Fixed, etc.
    const sectionMatch = line.match(/^### (.+)/);
    if (sectionMatch) {
      currentSection = { heading: sectionMatch[1], items: [] };
      current.sections.push(currentSection);
      continue;
    }

    // Bullet item
    if (currentSection && line.match(/^- /)) {
      currentSection.items.push(line.replace(/^- /, ''));
    }
    // Sub-bullet — append to last item
    if (currentSection && line.match(/^\s+- /)) {
      const last = currentSection.items.length - 1;
      if (last >= 0) {
        currentSection.items[last] += '\n' + line.trim().replace(/^- /, '↳ ');
      }
    }
  }
  if (current) entries.push(current);
  return entries;
}

/** Render inline markdown bold **text** → <strong>. */
function renderInline(text: string) {
  const parts: (string | JSX.Element)[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(<strong key={key++}>{match[1]}</strong>);
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function sectionBadge(heading: string): string {
  const h = heading.toLowerCase();
  if (h.includes('added') || h.includes('new')) return 'changelog-badge--added';
  if (h.includes('fixed')) return 'changelog-badge--fixed';
  if (h.includes('changed') || h.includes('enhanced')) return 'changelog-badge--changed';
  if (h.includes('removed') || h.includes('deprecated')) return 'changelog-badge--removed';
  return 'changelog-badge--other';
}

export default function Changelog() {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/v1/changelog')
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.text(); })
      .then(raw => {
        const parsed = parseChangelog(raw);
        setEntries(parsed);
        // Auto-expand the latest version
        if (parsed.length > 0) setExpanded(new Set([parsed[0].version]));
      })
      .catch(() => setError('Could not load changelog'))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (version: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(version)) next.delete(version);
      else next.add(version);
      return next;
    });
  };

  if (loading) return <div className="page-loading">Loading changelog…</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Changelog</h1>
        <a
          href="https://github.com/brian-mwirigi/codesession-cli/blob/main/CHANGELOG.md"
          target="_blank"
          rel="noreferrer"
          className="help-docs-link"
        >
          View on GitHub <IconExternalLink size={14} />
        </a>
      </div>

      <div className="changelog-list">
        {entries.map(entry => {
          const isOpen = expanded.has(entry.version);
          return (
            <div key={entry.version} className={`changelog-entry${isOpen ? ' changelog-entry--open' : ''}`}>
              <button className="changelog-entry-header" onClick={() => toggle(entry.version)}>
                <div className="changelog-entry-title">
                  <span className="changelog-version">v{entry.version}</span>
                  <span className="changelog-date">{entry.date}</span>
                </div>
                <span className="changelog-chevron">{isOpen ? '▾' : '▸'}</span>
              </button>

              {isOpen && (
                <div className="changelog-entry-body">
                  {entry.sections.map((sec, si) => (
                    <div key={si} className="changelog-section">
                      <span className={`changelog-badge ${sectionBadge(sec.heading)}`}>
                        {sec.heading}
                      </span>
                      <ul className="changelog-items">
                        {sec.items.map((item, ii) => (
                          <li key={ii}>
                            {item.includes('\n')
                              ? item.split('\n').map((line, li) => (
                                  <span key={li}>
                                    {li > 0 && <br />}
                                    {renderInline(line)}
                                  </span>
                                ))
                              : renderInline(item)
                            }
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
