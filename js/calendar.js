// Onglet « Calendrier commercial » : les temps forts de l'année (fête des mères, Noël, soldes…),
// la période de préparation de chacun et la création d'une tâche de préparation dans le planning.

const CAL_BOARD = { id: 'b_temps_forts', name: '📅 Temps commerciaux' };
const calUI = { showAll: false };
const cal = () => state.calendar;
const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const atNoon = iso => new Date(iso + 'T12:00:00');
const plusDays = (iso, n) => { const d = atNoon(iso); d.setDate(d.getDate() + n); return ymd(d); };
const daysBetween = (a, b) => Math.round((atNoon(b) - atNoon(a)) / 86400000);

// Dimanche de Pâques (algorithme de Meeus / Jones / Butcher)
function easterDate(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day, 12);
}
// n-ième jour de semaine wd du mois m (n = -1 : le dernier)
function nthWeekday(y, m, wd, n) {
  if (n > 0) {
    const d = new Date(y, m - 1, 1, 12);
    d.setDate(1 + ((wd - d.getDay() + 7) % 7) + (n - 1) * 7);
    return d;
  }
  const d = new Date(y, m, 0, 12);
  d.setDate(d.getDate() - ((d.getDay() - wd + 7) % 7));
  return d;
}
function eventDateISO(ev, y) {
  const r = ev.rule || {};
  if (r.from && y < r.from) return null; // ex. 1er anniversaire de l'atelier en 2027
  let d;
  if (r.type === 'fixed') d = new Date(y, r.m - 1, r.d, 12);
  else if (r.type === 'nth') d = nthWeekday(y, r.m, r.wd, r.n);
  else if (r.type === 'easter') { d = easterDate(y); d.setDate(d.getDate() + (r.off || 0)); }
  // soldes d'hiver : 2e mercredi de janvier, avancé au 1er si le 2e tombe après le 12
  else if (r.type === 'soldesHiver') { d = nthWeekday(y, 1, 3, 2); if (d.getDate() > 12) d = nthWeekday(y, 1, 3, 1); }
  // soldes d'été : dernier mercredi de juin, avancé à l'avant-dernier s'il tombe après le 28
  else if (r.type === 'soldesEte') { d = nthWeekday(y, 6, 3, -1); if (d.getDate() > 28) d.setDate(d.getDate() - 7); }
  else if (r.type === 'blackfriday') { d = nthWeekday(y, 11, 4, 4); d.setDate(d.getDate() + 1); }
  else if (r.type === 'mothers') {
    // dernier dimanche de mai, sauf s'il tombe le jour de la Pentecôte : premier dimanche de juin
    d = nthWeekday(y, 5, 0, -1);
    const pentecote = easterDate(y); pentecote.setDate(pentecote.getDate() + 49);
    if (ymd(d) === ymd(pentecote)) d = nthWeekday(y, 6, 0, 1);
  } else if (r.type === 'once') return r.date && Number(r.date.slice(0, 4)) === y ? r.date : null;
  return d ? ymd(d) : null;
}

// Prochaines occurrences de tous les temps forts actifs (de 15 jours en arrière à 12 mois devant)
function upcomingEvents(horizon = 365) {
  const today = todayISO(), y = Number(today.slice(0, 4));
  const list = [];
  for (const ev of cal().events) {
    if (ev.off) continue;
    for (const yy of [y - 1, y, y + 1, y + 2]) {
      const date = eventDateISO(ev, yy);
      if (!date) continue;
      const end = plusDays(date, Math.max(0, (ev.days || 1) - 1));
      const dIn = daysBetween(today, date);
      if (daysBetween(today, end) < -15 || dIn > horizon) continue;
      const prepStart = plusDays(date, -(ev.lead || 0));
      const status = daysBetween(today, end) < 0 ? 'past' : dIn <= 0 ? 'now' : today >= prepStart ? 'prep' : 'later';
      list.push({ ev, date, end, prepStart, dIn, status, key: `${ev.id}@${date}` });
    }
  }
  return list.sort((a, b) => a.date.localeCompare(b.date));
}
const calTaskFor = key => state.planning.items.find(t => t.calKey === key);

function fmtLong(iso) {
  const d = atNoon(iso);
  return `${WEEKDAYS[d.getDay()]} ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`;
}
function countdown(o) {
  if (o.status === 'past') return '<span class="tag">Passé</span>';
  if (o.status === 'now') return '<span class="tag gold">🎉 En ce moment</span>';
  if (o.status === 'prep') return `<span class="tag warn">📣 À préparer · J-${o.dIn}</span>`;
  return `<span class="tag info">J-${o.dIn}</span>`;
}

