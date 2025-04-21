// path: ChatGPT-Local-Files-Server/background.js
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || !msg.type) return;
  const { type, payload } = msg;
  let endpoint;
  if (type === 'exec') endpoint = 'http://127.0.0.1:5000/execute_ps';
  else if (type === 'save') endpoint = 'http://127.0.0.1:5000/save';
  else if (type === 'list') endpoint = 'http://127.0.0.1:5000/list';
  else if (type === 'open') endpoint = 'http://127.0.0.1:5000/open';
  else if (type === 'peek') endpoint = 'http://127.0.0.1:5000/peek';
  else {
    console.debug('[background] Unknown message type', type);
    sendResponse({ ok: false, err: 'Unknown message type' });
    return;
  }
  console.debug('[background] Sending', type, 'to', endpoint, 'payload:', payload);
  fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(res => res.json())
    .then(data => {
      console.debug('[background] Response from', endpoint, data);
      sendResponse({ ok: true, data });
    })
    .catch(err => {
      console.debug('[background] Fetch error:', err);
      sendResponse({ ok: false, err: err.message });
    });
  return true;
});
