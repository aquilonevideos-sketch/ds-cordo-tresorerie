// Onglet « Planning des tâches » : tableaux (comme les feuilles du modèle Excel),
// vues Kanban / Liste / Frise, fiche tâche, import / export Excel.

const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const TASK_COLS = ['Tâche', 'Priorité', 'Propriétaire', 'État', 'Date de début', 'Date de fin', 'Étape', 'Livrable', 'Notes'];
const TASK_KEYS = ['title', 'prio', 'owner', 'status', 'start', 'end', 'step', 'deliverable', 'notes'];

const plan = () => state.planning;
const taskUI = { board: 'all', view: 'kanban', owner: '', prio: '', q: '', hideDone: false, dragId: null };
const prioOf = id => TASK_PRIOS.find(p => p.id === id);
const statusOf = id => TASK_STATUSES.find(s => s.id === id) || TASK_STATUSES[0];
const boardName = id => (plan().boards.find(b => b.id === id) || { name: '—' }).name;
const fmtD = iso => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' }) : '');

function taskDeadline(t) {
  if (!t.end || t.status === 'Terminé') return null;
  const days = Math.round((new Date(t.end + 'T12:00:00') - new Date(todayISO() + 'T12:00:00')) / 86400000);
  if (days < 0) return { cls: 'bad', txt: `⏰ ${-days} j de retard` };
  if (days === 0) return { cls: 'warn', txt: "⏳ aujourd'hui" };
  if (days <= 7) return { cls: 'warn', txt: `⏳ J-${days}` };
  return null;
}

function filteredTasks() {
  const q = taskUI.q.trim().toLowerCase();
  return plan().items.filter(t =>
    (taskUI.board === 'all' || t.board === taskUI.board) &&
    (!taskUI.owner || (t.owner || '') === taskUI.owner) &&
    (!taskUI.prio || t.prio === taskUI.prio) &&
    (!taskUI.hideDone || t.status !== 'Terminé') &&
    (!q || [t.title, t.step, t.deliverable, t.notes, t.owner].some(x => (x || '').toLowerCase().includes(q))));
}
const byPrioThenEnd = (a, b) => (a.prio || 'P9').localeCompare(b.prio || 'P9') || (a.end || '9999').localeCompare(b.end || '9999');

function taskCard(t) {
  const p = prioOf(t.prio), dl = taskDeadline(t);
  return `<div class="task ${t.status === 'Terminé' ? 'is-done' : ''}" draggable="true" data-task-id="${t.id}" data-task-edit="${t.id}">
    <div class="task-top">${p ? `<span class="tag prio-${p.id}">${p.icon} ${p.id}</span>` : ''}${t.example ? '<span class="tag">exemple</span>' : ''}${dl ? `<span class="tag ${dl.cls}">${dl.txt}</span>` : ''}</div>
    <div class="task-title">${esc(t.title)}</div>
    ${t.step ? `<div class="task-step">➜ ${esc(t.step)}</div>` : ''}
    <div class="task-meta">${t.owner ? `<span>👤 ${esc(t.owner)}</span>` : ''}${t.start || t.end ? `<span>📅 ${fmtD(t.start)}${t.end ? ' → ' + fmtD(t.end) : ''}</span>` : ''}
      ${taskUI.board === 'all' ? `<span class="dim">🗂 ${esc(boardName(t.board))}</span>` : ''}</div>
  </div>`;
}

function viewKanban(tasks) {
  return `<div class="kanban">${TASK_STATUSES.map(s => {
    const col = tasks.filter(t => t.status === s.id).sort(byPrioThenEnd);
    return `<div class="kcol" data-drop-status="${s.id}">
      <div class="kcol-head"><span>${s.icon} ${s.id}</span><span class="tag ${s.color}">${col.length}</span></div>
      <div class="kcol-body">${col.map(taskCard).join('') || '<div class="kcol-empty">Glissez une tâche ici</div>'}</div>
    </div>`;
  }).join('')}</div>`;
}

