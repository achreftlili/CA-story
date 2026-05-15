import { spawn } from 'node:child_process';

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', () => resolve({ ok: false, stdout: '', stderr: '', code: -1 }));
    child.on('close', (code) => resolve({ ok: code === 0, stdout, stderr, code: code ?? -1 }));
  });
}

// Find the open PR (if any) for a given branch in a repo. Uses the `gh`
// CLI; gracefully returns null if gh is not installed or there's no PR.
export async function findPrForBranch(branch, repoPath) {
  const probe = await run('gh', ['--version'], { cwd: repoPath });
  if (!probe.ok) return null;
  const r = await run(
    'gh',
    ['pr', 'list', '--head', branch, '--state', 'all', '--limit', '1',
     '--json', 'url,number,title,state,baseRefName,headRefName,createdAt'],
    { cwd: repoPath },
  );
  if (!r.ok) return null;
  try {
    const parsed = JSON.parse(r.stdout);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed[0];
  } catch {
    // fallthrough
  }
  return null;
}
