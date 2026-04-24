import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const execFileP = promisify(execFile);

export const AGENTS_DIR = path.resolve(
  process.env.GESA_AGENTS_PATH || path.join(process.cwd(), 'agents')
);

const REPO_URL = process.env.GESA_AGENTS_REPO_URL?.trim() || '';
const TOKEN = process.env.GESA_AGENTS_TOKEN?.trim() || '';
const BRANCH = process.env.GESA_AGENTS_BRANCH?.trim() || 'main';
const COMMIT_NAME = process.env.GESA_AGENTS_COMMIT_NAME?.trim() || 'gesa-agent';
const COMMIT_EMAIL = process.env.GESA_AGENTS_COMMIT_EMAIL?.trim() || 'gesa-agent@localhost';

export function isGitBacked(): boolean {
  return REPO_URL.length > 0;
}

// Embed the PAT in the HTTPS URL. GitHub accepts `https://<token>@host/...`;
// Gitea accepts the same form. SSH URLs are not supported in this path.
function authenticatedUrl(): string {
  if (!TOKEN) return REPO_URL;
  try {
    const u = new URL(REPO_URL);
    if (u.protocol !== 'https:') return REPO_URL;
    // Use a fixed username to avoid leaking tokens in logs that redact by user.
    u.username = 'x-access-token';
    u.password = TOKEN;
    return u.toString();
  } catch {
    return REPO_URL;
  }
}

function redact(str: string): string {
  if (!TOKEN) return str;
  return str.split(TOKEN).join('***');
}

async function git(args: string[], cwd: string = AGENTS_DIR): Promise<string> {
  try {
    const { stdout } = await execFileP('git', args, {
      cwd,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_ASKPASS: 'echo',
      },
      maxBuffer: 8 * 1024 * 1024,
    });
    return stdout;
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string; message?: string };
    const detail = redact(e.stderr || e.stdout || e.message || 'git error');
    throw new Error(`git ${args[0]} failed: ${detail.trim()}`);
  }
}

// Serialize all git + filesystem mutations. Single-process app, so a Promise
// chain is enough; no need for a cross-process lock.
let queue: Promise<unknown> = Promise.resolve();
export function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
}

async function isGitRepo(): Promise<boolean> {
  try {
    await git(['rev-parse', '--git-dir']);
    return true;
  } catch {
    return false;
  }
}

async function remoteBranchExists(): Promise<boolean> {
  try {
    const out = await git(['ls-remote', '--heads', 'origin', BRANCH]);
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

async function setOriginUrl(): Promise<void> {
  const url = authenticatedUrl();
  try {
    await git(['remote', 'set-url', 'origin', url]);
  } catch {
    await git(['remote', 'add', 'origin', url]);
  }
}

async function configureIdentity(): Promise<void> {
  await git(['config', 'user.name', COMMIT_NAME]);
  await git(['config', 'user.email', COMMIT_EMAIL]);
}

let ensured: Promise<void> | null = null;

export function ensureRepo(): Promise<void> {
  if (!isGitBacked()) return Promise.resolve();
  if (!ensured) {
    ensured = withLock(() => ensureRepoInner()).catch(err => {
      // Don't cache failures — next call should retry.
      ensured = null;
      throw err;
    });
  }
  return ensured;
}

async function ensureRepoInner(): Promise<void> {
  if (!fs.existsSync(AGENTS_DIR)) {
    fs.mkdirSync(AGENTS_DIR, { recursive: true });
  }

  const alreadyInitialized = await isGitRepo();
  if (!alreadyInitialized) {
    await git(['init', '--initial-branch', BRANCH]);
  }

  await setOriginUrl();
  await configureIdentity();

  if (await remoteBranchExists()) {
    // Remote wins on boot: fetch and hard-reset to remote state.
    await git(['fetch', 'origin', BRANCH]);
    await git(['checkout', '-B', BRANCH, `origin/${BRANCH}`]);
    await git(['reset', '--hard', `origin/${BRANCH}`]);
  } else {
    // Empty remote: seed from whatever is on disk (baked-in agents).
    await git(['checkout', '-B', BRANCH]);
    const hasAny = fs
      .readdirSync(AGENTS_DIR)
      .some(f => f.endsWith('.md'));
    if (hasAny) {
      await git(['add', '-A']);
      try {
        await git(['commit', '-m', 'seed: baked-in agents']);
      } catch {
        // Nothing to commit (working tree matches an existing HEAD); fine.
      }
    } else {
      // Create an empty initial commit so the branch exists on the remote.
      await git(['commit', '--allow-empty', '-m', 'init: empty agents repo']);
    }
    await git(['push', '-u', 'origin', BRANCH]);
  }
}

export async function pull(): Promise<void> {
  if (!isGitBacked()) return;
  await withLock(async () => {
    await ensureRepoInner();
  });
}

export interface CommitAndPushOptions {
  message: string;
  // Relative paths inside AGENTS_DIR to stage. Use ['-A'] to stage everything.
  paths: string[];
}

// Stage + commit + push the current working tree. Caller must have already
// written the files and be running inside withLock(). If the push fails, we
// roll the working tree back to the previous HEAD so the on-disk state
// matches what's actually persisted remotely.
export async function commitAndPush({ message, paths }: CommitAndPushOptions): Promise<void> {
  if (!isGitBacked()) return;

  let prevSha = '';
  try {
    prevSha = (await git(['rev-parse', 'HEAD'])).trim();
  } catch {
    prevSha = '';
  }

  await git(['add', ...paths]);

  try {
    await git(['commit', '-m', message]);
  } catch (err) {
    // If there was nothing to commit (identical write), just return.
    const msg = err instanceof Error ? err.message : String(err);
    if (/nothing to commit/i.test(msg) || /no changes added/i.test(msg)) {
      return;
    }
    throw err;
  }

  try {
    await git(['push', 'origin', BRANCH]);
  } catch (err) {
    // Roll back the local commit and working tree so the caller's fs write
    // is undone and the user sees a clean failure.
    if (prevSha) {
      try { await git(['reset', '--hard', prevSha]); } catch { /* best effort */ }
    } else {
      try { await git(['update-ref', '-d', `refs/heads/${BRANCH}`]); } catch { /* best effort */ }
    }
    throw err;
  }
}