function viewTaskList(tasks) {
  const rows = [...tasks].sort(byPrioThenEnd).map(t => {
    const p = prioOf(t.prio), s = statusOf(t.status), dl = taskDeadline(t);
    return `<tr class="${t.status === 'Terminé' ? 'row-done' : ''}">
      <td><a href="#planning" class="task-link" data-task-edit="${t.id}">${esc(t.title)}</a>${t.example ? ' <span class="tag">exemple</span>' : ''}</td>
      <td>${p ? `<span class="tag prio-${p.id}">${p.icon} ${p.id}</span>` : ''}</td>
      <td style="text-align:left">${esc(t.owner || '')}</td>
      <td><select class="inp sel-mini" data-task-status="${t.id}">${TASK_STATUSES.map(x => `<option ${x.id === t.status ? 'selected' : ''}>${x.id}</option>`).join('')}</select></td>
      <td>${fmtD(t.start)}</td><td>${fmtD(t.end)} ${dl ? `<span class="tag ${dl.cls}">${dl.txt}</span>` : ''}</td>
      <td class="wrap">${esc(t.step || '')}</td><td class="wrap">${esc(t.deliverable || '')}</td><td class="wrap muted">${esc(t.notes || '')}</td>
      ${taskUI.board === 'all' ? `<td style="text-align:left" class="muted">${esc(boardName(t.board))}</td>` : ''}
    </tr>`;
  }).join('');
  return `<div class="tbl-wrap"><table class="task-tbl"><thead><tr>${TASK_COLS.map(c => `<th>${c}</th>`).join('')}${taskUI.board === 'all' ? '<th>Tableau</th>' : ''}</tr></thead>
    <tbody>${rows || `<tr><td colspan="10" class="muted">Aucune tâche.</td></tr>`}</tbody></table></div>`;
}

function viewGantt(tasks) {
  const dated = tasks.filter(t => t.start || t.end).sort((a, b) => (a.start || a.end).localeCompare(b.start || b.end));
  if (!dated.length) return '<div class="card muted">Aucune tâche datée à afficher sur la frise.</div>';
  const day = iso => new Date(iso + 'T12:00:00').getTime();
  let min = Math.min(...dated.map(t => day(t.start || t.end)));
  let max = Math.max(...dated.map(t => day(t.end || t.start)));
  const first = new Date(min); first.setDate(1);
  const last = new Date(max); last.setMonth(last.getMonth() + 1, 0);
  min = first.getTime(); max = last.getTime() + 86400000;
  const span = max - min;
  const pos = ts => ((ts - min) / span) * 100;
  const months = [];
  for (const d = new Date(first); d.getTime() < max; d.setMonth(d.getMonth() + 1)) {
    const a = d.getTime(), b = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    months.push(`<div class="g-month" style="left:${pos(a)}%;width:${pos(Math.min(b, max)) - pos(a)}%">${d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })}</div>`);
  }
  const now = day(todayISO());
  const todayLine = now >= min && now <= max ? `<div class="g-today" style="left:${pos(now)}%"></div>` : '';
  const rows = dated.map(t => {
    const s = day(t.start || t.end), e = day(t.end || t.start) + 86400000;
    const dl = taskDeadline(t);
    return `<div class="g-row"><div class="g-label"><a href="#planning" class="task-link" data-task-edit="${t.id}">${esc(t.title)}</a></div>
      <div class="g-track">${todayLine}<div class="g-bar st-${statusOf(t.status).color} ${dl && dl.cls === 'bad' ? 'late' : ''}" data-task-edit="${t.id}" style="left:${pos(s)}%;width:${Math.max(1.2, pos(e) - pos(s))}%" title="${esc(t.title)} — ${t.status}"></div></div></div>`;
  }).join('');
  return `<div class="card gantt"><div class="g-row g-head"><div class="g-label muted">Tâche</div><div class="g-track">${months.join('')}</div></div>${rows}
    <div class="row" style="margin-top:10px;font-size:12px">${TASK_STATUSES.map(s => `<span class="tag ${s.color}">${s.icon} ${s.id}</span>`).join('')}<span class="muted">· trait rose = aujourd'hui</span></div></div>`;
}

