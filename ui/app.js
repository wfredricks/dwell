/**
 * Dwell Constellation UI — vanilla JS dashboard
 *
 * @adopt:dwell-runtime-port [resolved: 3000]
 * @adopt:dwell-ui-runtime-url [resolved: http://localhost:3010]
 */

// @adopt:dwell-ui-runtime-url [resolved: http://localhost:3010]
// In docker-compose, the UI is served on :3011, and runtime on :3010 (host-side).
// We detect based on window.location — if on :3011, talk to :3010.
// @adopt:dwell-runtime-host-port [resolved: 3010]
const RUNTIME_PORT = 3010;
const RUNTIME_URL  = `http://${window.location.hostname}:${RUNTIME_PORT}`;

// ── Health / Agent List ──────────────────────────────────────────────────────
async function refreshAgents() {
  try {
    const res = await fetch(`${RUNTIME_URL}/health`);
    const data = await res.json();
    const list = document.getElementById('agent-list');
    if (!list) return;
    const agents = data.agents ?? [];
    if (agents.length === 0) {
      list.innerHTML = '<li id="agent-empty" style="color:#6e7681;font-style:italic;">No agents registered</li>';
    } else {
      list.innerHTML = agents.map(a => `<li>${a}</li>`).join('');
    }
  } catch (e) {
    console.warn('Health check failed:', e);
  }
}

refreshAgents();
setInterval(refreshAgents, 5000);

// ── Declare Intent ───────────────────────────────────────────────────────────
document.getElementById('intent-btn')?.addEventListener('click', async () => {
  const input = document.getElementById('intent-input');
  const status = document.getElementById('intent-status');
  const intent = input?.value?.trim();
  if (!intent) { if (status) status.textContent = 'Enter an intent first.'; return; }
  try {
    const res = await fetch(`${RUNTIME_URL}/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent }),
    });
    const data = await res.json();
    if (status) status.textContent = data.ok ? `✓ Declared: "${data.intent}"` : `Error: ${data.error}`;
    if (input && data.ok) input.value = '';
  } catch (e) {
    if (status) status.textContent = `Error: ${e}`;
  }
});

// ── SSE Event Stream ─────────────────────────────────────────────────────────
const log = document.getElementById('event-log');
const dot = document.getElementById('conn-dot');
const connText = document.getElementById('conn-text');

let eventCount = 0;
const MAX_EVENTS = 200;

function addEvent(subject, data) {
  if (!log) return;
  const now = new Date().toLocaleTimeString();
  const line = document.createElement('div');
  line.className = 'ev-line';
  line.innerHTML = `
    <span class="ev-time">${now}</span>
    <span class="ev-subject">${escHtml(subject)}</span>
    <span class="ev-data">${escHtml(JSON.stringify(data))}</span>
  `;
  log.appendChild(line);
  eventCount++;
  // Trim old events
  while (log.children.length > MAX_EVENTS) {
    log.removeChild(log.firstChild);
  }
  log.scrollTop = log.scrollHeight;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function connectSSE() {
  const es = new EventSource(`${RUNTIME_URL}/events`);

  es.onopen = () => {
    if (dot) dot.classList.add('connected');
    if (connText) connText.textContent = `Connected to ${RUNTIME_URL}/events`;
  };

  es.onmessage = (e) => {
    try {
      const payload = JSON.parse(e.data);
      addEvent(payload.subject ?? '?', payload.data ?? {});
    } catch {
      addEvent('raw', e.data);
    }
  };

  es.onerror = () => {
    if (dot) dot.classList.remove('connected');
    if (connText) connText.textContent = 'SSE disconnected — retrying…';
    es.close();
    setTimeout(connectSSE, 3000);
  };
}

connectSSE();
