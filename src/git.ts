import { simpleGit, SimpleGit } from 'simple-git';
import { addCommit } from './db';

let git: SimpleGit;
let lastCommitHash: string | null = null;

export function initGit(cwd: string): void {
  git = simpleGit(cwd);
}

export async function checkForNewCommits(sessionId: number): Promise<void> {
  if (!git) return;

  try {
    const log = await git.log({ maxCount: 1 });
    if (log.latest && log.latest.hash !== lastCommitHash) {
      lastCommitHash = log.latest.hash;
      
      addCommit({
        sessionId,
        hash: log.latest.hash.substring(0, 7),
        message: log.latest.message,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    // Not a git repo or no commits yet
  }
}

export async function getGitInfo(): Promise<{ branch: string; hasChanges: boolean } | null> {
  if (!git) return null;

  try {
    const branch = await git.revparse(['--abbrev-ref', 'HEAD']);
    const status = await git.status();
    return {
      branch: branch.trim(),
      hasChanges: !status.isClean(),
    };
  } catch (error) {
    return null;
  }
}

/**
 * Get the root directory of the current git repository.
 */
export async function getGitRoot(cwd: string): Promise<string | null> {
  try {
    const g = simpleGit(cwd);
    const root = await g.revparse(['--show-toplevel']);
    return root.trim();
  } catch (_) {
    return null;
  }
}

/**
 * Get the current HEAD SHA (full hash).
 */
export async function getGitHead(cwd: string): Promise<string | null> {
  try {
    const g = simpleGit(cwd);
    const head = await g.revparse(['HEAD']);
    return head.trim();
  } catch (_) {
    return null;
  }
}

/**
 * Get files changed between a start SHA and HEAD via `git diff --name-status`.
 * Returns an array of { filePath, changeType }.
 */
export async function getGitDiffFiles(cwd: string, fromHead: string): Promise<{ filePath: string; changeType: 'created' | 'modified' | 'deleted' }[]> {
  try {
    const g = simpleGit(cwd);
    const diff = await g.diff(['--name-status', `${fromHead}..HEAD`]);
    if (!diff.trim()) return [];
    return diff.trim().split('\n').map((line) => {
      const [status, ...pathParts] = line.split('\t');
      const filePath = pathParts.join('\t');
      let changeType: 'created' | 'modified' | 'deleted' = 'modified';
      if (status.startsWith('A')) changeType = 'created';
      else if (status.startsWith('D')) changeType = 'deleted';
      else if (status.startsWith('R')) changeType = 'modified'; // rename
      return { filePath, changeType };
    });
  } catch (_) {
    return [];
  }
}

/**
 * Get commits between a start SHA and HEAD via `git log`.
 * Returns array of { hash, message, timestamp }.
 */
export async function getGitLogCommits(cwd: string, fromHead: string): Promise<{ hash: string; message: string; timestamp: string }[]> {
  try {
    const g = simpleGit(cwd);
    const log = await g.log({ from: fromHead, to: 'HEAD' });
    return log.all.map((entry) => ({
      hash: entry.hash.substring(0, 7),
      message: entry.message,
      timestamp: entry.date || new Date().toISOString(),
    }));
  } catch (_) {
    return [];
  }
}

/**
 * Get unified diff between two SHAs (or SHA..HEAD).
 * If filePath is provided, returns diff for that file only.
 */
export async function getGitDiff(
  cwd: string,
  fromSha: string,
  toSha: string | null,
  filePath?: string,
): Promise<string> {
  try {
    const g = simpleGit(cwd);
    const range = toSha ? `${fromSha}..${toSha}` : `${fromSha}..HEAD`;
    const args = ['diff', '--unified=5', range];
    if (filePath) args.push('--', filePath);
    const result = await g.raw(args);
    return result;
  } catch (_) {
    return '';
  }
}

/**
 * Get diff for a single commit.
 */
export async function getCommitDiff(cwd: string, hash: string, filePath?: string): Promise<string> {
  try {
    const g = simpleGit(cwd);
    const args = ['diff', '--unified=5', `${hash}~1`, hash];
    if (filePath) args.push('--', filePath);
    const result = await g.raw(args);
    return result;
  } catch (_) {
    return '';
  }
}
