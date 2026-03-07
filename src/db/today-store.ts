/**
 * Today project registry — track which directories are included in `cs today`.
 */

import { db } from './connection';

export function getTodayProjects(): Array<{ id: number; path: string; name: string; addedAt: string }> {
  const stmt = db.prepare('SELECT * FROM today_projects ORDER BY name ASC, path ASC');
  const rows = stmt.all() as any[];
  return rows.map(r => ({
    id: r.id,
    path: r.path,
    name: r.name || require('path').basename(r.path),
    addedAt: r.added_at,
  }));
}

export function addTodayProject(projectPath: string, name?: string): { id: number; path: string; name: string; addedAt: string } {
  const normPath = projectPath.replace(/\\/g, '/').replace(/\/$/, '');
  const projectName = name || require('path').basename(normPath);
  const now = new Date().toISOString();
  const stmt = db.prepare('INSERT OR IGNORE INTO today_projects (path, name, added_at) VALUES (?, ?, ?)');
  const result = stmt.run(normPath, projectName, now);
  if (result.changes === 0) {
    // Already exists — update name if provided
    if (name) {
      db.prepare('UPDATE today_projects SET name = ? WHERE path = ?').run(projectName, normPath);
    }
    const existing = db.prepare('SELECT * FROM today_projects WHERE path = ?').get(normPath) as any;
    return { id: existing.id, path: existing.path, name: existing.name, addedAt: existing.added_at };
  }
  return { id: result.lastInsertRowid as number, path: normPath, name: projectName, addedAt: now };
}

export function removeTodayProject(projectPath: string): boolean {
  const normPath = projectPath.replace(/\\/g, '/').replace(/\/$/, '');
  const stmt = db.prepare('DELETE FROM today_projects WHERE path = ?');
  const result = stmt.run(normPath);
  return result.changes > 0;
}

export function clearTodayProjects(): void {
  db.prepare('DELETE FROM today_projects').run();
}
