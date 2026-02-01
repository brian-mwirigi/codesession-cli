import chokidar from 'chokidar';
import { relative } from 'path';
import { addFileChange } from './db';

let watcher: chokidar.FSWatcher | null = null;
const changedFiles = new Set<string>();

export function startWatcher(sessionId: number, cwd: string): void {
  if (watcher) return;

  watcher = chokidar.watch(cwd, {
    ignored: /(^|[\/\\])\..|(node_modules|dist|build|\.git)/,
    persistent: true,
    ignoreInitial: true,
  });

  watcher
    .on('add', (path) => handleChange(sessionId, path, cwd, 'created'))
    .on('change', (path) => handleChange(sessionId, path, cwd, 'modified'))
    .on('unlink', (path) => handleChange(sessionId, path, cwd, 'deleted'));
}

export function stopWatcher(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
    changedFiles.clear();
  }
}

function handleChange(
  sessionId: number,
  path: string,
  cwd: string,
  changeType: 'created' | 'modified' | 'deleted'
): void {
  const relativePath = relative(cwd, path);
  
  // Deduplicate rapid changes to same file
  const key = `${relativePath}-${changeType}`;
  if (changedFiles.has(key)) return;
  
  changedFiles.add(key);
  setTimeout(() => changedFiles.delete(key), 1000);

  addFileChange({
    sessionId,
    filePath: relativePath,
    changeType,
    timestamp: new Date().toISOString(),
  });
}
