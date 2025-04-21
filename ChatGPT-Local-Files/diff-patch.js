// path: ./ChatGPT-Local-Files/diff-patch.js
(() => {
  'use strict';

  // ── Minimal toast helper ─────────────────────────────
  function toast(msg, bg = '#2563eb') {
    const d = Object.assign(document.createElement('div'), {
      textContent: msg,
      style: [
        'position:fixed', 'bottom:20px', 'right:20px', 'padding:8px 12px',
        `background:${bg}`, 'color:#fff', 'font:600 13px/1.4 Consolas, monospace',
        'border-radius:4px', 'z-index:2147483647', 'pointer-events:none'
      ].join(';')
    });
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 2000);
  }

  // ── Extract file path from unified diff (REVISED based on suggestions) ──────────────

  // Capture path chunk: stops at first whitespace or asterisk. Captures in group 1.
  const PATH_CHUNK = '([^\\s*]+)';

  // Git Headers (Support backslashes, use non-space capture, corrected suggested regex)
  // Captures 'b' path (non-space chars) in group 1
  const GIT_DIFF_HEADER_RE = /^diff --git a\/[^\s]+ b\/([^\s]+)/i;
  // Captures path (non-space chars) in group 1
  const GIT_A_HEADER_RE    = /^\-\-\-\s+(?:[ab][\\/])?([^\s]+)/i;
  // Captures path (non-space chars) in group 1
  const GIT_B_HEADER_RE    = /^\+\+\+\s+(?:[ab][\\/])?([^\s]+)/i;

  // Comment-based paths using PATH_CHUNK (Captures path in group 1)
  const BARE_PATH_RE      = new RegExp(`^\\s*path\\s*:\\s*${PATH_CHUNK}\\s*$`, 'i');
  const SINGLE_COMMENT_RE = new RegExp(`^\\s*(?:\\/\\/|#)\\s*path\\s*:\\s*${PATH_CHUNK}`, 'i');
  const HTML_COMMENT_RE   = new RegExp(`^\\s*<!--\\s*path\\s*:\\s*${PATH_CHUNK}\\s*-->`, 'i');
  const C_BLOCK_OPEN_RE   = new RegExp(`^\\s*\\/\\*\\s*path\\s*:\\s*${PATH_CHUNK}\\s*\\*\\/`, 'i');
  const C_BLOCK_MIDDLE_RE = new RegExp(`^\\s*\\*\\s*path\\s*:\\s*${PATH_CHUNK}`, 'i');

  // Helper to normalize paths extracted from Git headers
  function normalizeGitPath(rawPath) {
    if (!rawPath) return '';
    // Remove leading slash (forward or backslash) and trim whitespace
    return rawPath.replace(/^[\\/]/, '').trim();
  }

  function extractPath(diffText) {
    if (!diffText || typeof diffText !== 'string') {
      console.warn('extractPath received invalid input:', diffText);
      return '';
    }

    const lines = diffText.trim().split('\n');
    let m;

    // 1. Check for standard Git headers (usually near the top)
    let pathFromGitHeader = '';
    for (let i = 0; i < Math.min(lines.length, 5); i++) {
      const line = lines[i].trim();
      if ((m = line.match(GIT_DIFF_HEADER_RE))) {
        pathFromGitHeader = normalizeGitPath(m[1]);
        break;
      }
      if ((m = line.match(GIT_B_HEADER_RE))) {
        pathFromGitHeader = normalizeGitPath(m[1]);
      }
      else if (!pathFromGitHeader && (m = line.match(GIT_A_HEADER_RE))) {
        pathFromGitHeader = normalizeGitPath(m[1]);
      }
    }
    if (pathFromGitHeader) {
      return pathFromGitHeader;
    }

    // 2. Fallback: Check for comment-based paths
    for (const line of lines) {
      const trimmedLine = line.trim();
      if ((m = trimmedLine.match(BARE_PATH_RE)) ||
          (m = trimmedLine.match(SINGLE_COMMENT_RE)) ||
          (m = trimmedLine.match(HTML_COMMENT_RE)) ||
          (m = trimmedLine.match(C_BLOCK_OPEN_RE)) ||
          (m = trimmedLine.match(C_BLOCK_MIDDLE_RE))) {
        const commentPath = m[1] ? m[1].trim() : '';
        if (commentPath) return commentPath;
      }
    }

    console.warn(
      'Could not extract file path from diff snippet:\n',
      lines.slice(0, 10).join('\n')
    );
    return '';
  }

  // ── Apply diff using jsdiff ───────────────────────────

  // Strip a leading language‑style “path:” marker so jsdiff sees a valid header.
  // Matches lines like:
  //   // path: src/app.js
  //   # path: scripts/run.py
  //   <!-- path: index.html -->
  const PATH_COMMENT_LINE_RE =
    /^\s*(?:\/\/|#|<!--|\/\*|\*)\s*path\s*:[^\n]*$/i;

  function applyPatchToText(original, diffText) {
    try {
      if (typeof Diff === 'undefined' || !Diff.applyPatch) {
        console.error('jsdiff library (Diff.applyPatch) not found.');
        toast('Missing jsdiff library', '#ef4444');
        return null;
      }

      // Remove the first line if it’s the path comment
      const cleanedDiff = diffText
        .split('\n')
        .filter((line, idx) => !(idx === 0 && PATH_COMMENT_LINE_RE.test(line)))
        .join('\n')
        .trim();

      const patched = Diff.applyPatch(original, cleanedDiff);

      if (patched === false) {
        console.warn(
          'Diff.applyPatch returned false. Patch may not apply cleanly. ' +
          'Check line endings (LF vs CRLF) or context lines in diff.'
        );
        toast('Patch did not apply cleanly', '#fbbf24');
        return null;
      }
      return patched;
    } catch (err) {
      console.error('Patch application error:', err);
      toast(`Patch error: ${err.message}`, '#ef4444');
      return null;
    }
  }

  // ── Core applyDiff function ──────────────────────────
  function applyDiff(pre) {
    const codeEl = pre.querySelector('code');
    const diffText = codeEl
      ? (codeEl.textContent || '')
      : (pre.textContent || '');

    if (!diffText) {
      toast('Could not find diff text content', '#ef4444');
      return;
    }

    const path = extractPath(diffText);
    if (!path) {
      toast('Could not extract file path from diff', '#ef4444');
      return;
    }

    if (
      typeof chrome === 'undefined' ||
      !chrome.runtime ||
      !chrome.runtime.sendMessage
    ) {
      console.error(
        'chrome.runtime.sendMessage is not available. ' +
        'Is this running in a Chrome extension context?'
      );
      toast('Extension context error', '#ef4444');
      return;
    }

    chrome.runtime.sendMessage({ type: 'open', payload: { path } }, r => {
      if (!r || typeof r.ok === 'undefined') {
        console.error(
          'Invalid response received from background script for "open":',
          r
        );
        toast('Open failed: Invalid response', '#ef4444');
        return;
      }
      if (!r.ok) {
        toast(`Open failed: ${r.err || 'Unknown error'}`, '#ef4444');
        return;
      }
      if (typeof r.data?.content !== 'string') {
        console.error(
          'Invalid content received from background script for "open":',
          r.data
        );
        toast('Open failed: Invalid content', '#ef4444');
        return;
      }

      const original = r.data.content;
      const patched = applyPatchToText(original, diffText);

      if (patched === null) {
        console.log('Patching resulted in null (failed or no changes).');
        return;
      }
      if (patched === original) {
        toast('No changes to apply', '#3b82f6');
        return;
      }

      chrome.runtime.sendMessage(
        { type: 'save', payload: { path, content: patched } },
        s => {
          if (!s || typeof s.ok === 'undefined') {
            console.error(
              'Invalid response received from background script for "save":',
              s
            );
            toast('Save failed: Invalid response', '#ef4444');
            return;
          }
          if (!s.ok) {
            toast(`Save failed: ${s.err || 'Unknown error'}`, '#ef4444');
            return;
          }
          toast(`✔ Patched ${path}`, '#10b981');
        }
      );
    });
  }

  // expose globally
  window.patchModule = { applyDiff };

})();
