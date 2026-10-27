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

// Every event, in table order. The standings table has one column per event.
const ALL_EVENTS = [
  ...DECATHLON_EVENTS.map(([id, label]) => ({ id, label, hep: false })),
  ...HEPTATHLON_EVENTS.map(([id, label]) => ({ id, label, hep: true }))
];
const eventById = (id) => ALL_EVENTS.find(e => e.id === id);
const columnTitle = (e) => (e.hep ? 'Hep ' : '') + e.label.replace(/ \(.*\)$/, '');

// Name, Edit, Position and Total come first so they stay visible; the 17 event columns follow.
el('standingsHead').innerHTML = [
  '<th scope="col">Name</th>',
  '<th scope="col">Actions</th>',
  '<th scope="col">Position</th>',
  '<th scope="col">Total</th>',
  ...ALL_EVENTS.map(e => `<th scope="col"${e.hep ? ' class="hep"' : ''}>${columnTitle(e)}</th>`)
].join('');

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

// Resolves true when the user picks "Yes" in the modal, false for "No" or Escape.
function askOverwrite(text) {
  const dialog = el('overwriteDialog');
  el('overwriteText').textContent = text;
  dialog.returnValue = '';
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'yes'), { once: true });
    dialog.showModal();
  });
}

el('save').addEventListener('click', async () => {
  const body = {
    name: el('name2').value,
    event: el('event').value,
    raw: parseFloat(el('raw').value)
  };
  try {
    // Replacing a different result needs a yes. Saving the same value again changes nothing, so it just saves.
    await renderStandings();
    const row = lastStandings.find(r => r.name === body.name.trim());
    const oldRaw = row?.raw?.[body.event];
    if (oldRaw !== undefined && !Number.isNaN(body.raw) && oldRaw !== body.raw) {
      const event = eventById(body.event);
      const replace = await askOverwrite(
        `${row.name} already has a result for ${event?.label ?? body.event}: ${oldRaw} (${row.scores[body.event]} pts). ` +
        `Replace it with ${body.raw}?`);
      if (!replace) {
        setMsg('Kept the existing result');
        return;
      }
    }
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
        <td><button type="button" class="edit" data-testid="editBtn" aria-label="Edit ${escapeHtml(r.name)}">Edit</button></td>
        <td class="pos">${r.position ?? ''}</td>
        <td class="total">${r.total ?? 0}</td>
        ${ALL_EVENTS.map(e => `<td${e.hep ? ' class="hep"' : ''}>${r.scores?.[e.id] ?? ''}</td>`).join('')}
      </tr>`).join('');

    el('standings').innerHTML = rows;

    // The name box on "Enter result" offers every competitor added so far.
    el('competitorList').innerHTML = data.map(r => r.name).sort((a, b) => a.localeCompare(b))
      .map(n => `<option value="${escapeHtml(n)}"></option>`).join('');
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

el('name2').addEventListener('change', loadStoredResult);
el('event').addEventListener('change', loadStoredResult);

el('standings').addEventListener('click', (ev) => {
  const tr = ev.target.closest('tr');
  if (!tr) return;
  if (ev.target.closest('button.edit')) {
    openEdit(tr.dataset.name);
    return;
  }
  el('name2').value = tr.dataset.name;
  loadStoredResult();
});

// Edit dialog: rename a competitor and change any of their results in one go.
let editing = null;

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error((await res.text()) || 'Request failed');
  return res;
}

function openEdit(name) {
  const row = lastStandings.find(r => r.name === name);
  if (!row) return;
  editing = { name: row.name, raw: { ...(row.raw || {}) } };
  el('editName').value = row.name;
  el('editError').textContent = '';
  const events = ALL_EVENTS.filter(e => row.scores?.[e.id] !== undefined);
  el('editResults').innerHTML = events.length
    ? events.map(e => `<label>${columnTitle(e)} (${e.label.match(/\(([^)]*)\)$/)?.[1] ?? ''})
        <input type="number" step="0.01" data-event="${e.id}" data-testid="edit-${e.id}"
               value="${row.raw?.[e.id] ?? ''}"></label>`).join('')
    : '<p>No results yet. Use "Enter result" to add one.</p>';
  el('editDialog').showModal();
}

el('editCancel').addEventListener('click', () => el('editDialog').close());

el('editSave').addEventListener('click', async () => {
  try {
    const newName = el('editName').value.trim();
    if (newName !== editing.name) {
      await postJson('/api/competitors/rename', { from: editing.name, to: newName });
      editing.name = newName;
    }
    for (const input of el('editResults').querySelectorAll('input[data-event]')) {
      const id = input.dataset.event;
      const value = parseFloat(input.value);
      if (Number.isNaN(value)) throw new Error(`Result for ${columnTitle(eventById(id))} is required`);
      if (value !== editing.raw[id]) {
        await postJson('/api/score', { name: editing.name, event: id, raw: value });
        editing.raw[id] = value;
      }
    }
    el('editDialog').close();
    setMsg('Changes saved');
  } catch (e) {
    el('editError').textContent = e.message;
  } finally {
    await renderStandings();
  }
});

function escapeHtml(s){
  return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

renderStandings();
