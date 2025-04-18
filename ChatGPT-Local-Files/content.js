// path: ChatGPT-Local-Files/content.js
(() => {
  'use strict';
  console.log('[ChatGPT Local Files] Content script loaded');

  // ── CONFIG ───────────────────────────────────────────
  const ENABLE_AUTO_INSERT = true;
  const PATH_RE = /^\s*(?:\/\/|#|<!--)?\s*path\s*:\s*(.+?)(?:\s*-->)?\s*$/i;

  // ── Toast helper ─────────────────────────────────────
  const toast = (msg, bg = '#2563eb') => {
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
        'font:600 13px/1.4 sans-serif',
        'border-radius:6px',
        'z-index:2147483647',
        'pointer-events:none'
      ].join(';')
    });
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 1500);
  };

  // ── Prefix join (always enforce for relative paths) ──
  function joinPrefix(pfx, p) {
    // normalize prefix separators and drop trailing slashes
    let normPfx = pfx.replace(/[\\/]+$/, '').replace(/\\/g, '/');
    // absolute paths stay untouched
    if (/^[A-Za-z]:[\\/]/.test(p) || /^\//.test(p)) return p;
    // normalize candidate path separators and drop leading slashes
    let norm = p.replace(/^[\\/]+/, '').replace(/\\/g, '/');
    // remove existing prefix if present
    const esc = normPfx.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    norm = norm.replace(new RegExp('^' + esc + '/+'), '');
    return `${normPfx}/${norm}`;
  }

  function getComposer() {
    return (
      document.querySelector('[contenteditable="true"][role="textbox"], .ProseMirror#prompt-textarea') ||
      document.querySelector('textarea[data-testid="prompt-textarea"], textarea#prompt-textarea, textarea:not([style*="display: none"])')
    );
  }

  async function pasteError(text) {
    const MAX = 2000;
    const block = `\n\n----- error -----\n\n${text.trim().slice(0, MAX)}\n\n`;
    try {
      await navigator.clipboard.writeText(block);
    } catch {
      toast('⚠ Could not copy error.', '#ef4444');
      return;
    }
    if (!ENABLE_AUTO_INSERT) {
      toast('📋 Error copied! Ctrl+V to paste.', '#ef4444');
      return;
    }
    const el = getComposer();
    if (!el) {
      toast('📋 Error copied! Ctrl+V to paste.', '#ef4444');
      return;
    }
    el.focus();
    if (el.tagName === 'TEXTAREA') {
      el.value = block;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      toast('📋 Error inserted into textarea', '#ef4444');
    } else {
      const sel = window.getSelection();
      sel.removeAllRanges();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.deleteContents();
      const tn = document.createTextNode(block);
      range.insertNode(tn);
      range.setStartAfter(tn);
      sel.addRange(range);
      el.dispatchEvent(new InputEvent('input', { bubbles: true }));
      toast('📋 Error inserted', '#ef4444');
    }
  }

  // send message to background and handle response
  function runCommand(cmd, cwd = prefixPath || null) {
    chrome.runtime.sendMessage({ type: 'exec', payload: { command: cmd, cwd } }, j => {
      if (!j.ok) {
        toast(`⚠ ${j.err}`, '#ef4444');
        addLog(`[ERROR] ${j.err}`);
        pasteError(j.err);
        return;
      }
      const data = j.data;
      const out = data.stdout.trim(), err = data.stderr.trim();
      const msg = out || err || '(no output)';
      toast(`▶ ${msg}`, data.code === 0 ? '#10b981' : '#ef4444');
      addLog(`[OUTPUT] ${msg}`);
      if (data.code !== 0) pasteError(err || out);
    });
  }

  function openEditor(editor, file) {
    runCommand(`Start-Process ${editor} -ArgumentList '${file}'`, null);
  }

  function saveCode(code, path) {
    chrome.runtime.sendMessage({ type: 'save', payload: { path, content: code } }, j => {
      if (!j.ok) {
        toast(`⚠ Save error: ${j.err}`, '#ef4444');
        addLog(`[SAVE-ERROR] ${j.err}`);
        return;
      }
      const data = j.data;
      const msg = data.ok
        ? `✔ Saved → ${data.saved || path}`
        : `⚠ ${data.error || 'Save failed'}`;
      toast(msg, data.ok ? '#10b981' : '#ef4444');
      addLog(`[SAVE] ${msg}`);
    });
  }

  // ── Panel & History ───────────────────────────────────
  let prefixPath = localStorage.getItem('cb_save_prefix') || '';
  let cmdHistory = JSON.parse(localStorage.getItem('cb_cmd_history') || '[]');
  const maxLogLines = 20, logs = [];
  let panel;

  function injectPanel() {
    if (panel) return;
    panel = document.createElement('details');
    panel.id = 'log-panel';
    panel.open = false;
    Object.assign(panel.style, {
      position: 'fixed',
      bottom: '0',
      left: '0',
      width: '50vw',
      background: '#2563eb',
      color: '#fff',
      font: '13px/1.4 sans-serif',
      maxHeight: '360px',
      overflow: 'auto',
      borderTop: '1px solid #1e40af',
      zIndex: 9999999,
      pointerEvents: 'auto'
    });

    const summary = document.createElement('summary');
    Object.assign(summary.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '6px 12px',
      background: '#1e3a8a',
      cursor: 'pointer',
      color: '#fff',
      fontWeight: '600',
      whiteSpace: 'nowrap'
    });
    summary.innerHTML = `
      <span>Logs & History (last ${maxLogLines})</span>
      <div style="display:flex;align-items:center;gap:6px;">
        <button id="set-prefix-btn">Prefix 📂</button>
        <button id="run-project-btn">Run ▶</button>
        <input id="panel-input" placeholder="path or cmd"
               style="padding:2px 6px;font:12px monospace;
                      width:180px;border-radius:3px;border:none;">
        <button id="panel-exec-btn">Exec</button>
        <button id="clear-logs-btn">Clear</button>
      </div>
    `;
    panel.appendChild(summary);

    const pre = document.createElement('pre');
    pre.id = 'log-panel-content';
    pre.style.cssText = 'margin:0;padding:8px;white-space:pre-wrap;';
    panel.appendChild(pre);
    document.body.appendChild(panel);

    const adjust = () =>
      (document.body.style.marginBottom = `${panel.getBoundingClientRect().height}px`);
    window.addEventListener('resize', adjust);
    panel.addEventListener('toggle', adjust);
    adjust();

    document.getElementById('clear-logs-btn').onclick = () => {
      logs.length = 0;
      pre.textContent = '';
    };
    document.getElementById('set-prefix-btn').onclick = () => {
      const p = prompt('Enter save/run prefix:', prefixPath);
      if (p !== null) {
        prefixPath = p.trim();
        localStorage.setItem('cb_save_prefix', prefixPath);
        toast(`Prefix set → ${prefixPath}`, '#8b5cf6');
        addLog(`[PREFIX] ${prefixPath}`);
      }
    };
    document.getElementById('run-project-btn').onclick = () => {
      const inp = document.getElementById('panel-input');
      inp.value = '';
      inp.focus();
    };
    document.getElementById('panel-exec-btn').onclick = () => {
      const cmd = document.getElementById('panel-input').value.trim();
      if (!cmd) return;
      addLog(`[PANEL EXEC] ${cmd}`);
      runCommand(cmd);
    };

    const pin = document.getElementById('panel-input');
    let pidx = -1;
    pin.addEventListener('keydown', e => {
      if (e.key === 'ArrowUp') {
        pidx = Math.min(pidx + 1, cmdHistory.length - 1);
        pin.value = cmdHistory[pidx] || '';
        e.preventDefault();
      } else if (e.key === 'ArrowDown') {
        pidx = Math.max(pidx - 1, 0);
        pin.value = cmdHistory[pidx] || '';
        e.preventDefault();
      }
    });
  }

  function addLog(entry) {
    injectPanel();
    logs.push(entry);
    if (logs.length > maxLogLines) logs.shift();
    document.getElementById('log-panel-content').textContent = logs.join('\n');
    if (!panel.open) panel.open = true;
  }

  // ── enhance each <pre> ───────────────────────────────
  function addBtns(pre) {
    if (pre.dataset.btns) return;
    const codeEl = pre.querySelector('code');
    if (!codeEl) return;
    pre.dataset.btns = '1';
    pre.style.position = 'relative';

    const extractPath = () => {
      const text = codeEl.textContent || '';
      for (let line of text.split('\n')) {
        const m = line.match(PATH_RE);
        if (m) return m[1].trim();
      }
      return '';
    };
    let fp = extractPath();

    const gap = 2, btnW = 60, inW = 180;
    const lefts = {
      save: 8,
      run: 8 + (btnW + gap),
      input: 8 + 2 * (btnW + gap),
      exec: 8 + 2 * (btnW + gap) + inW + gap,
      rrf: 8 + 3 * (btnW + gap) + inW + gap,
      note: 8 + 4 * (btnW + gap) + inW + gap,
      vs: 8 + 5 * (btnW + gap) + inW + gap
    };

    const input = document.createElement('input');
    Object.assign(input.style, {
      position: 'absolute',
      top: '8px',
      left: `${lefts.input}px`,
      width: `${inW}px`,
      height: '24px',
      padding: '0 8px',
      font: '12px monospace',
      lineHeight: '20px',
      boxSizing: 'border-box',
      background: '#fff',
      color: '#000',
      zIndex: 1000
    });
    input.value = fp ? (prefixPath ? joinPrefix(prefixPath, fp) : fp) : '';
    pre.appendChild(input);

    const codeObserver = new MutationObserver(() => {
      const fresh = extractPath();
      input.value = fresh ? (prefixPath ? joinPrefix(prefixPath, fresh) : fresh) : input.value;
    });
    codeObserver.observe(codeEl, { childList: true, subtree: true });

    const makeBtn = (text, left) => {
      const b = document.createElement('button');
      b.textContent = text;
      Object.assign(b.style, {
        position: 'absolute',
        top: '8px',
        left: `${left}px`,
        width: `${btnW}px`,
        height: '24px',
        lineHeight: '24px',
        boxSizing: 'border-box',
        padding: '0 4px',
        background: '#1976d2',
        border: 'none',
        borderRadius: '3px',
        color: '#fff',
        font: '12px sans-serif',
        cursor: 'pointer',
        zIndex: 1000
      });
      pre.appendChild(b);
      return b;
    };

    const btnSave = makeBtn('Save ↗', lefts.save);
    const btnRun = makeBtn('Run ▶', lefts.run);
    const btnExec = makeBtn('Exec', lefts.exec);
    const btnRrf = makeBtn('Rrfsh', lefts.rrf);
    const btnNote = makeBtn('Notepad', lefts.note);
    const btnVS = makeBtn('VStudio', lefts.vs);

    btnSave.onclick = e => {
      e.stopPropagation();
      let path = input.value.trim() || prompt('Enter save path:');
      if (!path) return;
      path = prefixPath ? joinPrefix(prefixPath, path) : path;
      input.value = path;
      saveCode(codeEl.textContent, path);
    };
    btnRun.onclick = e => {
      e.stopPropagation();
      const raw = extractPath();
      if (!raw) {
        toast('No path to run', '#ef4444');
        return;
      }
      const full = prefixPath ? joinPrefix(prefixPath, raw) : raw;
      const cmd = inferCommand(full);
      input.value = cmd;
      cmdHistory = [cmd, ...cmdHistory.filter(x => x !== cmd)];
      localStorage.setItem('cb_cmd_history', JSON.stringify(cmdHistory));
      addLog(`[PROJECT] ${cmd}`);
      runCommand(cmd);
    };
    btnExec.onclick = e => {
      e.stopPropagation();
      const cmd = input.value.trim();
      if (!cmd) return;
      cmdHistory = [cmd, ...cmdHistory.filter(x => x !== cmd)];
      localStorage.setItem('cb_cmd_history', JSON.stringify(cmdHistory));
      addLog(`[EXEC] ${cmd}`);
      runCommand(cmd);
    };
    btnRrf.onclick = e => {
      e.stopPropagation();
      // just refresh the input with the normalized path, keep prefix intact
      const fresh = extractPath();
      const newPath = fresh ? (prefixPath ? joinPrefix(prefixPath, fresh) : fresh) : '';
      input.value = newPath;
      toast('🔄 Path refreshed');
    };
    btnNote.onclick = e => {
      e.stopPropagation();
      const p = input.value.trim();
      if (!p) return toast('No path', '#ef4444');
      openEditor('notepad', p);
    };
    btnVS.onclick = e => {
      e.stopPropagation();
      const p = input.value.trim();
      if (!p) return toast('No path', '#ef4444');
      openEditor('code', p);
    };
  }

  function inferCommand(path) {
    let cmdPath = path;
    if (prefixPath) {
      const pfx = prefixPath.replace(/\/+$/, '') + '/';
      if (cmdPath.startsWith(pfx)) cmdPath = cmdPath.slice(pfx.length);
    }
    const ext = cmdPath.split('.').pop().toLowerCase();
    switch (ext) {
      case 'py':  return `python "${cmdPath}"`;
      case 'js':  return `node "${cmdPath}"`;
      case 'ps1': return `powershell -ExecutionPolicy Bypass -File "${cmdPath}"`;
      case 'cs':  return `dotnet run --project "${cmdPath.replace(/\\[^\\]+$/, '')}"`;
      default:    return `"${cmdPath}"`;
    }
  }

  // ── Init ──────────────────────────────────────────────
  document.querySelectorAll('div.markdown pre').forEach(addBtns);
  new MutationObserver(ms =>
    ms.forEach(m =>
      m.addedNodes.forEach(n => {
        if (n.nodeType !== 1) return;
        if (n.matches('div.markdown pre')) addBtns(n);
        else if (n.querySelectorAll) n.querySelectorAll('div.markdown pre').forEach(addBtns);
      })
    )
  ).observe(document.body, { childList: true, subtree: true });

  window.addEventListener('load', () => {
    injectPanel();
    toast('💾 ChatGPT Local Files by Curtis White Ready!');
  });
})();