function viewPlanning() {
  const p = plan();
  if (taskUI.board !== 'all' && !p.boards.some(b => b.id === taskUI.board)) taskUI.board = 'all';
  const tasks = filteredTasks();
  const ts = taskStats(state);
  const owners = [...new Set(p.items.map(t => t.owner).filter(Boolean))].sort();
  const scope = taskUI.board === 'all' ? p.items : p.items.filter(t => t.board === taskUI.board);
  const doneScope = scope.filter(t => t.status === 'Terminé').length;
  const hasExamples = p.items.some(t => t.example);
  return `
  <div class="page-head">
    <div><h1>Planning des tâches</h1><div class="sub">Tâche · priorité · propriétaire · état · dates · étape · livrable · notes. Chaque tâche terminée rapporte de l'XP selon sa priorité.</div></div>
    <div class="row">
      <button class="btn primary" data-task-new>＋ Nouvelle tâche</button>
      <button class="btn small" data-xlsx="export">⬇ Export Excel</button>
      <label class="btn small">⬆ Import Excel<input type="file" accept=".xlsx,.xls" id="taskImport" hidden></label>
    </div>
  </div>
  ${hasExamples ? `<div class="alert info">🧪 <div>Les tâches marquées « exemple » sont fictives et servent de démonstration. <button class="btn small ghost" data-task-clear-examples>Supprimer les exemples</button></div></div>` : ''}

  <div class="grid g4" style="margin-bottom:16px">
    <div class="card kpi"><div class="k-label">Avancement ${taskUI.board === 'all' ? 'global' : 'du tableau'}</div><div class="k-val">${scope.length ? Math.round((doneScope / scope.length) * 100) : 0} %</div>${bar('prog', scope.length ? doneScope / scope.length : 0)}<div class="k-sub">${doneScope}/${scope.length} tâches terminées</div></div>
    <div class="card kpi"><div class="k-label">⏰ En retard</div><div class="k-val ${ts.late.length ? 'neg' : 'pos'}">${ts.late.length}</div><div class="k-sub">date de fin dépassée</div></div>
    <div class="card kpi"><div class="k-label">⏳ À rendre sous 7 jours</div><div class="k-val">${ts.soon.length}</div><div class="k-sub">tous tableaux confondus</div></div>
    <div class="card kpi"><div class="k-label">🧱 Bloquées</div><div class="k-val ${ts.blocked.length ? 'neg' : ''}">${ts.blocked.length}</div><div class="k-sub">à débloquer en priorité</div></div>
  </div>

  <div class="card" style="margin-bottom:16px">
    <div class="row">
      <div class="board-tabs">
        <button class="${taskUI.board === 'all' ? 'on' : ''}" data-board-sel="all">Tous (${p.items.length})</button>
        ${p.boards.map(b => `<button class="${taskUI.board === b.id ? 'on' : ''}" data-board-sel="${b.id}">${esc(b.name)} (${p.items.filter(t => t.board === b.id).length})</button>`).join('')}
        <button data-board-new title="Nouveau tableau">＋ Tableau</button>
      </div>
      <span class="spacer"></span>
      ${taskUI.board !== 'all' ? `<button class="btn small ghost" data-board-rename>✎ Renommer</button><button class="btn small danger" data-board-del>🗑</button>` : ''}
    </div>
    <div class="row" style="margin-top:12px">
      <div class="seg">${[['kanban', '🧩 Kanban'], ['liste', '📋 Liste'], ['gantt', '📅 Frise']].map(([k, l]) => `<button class="${taskUI.view === k ? 'on' : ''}" data-tview="${k}">${l}</button>`).join('')}</div>
      <input class="inp" id="taskQ" data-tfilter="q" placeholder="🔎 Rechercher…" value="${esc(taskUI.q)}" style="max-width:220px">
      <select class="inp" data-tfilter="owner" style="max-width:180px"><option value="">👤 Tous les propriétaires</option>${owners.map(o => `<option ${o === taskUI.owner ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>
      <select class="inp" data-tfilter="prio" style="max-width:160px"><option value="">Toutes priorités</option>${TASK_PRIOS.map(x => `<option value="${x.id}" ${x.id === taskUI.prio ? 'selected' : ''}>${x.icon} ${x.id} · ${x.label}</option>`).join('')}</select>
      <label class="row" style="gap:6px;cursor:pointer"><input type="checkbox" data-tfilter="hideDone" ${taskUI.hideDone ? 'checked' : ''}> Masquer les terminées</label>
    </div>
  </div>

  ${taskUI.view === 'kanban' ? viewKanban(tasks) : taskUI.view === 'liste' ? viewTaskList(tasks) : viewGantt(tasks)}`;
}

// Carte du QG
function qgTasksCard() {
  const ts = taskStats(state);
  const urgent = [...ts.late, ...ts.soon.filter(t => !ts.late.includes(t)), ...ts.blocked.filter(t => !ts.late.includes(t) && !ts.soon.includes(t))].slice(0, 5);
  return `<div class="card">
    <div class="row"><h2 style="margin:0">📋 Tâches du moment</h2><span class="spacer"></span><a class="btn small ghost" href="#planning">Planning ▶</a></div>
    <div class="row" style="margin:10px 0"><span class="tag ${ts.late.length ? 'bad' : 'ok'}">⏰ ${ts.late.length} en retard</span><span class="tag warn">⏳ ${ts.soon.length} sous 7 j</span><span class="tag">🧱 ${ts.blocked.length} bloquée(s)</span><span class="tag info">${ts.open.length} ouvertes</span></div>
    ${urgent.length ? urgent.map(t => { const dl = taskDeadline(t); return `<div class="sum-line"><a href="#planning" class="task-link" data-task-edit="${t.id}">${prioOf(t.prio) ? prioOf(t.prio).icon + ' ' : ''}${esc(t.title)}</a><span class="tag ${dl ? dl.cls : 'bad'}">${dl ? dl.txt : '🧱 bloquée'}</span></div>`; }).join('') : '<div class="alert ok">💚 Rien d’urgent : aucune tâche en retard ni à rendre cette semaine.</div>'}
  </div>`;
}

// ————— Fiche tâche (boîte de dialogue) —————
function ensureDialog() {
  let dlg = document.getElementById('taskDlg');
  if (dlg) return dlg;
  dlg = document.createElement('dialog');
  dlg.id = 'taskDlg';
  dlg.className = 'dlg';
  document.body.appendChild(dlg);
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  return dlg;
}

function openTask(id) {
  const p = plan();
  const t = id ? p.items.find(x => x.id === id) : {
    title: '', prio: 'P2', owner: (p.items.find(x => x.owner) || {}).owner || '', status: 'Pas commencé',
    start: todayISO(), end: '', step: '', deliverable: '', notes: '', board: taskUI.board !== 'all' ? taskUI.board : (p.boards[0] || {}).id,
  };
  if (!t) return;
  if (!p.boards.length) { p.boards.push({ id: 'b_' + Date.now().toString(36), name: 'Mes tâches' }); t.board = p.boards[0].id; }
  const owners = [...new Set(p.items.map(x => x.owner).filter(Boolean))];
  const dlg = ensureDialog();
  dlg.innerHTML = `<form method="dialog" id="taskForm">
    <div class="row"><h2 style="margin:0">${id ? '✎ Modifier la tâche' : '＋ Nouvelle tâche'}</h2><span class="spacer"></span><button type="button" class="btn small ghost" data-dlg-close>✕</button></div>
    <div class="field" style="margin-top:12px"><label>Tâche *</label><textarea class="inp" name="title" rows="2" required>${esc(t.title)}</textarea></div>
    <div class="fields" style="margin-top:12px">
      <div class="field"><label>Priorité</label><select class="inp" name="prio">${TASK_PRIOS.map(x => `<option value="${x.id}" ${x.id === t.prio ? 'selected' : ''}>${x.icon} ${x.id} · ${x.label} (+${x.xp} XP)</option>`).join('')}</select></div>
      <div class="field"><label>État</label><select class="inp" name="status">${TASK_STATUSES.map(x => `<option ${x.id === t.status ? 'selected' : ''}>${x.id}</option>`).join('')}</select></div>
      <div class="field"><label>Propriétaire</label><input class="inp" name="owner" list="ownerList" value="${esc(t.owner)}"><datalist id="ownerList">${owners.map(o => `<option value="${esc(o)}">`).join('')}</datalist></div>
      <div class="field"><label>Tableau</label><select class="inp" name="board">${p.boards.map(b => `<option value="${b.id}" ${b.id === t.board ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Date de début</label><input class="inp" type="date" name="start" value="${t.start || ''}"></div>
      <div class="field"><label>Date de fin</label><input class="inp" type="date" name="end" value="${t.end || ''}"></div>
    </div>
    <div class="field" style="margin-top:12px"><label>Étape (prochaine action)</label><textarea class="inp" name="step" rows="2">${esc(t.step)}</textarea></div>
    <div class="field" style="margin-top:12px"><label>Livrable</label><input class="inp" name="deliverable" value="${esc(t.deliverable)}"></div>
    <div class="field" style="margin-top:12px"><label>Notes</label><textarea class="inp" name="notes" rows="3">${esc(t.notes)}</textarea></div>
    <div class="row" style="margin-top:16px">
      ${id ? `<button type="button" class="btn danger small" data-task-del="${id}">🗑 Supprimer</button><button type="button" class="btn small ghost" data-task-dup="${id}">⧉ Dupliquer</button>` : ''}
      <span class="spacer"></span>
      <button type="button" class="btn ghost" data-dlg-close>Annuler</button>
      <button type="submit" class="btn primary">💾 Enregistrer</button>
    </div>
  </form>`;
  dlg.querySelector('#taskForm').addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const data = Object.fromEntries(TASK_KEYS.map(k => [k, (f.get(k) || '').toString().trim()]));
    data.board = f.get('board');
    if (!data.title) return;
    if (data.start && data.end && data.end < data.start) { toast('⚠️', 'Dates incohérentes', 'La date de fin est avant la date de début.', true); return; }
    if (id) {
      const prevStatus = t.status;
      Object.assign(t, data);
      delete t.example;
      setStatus(t, data.status, prevStatus);
    } else {
      const nt = { id: newTaskId(), doneAt: null, ...data };
      p.items.push(nt);
      setStatus(nt, data.status, null);
    }
    dlg.close();
    commit();
  });
  dlg.showModal();
  setTimeout(() => dlg.querySelector('[name=title]').focus(), 30);
}

function setStatus(t, status, prev) {
  t.status = status;
  if (status === 'Terminé' && prev !== 'Terminé') {
    t.doneAt = todayISO();
    delete t.noXp;
    const p = prioOf(t.prio) || TASK_PRIOS[3];
    const ontime = t.end && t.doneAt <= t.end;
    toast('🏁', 'Tâche terminée !', `${t.title.slice(0, 60)} · +${p.xp + (ontime ? 5 : 0)} XP${ontime ? ' (dans les délais)' : ''}`);
  } else if (status !== 'Terminé') t.doneAt = null;
}

// ————— Import / export Excel —————
function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = XLSX_URL;
    s.onload = () => res(window.XLSX);
    s.onerror = () => rej(new Error('xlsx'));
    document.head.appendChild(s);
  });
}
const isoFromDate = d => {
  const x = new Date(d.getTime() + 12 * 3600e3);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
function parseDateCell(v) {
  if (!v) return '';
  if (v instanceof Date && !isNaN(v)) return isoFromDate(v);
  const m = String(v).trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(String(v))) return String(v).slice(0, 10);
  return '';
}
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

