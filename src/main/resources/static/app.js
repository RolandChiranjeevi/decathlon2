const el = (id) => document.getElementById(id);
const err = el('error');
const msg = el('msg');

// ---- Feedback: one error line and one success line; the field at fault is marked ----
function clearInvalid() {
  document.querySelectorAll('[aria-invalid]').forEach(n => n.removeAttribute('aria-invalid'));
}
function setError(text, field) {
  err.textContent = text;
  msg.textContent = '';
  clearInvalid();
  if (field) field.setAttribute('aria-invalid', 'true');
}
function setMsg(text) {
  msg.textContent = text;
  err.textContent = '';
  clearInvalid();
}

// Which "Enter result" field a server message is about.
function resultFieldFor(text) {
  if (/competing in/i.test(text)) return el('discipline');
  if (/^(Name\b|Unknown competitor|Too many)/i.test(text)) return el('name2');
  if (/^(Event|Unknown event)/i.test(text)) return el('event');
  if (/^Result/i.test(text)) return el('raw');
  return null;
}

// ---- Events ----
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

const ALL_EVENTS = [
  ...DECATHLON_EVENTS.map(([id, label]) => ({ id, label, hep: false })),
  ...HEPTATHLON_EVENTS.map(([id, label]) => ({ id, label, hep: true }))
];
const eventById = (id) => ALL_EVENTS.find(e => e.id === id);
const unitOf = (e) => e.label.match(/\(([^)]*)\)$/)?.[1] ?? '';
const titleOf = (e) => e.label.replace(/ \(.*\)$/, '');
const competitionLabel = (c) => (c === 'HEPTATHLON' ? 'Heptathlon' : 'Decathlon');

// Allowed ranges come from the server, so the rules live in one place.
let ranges = {};
fetch('/api/events')
  .then(res => res.json())
  .then(list => { ranges = Object.fromEntries(list.map(e => [e.id, e])); updateUnit(); })
  .catch(() => {});

function updateUnit() {
  const e = eventById(el('event').value);
  el('unit').textContent = e ? unitOf(e) : '';
  const r = ranges[el('event').value];
  el('rangeHint').textContent = r ? `Allowed range: ${r.min} to ${r.max} ${r.unit}` : '';
}

function populateEvents(preferred) {
  const events = el('discipline').value === 'heptathlon' ? HEPTATHLON_EVENTS : DECATHLON_EVENTS;
  el('event').innerHTML = events.map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
  if (preferred && events.some(([id]) => id === preferred)) el('event').value = preferred;
  updateUnit();
}

el('discipline').addEventListener('change', () => populateEvents());
populateEvents();

// ---- State shared by the table, the tabs and the competitor list ----
let sortBroken = false;
let lastStandings = [];
let tab = 'DECATHLON';
let tabChosen = false;

const findRow = (name) => lastStandings.find(r => r.name === String(name).trim());

function setTab(competition) {
  tabChosen = true;
  if (tab === competition) return;
  tab = competition;
  renderTable();
}

// Loads the stored result for the chosen competitor and event into the form, so it can be changed.
function loadStoredResult() {
  const stored = findRow(el('name2').value)?.raw?.[el('event').value];
  if (stored !== undefined) el('raw').value = stored;
}

// Follows the competitor's competition: the discipline select and the visible table.
function syncFromName() {
  const row = findRow(el('name2').value);
  if (!row?.competition) return;
  const want = row.competition.toLowerCase();
  if (el('discipline').value !== want) {
    el('discipline').value = want;
    populateEvents(el('event').value);
  }
  setTab(row.competition);
}

// ---- Competitor combobox ----
const combo = { input: el('name2'), list: el('comboList'), items: [], active: -1 };

function renderCombo() {
  combo.items = [...lastStandings].sort((a, b) => a.name.localeCompare(b.name));
  const current = combo.input.value.trim();
  combo.active = Math.max(0, combo.items.findIndex(r => r.name === current));
  combo.list.innerHTML = combo.items.length
    ? combo.items.map((r, i) => `<li role="option" id="opt-${i}" data-name="${escapeHtml(r.name)}" aria-selected="${i === combo.active}">
        <span>${escapeHtml(r.name)}</span><small>${r.competition ? competitionLabel(r.competition) : ''}</small></li>`).join('')
    : '<li class="none" role="option" aria-disabled="true">No competitors yet</li>';
  markActive();
}

function markActive() {
  combo.list.querySelectorAll('li[data-name]').forEach((li, i) => li.setAttribute('aria-selected', String(i === combo.active)));
  const li = combo.list.querySelector(`#opt-${combo.active}`);
  if (li) {
    combo.input.setAttribute('aria-activedescendant', li.id);
    li.scrollIntoView({ block: 'nearest' });
  }
}

