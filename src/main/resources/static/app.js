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
  // A dropdown's visible box is its button, not the hidden <select>.
  if (field) (field._button ?? field).setAttribute('aria-invalid', 'true');
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
const typeLabel = (t) => (t === 'DECATHLON' ? 'Decathlon' : t === 'HEPTATHLON' ? 'Heptathlon' : 'Mixed');

// ---- Competitions: each has its own competitors and results; the selected one is remembered ----
let competitions = [];
let currentId = (() => {
  try { return localStorage.getItem('competition') || 'default'; } catch (e) { return 'default'; }
})();
const currentCompetition = () => competitions.find(c => c.id === currentId);
// The default competition keeps the plain /api/... routes; the others live under /api/competitions/{id}.
const api = (path) => (currentId === 'default' ? `/api${path}` : `/api/competitions/${encodeURIComponent(currentId)}${path}`);

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
    syncDropdown(el('discipline'));
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
    ? combo.items.map((r, i) => `<li role="option" id="opt-${i}" data-name="${escapeHtml(r.name)}" class="${i === combo.active ? 'active' : ''}" aria-selected="${r.name === current}">
        <span>${escapeHtml(r.name)}</span><small>${r.competition ? competitionLabel(r.competition) : ''}</small></li>`).join('')
    : '<li class="none" role="option" aria-disabled="true">No competitors yet</li>';
  markActive();
}