async function exportTasksXLSX() {
  let X;
  try { X = await loadXLSX(); } catch (e) { return toast('⚠️', 'Export impossible', 'Connexion internet requise pour générer le fichier Excel.', true); }
  const wb = X.utils.book_new();
  const p = plan();
  const used = new Set();
  for (const b of p.boards) {
    const rows = p.items.filter(t => t.board === b.id).map(t => TASK_KEYS.map(k => ((k === 'start' || k === 'end') && t[k] ? new Date(t[k] + 'T12:00:00') : t[k] || '')));
    const ws = X.utils.aoa_to_sheet([TASK_COLS, ...rows], { cellDates: true, dateNF: 'dd/mm/yyyy' });
    ws['!cols'] = [{ wch: 45 }, { wch: 9 }, { wch: 16 }, { wch: 13 }, { wch: 12 }, { wch: 12 }, { wch: 40 }, { wch: 20 }, { wch: 40 }];
    let name = b.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim() || 'Tableau';
    while (used.has(name)) name = name.slice(0, 28) + ' ' + (used.size + 1);
    used.add(name);
    X.utils.book_append_sheet(wb, ws, name);
  }
  if (!p.boards.length) X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([TASK_COLS]), 'Tâches');
  X.writeFile(wb, `DS_CORDO_planning_taches_${todayISO()}.xlsx`, { cellDates: true });
}