function openCombo() {
  renderCombo();
  combo.list.hidden = false;
  combo.input.setAttribute('aria-expanded', 'true');
}

function closeCombo() {
  combo.list.hidden = true;
  combo.input.setAttribute('aria-expanded', 'false');
  combo.input.removeAttribute('aria-activedescendant');
}

function chooseCompetitor(name) {
  combo.input.value = name;
  closeCombo();
  syncFromName();
  loadStoredResult();
  el('raw').focus();
}

// The list opens on a click or ArrowDown, not when the field is merely focused or filled in.
combo.input.addEventListener('click', () => (combo.list.hidden ? openCombo() : closeCombo()));
el('comboToggle').addEventListener('mousedown', (ev) => ev.preventDefault());
el('comboToggle').addEventListener('click', () => {
  combo.input.focus();
  combo.list.hidden ? openCombo() : closeCombo();
});
combo.input.addEventListener('keydown', (ev) => {
  const open = !combo.list.hidden;
  if (ev.key === 'ArrowDown') {
    ev.preventDefault();
    if (!open) openCombo();
    else { combo.active = Math.min(combo.items.length - 1, combo.active + 1); markActive(); }
  } else if (ev.key === 'ArrowUp' && open) {
    ev.preventDefault();
    combo.active = Math.max(0, combo.active - 1);
    markActive();
  } else if (ev.key === 'Enter' && open && combo.items[combo.active]) {
    ev.preventDefault();
    chooseCompetitor(combo.items[combo.active].name);
  } else if (ev.key === 'Escape' && open) {
    ev.preventDefault();
    closeCombo();
  }
});
combo.list.addEventListener('mousedown', (ev) => {
  const li = ev.target.closest('li[data-name]');
  if (!li) return;
  ev.preventDefault();
  chooseCompetitor(li.dataset.name);
});
combo.input.addEventListener('blur', closeCombo);
combo.input.addEventListener('change', () => { syncFromName(); loadStoredResult(); });
el('event').addEventListener('change', () => { updateUnit(); loadStoredResult(); });

// ---- Add competitor ----
el('add').addEventListener('click', async () => {
  const name = el('name').value;
  try {
    const res = await fetch('/api/competitors', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    if (!res.ok) {
      setError((await res.text()) || 'Failed to add competitor', el('name'));
    } else {
      setMsg('Added');
      // Ready for the next step: the new competitor is selected in "Enter result".
      el('name2').value = name.trim();
      el('name').value = '';
    }
    await renderStandings();
  } catch (e) {
    setError('Network error', el('name'));
  }
});
el('name').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') el('add').click(); });

// ---- Enter result ----
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
    const row = findRow(body.name);
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
      const text = (await res.text()) || 'Score failed';
      setError(text, resultFieldFor(text));
    } else {
      const json = await res.json();
      setMsg(`Saved: ${json.points} pts`);
    }
    await renderStandings(body.name);
  } catch (e) {
    setError('Score failed');
  }
});
el('raw').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') el('save').click(); });

// ---- Export, save and load ----
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

el('loadStateBtn').addEventListener('click', () => el('loadState').click());
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
      tabChosen = false;
    }
    await renderStandings();
  } catch (e) {
    setError('Could not load state');
  } finally {
    ev.target.value = '';
  }
});

// ---- Standings ----
const PENCIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

async function renderStandings(focusName) {
  try {
    const res = await fetch('/api/standings');
    const data = await res.json();

    lastStandings = sortBroken ? data : data.sort((a, b) => (b.total || 0) - (a.total || 0));

    if (!tabChosen) {
      // First look at the data: open on the competition that has competitors.
      const has = (c) => lastStandings.some(r => r.competition === c);
      if (!has('DECATHLON') && has('HEPTATHLON')) tab = 'HEPTATHLON';
      tabChosen = true;
    }
    const focus = focusName === undefined ? null : findRow(focusName);
    if (focus?.competition) tab = focus.competition;

    renderTable();
  } catch (e) {
    setError('Could not load standings');
  }
}

// Competitors without a result yet have no competition, so they show in both tabs.
const visibleRows = (competition) => lastStandings.filter(r => !r.competition || r.competition === competition);

