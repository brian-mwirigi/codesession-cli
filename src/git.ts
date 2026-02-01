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
