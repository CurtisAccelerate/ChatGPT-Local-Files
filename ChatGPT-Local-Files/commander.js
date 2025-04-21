// path: ChatGPT-Local-Files/commander.js
import { toast } from './utils.js';
import { getPrefixPath, setPrefixPath, addCmdHistory } from './state.js';
import { runCommand, getComposer, pasteIntoComposer } from './actions.js';

// ── File‑tree helpers ─────────────────────────────────
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
            loadDirectory(`${dirPath}/${ent.name}`, sub);
            li.appendChild(sub);
            li.open = true;
          }
        };
        li.appendChild(span);
      } else {
        const fileLabel = document.createElement('span');
        fileLabel.textContent = ent.name + ' ';
        li.appendChild(fileLabel);

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
        ins.onclick = () => insertFile(`${dirPath}/${ent.name}`, false);

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
        pk.onclick = () => insertFile(`${dirPath}/${ent.name}`, true);

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
  if (!composer) {
    toast('⚠ Chat input not found', '#ef4444');
    return;
  }
  composer.focus();
  const header = `// path: ${path}\n\n`;
  if (!peek) {
    chrome.runtime.sendMessage({ type: 'open', payload: { path } }, r => {
      if (!r.ok) {
        toast(`⚠ ${r.err}`, '#ef4444');
        return;
      }
      pasteIntoComposer(composer, header + r.data.content);
    });
  } else {
    chrome.runtime.sendMessage({ type: 'peek', payload: { path, limit: 10 } }, r => {
      if (!r.ok) {
        toast(`⚠ ${r.err}`, '#ef4444');
        return;
      }
      const more = r.data.lines >= 10 ? '\n…' : '';
      pasteIntoComposer(composer, header + r.data.preview + more);
    });
  }
}

// ── Workspace Commander ───────────────────────────────
let panel = null;
let logs = [];
const maxLogLines = 20;

export function injectCommander() {
  if (panel) return;

  panel = document.createElement('details');
  panel.id = 'workspace-commander';
  panel.open = false;
  panel.style.cssText = `
    position:fixed; bottom:0; left:0; width:40vw; background:#2563eb;
    color:#fff; font:13px/1.4 Consolas,monospace; max-height:60vh;
    overflow:auto; border-top:1px solid #1e40af; z-index:9999999;
    resize:both; pointer-events:auto;
  `;

  // Drag handle
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
    panel.style.top = `${e.clientY - panel.dataset.dy}px`;
    panel.style.bottom = 'auto';
  });

  // Summary bar
  const summary = document.createElement('summary');
  const baseTitle = '📂 Workspace Commander';
  summary.style.cssText = `
    display:flex; align-items:center; justify-content:center;
    padding:6px; background:#1e3a8a; cursor:move; user-select:none;
  `;
  summary.textContent = baseTitle;
  function adjust() {
    document.body.style.marginBottom = `${panel.getBoundingClientRect().height}px`;
  }
  summary.addEventListener('dblclick', e => {
    e.stopPropagation();
    panel.open = !panel.open;
    summary.textContent = panel.open ? `${baseTitle} 📌` : baseTitle;
    adjust();
  });
  panel.appendChild(summary);

  // Controls
  const controls = document.createElement('div');
  controls.style.cssText = 'display:flex; gap:6px; padding:4px 8px; background:#1e3a8a';
  controls.innerHTML = `
    <button id="set-prefix-btn">📂Prefix</button>
    <button id="run-project-btn">▶ Run</button>
    <button id="clear-logs-btn">Clear Log</button>
  `;
  panel.appendChild(controls);

  // File tree & logs
  const tree = document.createElement('div');
  tree.id = 'workspace-tree';
  tree.style.padding = '8px';
  tree.dataset.loaded = '0';
  panel.appendChild(tree);

  const logview = document.createElement('pre');
  logview.id = 'commander-log-content';
  logview.style.cssText = `
    margin:0; padding:8px; white-space:pre-wrap;
    font-family:Consolas,monospace; background:#1e40af;
  `;
  panel.appendChild(logview);

  document.body.appendChild(panel);
  window.addEventListener('resize', adjust);
  panel.addEventListener('toggle', adjust);

  panel.addEventListener('toggle', () => {
    if (panel.open && tree.dataset.loaded === '0') {
      loadDirectory('.', tree);
      tree.dataset.loaded = '1';
    }
  });

  document.getElementById('set-prefix-btn').onclick = () => {
    const p = prompt('Enter save/run prefix:', getPrefixPath());
    if (p !== null) {
      setPrefixPath(p.trim());
      addCmdHistory(`[PREFIX] ${p.trim()}`);
      toast(`Prefix set → ${p.trim()}`, '#8b5cf6');
    }
  };

  document.getElementById('run-project-btn').onclick = () => {
    const cmd = prompt('Enter command to run:', '');
    if (cmd) {
      addCmdHistory(`[CMD] ${cmd}`);
      runCommand(cmd);
    }
  };

  document.getElementById('clear-logs-btn').onclick = () => {
    logs = [];
    logview.textContent = '';
  };
}  // ← closing injectCommander
