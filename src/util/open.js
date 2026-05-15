import { spawn } from 'node:child_process';

/**
 * Open a file path or URL in the user's default browser. Cross-platform,
 * no npm dependency.
 * @param {string} target absolute path or URL
 * @returns {Promise<void>}
 */
export function openInBrowser(target) {
  return new Promise((resolve) => {
    let cmd, args;
    if (process.platform === 'darwin') {
      cmd = 'open';
      args = [target];
    } else if (process.platform === 'win32') {
      cmd = 'cmd';
      args = ['/c', 'start', '""', target];
    } else {
      cmd = 'xdg-open';
      args = [target];
    }
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => resolve());
    child.unref();
    setTimeout(resolve, 50);
  });
}
