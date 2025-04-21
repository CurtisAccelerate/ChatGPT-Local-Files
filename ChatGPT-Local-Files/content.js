// path: ChatGPT-Local-Files/content.js
import './diff.min.js';
import './diff-patch.js';
import { toast } from './utils.js';
import { injectCommander } from './commander.js';
import { initObserver, injectCanvasSave } from './observer.js';

console.log('[ChatGPT Local Files] Content script loaded');

window.addEventListener('load', () => {
  injectCommander();
  initObserver();
  injectCanvasSave();
  toast('💾 ChatGPT Local Files Ready! By Curtis White');
});