function calEventCard(o) {
  const t = calTaskFor(o.key);
  const fams = (o.ev.fam || []).map(id => FAMILIES.find(f => f.id === id)).filter(Boolean);
  return `<div class="cal-ev st-${o.status}">
    <div class="cal-date"><div class="cal-day">${atNoon(o.date).getDate()}</div><div class="cal-mon">${atNoon(o.date).toLocaleDateString('fr-FR', { month: 'short' })}</div></div>
    <div class="cal-body">
      <div class="row" style="gap:8px"><span class="cal-name">${esc(o.ev.icon)} ${esc(o.ev.name)}</span>${countdown(o)}
        <span class="spacer"></span><button class="rw-edit" style="position:static" data-cal-edit="${o.ev.id}" title="Modifier">✎</button></div>
      <div class="muted" style="font-size:12px">${fmtLong(o.date)}${o.ev.days > 1 ? ` → ${fmtLong(o.end)}` : ''} · préparation dès le ${atNoon(o.prepStart).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} (${o.ev.lead} j avant)</div>
      ${o.ev.idea ? `<div class="cal-idea">💡 ${esc(o.ev.idea)}</div>` : ''}
      <div class="row" style="gap:6px;margin-top:6px">
        ${fams.map(f => `<span class="tag">${esc(f.short)}</span>`).join('')}
        <span class="spacer"></span>
        ${o.status === 'past' ? '' : t
          ? `<a href="#planning" class="tag ${t.status === 'Terminé' ? 'ok' : 'info'}" style="text-decoration:none" data-task-edit="${t.id}">${t.status === 'Terminé' ? '✔ Préparation faite' : '📋 Tâche : ' + esc(t.status)}</a>`
          : `<button class="btn small" data-cal-task="${o.key}">＋ Tâche de préparation</button>`}
      </div>
    </div>
  </div>`;
}

