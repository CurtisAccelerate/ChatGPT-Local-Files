// path: ChatGPT-Local-Files/background.js
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || !msg.type) return;
  const { type, payload } = msg;
  let endpoint;
  if (type === 'exec') endpoint = 'http://127.0.0.1:5000/execute_ps';
  else if (type === 'save') endpoint = 'http://127.0.0.1:5000/save';
  else {
    sendResponse({ ok: false, err: 'Unknown message type' });
    return;
  }

  fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(res => res.json())
    .then(data => sendResponse({ ok: true, data }))
    .catch(err => sendResponse({ ok: false, err: err.message }));

  // keep the message channel open for sendResponse
  return true;
});
