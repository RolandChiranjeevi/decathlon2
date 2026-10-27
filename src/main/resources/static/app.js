const el = (id) => document.getElementById(id);
const err = el('error');
const msg = el('msg');

function setError(text) { err.textContent = text; msg.textContent = ''; }
function setMsg(text) { msg.textContent = text; err.textContent = ''; }

const DECATHLON_EVENTS = [
  ['100m', '100m (s)'],
  ['110mHurdles', '110m Hurdles (s)'],
  ['400m', '400m (s)'],
  ['1500m', '1500m (s)'],
  ['longJump', 'Long Jump (cm)'],
  ['highJump', 'High Jump (cm)'],
  ['poleVault', 'Pole Vault (cm)'],
  ['shotPut', 'Shot Put (m)'],
  ['discusThrow', 'Discus Throw (m)'],
  ['javelinThrow', 'Javelin Throw (m)']
];

const HEPTATHLON_EVENTS = [
  ['hep100mHurdles', '100m Hurdles (s)'],
  ['hep200m', '200m (s)'],
  ['hep800m', '800m (s)'],
  ['hepLongJump', 'Long Jump (cm)'],
  ['hepHighJump', 'High Jump (cm)'],
  ['hepShotPut', 'Shot Put (m)'],
  ['hepJavelinThrow', 'Javelin Throw (m)']
];

function populateEvents() {
  const events = el('discipline').value === 'heptathlon' ? HEPTATHLON_EVENTS : DECATHLON_EVENTS;
  el('event').innerHTML = events.map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
}

el('discipline').addEventListener('change', populateEvents);
populateEvents();

el('add').addEventListener('click', async () => {
  const name = el('name').value;
  try {
    const res = await fetch('/api/competitors', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    if (!res.ok) {
      const t = await res.text();
      setError(t || 'Failed to add competitor');
    } else {
      setMsg('Added');
    }
    await renderStandings();
  } catch (e) {
    setError('Network error');
  }
});

el('save').addEventListener('click', async () => {
  const body = {
    name: el('name2').value,
    event: el('event').value,
    raw: parseFloat(el('raw').value)
  };
  try {
    const res = await fetch('/api/score', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      setError((await res.text()) || 'Score failed');
    } else {
      const json = await res.json();
      setMsg(`Saved: ${json.points} pts`);
    }
    await renderStandings();
  } catch (e) {
    setError('Score failed');
  }
});

let sortBroken = false;
let lastStandings = [];

// Downloads a server file under the name the server chose (timestamped), or the fallback.
async function download(url, type, fallbackName) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  const text = await res.text();
  const named = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = named ? named[1] : fallbackName;
  a.click();
}

el('export').addEventListener('click', async () => {
  try {
    await download('/api/export.csv', 'text/csv;charset=utf-8', 'results.csv');
    sortBroken = true;
  } catch (e) {
    setError('Export failed');
  }
});

el('saveState').addEventListener('click', async () => {
  try {
    await download('/api/state', 'application/json', 'decathlon-state.json');
    setMsg('State saved');
  } catch (e) {
    setError('Could not save state');
  }
});

el('loadState').addEventListener('change', async (ev) => {
  const file = ev.target.files[0];
  if (!file) return;
  try {
    const res = await fetch('/api/state', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: await file.text()
    });
    if (!res.ok) {
      setError((await res.text()) || 'Could not load state');
    } else {
      setMsg('State loaded');
    }
    await renderStandings();
  } catch (e) {
    setError('Could not load state');
  } finally {
    ev.target.value = '';
  }
});

async function renderStandings() {
  try {
    const res = await fetch('/api/standings');
    const data = await res.json();

    lastStandings = data;
    const rows = (sortBroken ? data : data.sort((a,b)=> (b.total||0)-(a.total||0)))
      .map(r => `<tr data-name="${escapeHtml(r.name)}" title="${escapeHtml(describeRow(r))}">
        <td>${escapeHtml(r.name)}</td>
        <td>${r.scores?.["100m"] ?? ''}</td>
        <td>${r.scores?.["longJump"] ?? ''}</td>
        <td>${r.scores?.["shotPut"] ?? ''}</td>
        <td>${r.scores?.["400m"] ?? ''}</td>
        <td>${r.total ?? 0}</td>
        <td>${r.position ?? ''}</td>
      </tr>`).join('');

    el('standings').innerHTML = rows;
  } catch (e) {
    setError('Could not load standings');
  }
}

// Tooltip with every event: "hep200m: 25 (887 pts)".
function describeRow(r) {
  return Object.entries(r.scores || {})
    .map(([event, pts]) => `${event}: ${r.raw?.[event] ?? '?'} (${pts} pts)`)
    .join('; ');
}

// Editing: clicking a row, or changing the event, loads the stored result into the form.
// Saving again overwrites it.
function loadStoredResult() {
  const row = lastStandings.find(r => r.name === el('name2').value.trim());
  const stored = row?.raw?.[el('event').value];
  if (stored !== undefined) el('raw').value = stored;
}

el('standings').addEventListener('click', (ev) => {
  const tr = ev.target.closest('tr');
  if (!tr) return;
  el('name2').value = tr.dataset.name;
  loadStoredResult();
});
el('event').addEventListener('change', loadStoredResult);

function escapeHtml(s){
  return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

renderStandings();