async function importTasksXLSX(file) {
  if (!file) return;
  let X;
  try { X = await loadXLSX(); } catch (e) { return toast('⚠️', 'Import impossible', 'Connexion internet requise pour lire le fichier Excel.', true); }
  try {
    const wb = X.read(await file.arrayBuffer(), { cellDates: true });
    const boards = [];
    for (const name of wb.SheetNames) {
      const rows = X.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' });
      const hi = rows.findIndex(r => r.some(c => norm(c) === 'tache'));
      if (hi < 0) continue;
      const head = rows[hi].map(norm);
      const col = TASK_COLS.map(c => head.indexOf(norm(c)));
      const items = rows.slice(hi + 1).filter(r => String(r[col[0]] || '').trim()).map(r => {
        const t = {};
        TASK_KEYS.forEach((k, i) => { const v = col[i] >= 0 ? r[col[i]] : ''; t[k] = k === 'start' || k === 'end' ? parseDateCell(v) : String(v ?? '').trim(); });
        if (!TASK_PRIOS.some(p => p.id === t.prio.toUpperCase())) t.prio = ''; else t.prio = t.prio.toUpperCase();
        const st = TASK_STATUSES.find(s => norm(s.id) === norm(t.status));
        t.status = st ? st.id : 'Pas commencé';
        return t;
      });
      if (items.length) boards.push({ name: name.trim(), items });
    }
    const total = boards.reduce((s, b) => s + b.items.length, 0);
    if (!total) return toast('⚠️', 'Aucune tâche trouvée', 'Le fichier doit contenir une colonne « Tâche » (même modèle que le planning Excel).', true);
    if (!confirm(`Importer ${total} tâche(s) réparties dans ${boards.length} tableau(x) : ${boards.map(b => b.name).join(', ')} ?`)) return;
    const p = plan();
    for (const b of boards) {
      let name = b.name, i = 2;
      while (p.boards.some(x => x.name === name)) name = `${b.name} (${i++})`;
      const id = 'b_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      p.boards.push({ id, name });
      for (const t of b.items) p.items.push({ id: newTaskId(), board: id, doneAt: t.status === 'Terminé' ? (t.end || todayISO()) : null, ...(t.status === 'Terminé' ? { noXp: true } : {}), ...t });
    }
    toast('⬆', 'Planning importé', `${total} tâches ajoutées`, true);
    commit();
  } catch (e) {
    toast('⚠️', 'Fichier illisible', 'Choisissez un fichier Excel (.xlsx).', true);
  }
}

