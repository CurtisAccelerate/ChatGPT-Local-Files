// path: ./ChatGPT-Local-Files/observer.js
import { toast } from './utils.js';
import { runCommand, saveCode, openEditor, inferCommand } from './actions.js';

// Matches your "// path: ..." comments
const PATH_RE = /^\s*(?:\/\/|#|<!--|\/\*)\s*path\s*:\s*(.+?)\s*(?:\*\/|-->)?\s*$/i;

// ───────────────────────────────────────────────────────────
// 1) Inject toolbar buttons into each markdown <pre> block
// ───────────────────────────────────────────────────────────
export function addBtns(pre) {
  if (pre.dataset.btns) return;
  pre.dataset.btns = '1';
  pre.style.position = 'relative';

  // grab the <code> text and extract the file path
  const codeEl = pre.querySelector('code');
  if (!codeEl) return;
  const origText = codeEl.textContent;
  let filePath = '';
  origText.split('\n').some(line => {
    const m = PATH_RE.exec(line);
    if (m) { filePath = m[1].trim(); return true; }
    return false;
  });

  // layout variables
  let x = 3;
  const SP = 3;

  // define buttons and input
  const controls = [
    { type:'button', label:'Save ↗',  bg:'#2a4b9a', onClick:() => saveCode(origText, filePath) },
    { type:'button', label:'VDiff 📊', bg:'#2a4b9a', onClick:() => showVDiff(filePath, pre) },
    { type:'button', label:'Run ▶',   bg:'#2a4b9a', onClick:() => runCommand(inferCommand(filePath)) },
    { type:'input',  value:filePath,  width:150,        onChange:v => filePath = v },
    { type:'button', label:'Refresh 🔄', bg:'#2a4b9a', onClick:() => {
        pre.dataset.btns = '';
        addBtns(pre);
        toast('Buttons refreshed');
      }
    },
    { type:'button', label:'A→Diff ⧉', bg:'#2a4b9a', onClick:() => {
        if (window.patchModule?.applyDiff) window.patchModule.applyDiff(pre);
        else toast('Diff module unavailable', '#ef4444');
      }
    },
    { type:'button', label:'NPad 📝', bg:'#2a4b9a', onClick:() => openEditor('notepad', filePath) },
    { type:'button', label:'VS 🖥',   bg:'#2a4b9a', onClick:() => openEditor('devenv', filePath) }
  ];

  // render them
  for (const ctl of controls) {
    if (ctl.type === 'button') {
      const btn = document.createElement('button');
      btn.innerText = ctl.label;
      Object.assign(btn.style, {
        position:'absolute',
        top: '4px',
        left:`${x}px`,
        padding:'2px 4px',
        fontSize:'0.9em',
        background:ctl.bg,
        color:'#fff',
        border:'none',
        borderRadius:'4px',
        cursor:'pointer',
        zIndex:1
      });
      btn.addEventListener('click', ctl.onClick);
      pre.appendChild(btn);
      x += btn.getBoundingClientRect().width + SP;
    } else {
      const inp = document.createElement('input');
      inp.value = ctl.value;
      Object.assign(inp.style, {
        position:'absolute',
        top: '4px',
        left:`${x}px`,
        width:`${ctl.width}px`,
        padding:'4px',
        fontSize:'0.9em',
        border:'1px solid #ccc',
        borderRadius:'4px',
        zIndex:1
      });
      inp.addEventListener('input', e => ctl.onChange(e.target.value));
      pre.appendChild(inp);
      x += inp.getBoundingClientRect().width + SP;
    }
  }
}

// ───────────────────────────────────────────────────────────
// 2) showVDiff: manual dark popover + per‑hunk checkboxes
// ───────────────────────────────────────────────────────────
function showVDiff(path, pre) {
  const diffText = pre.querySelector('code')?.textContent || '';
  if (!diffText) {
    toast('No diff to show', '#ef4444');
    return;
  }

  // popover container
  const po = document.createElement('div');
  Object.assign(po.style, {
    position:'fixed',
    top:'50%', left:'50%',
    transform:'translate(-50%,-50%)',
    background:'#1e1e1e',
    color:'#ddd',
    width:'70vw',
    height:'70vh',
    padding:'16px',
    borderRadius:'6px',
    boxShadow:'0 0 16px rgba(0,0,0,0.7)',
    display:'flex',
    flexDirection:'column',
    zIndex:9999999,
    fontFamily:'Consolas, monospace',
    fontSize:'14px',
    overflow:'hidden'
  });

  // close button
  const close = document.createElement('button');
  close.textContent = '×';
  Object.assign(close.style, {
    position:'absolute',
    top:'8px', right:'8px',
    background:'none',
    border:'none',
    color:'#fff',
    fontSize:'20px',
    cursor:'pointer'
  });
  close.addEventListener('click', () => po.remove());
  po.appendChild(close);

  // title
  const title = document.createElement('div');
  title.textContent = `Diff: ${path}`;
  Object.assign(title.style, {
    fontWeight:'bold',
    marginBottom:'8px',
    color:'#fff'
  });
  po.appendChild(title);

  // content scroll area
  const content = document.createElement('div');
  Object.assign(content.style, {
    flex:'1',
    overflowY:'auto',
    padding: '8px',
    background: '#1a1a1a',
    borderRadius: '4px'
  });
  po.appendChild(content);

  // loading indicator
  const loading = document.createElement('div');
  loading.textContent = 'Loading file…';
  loading.style.color = '#888';
  content.appendChild(loading);

  document.body.appendChild(po);

  // fetch the original
  chrome.runtime.sendMessage(
    { type:'open', payload:{ path } },
    res => {
      content.innerHTML = '';
      if (!res?.ok || typeof res.data?.content !== 'string') {
        toast('Failed to open file', '#ef4444');
        po.remove();
        return;
      }
      const orig = res.data.content;

      // parse patch (with dummy header)
      let patches;
      try {
        patches = Diff.parsePatch('--- a/'+path+'\n+++ b/'+path+'\n' + diffText);
      } catch (err) {
        console.error('Diff parse error:', err);
        toast('Bad diff format', '#ef4444');
        po.remove();
        return;
      }

      // Debug info panel
      const debugInfo = document.createElement('div');
      Object.assign(debugInfo.style, {
        padding: '8px 12px',
        marginBottom: '12px',
        background: '#2d3748',
        borderRadius: '4px',
        fontSize: '12px'
      });
      if (patches.length === 0) {
        debugInfo.innerHTML = '<b>Diff Debug:</b> No hunks detected.';
      } else {
        const totalHunks = patches.reduce((sum, p) => sum + (p.hunks?.length || 0), 0);
        debugInfo.innerHTML = `<b>Diff Debug:</b> ${patches.length} patch(es), ${totalHunks} hunk(s).`;
      }
      content.appendChild(debugInfo);

      // Create tab interface
      const tabsContainer = document.createElement('div');
      Object.assign(tabsContainer.style, {
        display: 'flex',
        marginBottom: '12px',
        borderBottom: '1px solid #333'
      });

      const tabs = [
        { id: 'full-diff',  label: 'Full Diff' },
        { id: 'line-select',label: 'Line Selection' },
        { id: 'hunk-select',label: 'Hunk Selection' }
      ];
      const tabContents = {};

      tabs.forEach(tab => {
        const tabButton = document.createElement('button');
        tabButton.textContent = tab.label;
        tabButton.dataset.tabId = tab.id;
        tabButton.dataset.active = tab.id === 'full-diff' ? '1' : '0';
        Object.assign(tabButton.style, {
          padding: '8px 16px',
          background: tab.id === 'full-diff' ? '#2a4b9a' : '#1e1e1e',
          color: '#fff',
          border: 'none',
          borderTopLeftRadius: '4px',
          borderTopRightRadius: '4px',
          cursor: 'pointer',
          marginRight: '2px'
        });
        tabButton.addEventListener('click', () => {
          Object.values(tabContents).forEach(el => el.style.display = 'none');
          tabsContainer.querySelectorAll('button').forEach(btn => {
            btn.style.background = '#1e1e1e';
            btn.dataset.active = '0';
          });
          tabContents[tab.id].style.display = 'block';
          tabButton.style.background = '#2a4b9a';
          tabButton.dataset.active = '1';
        });
        tabsContainer.appendChild(tabButton);

        const tabContent = document.createElement('div');
        tabContent.id = `tab-${tab.id}`;
        tabContent.style.display = tab.id === 'full-diff' ? 'block' : 'none';
        tabContents[tab.id] = tabContent;
        content.appendChild(tabContent);
      });

      content.insertBefore(tabsContainer, debugInfo.nextSibling);

      // 1. FULL DIFF TAB
      const fullDiffTab = tabContents['full-diff'];
      const fullDiffInfo = document.createElement('div');
      fullDiffInfo.innerHTML = '<b>Full Diff View:</b> Shows the complete diff between the files.';
      Object.assign(fullDiffInfo.style, {
        padding: '8px 12px',
        marginBottom: '8px',
        background: '#1e293b',
        color: '#94a3b8',
        borderRadius: '4px'
      });
      fullDiffTab.appendChild(fullDiffInfo);

      const full = document.createElement('pre');
      Object.assign(full.style, {
        margin: 0,
        padding: '8px',
        whiteSpace: 'pre-wrap',
        fontFamily: 'inherit',
        background: '#0f172a',
        color: '#ddd',
        borderRadius: '4px',
        maxHeight: '500px',
        overflowY: 'auto'
      });

      const lineDiffs = Diff.diffLines(orig, diffText);
      let lineNumOrig = 1;
      let lineNumNew = 1;

      lineDiffs.forEach(part => {
        const container = document.createElement('div');
        Object.assign(container.style, {
          background: part.added ? '#0d3321' : part.removed ? '#350d0d' : 'transparent'
        });
        const lines = part.value.split('\n');
        const numLines = lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;

        for (let i = 0; i < numLines; i++) {
          if (i === numLines - 1 && lines[i] === '') continue;
          const lineEl = document.createElement('div');
          lineEl.className = part.added ? 'added-line' : part.removed ? 'removed-line' : 'unchanged-line';

          const prefix = document.createElement('span');
          if (part.added) {
            prefix.textContent = `+${lineNumNew++} `;
            prefix.style.color = '#4ade80';
          } else if (part.removed) {
            prefix.textContent = `-${lineNumOrig++} `;
            prefix.style.color = '#f87171';
          } else {
            prefix.textContent = ` ${lineNumOrig++}/${lineNumNew++} `;
            prefix.style.color = '#94a3b8';
          }
          prefix.style.display = 'inline-block';
          prefix.style.width = '60px';
          prefix.style.userSelect = 'none';

          const txt = document.createElement('span');
          txt.textContent = lines[i];

          lineEl.appendChild(prefix);
          lineEl.appendChild(txt);
          container.appendChild(lineEl);
        }

        full.appendChild(container);
      });

      fullDiffTab.appendChild(full);

      // 2. LINE SELECTION TAB
      const lineSelectTab = tabContents['line-select'];
      const lineSelectInfo = document.createElement('div');
      lineSelectInfo.innerHTML = '<b>Line Selection:</b> Select individual lines to include in your changes.';
      Object.assign(lineSelectInfo.style, {
        padding: '8px 12px',
        marginBottom: '8px',
        background: '#1e293b',
        color: '#94a3b8',
        borderRadius: '4px'
      });
      lineSelectTab.appendChild(lineSelectInfo);

      const debugButton = document.createElement('button');
      debugButton.textContent = '🔍 Debug Selections';
      Object.assign(debugButton.style, {
        padding: '4px 8px',
        background: '#4b5563',
        color: '#fff',
        border: 'none',
        borderRadius: '4px',
        marginBottom: '8px',
        cursor: 'pointer'
      });
      debugButton.addEventListener('click', () => {
        const selected = lineChunks.filter(c => c.selected);
        console.log('Selected chunks:', selected);
        alert(`${selected.length} chunks selected`);
      });
      lineSelectTab.appendChild(debugButton);

      const lineSelector = document.createElement('div');
      Object.assign(lineSelector.style, {
        margin: 0,
        padding: '8px',
        background: '#0f172a',
        color: '#ddd',
        borderRadius: '4px',
        maxHeight: '500px',
        overflowY: 'auto',
        fontFamily: 'inherit'
      });

      let lineChunks = [];
      let currentChunk = null;
      let linePosition = { orig: 1, new: 1 };

      lineDiffs.forEach(part => {
        const lines = part.value.split('\n');
        const numLines = lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;

        if (part.added || part.removed) {
          if (!currentChunk ||
              (currentChunk.type === 'add' && part.removed) ||
              (currentChunk.type === 'remove' && part.added)) {
            if (currentChunk) lineChunks.push(currentChunk);
            currentChunk = {
              type: part.added ? 'add' : 'remove',
              startLine: part.added ? linePosition.new : linePosition.orig,
              lines: [],
              selected: false
            };
          }
          for (let i = 0; i < numLines; i++) {
            if (i === numLines - 1 && lines[i] === '') continue;
            currentChunk.lines.push({
              content: lines[i],
              origLine: part.removed ? linePosition.orig++ : null,
              newLine: part.added ? linePosition.new++ : null
            });
          }
          currentChunk.endLine = part.added ? linePosition.new - 1 : linePosition.orig - 1;
        } else {
          if (currentChunk) {
            lineChunks.push(currentChunk);
            currentChunk = null;
          }
          for (let i = 0; i < numLines; i++) {
            if (i === numLines - 1 && lines[i] === '') continue;
            linePosition.orig++;
            linePosition.new++;
          }
        }
      });

      if (currentChunk) lineChunks.push(currentChunk);

      for (let i = 0; i < lineChunks.length - 1; i++) {
        if (lineChunks[i].type === 'remove' && lineChunks[i+1].type === 'add') {
          const removeChunk = lineChunks[i];
          const addChunk = lineChunks[i+1];
          const replaceChunk = {
            type: 'replace',
            startLineOrig: removeChunk.startLine,
            endLineOrig: removeChunk.endLine,
            startLineNew: addChunk.startLine,
            endLineNew: addChunk.endLine,
            removeLines: removeChunk.lines,
            addLines: addChunk.lines,
            selected: false
          };
          lineChunks.splice(i, 2, replaceChunk);
          i--;
        }
      }

      if (lineChunks.length === 0) {
        const noChanges = document.createElement('div');
        noChanges.textContent = 'No differences detected between the files.';
        Object.assign(noChanges.style, {
          padding: '12px',
          textAlign: 'center',
          color: '#94a3b8'
        });
        lineSelector.appendChild(noChanges);
      } else {
        lineChunks.forEach((chunk, index) => {
          const chunkContainer = document.createElement('div');
          chunkContainer.dataset.chunkIndex = index;
          Object.assign(chunkContainer.style, {
            marginBottom: '12px',
            border: '1px solid #475569',
            borderRadius: '4px',
            overflow: 'hidden'
          });

          const header = document.createElement('div');
          Object.assign(header.style, {
            display: 'flex',
            alignItems: 'center',
            padding: '8px',
            background: chunk.type === 'add' ? '#065f46'
                      : chunk.type === 'remove' ? '#7f1d1d'
                      : '#1e40af',
            borderBottom: '1px solid #475569',
            cursor: 'pointer'
          });

          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.id = `chunk-${index}`;
          Object.assign(checkbox.style, {
            width: '20px',
            height: '20px',
            marginRight: '8px',
            cursor: 'pointer',
            accentColor: '#3b82f6'
          });
          header.appendChild(checkbox);

          const label = document.createElement('label');
          label.htmlFor = `chunk-${index}`;
          if (chunk.type === 'add') {
            label.textContent = `Add lines after line ${chunk.startLine - 1} (${chunk.lines.length} line${chunk.lines.length!==1?'s':''})`;
          } else if (chunk.type === 'remove') {
            label.textContent = `Delete lines ${chunk.startLine}-${chunk.endLine} (${chunk.lines.length} line${chunk.lines.length!==1?'s':''})`;
          } else {
            label.textContent = `Replace lines ${chunk.startLineOrig}-${chunk.endLineOrig} with ${chunk.addLines.length} line${chunk.addLines.length!==1?'s':''}`;
          }
          Object.assign(label.style, {
            color: 'white',
            flex: '1',
        cursor: 'pointer',
            fontWeight: 'bold'
          });
          header.appendChild(label);

          header.addEventListener('click', e => {
            if (e.target !== checkbox) {
              checkbox.checked = !checkbox.checked;
              chunk.selected = checkbox.checked;
            }
          });

          checkbox.addEventListener('change', () => {
            chunk.selected = checkbox.checked;
            chunkContainer.style.borderColor = checkbox.checked ? '#3b82f6' : '#475569';
            chunkContainer.style.background = checkbox.checked ? 'rgba(30,58,138,0.3)' : 'transparent';
          });

          chunkContainer.appendChild(header);

          const contentDiv = document.createElement('div');
          Object.assign(contentDiv.style, {
            padding: '8px',
            background: '#1a1a1a',
            maxHeight: '150px',
            overflowY: 'auto'
          });

          if (chunk.type === 'add') {
            chunk.lines.forEach(line => {
              const lineEl = document.createElement('div');
              lineEl.innerHTML = `<span style="color:#4ade80;display:inline-block;width:40px;text-align:right;">+${line.newLine}</span> <span>${escapeHtml(line.content)}</span>`;
              lineEl.style.fontFamily = 'monospace';
              contentDiv.appendChild(lineEl);
            });
          } else if (chunk.type === 'remove') {
            chunk.lines.forEach(line => {
              const lineEl = document.createElement('div');
              lineEl.innerHTML = `<span style="color:#f87171;display:inline-block;width:40px;text-align:right;">-${line.origLine}</span> <span>${escapeHtml(line.content)}</span>`;
              lineEl.style.fontFamily = 'monospace';
              contentDiv.appendChild(lineEl);
            });
          } else {
            const removedContainer = document.createElement('div');
            chunk.removeLines.forEach(line => {
              const lineEl = document.createElement('div');
              lineEl.innerHTML = `<span style="color:#f87171;display:inline-block;width:40px;text-align:right;">-${line.origLine}</span> <span>${escapeHtml(line.content)}</span>`;
              lineEl.style.fontFamily = 'monospace';
              removedContainer.appendChild(lineEl);
            });
            contentDiv.appendChild(removedContainer);

            const separator = document.createElement('div');
            separator.style.borderTop = '1px dashed #475569';
            separator.style.margin = '4px 0';
            contentDiv.appendChild(separator);

            const addedContainer = document.createElement('div');
            chunk.addLines.forEach(line => {
              const lineEl = document.createElement('div');
              lineEl.innerHTML = `<span style="color:#4ade80;display:inline-block;width:40px;text-align:right;">+${line.newLine}</span> <span>${escapeHtml(line.content)}</span>`;
              lineEl.style.fontFamily = 'monospace';
              addedContainer.appendChild(lineEl);
            });
            contentDiv.appendChild(addedContainer);
          }

          chunkContainer.appendChild(contentDiv);
          lineSelector.appendChild(chunkContainer);
        });
      }

      lineSelectTab.appendChild(lineSelector);

      // 3. HUNK SELECTION TAB
      const hunkSelectTab = tabContents['hunk-select'];
      const hunkSelectInfo = document.createElement('div');
      let hunkInfoText = '';
      if (!patches[0]?.hunks?.length) {
        hunkInfoText = '<b>Hunk Selection:</b> No hunks detected.';
      } else {
        hunkInfoText = `<b>Hunk Selection:</b> ${patches[0].hunks.length} hunk(s) detected.`;
      }
      hunkSelectInfo.innerHTML = hunkInfoText;
      Object.assign(hunkSelectInfo.style, {
        padding: '8px 12px',
        marginBottom: '8px',
        background: '#1e293b',
        color: '#94a3b8',
        borderRadius: '4px'
      });
      hunkSelectTab.appendChild(hunkSelectInfo);

      const hunkSelector = document.createElement('div');
      Object.assign(hunkSelector.style, {
        margin: 0,
        padding: '8px',
        background: '#0f172a',
        color: '#ddd',
        borderRadius: '4px',
        maxHeight: '500px',
        overflowY: 'auto'
      });

      if (!patches[0]?.hunks?.length) {
        const noHunks = document.createElement('div');
        noHunks.textContent = 'No hunks available.';
        Object.assign(noHunks.style, {
          padding: '12px',
          textAlign: 'center',
          color: '#94a3b8'
        });
        hunkSelector.appendChild(noHunks);
      } else {
        patches[0].hunks.forEach((h, i) => {
          const hunkContainer = document.createElement('div');
          hunkContainer.dataset.hunkIndex = i;
          Object.assign(hunkContainer.style, {
            marginBottom: '12px',
            border: '1px solid #475569',
            borderRadius: '4px',
            overflow: 'hidden'
          });

          const header = document.createElement('div');
          Object.assign(header.style, {
            display: 'flex',
            alignItems: 'center',
            padding: '8px',
            background: '#1e40af',
            borderBottom: '1px solid #475569',
            cursor: 'pointer'
          });

          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.id = `hunk-${i}`;
          checkbox.dataset.hunkIndex = i;
          Object.assign(checkbox.style, {
            width: '20px',
            height: '20px',
            marginRight: '8px',
            cursor: 'pointer',
            accentColor: '#3b82f6'
          });
          header.appendChild(checkbox);

          const label = document.createElement('label');
          label.htmlFor = `hunk-${i}`;
          label.textContent = `Hunk #${i+1}: @@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`;
          Object.assign(label.style, {
            color: 'white',
            flex: '1',
            cursor: 'pointer',
            fontWeight: 'bold'
          });
          header.appendChild(label);

          header.addEventListener('click', () => {
            checkbox.checked = !checkbox.checked;
          });

          hunkContainer.appendChild(header);

          const hunkContent = document.createElement('pre');
          hunkContent.textContent = h.lines.join('\n');
          Object.assign(hunkContent.style, {
            margin: 0,
            padding: '8px',
            background: '#1a1a1a',
            maxHeight: '150px',
            overflowY: 'auto',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap'
          });
          hunkContainer.appendChild(hunkContent);

          hunkSelector.appendChild(hunkContainer);
        });
      }

      hunkSelectTab.appendChild(hunkSelector);

      // action bar
      const bar = document.createElement('div');
      Object.assign(bar.style, {
        textAlign: 'right',
        marginTop: '12px',
        padding: '8px',
        borderTop: '1px solid #374151'
      });

      // Accept All
      const btnAll = document.createElement('button');
      btnAll.textContent = 'Accept All';
      Object.assign(btnAll.style, {
        marginRight:'8px',
        padding:'6px 12px',
        background:'#10b981',
        color:'#fff',
        border:'none',
        borderRadius:'4px',
        cursor:'pointer',
        fontWeight: 'bold'
      });
      btnAll.addEventListener('click', () => {
        if (btnAll.disabled) return;
        btnAll.disabled = true;
        saveCode(diffText, path);
        toast(`✔ Saved ${path}`, '#10b981');
        setTimeout(() => po.remove(), 500);
      });
      bar.appendChild(btnAll);

      // Accept Selected
      const btnSel = document.createElement('button');
      btnSel.textContent = 'Accept Selected';
      Object.assign(btnSel.style, {
        marginRight:'8px',
        padding:'6px 12px',
        background:'#3b82f6',
        color:'#fff',
        border:'none',
        borderRadius:'4px',
        cursor:'pointer',
        fontWeight: 'bold'
      });
      btnSel.addEventListener('click', () => {
        if (btnSel.disabled) return;
        btnSel.disabled = true;

        const activeBtn = tabsContainer.querySelector('button[data-active="1"]');
        const activeTabId = activeBtn ? activeBtn.dataset.tabId : null;
        if (!activeTabId) {
          toast('Cannot determine active tab', '#ef4444');
          btnSel.disabled = false;
          return;
        }

        if (activeTabId === 'hunk-select') {
          const selected = hunkSelector.querySelectorAll('input[type="checkbox"]:checked');
          const idxs = Array.from(selected).map(cb => Number(cb.dataset.hunkIndex)).sort((a,b)=>a-b);
          if (!idxs.length) {
            toast('No hunks selected', '#ef4444');
            btnSel.disabled = false;
            return;
          }
          let patched = orig;
          for (const j of idxs) {
            const h = patches[0].hunks[j];
            const snippet = `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@\n` + h.lines.join('\n') + '\n';
            try {
              const res = Diff.applyPatch(patched, snippet);
              if (!res) throw new Error(`Hunk ${j} failed`);
              patched = res;
            } catch (err) {
              toast(`Failed at hunk ${j}`, '#ef4444');
              btnSel.disabled = false;
              return;
            }
          }
          saveCode(patched, path);
          toast(`✔ Saved ${path} with ${idxs.length} change${idxs.length!==1?'s':''}`, '#10b981');
        } else {
          const selChunks = lineChunks.filter(c=>c.selected);
          if (!selChunks.length) {
            toast('No changes selected', '#ef4444');
            btnSel.disabled = false;
            return;
          }
          let result = orig.split('\n');
          let offset = 0;
          selChunks.sort((a,b)=>{
            const aLine = a.startLineOrig||a.startLine;
            const bLine = b.startLineOrig||b.startLine;
            return bLine-aLine;
          });
          for (const chunk of selChunks) {
            if (chunk.type==='add') {
              const idx = chunk.startLine-1+offset;
              const toAdd = chunk.lines.map(l=>l.content);
              result.splice(idx,0,...toAdd);
              offset += toAdd.length;
            } else if (chunk.type==='remove') {
              const idx = chunk.startLine-1+offset;
              result.splice(idx,chunk.lines.length);
              offset -= chunk.lines.length;
            } else {
              const idx = chunk.startLineOrig-1+offset;
              result.splice(idx, chunk.removeLines.length, ...chunk.addLines.map(l=>l.content));
              offset += chunk.addLines.length - chunk.removeLines.length;
            }
          }
          const patched = result.join('\n');
          if (patched===diffText) {
            toast('Error: Selection logic failed', '#ef4444');
            btnSel.disabled = false;
            return;
          }
          saveCode(patched, path);
          toast(`✔ Saved ${path} with ${selChunks.length} change${selChunks.length!==1?'s':''}`, '#10b981');
        }

        setTimeout(() => po.remove(), 500);
      });
      bar.appendChild(btnSel);

      // Reject
      const btnRej = document.createElement('button');
      btnRej.textContent = 'Reject';
      Object.assign(btnRej.style, {
        padding:'6px 12px',
        background:'#ef4444',
        color:'#fff',
        border:'none',
        borderRadius:'4px',
        cursor:'pointer',
        fontWeight: 'bold'
      });
      btnRej.addEventListener('click', () => po.remove());
      bar.appendChild(btnRej);

      po.appendChild(bar);
    }
  );
}

// Helper to escape HTML
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ───────────────────────────────────────────────────────────
// 3) Canvas‑save (unchanged)
// ───────────────────────────────────────────────────────────
export function injectCanvasSave() {
  document.querySelectorAll('div.markdown canvas').forEach(canvas=>{
    if (canvas.dataset.cbsave) return;
    canvas.dataset.cbsave = '1';
    const wrap = canvas.parentElement;
    if (getComputedStyle(wrap).position === 'static') {
      wrap.style.position = 'relative';
    }
    const btn = document.createElement('button');
    btn.textContent = '💾';
    btn.title = 'Save Image';
    Object.assign(btn.style, {
      position:'absolute',
      top:'4px',
      right:'4px',
      padding:'2px 4px',
      fontSize:'0.9em',
      background:'#2563eb',
      color:'#fff',
      border:'none',
      borderRadius:'4px',
      cursor:'pointer',
      zIndex:1
    });
    btn.addEventListener('click', ()=>{
      try {
        const url = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = 'canvas.png';
        a.click();
        toast('Canvas saved');
      } catch {
        toast('Save failed', '#ef4444');
      }
    });
    wrap.appendChild(btn);
  });
}

// ───────────────────────────────────────────────────────────
// 4) Initialize on load + mutations
// ───────────────────────────────────────────────────────────
export function initObserver() {
  document.querySelectorAll('div.markdown pre').forEach(addBtns);
  new MutationObserver(muts=>{
    muts.forEach(m =>
      m.addedNodes.forEach(n => {
        if (n.nodeType !== 1) return;
        if (n.matches('div.markdown pre')) addBtns(n);
        else if (n.querySelectorAll) {
          n.querySelectorAll('div.markdown pre').forEach(addBtns);
        }
      })
    );
    injectCanvasSave();
  }).observe(document.body, { childList:true, subtree:true });
}
