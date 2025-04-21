// path: ChatGPT-Local-Files/actions.js
import { stripAnsi, toast } from './utils.js';
import { getPrefixPath, addCmdHistory } from './state.js';

/**
 * Find the chat input composer element.
 * 1) Prefer the ProseMirror div with id="prompt-textarea".
 * 2) Fallback to the visible textarea with placeholder="Ask anything".
 */
export function getComposer() {
  // 1) ProseMirror rich‑text editor
  const rich = document.getElementById('prompt-textarea');
  if (rich && rich.isContentEditable) {
    return rich;
  }

  // 2) Visible <textarea placeholder="Ask anything">
  const ta = Array.from(
    document.querySelectorAll('textarea[placeholder="Ask anything"]')
  ).find(el => {
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
  if (ta) return ta;

  // 3) Not found
  return null;
}

/**
 * Paste text (with newlines) into the composer
 */
export function pasteIntoComposer(el, text) {
  if (el.tagName === 'TEXTAREA') {
    el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    text.split('\n').forEach((line, i, arr) => {
      const tn = document.createTextNode(line);
      range.insertNode(tn);
      range.setStartAfter(tn);
      if (i < arr.length - 1) {
        const br = document.createElement('br');
        range.insertNode(br);
        range.setStartAfter(br);
      }
    });
    sel.removeAllRanges();
    sel.addRange(range);
    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
  }
}

async function pasteError(text, enableAutoInsert = true) {
  const MAX = 2000;
  const block = `\n\n----- error -----\n\n${text.trim().slice(0, MAX)}\n\n`;
  try {
    await navigator.clipboard.writeText(block);
  } catch {
    toast('⚠ Could not copy error.', '#ef4444');
    return;
  }
  if (!enableAutoInsert) {
    toast('📋 Error copied! Ctrl+V to paste.', '#ef4444');
    return;
  }
  const el = getComposer();
  if (!el) {
    toast('📋 Error copied! Ctrl+V to paste.', '#ef4444');
    return;
  }
  el.focus();
  pasteIntoComposer(el, block);
  toast('📋 Error inserted', '#ef4444');
}

/**
 * Run a shell command via background, show toast, and log
 */
export function runCommand(cmd, cwd = null) {
  const prefix = getPrefixPath();
  const workingDir = cwd !== null ? cwd : prefix;
  chrome.runtime.sendMessage(
    { type: 'exec', payload: { command: cmd, cwd: workingDir } },
    j => {
      if (!j.ok) {
        toast(`⚠ ${j.err}`, '#ef4444');
        pasteError(j.err);
        return;
      }
      const out = stripAnsi(j.data.stdout).trim();
      const err = stripAnsi(j.data.stderr).trim();
      const msg = out || err || '(no output)';
      toast(`▶ ${msg}`, j.data.code === 0 ? '#10b981' : '#ef4444');
      addCmdHistory(`[OUTPUT] ${msg}`);
      if (j.data.code !== 0) pasteError(err || out);
    }
  );
}

/**
 * Save code to disk via background
 */
export function saveCode(code, path) {
  chrome.runtime.sendMessage(
    { type: 'save', payload: { path, content: code } },
    j => {
      if (!j.ok) {
        toast(`⚠ Save error: ${j.err}`, '#ef4444');
        return;
      }
      const msg = j.data.ok
        ? `✔ Saved → ${j.data.saved || path}`
        : `⚠ ${j.data.error || 'Save failed'}`;
      toast(msg, j.data.ok ? '#10b981' : '#ef4444');
      addCmdHistory(`[SAVE] ${msg}`);
    }
  );
}

/**
 * Infer shell command to run a file relative to the prefix path.
 */
export function inferCommand(path) {
  let cmdPath = path;
  const prefix = getPrefixPath().replace(/[\\/]+$/, '') + '/';
  if (prefix && cmdPath.startsWith(prefix)) {
    cmdPath = cmdPath.slice(prefix.length);
  }
  const ext = cmdPath.split('.').pop().toLowerCase();
  switch (ext) {
    case 'py':
      return `python "${cmdPath}"`;
    case 'js':
      return `node "${cmdPath}"`;
    case 'ps1':
      return `powershell -ExecutionPolicy Bypass -File "${cmdPath}"`;
    case 'cs':
      return `dotnet run --project "${cmdPath.replace(/\\[^\\]+$/, '')}"`;
    default:
      return `"${cmdPath}"`;
  }
}

/**
 * Open a file in an external editor via PowerShell Start-Process.
 */
export function openEditor(editor, file) {
  runCommand(`Start-Process ${editor} -ArgumentList '${file}'`, null);
}
