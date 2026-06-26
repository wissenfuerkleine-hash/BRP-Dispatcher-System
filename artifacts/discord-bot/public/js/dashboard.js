/* ── Auth token (stored in localStorage) ── */
function getSecret() {
  return localStorage.getItem('dashboard_secret') || '';
}
function authHeaders() {
  const s = getSecret();
  return s ? { Authorization: `Bearer ${s}` } : {};
}
function saveSecret() {
  const val = document.getElementById('secret-input').value.trim();
  if (val) {
    localStorage.setItem('dashboard_secret', val);
    showToast('Token gespeichert ✓', 'success');
  }
}
// Pre-fill secret input from storage on load
window.addEventListener('DOMContentLoaded', () => {
  const stored = getSecret();
  if (stored) document.getElementById('secret-input').value = stored;
});

/* ── Socket.io ── */
const socket = io();
const badge = document.getElementById('connection-badge');

socket.on('connect', () => {
  badge.textContent = '● Verbunden';
  badge.className = 'badge connected';
});
socket.on('disconnect', () => {
  badge.textContent = '● Getrennt';
  badge.className = 'badge disconnected';
});

/* ── Live Queue ── */
socket.on('queueUpdate', (queue) => {
  const body = document.getElementById('queue-body');
  const count = document.getElementById('queue-count');
  count.textContent = queue.length;
  const now = Date.now();
  if (queue.length === 0) {
    body.innerHTML = '<tr class="empty-row"><td colspan="2">Niemand wartet</td></tr>';
    return;
  }
  body.innerHTML = queue.map((q) => {
    const waitSec = Math.floor((now - new Date(q.joinedAt).getTime()) / 1000);
    const avatar = q.avatarURL ? `<img class="avatar" src="${q.avatarURL}" />` : '';
    return `<tr>
      <td class="user-cell">${avatar}${esc(q.username)}</td>
      <td class="wait-cell" data-joined="${new Date(q.joinedAt).getTime()}">${waitSec}s</td>
    </tr>`;
  }).join('');
});

/* ── Live Rooms ── */
socket.on('roomsUpdate', (rooms) => {
  rooms.forEach((r) => {
    const el = document.getElementById(`room-${r.roomId}`);
    if (!el) return;
    const s = r.active;
    el.className = `room-card ${s ? 'room-active' : 'room-free'}`;

    const nameEl = el.querySelector('.room-name');
    const statusEl = el.querySelector('.room-status');
    const infoEl = el.querySelector('.room-info');

    if (statusEl) statusEl.textContent = s ? '🔴 Belegt' : '🟢 Frei';

    if (s && infoEl) {
      const runtime = s.startedAt ? Math.floor((Date.now() - new Date(s.startedAt).getTime()) / 1000) : 0;
      infoEl.innerHTML = `
        <div>👮 <strong>${esc(s.supporterName)}</strong></div>
        <div>👤 <strong>${esc(s.citizenName)}</strong></div>
        <div class="runtime" data-started="${new Date(s.startedAt).getTime()}">⏱ ${runtime}s</div>
      `;
    } else if (!s && infoEl) {
      infoEl.innerHTML = '';
    }
  });
});

/* ── Tick: update wait times every second ── */
setInterval(() => {
  const now = Date.now();

  // Queue wait times
  document.querySelectorAll('.wait-cell[data-joined]').forEach((td) => {
    const joined = parseInt(td.dataset.joined, 10);
    td.textContent = Math.floor((now - joined) / 1000) + 's';
  });

  // Room runtimes
  document.querySelectorAll('.runtime[data-started]').forEach((el) => {
    const started = parseInt(el.dataset.started, 10);
    el.textContent = '⏱ ' + Math.floor((now - started) / 1000) + 's';
  });
}, 1000);

/* ── Stats ── */
async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();

    document.getElementById('stat-total').textContent = data.totalSessions ?? '—';
    const avgSec = data.avgWaitMs ? Math.round(data.avgWaitMs / 1000) : 0;
    document.getElementById('stat-avg').textContent = avgSec + 's';

    const body = document.getElementById('ranking-body');
    if (!data.ranking || data.ranking.length === 0) {
      body.innerHTML = '<tr class="empty-row"><td colspan="4">Keine Daten</td></tr>';
      return;
    }
    body.innerHTML = data.ranking.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${esc(r.supporterName)}</td>
        <td>${r.totalSessions}</td>
        <td>${Math.round(r.totalTime / 60000)}min</td>
      </tr>
    `).join('');
  } catch (e) {
    showToast('Fehler beim Laden der Statistik', 'error');
  }
}
loadStats();

/* ── Settings ── */
async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    document.getElementById('delay-input').value = data.dispatchDelay ?? 10000;
  } catch (_) {}
}
loadSettings();

document.getElementById('settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const delay = document.getElementById('delay-input').value;
  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ dispatchDelay: Number(delay) }),
    });
    const data = await res.json();
    if (res.ok) showToast('Einstellungen gespeichert ✓', 'success');
    else showToast(data.error || 'Fehler ' + res.status, 'error');
  } catch (_) {
    showToast('Fehler beim Speichern', 'error');
  }
});

/* ── Controls ── */
async function clearQueue() {
  if (!confirm('Queue wirklich leeren?')) return;
  try {
    const res = await fetch('/api/queue/clear', { method: 'POST', headers: authHeaders() });
    const data = await res.json();
    if (res.ok) showToast('Queue geleert ✓', 'success');
    else showToast(data.error || 'Fehler ' + res.status, 'error');
  } catch (_) { showToast('Netzwerkfehler', 'error'); }
}

async function endSupport(roomId) {
  try {
    const res = await fetch(`/api/rooms/${roomId}/end`, { method: 'POST', headers: authHeaders() });
    const data = await res.json();
    if (data.ok) showToast('Support beendet ✓', 'success');
    else showToast(data.error || 'Fehler ' + res.status, 'error');
  } catch (_) { showToast('Netzwerkfehler', 'error'); }
}

async function resetChannel(channelId) {
  try {
    const res = await fetch(`/api/channel-reset/${channelId}`, { method: 'POST', headers: authHeaders() });
    const data = await res.json();
    if (res.ok) showToast('Channel zurückgesetzt ✓', 'success');
    else showToast(data.error || 'Fehler ' + res.status, 'error');
  } catch (_) { showToast('Netzwerkfehler', 'error'); }
}

/* ── Audio Upload ── */
async function uploadAudio(name) {
  const input = document.getElementById(`upload-${name}`);
  const status = document.getElementById(`upload-status-${name}`);
  if (!input.files.length) { showToast('Keine Datei ausgewählt', 'error'); return; }
  const formData = new FormData();
  formData.append('file', input.files[0]);
  status.textContent = 'Uploading…';
  status.className = 'upload-status';
  try {
    const res = await fetch(`/upload/${name}.mp3`, { method: 'POST', headers: authHeaders(), body: formData });
    const data = await res.json();
    if (data.ok) {
      status.textContent = '✓ Hochgeladen';
      status.className = 'upload-status ok';
    } else {
      status.textContent = '✗ ' + (data.error || 'Fehler');
      status.className = 'upload-status err';
    }
  } catch (_) {
    status.textContent = '✗ Netzwerkfehler';
    status.className = 'upload-status err';
  }
}

/* ── Toast ── */
let toastTimer;
function showToast(msg, type = 'success') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = `show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 3000);
}

/* ── Helpers ── */
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
