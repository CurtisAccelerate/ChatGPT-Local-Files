// path: ./ChatGPT-Local-Files/diff-patch.js
(() => {
  'use strict';

  // ── Minimal toast helper ─────────────────────────────
  function toast(msg, bg = '#2563eb') {
    const d = Object.assign(document.createElement('div'), {
      textContent: msg,
      style: [
        'position:fixed',
        'bottom:20px',
        'right:20px',
        'padding:8px 12px',
        `background:${bg}`,
        'color:#fff',
        'font:600 13px/1.4 Consolas, monospace',
        'border-radius:4px',
        'z-index:2147483647',
        'pointer-events:none'
      ].join(';')
    });
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 2000);
  }

  // ── Extract file path from unified diff ──────────────
  const PATH_RE = /^\s*(?:\/\/|#|<!--|\/\*)\s*path\s*:\s*(.+?)\s*(?:\*\/|-->)?\s*$/i;
  function extractPath(diffText) {
    const lines = diffText.split('\n');
    if (lines.length > 0) {
      const m = lines[0].match(/^\s*path\s*:\s*(.+)$/i);
      if (m) return m[1].trim();
    }
    for (const line of lines) {
      const m = line.match(PATH_RE);
      if (m) return m[1].trim();
    }
    for (const line of lines) {
      const m = line.match(/^\+\+\+\s+[ab]\/(.+)$/);
      if (m) return m[1].trim();
    }
    return '';
  }

  // ── Apply diff using jsdiff ───────────────────────────
  function applyPatchToText(original, diffText) {
    try {
      // global Diff from cdn
      const patched = Diff.applyPatch(original, diffText);
      return patched === false ? null : patched;
    } catch (err) {
      console.error('Patch error:', err);
      return null;
    }
  }

  // ── Core applyDiff function ──────────────────────────
  function applyDiff(pre) {
    const codeEl = pre.querySelector('code');
    if (!codeEl) {
      toast('No diff block', '#ef4444');
      return;
    }
    const diffText = codeEl.textContent || '';
    const path = extractPath(diffText);
    if (!path) {
      toast('Bad diff: no path', '#ef4444');
      return;
    }

    // load original
    chrome.runtime.sendMessage({ type: 'open', payload: { path } }, r => {
      if (!r.ok) {
        toast(`Open failed: ${r.err}`, '#ef4444');
        return;
      }
      const original = r.data.content;

      // apply patch
      const patched = applyPatchToText(original, diffText);
      if (patched === null) {
        toast('Patch failed or no changes', '#ef4444');
        return;
      }

      // save result
      chrome.runtime.sendMessage({ type: 'save', payload: { path, content: patched } }, s => {
        if (!s.ok) {
          toast(`Save failed: ${s.err}`, '#ef4444');
          return;
        }
        toast(`✔ Patched ${path}`, '#10b981');
      });
    });
  }

  // expose globally
  window.patchModule = { applyDiff };

})();