function renderTable() {
  const events = ALL_EVENTS.filter(e => e.hep === (tab === 'HEPTATHLON'));

  el('standingsHead').innerHTML = [
    '<th scope="col" title="Position">Pos</th>',
    '<th scope="col" class="name">Name</th>',
    '<th scope="col">Total</th>',
    ...events.map(e => `<th scope="col">${titleOf(e)}</th>`),
    '<th scope="col"><span class="sr-only">Actions</span></th>'
  ].join('');

  const rows = visibleRows(tab);
  el('standings').innerHTML = rows.map(r => {
    const pos = r.competition
      ? `<span class="pos pos-${r.position <= 3 ? r.position : 'n'}">${r.position}</span>`
      : '<span class="pos pos-n">–</span>';
    const cells = events.map(e => {
      const points = r.scores?.[e.id];
      if (points === undefined) return '<td class="num"></td>';
      const raw = r.raw?.[e.id];
      // The raw result is drawn from data-raw (CSS), so the cell's own text stays the points.
      return `<td class="num" data-raw="${raw === undefined ? '' : escapeHtml(`${raw} ${unitOf(e)}`)}">${points}</td>`;
    }).join('');
    return `<tr data-name="${escapeHtml(r.name)}">
      <td>${pos}</td>
      <td class="name">${escapeHtml(r.name)}</td>
      <td class="num total">${r.total ?? 0}</td>
      ${cells}
      <td class="act"><button type="button" class="btn icon edit" data-testid="editBtn" aria-label="Edit ${escapeHtml(r.name)}" title="Edit">${PENCIL}</button></td>
    </tr>`;
  }).join('');
  el('emptyState').hidden = rows.length > 0;

  for (const button of document.querySelectorAll('[role="tab"]')) {
    const selected = button.dataset.tab === tab;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
    if (selected) el('tablePanel').setAttribute('aria-labelledby', button.id);
  }
  el('countDecathlon').textContent = visibleRows('DECATHLON').length;
  el('countHeptathlon').textContent = visibleRows('HEPTATHLON').length;
}

for (const button of document.querySelectorAll('[role="tab"]')) {
  button.addEventListener('click', () => setTab(button.dataset.tab));
  button.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    const other = document.querySelector(`[role="tab"][data-tab="${button.dataset.tab === 'DECATHLON' ? 'HEPTATHLON' : 'DECATHLON'}"]`);
    setTab(other.dataset.tab);
    other.focus();
  });
}

// Clicking a row loads that competitor into "Enter result"; the pencil opens the editor.
el('standings').addEventListener('click', (ev) => {
  const tr = ev.target.closest('tr');
  if (!tr) return;
  if (ev.target.closest('button.edit')) {
    openEdit(tr.dataset.name);
    return;
  }
  el('name2').value = tr.dataset.name;
  syncFromName();
  loadStoredResult();
});

// ---- Edit dialog: rename a competitor and change any of their results ----
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
  const row = findRow(name);
  if (!row) return;
  editing = { name: row.name, raw: { ...(row.raw || {}) } };
  el('editName').value = row.name;
  el('editError').textContent = '';
  el('editDialog').querySelectorAll('[aria-invalid]').forEach(n => n.removeAttribute('aria-invalid'));
  const events = ALL_EVENTS.filter(e => row.scores?.[e.id] !== undefined);
  el('editResults').innerHTML = events.length
    ? events.map(e => `<div class="field"><label for="edit-${e.id}">${titleOf(e)} (${unitOf(e)})</label>
        <input id="edit-${e.id}" type="number" step="0.01" data-event="${e.id}" data-testid="edit-${e.id}" value="${row.raw?.[e.id] ?? ''}"></div>`).join('')
    : '<p class="hint">No results yet. Use "Enter result" to add one.</p>';
  el('editDialog').showModal();
}

el('editCancel').addEventListener('click', () => el('editDialog').close());

el('editSave').addEventListener('click', async () => {
  let failing = null;
  el('editDialog').querySelectorAll('[aria-invalid]').forEach(n => n.removeAttribute('aria-invalid'));
  try {
    const newName = el('editName').value.trim();
    if (newName !== editing.name) {
      failing = el('editName');
      await postJson('/api/competitors/rename', { from: editing.name, to: newName });
      editing.name = newName;
    }
    for (const input of el('editResults').querySelectorAll('input[data-event]')) {
      const id = input.dataset.event;
      const value = parseFloat(input.value);
      failing = input;
      if (Number.isNaN(value)) throw new Error(`Result for ${titleOf(eventById(id))} is required`);
      if (value !== editing.raw[id]) {
        await postJson('/api/score', { name: editing.name, event: id, raw: value });
        editing.raw[id] = value;
      }
    }
    el('editDialog').close();
    setMsg('Changes saved');
  } catch (e) {
    el('editError').textContent = e.message;
    failing?.setAttribute('aria-invalid', 'true');
  } finally {
    await renderStandings(editing?.name);
  }
});

function escapeHtml(s){
  return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

renderStandings();