function markActive() {
  combo.list.querySelectorAll('li[data-name]').forEach((li, i) => li.classList.toggle('active', i === combo.active));
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
    const res = await fetch(api('/competitors'), {
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
    const res = await fetch(api('/score'), {
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
    await download(api('/export.csv'), 'text/csv;charset=utf-8', 'results.csv');
    sortBroken = true;
  } catch (e) {
    setError('Export failed');
  }
});

el('saveState').addEventListener('click', async () => {
  try {
    await download(api('/state'), 'application/json', 'decathlon-state.json');
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
    const res = await fetch(api('/state'), {
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
// Column widths in rem. They are the same for every competition (see renderTable).
const COLUMN_REM = { pos: 3.5, name: 11, total: 5, act: 3.5, event: 5 };

async function renderStandings(focusName) {
  try {
    const res = await fetch(api('/standings'));
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();

    lastStandings = sortBroken ? data : data.sort((a, b) => (b.total || 0) - (a.total || 0));
    const current = currentCompetition();
    if (current) {
      current.competitors = lastStandings.length;
      renderCompetitionBar();
    }

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

  // The first four columns and every event column have the same width in every competition, so
  // switching moves nothing; a 7-event table just ends sooner.
  const widths = [COLUMN_REM.pos, COLUMN_REM.name, COLUMN_REM.total, COLUMN_REM.act, ...events.map(() => COLUMN_REM.event)];
  el('standingsCols').innerHTML = widths.map(w => `<col style="width: ${w}rem">`).join('');
  el('standingsTableEl').style.width = `${widths.reduce((sum, w) => sum + w, 0)}rem`;

  el('standingsHead').innerHTML = [
    '<th scope="col" title="Position">Pos</th>',
    '<th scope="col" class="name">Name</th>',
    '<th scope="col">Total</th>',
    '<th scope="col"><span class="sr-only">Actions</span></th>',
    ...events.map(e => `<th scope="col">${titleOf(e)}</th>`)
  ].join('');

  const rows = visibleRows(tab);
  el('standings').innerHTML = rows.map(r => {
    // No position until the competitor has a result.
    const pos = r.position == null
      ? '<span class="pos pos-n">–</span>'
      : `<span class="pos pos-${r.position <= 3 ? r.position : 'n'}">${r.position}</span>`;
    const cells = events.map(e => {
      const points = r.scores?.[e.id];
      if (points === undefined) return '<td class="num"></td>';
      const raw = r.raw?.[e.id];
      // The raw result is drawn from data-raw (CSS), so the cell's own text stays the points.
      return `<td class="num" data-raw="${raw === undefined ? '' : escapeHtml(`${raw} ${unitOf(e)}`)}">${points}</td>`;
    }).join('');
    return `<tr data-name="${escapeHtml(r.name)}">
      <td>${pos}</td>
      <td class="name" title="${escapeHtml(r.name)}">${escapeHtml(r.name)}</td>
      <td class="num total">${r.total ?? 0}</td>
      <td class="act"><button type="button" class="btn icon edit" data-testid="editBtn" aria-label="Edit ${escapeHtml(r.name)}" title="Edit">${PENCIL}</button></td>
      ${cells}
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
      await postJson(api('/competitors/rename'), { from: editing.name, to: newName });
      editing.name = newName;
    }
    for (const input of el('editResults').querySelectorAll('input[data-event]')) {
      const id = input.dataset.event;
      const value = parseFloat(input.value);
      failing = input;
      if (Number.isNaN(value)) throw new Error(`Result for ${titleOf(eventById(id))} is required`);
      if (value !== editing.raw[id]) {
        await postJson(api('/score'), { name: editing.name, event: id, raw: value });
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

// ---- Competition switcher and the New / Rename dialog ----
function renderCompetitionBar() {
  const select = el('competition');
  select.innerHTML = competitions.map(c =>
    `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)} · ${typeLabel(c.type)} (${c.competitors})</option>`).join('');
  select.value = currentId;
  syncDropdown(select);
  const c = currentCompetition();
  el('competitionType').textContent = typeLabel(c?.type);
  el('competitionType').dataset.type = c?.type || 'MIXED';
  el('competitionHint').textContent = c && !c.type
    ? 'General is the default list and can hold decathletes and heptathletes together. Create a named competition to keep them apart.'
    : '';
}

// A named competition has one type: the discipline is fixed and there is nothing to switch between in the table.
function applyCompetition() {
  const typed = currentCompetition()?.type || null;
  el('tabs').hidden = !!typed;
  el('discipline').disabled = !!typed;
  el('discipline').title = typed ? `This is a ${typeLabel(typed)} competition` : '';
  if (typed) {
    tab = typed;
    tabChosen = true;
    el('discipline').value = typed.toLowerCase();
    syncDropdown(el('discipline'));
    populateEvents();
  }
  renderCompetitionBar();
}

async function switchCompetition(id) {
  currentId = id;
  try { localStorage.setItem('competition', id); } catch (e) { /* the choice just isn't remembered */ }
  lastStandings = [];
  tab = 'DECATHLON';
  tabChosen = false;
  for (const field of ['name', 'name2', 'raw']) el(field).value = '';
  setMsg('');
  applyCompetition();
  await renderStandings();
}

async function loadCompetitions() {
  try {
    const res = await fetch('/api/competitions');
    competitions = await res.json();
  } catch (e) {
    competitions = [];
  }
  if (!competitions.some(c => c.id === currentId)) currentId = 'default';
  applyCompetition();
}

el('competition').addEventListener('change', (ev) => switchCompetition(ev.target.value));

let compMode = 'create';
function openCompDialog(mode) {
  compMode = mode;
  el('compTitle').textContent = mode === 'create' ? 'New competition' : 'Rename competition';
  el('compSave').textContent = mode === 'create' ? 'Create' : 'Save';
  el('compTypeFields').hidden = mode !== 'create';
  el('compName').value = mode === 'create' ? '' : (currentCompetition()?.name ?? '');
  el('compName').removeAttribute('aria-invalid');
  el('compError').textContent = '';
  el('compDialog').showModal();
  el('compName').select();
}

el('newCompetitionBtn').addEventListener('click', () => openCompDialog('create'));
el('renameCompetitionBtn').addEventListener('click', () => openCompDialog('rename'));
el('compCancel').addEventListener('click', () => el('compDialog').close());
el('compName').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') { ev.preventDefault(); el('compSave').click(); }
});

el('compSave').addEventListener('click', async () => {
  const name = el('compName').value.trim();
  try {
    if (compMode === 'create') {
      const type = document.querySelector('input[name="compType"]:checked').value;
      const created = await (await postJson('/api/competitions', { name, type })).json();
      competitions.push(created);
      el('compDialog').close();
      await switchCompetition(created.id);
      setMsg(`Created ${created.name}`);
    } else {
      await postJson(api('/name'), { name });
      currentCompetition().name = name;
      el('compDialog').close();
      renderCompetitionBar();
      setMsg('Competition renamed');
    }
  } catch (e) {
    el('compError').textContent = e.message;
    el('compName').setAttribute('aria-invalid', 'true');
  }
});

function escapeHtml(s){
  return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

// ---- One dropdown design for every <select> ----
const CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

const syncDropdown = (select) => select._refresh?.();

// Replaces what the user sees of a <select> with a button and a list that look like the competitor
// dropdown. The <select> stays in the page, hidden, as the source of truth: its value, its change
// event and its test id keep working, and any change made to it (by this script or by a test) is
// mirrored on the button.
function enhanceSelect(select) {
  const label = document.querySelector(`label[for="${select.id}"]`);
  const wrap = document.createElement('div');
  wrap.className = 'dd';
  select.before(wrap);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'dd-btn';
  button.setAttribute('role', 'combobox');
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  button.innerHTML = `<span class="dd-value"></span>${CHEVRON}`;
  if (label) {
    label.id = label.id || `${select.id}-label`;
    button.setAttribute('aria-labelledby', label.id);
    label.addEventListener('click', () => button.focus());
  }

  const list = document.createElement('ul');
  list.className = 'dd-list';
  list.id = `${select.id}-list`;
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  button.setAttribute('aria-controls', list.id);

  wrap.append(button, list, select);
  select.classList.add('sr-only');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');

  let active = -1;
  let typed = '';
  let typedTimer = null;
  const options = () => [...select.options];

  function markActive() {
    [...list.children].forEach((li, i) => li.classList.toggle('active', i === active));
    const li = list.children[active];
    if (li) {
      button.setAttribute('aria-activedescendant', li.id);
      li.scrollIntoView({ block: 'nearest' });
    }
  }
  function renderList() {
    list.innerHTML = options().map((o, i) =>
      `<li role="option" id="${list.id}-${i}" aria-selected="${o.selected}">${escapeHtml(o.textContent)}</li>`).join('');
    markActive();
  }
  function close() {
    list.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    button.removeAttribute('aria-activedescendant');
  }
  function open() {
    if (select.disabled) return;
    active = Math.max(0, select.selectedIndex);
    list.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    renderList();
  }
  function refresh() {
    const selected = select.selectedOptions[0];
    button.querySelector('.dd-value').textContent = selected ? selected.textContent : '';
    button.disabled = select.disabled;
    button.title = select.title;
    if (select.disabled) close();
    else if (!list.hidden) renderList();
  }
  function choose(index) {
    close();
    if (index >= 0 && index !== select.selectedIndex) {
      select.selectedIndex = index;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    refresh();
  }

  button.addEventListener('click', () => (list.hidden ? open() : close()));
  button.addEventListener('blur', close);
  button.addEventListener('keydown', (ev) => {
    const isOpen = !list.hidden;
    const last = options().length - 1;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (!isOpen) open();
      else { active = Math.min(last, Math.max(0, active + (ev.key === 'ArrowDown' ? 1 : -1))); markActive(); }
    } else if (ev.key === 'Home' || ev.key === 'End') {
      if (isOpen) { ev.preventDefault(); active = ev.key === 'Home' ? 0 : last; markActive(); }
    } else if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      if (isOpen) choose(active); else open();
    } else if (ev.key === 'Escape' && isOpen) {
      ev.preventDefault();
      close();
    } else if (ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      // Type-ahead: "H" jumps to the first option starting with H.
      typed += ev.key.toLowerCase();
      clearTimeout(typedTimer);
      typedTimer = setTimeout(() => { typed = ''; }, 600);
      const hit = options().findIndex(o => o.textContent.toLowerCase().startsWith(typed));
      if (hit >= 0) {
        if (isOpen) { active = hit; markActive(); } else choose(hit);
      }
    }
  });
  list.addEventListener('mousedown', (ev) => {
    ev.preventDefault();   // keep focus on the button so the list isn't closed by a blur
    const li = ev.target.closest('li');
    if (li) choose([...list.children].indexOf(li));
  });

  select.addEventListener('change', refresh);
  new MutationObserver(refresh).observe(select, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'title']
  });
  select._refresh = refresh;
  select._button = button;
  refresh();
}

for (const id of ['competition', 'discipline', 'event']) enhanceSelect(el(id));

// Headers appear at once; the data follows when the competition list and standings have loaded.
renderTable();
loadCompetitions().then(() => renderStandings());
