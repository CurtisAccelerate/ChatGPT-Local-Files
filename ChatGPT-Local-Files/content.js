// path: ChatGPT-Local-Files/content.js
(() => {
  'use strict';
  console.log('[ChatGPT Local Files] Content script loaded');

  // ── CONFIG ───────────────────────────────────────────
  const ENABLE_AUTO_INSERT = true;
  const PATH_RE = /^\s*(?:\/\/|#|<!--)?\s*path\s*:\s*(.+?)(?:\s*-->)?\s*$/i;

  // ── ANSI escape stripper ──────────────────────────────
  function stripAnsi(text) {
    return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
  }

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
        'font:600 13px/1.4 Consolas, monospace',
        'border-radius:6px',
        'z-index:2147483647',
        'pointer-events:none'
      ].join(';')
    });
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 1500);
  };

  // ── Prefix join ──────────────────────────────────────
  function joinPrefix(pfx, p) {
    let normPfx = pfx.replace(/[\\/]+$/, '').replace(/\\/g, '/');
    if (/^[A-Za-z]:[\\/]/.test(p) || /^\//.test(p)) return p;
    let norm = p.replace(/^[\\/]+/, '').replace(/\\/g, '/');
    const esc = normPfx.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    norm = norm.replace(new RegExp('^' + esc + '/+'), '');
    return `${normPfx}/${norm}`;
  }

  // ── Chat input helper ─────────────────────────────────
  function getComposer() {
    return (
      document.querySelector('[contenteditable="true"][role="textbox"], .ProseMirror#prompt-textarea') ||
      document.querySelector('textarea[data-testid="prompt-textarea"], textarea#prompt-textarea, textarea:not([style*="display: none"])')
    );
  }

  // ── Paste preserving newlines ────────────────────────
  function pasteIntoComposer(el, text) {
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
    pasteIntoComposer(el, block);
    toast('📋 Error inserted', '#ef4444');
  }

  // ── Background commands ──────────────────────────────
  function runCommand(cmd, cwd = prefixPath || null) {
    chrome.runtime.sendMessage({ type: 'exec', payload: { command: cmd, cwd } }, j => {
      if (!j.ok) {
        toast(`⚠ ${j.err}`, '#ef4444');
        addLog(`[ERROR] ${j.err}`);
        pasteError(j.err);
        return;
      }
      const data = j.data;
      const out = stripAnsi(data.stdout).trim();
      const err = stripAnsi(data.stderr).trim();
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

  // ── Workspace Commander ───────────────────────────────
  let prefixPath = localStorage.getItem('cb_save_prefix') || '';
  let cmdHistory = JSON.parse(localStorage.getItem('cb_cmd_history') || '[]');
  const logs = [];
  const maxLogLines = 20;
  let panel;

  function injectCommander() {
    if (panel) return;
    panel = document.createElement('details');
    panel.id = 'workspace-commander';
    panel.open = false;
    // draggable & resizable
    panel.style.cssText = `
      position:fixed; bottom:0; left:0; width:40vw; background:#2563eb;
      color:#fff; font:13px/1.4 Consolas,monospace; max-height:60vh;
      overflow:auto; border-top:1px solid #1e40af; z-index:9999999;
      resize:both; pointer-events:auto;
    `;
    panel.setAttribute('draggable', 'true');
    panel.addEventListener('dragstart', e => {
      const rect = panel.getBoundingClientRect();
      panel.dataset.dx = e.clientX - rect.left;
      panel.dataset.dy = e.clientY - rect.top;
    });
    document.addEventListener('dragover', e => {
      e.preventDefault();
      if (!panel.dataset.dx) return;
      panel.style.left = `${e.clientX - panel.dataset.dx}px`;
      panel.style.bottom = 'auto';
      panel.style.top = `${e.clientY - panel.dataset.dy}px`;
    });

    // control bar (drag handle)
    const summary = document.createElement('summary');
    summary.style.cssText = `
      display:flex; align-items:center; justify-content:center;
      padding:6px; background:#1e3a8a; cursor:move; user-select:none;
    `;
    summary.textContent = '📂 Workspace Commander';
    panel.appendChild(summary);

    // ── Controls bar ─────────────────────────────────────
    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 8px;background:#1e3a8a';
    controls.innerHTML = `
      <button id="set-prefix-btn">📂Prefix</button>
      <button id="run-project-btn">▶ Run </button>
      <button id="clear-logs-btn">Clear Log</button>
    `;
    panel.appendChild(controls);

    // file tree container
    const tree = document.createElement('div');
    tree.id = 'workspace-tree';
    tree.style.padding = '8px';
    panel.appendChild(tree);

    // log view at bottom
    const logview = document.createElement('pre');
    logview.id = 'commander-log-content';
    logview.style.cssText = `
      margin:0; padding:8px; white-space:pre-wrap;
      font-family:Consolas,monospace; background:#1e40af;
    `;
    panel.appendChild(logview);

    document.body.appendChild(panel);

    function adjust() {
      document.body.style.marginBottom = `${panel.getBoundingClientRect().height}px`;
    }
    window.addEventListener('resize', adjust);
    panel.addEventListener('toggle', adjust);

    // auto-load root on first open
    tree.dataset.loaded = '0';
    panel.addEventListener('toggle', () => {
      if (panel.open && tree.dataset.loaded === '0') {
        loadDirectory('.', tree);
        tree.dataset.loaded = '1';
      }
    });

    document.getElementById('set-prefix-btn').onclick = () => {
      const p = prompt('Enter save/run prefix:', prefixPath);
      if (p !== null) {
        prefixPath = p.trim();
        addLog(`[PREFIX] ${prefixPath}`);
        toast(`Prefix set → ${prefixPath}`, '#8b5cf6');
      }
    };
    document.getElementById('run-project-btn').onclick = () => {
      const cmd = prompt('Enter command to run:', '');
      if (cmd) runCommand(cmd);
    };
    document.getElementById('clear-logs-btn').onclick = () => {
      logs.length = 0;
      logview.textContent = '';
    };
  }


function loadDirectory(dirPath, container) {
  chrome.runtime.sendMessage({ type: 'list', payload: { path: dirPath } }, r => {
    if (!r.ok) {
      toast(`⚠ ${r.err}`, '#ef4444');
      return;
    }
    const ul = document.createElement('ul');
    ul.style.listStyle = 'none';
    ul.style.paddingLeft = '12px';

    for (const ent of r.data.entries) {
      const li = document.createElement('li');
      li.style.margin = '4px 0';

      if (ent.is_dir) {
        const span = document.createElement('span');
        span.textContent = '▶ ' + ent.name;
        span.style.cursor = 'pointer';
        span.onclick = () => {
          if (li.open) {
            li.lastChild.remove();
            li.open = false;
            span.textContent = '▶ ' + ent.name;
          } else {
            span.textContent = '▼ ' + ent.name;
            const sub = document.createElement('div');
            sub.style.paddingLeft = '12px';
            loadDirectory(dirPath + '/' + ent.name, sub);
            li.appendChild(sub);
            li.open = true;
          }
        };
        li.appendChild(span);

      } else {
        // file entry: name + Insert / Peek CTAs
        const fileLabel = document.createElement('span');
        fileLabel.textContent = ent.name + ' ';
        li.appendChild(fileLabel);

        // “Insert” CTA button
        const ins = document.createElement('button');
        ins.innerHTML = '📥 Insert';
        Object.assign(ins.style, {
          marginRight: '6px',
          background: '#10b981',
          border: 'none',
          borderRadius: '4px',
          color: '#fff',
          padding: '4px 8px',
          cursor: 'pointer',
          fontSize: '0.9em'
        });
        ins.onclick = () => insertFile(dirPath + '/' + ent.name, false);

        // “Peek” CTA button
        const pk = document.createElement('button');
        pk.innerHTML = '🔍 Peek';
        Object.assign(pk.style, {
          background: '#89b910',
          border: 'none',
          borderRadius: '4px',
          color: '#fff',
          padding: '4px 8px',
          cursor: 'pointer',
          fontSize: '0.9em'
        });
        pk.onclick = () => insertFile(dirPath + '/' + ent.name, true);

        li.appendChild(ins);
        li.appendChild(pk);
      }

      ul.appendChild(li);
    }

    container.appendChild(ul);
  });
}

  function insertFile(path, peek) {
    const composer = getComposer();
    if (!composer) { toast('⚠ Chat input not found', '#ef4444'); return; }
    composer.focus();
    const header = `// path: ${path}\n\n`;
    if (!peek) {
      chrome.runtime.sendMessage({ type: 'open', payload: { path } }, r => {
        if (!r.ok) { toast(`⚠ ${r.err}`, '#ef4444'); return; }
        pasteIntoComposer(composer, header + r.data.content);
      });
    } else {
      chrome.runtime.sendMessage({ type: 'peek', payload: { path, limit: 10 } }, r => {
        if (!r.ok) { toast(`⚠ ${r.err}`, '#ef4444'); return; }
        const more = r.data.lines >= 10 ? '\n…' : '';
        pasteIntoComposer(composer, header + r.data.preview + more);
      });
    }
  }

  function addLog(entry) {
    injectCommander();
    logs.push(entry);
    if (logs.length > maxLogLines) logs.shift();
    document.getElementById('commander-log-content').textContent = logs.join('\n');
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

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
        e.stopPropagation();
        e.preventDefault();
        btnSave.click();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.stopPropagation();
        e.preventDefault();
        btnExec.click();
      }
    });

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
    const btnRun  = makeBtn('Run ▶', lefts.run);
    const btnExec = makeBtn('Exec', lefts.exec);
    const btnRrf  = makeBtn('Rrfsh', lefts.rrf);
    const btnNote = makeBtn('Notepad', lefts.note);
    const btnVS   = makeBtn('VStudio', lefts.vs);

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

  // ── Canvas save button injection ─────────────────────
  function injectCanvasSave() {
    const header = document.querySelector('section.popover header[class*="@container"][class*="h-14"]');
    if (!header || header.dataset.hasSaveBtn) return;
    const refBtn = header.querySelector('button[id^="radix-"]');
    if (!refBtn) return;
    header.dataset.hasSaveBtn = '1';

    const dlBtn = document.createElement('button');
    dlBtn.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path fill-rule="evenodd" d="M5 20h14v-2H5v2zm7-14v8h3l-4 4-4-4h3V6h2z"/>
      </svg>
    `;
    Object.assign(dlBtn.style, {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: '4px',
      marginLeft: '6px'
    });
    dlBtn.title = 'Save to server';

    dlBtn.onclick = () => {
      const codeEl = document.querySelector('.cm-content');
      const code = codeEl ? codeEl.innerText : '';
      let path = '';
      code.split('\n').some(line => {
        const m = line.match(PATH_RE);
        if (m) {
          path = m[1].trim();
          return true;
        }
        return false;
      });
      if (!path) path = prompt('Enter save path:', '');
      if (!path) return;
      saveCode(code, path);
    };

    refBtn.insertAdjacentElement('afterend', dlBtn);
  }

  // ── Init ──────────────────────────────────────────────
  document.querySelectorAll('div.markdown pre').forEach(addBtns);
  new MutationObserver(ms => {
    ms.forEach(m =>
      m.addedNodes.forEach(n => {
        if (n.nodeType !== 1) return;
        if (n.matches('div.markdown pre')) addBtns(n);
        else if (n.querySelectorAll) n.querySelectorAll('div.markdown pre').forEach(addBtns);
      })
    );
    injectCanvasSave();
  }).observe(document.body, { childList: true, subtree: true });

  window.addEventListener('load', () => {
    injectCommander();
    injectCanvasSave();
    toast('💾 ChatGPT Local Files by Curtis White Ready!');
  });
})();
