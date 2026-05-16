/**
 * Compute a unified-diff-style line list for two strings using a classic
 * longest-common-subsequence pass. Output: [{type: ' '|'-'|'+', text}].
 * Lines marked ' ' are unchanged context, '-' removed, '+' added.
 *
 * Designed for short snippets (≤ a few thousand lines). For very large
 * inputs, both strings are truncated before diffing by the caller.
 */
export function diffLines(a, b) {
  const al = String(a ?? '').split('\n');
  const bl = String(b ?? '').split('\n');
  const n = al.length;
  const m = bl.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (al[i] === bl[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (al[i] === bl[j]) {
      out.push({ type: ' ', text: al[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: '-', text: al[i] });
      i++;
    } else {
      out.push({ type: '+', text: bl[j] });
      j++;
    }
  }
  while (i < n) out.push({ type: '-', text: al[i++] });
  while (j < m) out.push({ type: '+', text: bl[j++] });
  return out;
}

/** Collapse runs of unchanged lines longer than `ctx` to a single ellipsis. */
export function collapseContext(diff, ctx = 2) {
  const out = [];
  let run = 0;
  let lastChangeIdx = -1;
  for (let k = 0; k < diff.length; k++) {
    if (diff[k].type === ' ') run++;
    else {
      // emit up to `ctx` lines just before this change (already in out)
      lastChangeIdx = k;
      run = 0;
    }
  }
  // Simple pass: keep up to `ctx` unchanged lines around each change, hide
  // long runs of unchanged context.
  const keep = new Array(diff.length).fill(false);
  for (let k = 0; k < diff.length; k++) {
    if (diff[k].type !== ' ') {
      for (let d = -ctx; d <= ctx; d++) {
        const idx = k + d;
        if (idx >= 0 && idx < diff.length) keep[idx] = true;
      }
    }
  }
  let inGap = false;
  for (let k = 0; k < diff.length; k++) {
    if (keep[k]) {
      out.push(diff[k]);
      inGap = false;
    } else if (!inGap) {
      out.push({ type: ' ', text: '…' });
      inGap = true;
    }
  }
  return out;
}