// ————— Événements —————
document.addEventListener('click', e => {
  const t = e.target.closest('[data-task-new],[data-task-edit],[data-task-del],[data-task-dup],[data-dlg-close],[data-board-sel],[data-board-new],[data-board-rename],[data-board-del],[data-tview],[data-xlsx],[data-task-clear-examples]');
  if (!t) return;
  const d = t.dataset, p = plan();
  if (d.taskNew != null) return openTask(null);
  if (d.taskEdit) { e.preventDefault(); if (taskUI.dragId) return; return openTask(d.taskEdit); }
  if (d.dlgClose != null) return document.getElementById('taskDlg').close();
  if (d.taskDel) {
    if (!confirm('Supprimer définitivement cette tâche ?')) return;
    p.items = p.items.filter(x => x.id !== d.taskDel);
    document.getElementById('taskDlg').close();
    return commit();
  }
  if (d.taskDup) {
    const src = p.items.find(x => x.id === d.taskDup);
    const copy = { ...src, id: newTaskId(), title: src.title + ' (copie)', status: 'Pas commencé', doneAt: null };
    delete copy.example;
    p.items.push(copy);
    document.getElementById('taskDlg').close();
    commit();
    return setTimeout(() => openTask(copy.id), 50);
  }
  if (d.boardSel) { taskUI.board = d.boardSel; return render(); }
  if (d.boardNew != null) {
    const name = prompt('Nom du nouveau tableau (ex. « Janvier – Mars », « Communication »…) :');
    if (!name || !name.trim()) return;
    const id = 'b_' + Date.now().toString(36);
    p.boards.push({ id, name: name.trim() });
    taskUI.board = id;
    return commit();
  }
  if (d.boardRename != null) {
    const b = p.boards.find(x => x.id === taskUI.board);
    const name = prompt('Nouveau nom du tableau :', b.name);
    if (!name || !name.trim()) return;
    b.name = name.trim();
    return commit();
  }
  if (d.boardDel != null) {
    const b = p.boards.find(x => x.id === taskUI.board);
    const n = p.items.filter(x => x.board === b.id).length;
    if (!confirm(`Supprimer le tableau « ${b.name} » et ses ${n} tâche(s) ?`)) return;
    p.boards = p.boards.filter(x => x.id !== b.id);
    p.items = p.items.filter(x => x.board !== b.id);
    taskUI.board = 'all';
    return commit();
  }
  if (d.tview) { taskUI.view = d.tview; return render(); }
  if (d.xlsx === 'export') return exportTasksXLSX();
  if (d.taskClearExamples != null) {
    if (!confirm('Supprimer toutes les tâches et tableaux d’exemple ?')) return;
    const exBoards = new Set(EXAMPLE_TASKS.boards.map(b => b.id));
    p.items = p.items.filter(x => !x.example);
    p.boards = p.boards.filter(b => !exBoards.has(b.id) || p.items.some(x => x.board === b.id));
    if (!p.boards.length) p.boards.push({ id: 'b_' + Date.now().toString(36), name: 'Mes tâches' });
    taskUI.board = 'all';
    return commit();
  }
});

