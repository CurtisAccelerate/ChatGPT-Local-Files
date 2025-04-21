// path: ChatGPT-Local-Files/state.js
/**
 * Shared persistent state (prefixPath, cmdHistory)
 */
let prefixPath = localStorage.getItem('cb_save_prefix') || '';
let cmdHistory = JSON.parse(localStorage.getItem('cb_cmd_history') || '[]');

export function getPrefixPath() {
  return prefixPath;
}

export function setPrefixPath(p) {
  prefixPath = p;
  localStorage.setItem('cb_save_prefix', p);
}

export function getCmdHistory() {
  return [...cmdHistory];
}

export function addCmdHistory(entry) {
  cmdHistory.push(entry);
  localStorage.setItem('cb_cmd_history', JSON.stringify(cmdHistory));
}
