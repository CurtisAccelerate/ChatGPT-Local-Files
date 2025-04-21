// path: ChatGPT-Local-Files/utils.js
/**
 * ANSI escape code stripper
 */
export function stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
}

/**
 * Simple toast/notification helper
 */
export function toast(msg, bg = '#2563eb') {
  const d = Object.assign(document.createElement('div'), {
    textContent: msg,
    style: [
      'position:fixed',
      'top:14px',
      'left:50%',
      'transform:translateX(-50%)',
      'padding:8px 18px',
      `background:${bg}`,
      'color:#fff',
      'font:600 13px/1.4 Consolas,monospace',
      'border-radius:6px',
      'z-index:2147483647',
      'pointer-events:none'
    ].join(';')
  });
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 1500);
}

/**
 * Joins a saved prefix path and a relative path
 */
export function joinPrefix(pfx, p) {
  let normPfx = pfx.replace(/[\\/]+$/, '').replace(/\\/g, '/');
  if (/^[A-Za-z]:[\\/]/.test(p) || /^\//.test(p)) return p;
  let norm = p.replace(/^[\\/]+/, '').replace(/\\/g, '/');
  const esc = normPfx.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  norm = norm.replace(new RegExp('^' + esc + '/+'), '');
  return `${normPfx}/${norm}`;
}