document.addEventListener('change', e => {
  const t = e.target, d = t.dataset;
  if (t.id === 'taskImport') { importTasksXLSX(t.files[0]); t.value = ''; return; }
  if (d.taskStatus) {
    const task = plan().items.find(x => x.id === d.taskStatus);
    const prev = task.status;
    delete task.example;
    setStatus(task, t.value, prev);
    return commit();
  }
  if (d.tfilter === 'hideDone') { taskUI.hideDone = t.checked; return render(); }
  if (d.tfilter && d.tfilter !== 'q') { taskUI[d.tfilter] = t.value; return render(); }
});
document.addEventListener('input', e => {
  if (e.target.dataset && e.target.dataset.tfilter === 'q') { taskUI.q = e.target.value; render(); }
});

// Glisser-déposer entre les colonnes du Kanban
document.addEventListener('dragstart', e => {
  const card = e.target.closest && e.target.closest('[data-task-id]');
  if (!card) return;
  taskUI.dragId = card.dataset.taskId;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', taskUI.dragId);
  setTimeout(() => card.classList.add('dragging'), 0);
});
document.addEventListener('dragend', () => {
  document.querySelectorAll('.dragging,.drop-on').forEach(x => x.classList.remove('dragging', 'drop-on'));
  setTimeout(() => { taskUI.dragId = null; }, 50);
});
document.addEventListener('dragover', e => {
  const col = e.target.closest && e.target.closest('[data-drop-status]');
  if (!col || !taskUI.dragId) return;
  e.preventDefault();
  document.querySelectorAll('.drop-on').forEach(x => x !== col && x.classList.remove('drop-on'));
  col.classList.add('drop-on');
});
document.addEventListener('drop', e => {
  const col = e.target.closest && e.target.closest('[data-drop-status]');
  if (!col || !taskUI.dragId) return;
  e.preventDefault();
  const task = plan().items.find(x => x.id === taskUI.dragId);
  if (task && task.status !== col.dataset.dropStatus) {
    const prev = task.status;
    delete task.example;
    setStatus(task, col.dataset.dropStatus, prev);
    commit();
  }
});