function viewCalendrier() {
  const list = upcomingEvents(calUI.showAll ? 730 : 365);
  const future = list.filter(o => o.status !== 'past');
  const next = future[0];
  const prep = future.filter(o => o.status === 'prep' || o.status === 'now');
  const months = [];
  for (const o of list) {
    const k = o.date.slice(0, 7);
    let g = months.find(x => x.k === k);
    if (!g) months.push(g = { k, items: [] });
    g.items.push(o);
  }
  const off = cal().events.filter(e => e.off);
  return `
  <div class="page-head">
    <div><h1>Calendrier commercial</h1><div class="sub">Les temps forts de l'année pour la cordonnerie, les clés et la maroquinerie : dates, période de préparation, idées d'actions.</div></div>
    <div class="row"><button class="btn primary" data-cal-new>＋ Ajouter un temps fort</button></div>
  </div>

  <div class="grid g3" style="margin-bottom:16px">
    <div class="card glow-pink kpi"><div class="k-label">🎯 Prochain temps fort</div>
      ${next ? `<div class="k-val" style="font-size:20px">${esc(next.ev.icon)} ${esc(next.ev.name)}</div><div class="k-sub">${fmtLong(next.date)} · ${next.dIn > 0 ? 'dans ' + next.dIn + ' jour' + (next.dIn > 1 ? 's' : '') : 'en ce moment'}</div>` : '<div class="k-sub">Aucun</div>'}</div>
    <div class="card kpi"><div class="k-label">📣 À préparer maintenant</div><div class="k-val ${prep.length ? '' : 'pos'}">${prep.length}</div>
      <div class="k-sub">${prep.length ? prep.map(o => esc(o.ev.name)).join(', ') : 'Rien à lancer pour le moment'}</div></div>
    <div class="card kpi"><div class="k-label">📋 Préparations dans le planning</div><div class="k-val">${future.filter(o => calTaskFor(o.key)).length} / ${future.length}</div>
      <div class="k-sub">tâches créées pour les temps forts à venir</div></div>
  </div>

  ${prep.filter(o => !calTaskFor(o.key)).length ? `<div class="alert warn">📣 <div><b>${prep.filter(o => !calTaskFor(o.key)).map(o => esc(o.ev.name)).join(', ')}</b> : c'est le moment de préparer (vitrine, offre, communication). <button class="btn small" data-cal-task-all>＋ Créer les tâches de préparation</button></div></div>` : ''}

  <div class="cal-months">
    ${months.map(g => `<div class="cal-month">
      <h2>${atNoon(g.k + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }).replace(/^./, c => c.toUpperCase())}</h2>
      ${g.items.map(calEventCard).join('')}
    </div>`).join('')}
  </div>

  <div class="row" style="margin-top:16px">
    <button class="btn small ghost" data-cal-horizon>${calUI.showAll ? 'Afficher 12 mois' : 'Afficher 24 mois'}</button>
    ${off.length ? `<span class="muted">Masqués : ${off.map(e => `<a href="#calendrier" data-cal-edit="${e.id}">${esc(e.icon)} ${esc(e.name)}</a>`).join(', ')}</span>` : ''}
  </div>
  <p class="muted" style="font-size:12px">Dates calculées automatiquement chaque année (fête des mères, Pâques, Black Friday, soldes…). Soldes : dates nationales, à vérifier pour le Var. Le ✎ permet de modifier un temps fort, de changer sa période de préparation ou de le masquer.</p>`;
}

// Carte du QG
function qgCalendarCard() {
  const future = upcomingEvents(120).filter(o => o.status !== 'past').slice(0, 4);
  return `<div class="card">
    <div class="row"><h2 style="margin:0">📅 Prochains temps forts</h2><span class="spacer"></span><a class="btn small ghost" href="#calendrier">Calendrier ▶</a></div>
    <div style="margin-top:10px">${future.length ? future.map(o => `<div class="sum-line"><span>${esc(o.ev.icon)} <b>${esc(o.ev.name)}</b> <span class="dim">— ${atNoon(o.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span></span>${countdown(o)}</div>`).join('') : '<p class="muted">Aucun temps fort dans les 4 prochains mois.</p>'}</div>
  </div>`;
}

function createPrepTask(key) {
  const o = upcomingEvents(730).find(x => x.key === key);
  if (!o || calTaskFor(key)) return null;
  const p = state.planning;
  if (!p.boards.some(b => b.id === CAL_BOARD.id)) p.boards.push({ ...CAL_BOARD });
  const today = todayISO();
  const t = {
    id: newTaskId(), board: CAL_BOARD.id, calKey: key,
    title: `${o.ev.icon} Préparer : ${o.ev.name} (${atNoon(o.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })})`,
    prio: o.dIn <= 21 ? 'P1' : 'P2', owner: (p.items.find(x => x.owner) || {}).owner || 'Déborah', status: 'Pas commencé',
    start: o.prepStart < today ? today : o.prepStart, end: plusDays(o.date, -1),
    step: o.ev.idea || '', deliverable: 'Offre, vitrine et communication prêtes', notes: `Temps fort du ${fmtLong(o.date)}`, repeat: '', doneAt: null,
  };
  if (t.end < t.start) t.end = o.date;
  p.items.push(t);
  return t;
}

function openCalEvent(id) {
  const ev = id ? cal().events.find(e => e.id === id) : { icon: '⭐', name: '', rule: { type: 'fixed', m: 1, d: 1 }, lead: 14, idea: '', fam: [] };
  if (!ev) return;
  const editableDate = !id || ev.rule.type === 'fixed' || ev.rule.type === 'once';
  const r = ev.rule;
  let dlg = document.getElementById('calDlg');
  if (!dlg) {
    dlg = document.createElement('dialog'); dlg.id = 'calDlg'; dlg.className = 'dlg';
    document.body.appendChild(dlg);
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  }
  const nextOcc = id ? upcomingEvents(730).find(o => o.ev.id === id && o.status !== 'past') : null;
  dlg.innerHTML = `<form id="calForm">
    <div class="row"><h2 style="margin:0">${id ? '✎ Modifier le temps fort' : '＋ Nouveau temps fort'}</h2><span class="spacer"></span><button type="button" class="btn small ghost" data-cal-close>✕</button></div>
    <div class="fields" style="margin-top:12px">
      <div class="field"><label>Icône</label><input class="inp" name="icon" maxlength="4" value="${esc(ev.icon)}"></div>
      <div class="field" style="grid-column:span 2"><label>Nom *</label><input class="inp" name="name" required value="${esc(ev.name)}"></div>
    </div>
    ${editableDate ? `<div class="fields" style="margin-top:12px">
      <div class="field"><label>Revient</label><select class="inp" name="kind"><option value="fixed" ${r.type !== 'once' ? 'selected' : ''}>Chaque année à la même date</option><option value="once" ${r.type === 'once' ? 'selected' : ''}>Une seule fois</option></select></div>
      <div class="field"><label>Date</label><input class="inp" type="date" name="date" required value="${r.type === 'once' ? r.date : (nextOcc ? nextOcc.date : `${todayISO().slice(0, 4)}-${String(r.m).padStart(2, '0')}-${String(r.d).padStart(2, '0')}`)}"></div>
    </div>` : `<p class="muted" style="margin:12px 0 0">📆 Date calculée automatiquement chaque année${nextOcc ? ` — prochaine : <b>${fmtLong(nextOcc.date)}</b>` : ''}.</p>`}
    <div class="fields" style="margin-top:12px">
      <div class="field"><label>Préparation (jours avant)</label><input class="inp" type="number" min="0" max="120" name="lead" value="${ev.lead || 0}"></div>
      <div class="field"><label>Durée (jours)</label><input class="inp" type="number" min="1" max="60" name="days" value="${ev.days || 1}"></div>
    </div>
    <div class="field" style="margin-top:12px"><label>Idée d'action</label><textarea class="inp" name="idea" rows="3">${esc(ev.idea || '')}</textarea></div>
    <div class="field" style="margin-top:12px"><label>Familles concernées</label><div class="row" style="gap:6px">${FAMILIES.map(f => `<label class="tag" style="cursor:pointer"><input type="checkbox" name="fam" value="${f.id}" ${(ev.fam || []).includes(f.id) ? 'checked' : ''}> ${esc(f.short)}</label>`).join('')}</div></div>
    <div class="row" style="margin-top:16px">
      ${id ? `<label class="check" style="border:0;padding:0"><input type="checkbox" name="off" ${ev.off ? 'checked' : ''}><span>Masquer ce temps fort</span></label>
        <button type="button" class="btn danger small" data-cal-del="${id}">🗑 Supprimer</button>` : ''}
      <span class="spacer"></span>
      <button type="button" class="btn ghost" data-cal-close>Annuler</button>
      <button type="submit" class="btn primary">💾 Enregistrer</button>
    </div>
  </form>`;
  dlg.querySelector('#calForm').addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const data = {
      icon: (f.get('icon') || '⭐').toString().trim() || '⭐',
      name: f.get('name').toString().trim(),
      lead: Math.max(0, Math.round(Number(f.get('lead')) || 0)),
      days: Math.max(1, Math.round(Number(f.get('days')) || 1)),
      idea: f.get('idea').toString().trim(),
      fam: f.getAll('fam'),
      off: f.get('off') === 'on',
    };
    if (!data.name) return;
    if (editableDate) {
      const date = f.get('date');
      if (!date) return;
      data.rule = f.get('kind') === 'once' ? { type: 'once', date } : { type: 'fixed', m: Number(date.slice(5, 7)), d: Number(date.slice(8, 10)), ...(ev.rule && ev.rule.from ? { from: ev.rule.from } : {}) };
    }
    if (id) Object.assign(ev, data);
    else cal().events.push({ id: 'c_' + Date.now().toString(36), ...data });
    dlg.close();
    commit();
  });
  dlg.showModal();
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-cal-new],[data-cal-edit],[data-cal-task],[data-cal-task-all],[data-cal-close],[data-cal-del],[data-cal-horizon]');
  if (!t) return;
  const d = t.dataset;
  if (d.calNew != null) return openCalEvent(null);
  if (d.calEdit) { e.preventDefault(); return openCalEvent(d.calEdit); }
  if (d.calClose != null) return document.getElementById('calDlg').close();
  if (d.calHorizon != null) { calUI.showAll = !calUI.showAll; return render(); }
  if (d.calTask) {
    const task = createPrepTask(d.calTask);
    if (task) toast('📋', 'Tâche de préparation créée', `${task.title} · dans « ${CAL_BOARD.name} »`, true);
    return commit();
  }
  if (d.calTaskAll != null) {
    const created = upcomingEvents(365).filter(o => (o.status === 'prep' || o.status === 'now') && !calTaskFor(o.key)).map(o => createPrepTask(o.key)).filter(Boolean);
    if (created.length) toast('📋', `${created.length} tâche${created.length > 1 ? 's' : ''} de préparation créée${created.length > 1 ? 's' : ''}`, `Dans « ${CAL_BOARD.name} »`, true);
    return commit();
  }
  if (d.calDel) {
    if (!confirm('Supprimer ce temps fort du calendrier ?')) return;
    cal().events = cal().events.filter(x => x.id !== d.calDel);
    if (DEFAULT_CAL_EVENTS.some(x => x.id === d.calDel)) cal().removed.push(d.calDel);
    document.getElementById('calDlg').close();
    return commit();
  }
});
