// Interface de l'application « Quête de Trésorerie » — DS CORDO
const STORE_KEY = 'dscordo-tresorerie-v1';
const $ = (sel, root = document) => root.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let state = load();
let calc, xp;
let ui = { view: 'qg', month: Math.min(state.closed, 11), planMode: 'prev', charts: [] };

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return normalizeState(JSON.parse(raw));
  } catch (e) { /* stockage indisponible : on repart des valeurs par défaut */ }
  return defaultState();
}
function save() {
  state.updatedAt = new Date().toISOString();
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignoré */ }
  scheduleSync();
}
function recompute() {
  calc = compute(state);
  xp = computeXP(state, calc);
}

// Enregistre, recalcule et célèbre les nouveaux succès / niveaux
function commit(rerender = true) {
  const before = xp ? xp.lvl : null;
  const affBefore = xp ? affordableRewards().map(r => r.id) : [];
  save();
  recompute();
  const newlyAff = affordableRewards().filter(r => !affBefore.includes(r.id));
  if (xp && affBefore && newlyAff.length) setTimeout(() => toast('🎁', 'Nouvelle récompense accessible !', newlyAff.map(r => r.name).join(', ')), 700);
  const fresh = xp.ach.filter(a => a.ok && !state.seenAch.includes(a.id));
  if (fresh.length) {
    state.seenAch.push(...fresh.map(a => a.id));
    save();
    fresh.forEach((a, i) => setTimeout(() => toast(a.icon, 'Succès débloqué : ' + a.name, `${a.desc} · +${a.xp} XP`), i * 500));
    celebrate();
  }
  if (before && xp.lvl > before) {
    setTimeout(() => toast('⭐', `Niveau ${xp.lvl} atteint !`, xp.title), 300);
    celebrate(true);
  }
  if (rerender) setTimeout(render, 0);
}

function celebrate(big) {
  if (typeof confetti !== 'function') return;
  confetti({ particleCount: big ? 180 : 90, spread: big ? 100 : 70, origin: { y: .7 },
    colors: ['#ff4fd8', '#3ee8ff', '#ffcc3d', '#45f0a0', '#8b6cff'] });
}

function toast(icon, title, desc, plain) {
  const el = document.createElement('div');
  el.className = 'toast' + (plain ? ' plain' : '');
  el.innerHTML = `<div class="t-ic">${icon}</div><div><div class="t-t">${esc(title)}</div><div class="t-d">${esc(desc || '')}</div></div>`;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; }, 3800);
  setTimeout(() => el.remove(), 4300);
}

// ————— Helpers d'affichage —————
const cls = v => (v > 0.005 ? 'pos' : v < -0.005 ? 'neg' : 'muted');
const clsDec = v => (v > 0.005 ? 'neg' : v < -0.005 ? 'pos' : 'muted'); // décaissement : + = dépense en plus
const pct = (a, b) => (b ? Math.max(0, Math.min(1, a / b)) : 0);
function bar(kind, ratio, big) {
  return `<div class="bar ${kind}${big ? ' big' : ''}"><i style="width:${(Math.max(0, Math.min(1, ratio)) * 100).toFixed(1)}%"></i></div>`;
}
function hpClass(v) { return v < 0 ? 'bad' : v < state.hyp.seuilAlerte ? 'warn' : ''; }
function alertTag(a) { return `<span class="tag ${a === 'OK' ? 'ok' : a === 'Vigilance' ? 'warn' : 'bad'}">${a}</span>`; }
function numInput(attrs, value, placeholder, extraCls = '') {
  const v = value == null ? '' : String(Math.round(value * 100) / 100).replace('.', ',');
  return `<input class="num ${extraCls}" inputmode="decimal" ${attrs} value="${v}" placeholder="${esc(placeholder ?? '')}">`;
}
const BOSSES = [
  { name: 'Le Dragon du Lancement', icon: '🐉' },
  { name: 'Le Golem des Marges', icon: '🗿' },
  { name: "L'Hydre de l'Été", icon: '🐍' },
  { name: 'Le Titan des 75 k€', icon: '👹' },
];
const QUARTER_LABELS = ['T1 · Nov. → Janv.', 'T2 · Févr. → Avr.', 'T3 · Mai → Juil.', 'T4 · Août → Oct.'];

function currentTreso() { return calc.n === 0 ? state.hyp.tresoInitiale : calc.R[calc.n - 1].fin; }

function playerCard(compact) {
  const span = xp.next ? xp.next - xp.cur : 1;
  const into = xp.total - xp.cur;
  return `<div class="player">
    <div class="avatar">DS<span class="lvl">${xp.lvl}</span></div>
    <div style="flex:1;min-width:0">
      <div class="player-name">${esc(state.hyp.gerante.split(' ')[0] || 'Déborah')}</div>
      <div class="player-title">${esc(xp.title)}</div>
      ${compact ? '' : `<div class="bar-label"><span>XP <b>${nf0.format(xp.total)}</b></span><span>${xp.next ? `${nf0.format(xp.next - xp.total)} XP → ${esc(xp.nextTitle)}` : 'Niveau max !'}</span></div>`}
      ${bar('xp', xp.next ? into / span : 1)}
      ${compact ? '' : qgRewardsLine()}
    </div>
  </div>`;
}

// ————— Vues —————
const VIEWS = {
  qg: viewQG, mission: viewMission, plan: viewPlan, quetes: viewQuetes,
  familles: viewFamilles, succes: viewSucces, planning: viewPlanning, recompenses: viewRecompenses, reglages: viewReglages, sauvegarde: viewSauvegarde,
};

function render() {
  const active = document.activeElement;
  const focusId = active && active.id;
  const selStart = active && active.selectionStart;
  ui.charts.forEach(c => c.destroy());
  ui.charts = [];
  $('#view').innerHTML = VIEWS[ui.view]();
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.view === ui.view));
  $('#sidePlayer').innerHTML = `<div class="card">${playerCard(true)}<div class="bar-label"><span>XP</span><b>${nf0.format(xp.total)}</b></div><a href="#recompenses" class="bar-label" style="text-decoration:none;margin:0"><span>🎁 Points</span><b style="color:var(--gold)">${nf0.format(xp.points)}</b></a>${syncBadge()}</div>`;
  if (ui.view === 'qg') drawQGCharts();
  if (ui.view === 'familles') drawFamChart();
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) { el.focus(); try { if (selStart != null) el.setSelectionRange(el.value.length, el.value.length); } catch (e) { /* type sans sélection */ } }
  }
}

function viewQG() {
  const h = state.hyp, n = calc.n, c = calc;
  const treso = currentTreso();
  const mNext = n < 12 ? n : null;
  const qIdx = Math.min(3, Math.floor(n / 3));
  const q = c.quarters[qIdx];
  const boss = BOSSES[qIdx];
  const bossHp = q.obj ? Math.max(0, q.obj - q.caReel) / q.obj : 0;
  const deadline = mNext != null ? ritualDeadline(mNext) : null;
  const days = deadline ? Math.ceil((deadline - new Date()) / 86400000) : null;
  const [y, mo] = mNext != null ? MONTH_YM[mNext] : [0, 0];
  const monthEnded = mNext != null && new Date() >= new Date(y, mo + 1, 1);

  const kpis = [
    { l: "Chiffre d'affaires HT", v: c.reelDate.ca, p: c.prevDate.ca, obj: h.caObjectif, s: 'SMART n°01' },
    { l: 'Marge brute', v: c.reelDate.mb, p: c.prevDate.mb, sub: `Taux réel ${fmtP(c.reelDate.tauxMB)} · cible ${fmtP(c.tauxMBCible)}`, s: 'SMART n°04' },
    { l: 'EBE estimé', v: c.reelDate.ebe, p: c.prevDate.ebe, s: 'doit rester > 0' },
    { l: 'Résultat net estimé', v: c.reelDate.resNet, p: c.prevDate.resNet, s: 'après amort. & intérêts' },
    { l: 'Panier moyen HT', v: c.reelDate.panier, p: c.prevDate.panier, dec: true, sub: `Cible T4 : ${fmtE(c.panierCible, true)}`, s: 'SMART n°02' },
    { l: 'Rémunération versée', v: c.reelDate.remu, p: c.prevDate.remu, sub: `Objectif : ${fmtE(h.remuVisee)}/mois`, s: 'SMART n°06' },
  ];
  const vigil = c.alerts.map((a, m) => ({ a, m })).filter(x => x.a !== 'OK');

  return `
  <div class="page-head">
    <div><h1>Quartier général</h1><div class="sub">${esc(h.entreprise)} · ${esc(h.atelier)} · Plan Nov. 2026 → Oct. 2027</div></div>
    <div class="row"><span class="tag info">${n}/12 mois remis au réel</span>${c.checks.length ? `<span class="tag bad">⚠ ${c.checks.length} contrôle(s)</span>` : '<span class="tag ok">✔ Contrôles OK</span>'}</div>
  </div>
  ${h.tresoInitiale === 0 && h.ca2025 === 0 && n === 0 ? `<div class="alert info" style="margin-bottom:16px">👋 <div><b>Bienvenue !</b> Première utilisation sur cet appareil : restaurez votre fichier de sauvegarde (.json) dans <a href="#sauvegarde">Sauvegarde & guide</a> pour charger vos chiffres, ou renseignez-les dans <a href="#reglages">Réglages</a>.</div></div>` : ''}

  <div class="grid g3" style="margin-bottom:16px">
    <div class="card glow-gold">${playerCard()}
      <div class="bar-label" style="margin-top:14px"><span>❤️ Trésorerie (points de vie)</span><b>${fmtE(treso)}</b></div>
      <div class="bar hp big ${hpClass(treso)}"><i style="width:${(pct(treso, Math.max(h.seuilAlerte * 4, treso)) * 100).toFixed(1)}%"></i></div>
      <div class="bar-label"><span>Seuil de vigilance ${fmtE(h.seuilAlerte)}</span><span>${treso < 0 ? '💀 Découvert' : treso < h.seuilAlerte ? '⚠️ Vigilance' : '💚 En forme'}</span></div>
    </div>

    <div class="card glow-pink">
      <h3>⚔️ Prochaine mission</h3>
      ${mNext == null ? `<div class="player-name">Campagne terminée 🎉</div><p class="muted">Les 12 mois sont remis au réel. Place au bilan annuel !</p>` : `
        <div class="player-name">Remise au réel — ${MONTHS[mNext]}</div>
        <p class="muted" style="margin:4px 0 10px">Rituel du 10 : à boucler avant le <b>${deadline.toLocaleDateString('fr-FR')}</b> avec le relevé bancaire, la caisse et Pennylane.</p>
        <div class="row"><div class="countdown">${days >= 0 ? `J-${days}` : `+${-days} j`}</div>
        <span class="tag ${monthEnded ? (days >= 0 ? 'warn' : 'bad') : 'info'}">${monthEnded ? (days >= 0 ? 'Mois écoulé : à saisir' : 'En retard') : 'Mois en cours'}</span></div>
        <div class="row" style="margin-top:12px"><a class="btn primary" href="#mission" data-month="${mNext}">Lancer la mission ▶</a></div>`}
    </div>

    <div class="card boss-card ${q.won ? 'won' : ''}">
      <h3>👾 Boss du trimestre</h3>
      <div class="row"><div class="boss-ic">${boss.icon}</div><div><div class="player-name">${boss.name}</div><div class="muted">${QUARTER_LABELS[qIdx]} · ${fmtE(q.obj)} de CA</div></div></div>
      <div class="bar-label"><span>PV du boss</span><b>${fmtE(Math.max(0, q.obj - q.caReel))}</b></div>
      ${bar('boss', bossHp, true)}
      <div class="bar-label"><span>CA réel ${fmtE(q.caReel)} · ${q.monthsDone}/3 mois</span><span>🤝 ${q.partenaires ?? '?'} / ${q.cible} partenaires</span></div>
      <div class="row" style="margin-top:6px"><span class="tag ${q.won ? 'ok' : q.done ? 'bad' : 'info'}">${q.status}</span><a class="btn small ghost" href="#quetes">Voir les boss</a></div>
    </div>
  </div>

  <div class="grid g3" style="margin-bottom:16px">
    ${kpis.map(k => {
      const ecart = k.v - k.p;
      return `<div class="card kpi">
        <div class="k-label"><span>${k.l}</span><span class="tag">${k.s}</span></div>
        <div class="k-val">${n ? fmtE(k.v, k.dec) : '—'}</div>
        <div class="k-sub">Prévi à date ${fmtE(k.p, k.dec)} ${n ? `· <span class="${cls(ecart)}">${fmtS(Math.round(ecart * 100) / 100)}</span>` : ''}</div>
        ${k.obj ? `<div class="bar-label"><span>Objectif 12 mois</span><b>${fmtP(k.v / k.obj)}</b></div>${bar('prog', k.v / k.obj)}` : ''}
        ${k.sub ? `<div class="k-sub">${k.sub}</div>` : ''}
      </div>`;
    }).join('')}
  </div>

  <div class="grid g2" style="margin-bottom:16px">
    <div class="card"><h2>💧 Trésorerie fin de mois</h2><div class="chart-box"><canvas id="chTreso"></canvas></div></div>
    <div class="card"><h2>📊 CA HT mensuel</h2><div class="chart-box"><canvas id="chCA"></canvas></div></div>
  </div>

  <div class="grid g2">
    <div class="card">
      <h2>🚨 Alertes</h2>
      ${c.checks.map(t => `<div class="alert bad">⚠️ <div>${esc(t)}</div></div>`).join('')}
      ${vigil.length ? vigil.map(x => `<div class="alert ${x.a === 'Découvert' ? 'bad' : 'warn'}">${x.a === 'Découvert' ? '💀' : '⚠️'} <div><b>${MONTHS[x.m]}</b> — ${x.a} : trésorerie ${x.m < n ? 'réelle ou prévue' : 'prévue'} sous ${x.a === 'Découvert' ? '0 €' : fmtE(h.seuilAlerte)}.</div></div>`).join('') : '<div class="alert ok">💚 Aucun mois en vigilance ni en découvert sur le plan.</div>'}
      ${c.prev12.ebe < 0 ? `<div class="alert warn">📉 <div>EBE prévi 12 mois négatif (${fmtE(c.prev12.ebe)}).</div></div>` : ''}
      ${!state.quests.tresoInit ? `<div class="alert info">ℹ️ <div>Trésorerie initiale actuelle : <b>${fmtE(h.tresoInitiale)}</b>. Renseignez le solde banque + caisse au 31/10/2026 dans <a href="#reglages">Réglages</a>, puis cochez la quête « Démarrage ».</div></div>` : ''}
    </div>
    <div class="card">
      <h2>🎯 Objectifs du plan (prévi 12 mois)</h2>
      <div class="sum-line"><span>CA HT prévu / objectif</span><b>${fmtE(c.prev12.ca)} / ${fmtE(h.caObjectif)}</b></div>
      <div class="sum-line"><span>Marge brute prévue</span><b>${fmtE(c.prev12.mb)} (${fmtP(c.prev12.tauxMB)})</b></div>
      <div class="sum-line"><span>EBE prévu</span><b class="${cls(c.prev12.ebe)}">${fmtE(c.prev12.ebe)}</b></div>
      <div class="sum-line"><span>Résultat net estimé</span><b class="${cls(c.prev12.resNet)}">${fmtE(c.prev12.resNet)}</b></div>
      <div class="sum-line"><span>Trésorerie au 31/10/2027 (objectif ≥ ${fmtE(h.tresoObjectif)})</span><b class="${c.prev12.treso >= h.tresoObjectif ? 'pos' : 'neg'}">${fmtE(c.prev12.treso)}</b></div>
      <div class="sum-line"><span>Panier moyen T4 prévu / cible</span><b>${fmtE(c.prev12.panierT4, true)} / ${fmtE(c.panierCible, true)}</b></div>
      <div class="sum-line"><span>Rémunération nette prévue (12 mois)</span><b>${fmtE(c.prev12.remu)}</b></div>
    </div>
  </div>
  <div style="margin-top:16px">${qgTasksCard()}</div>`;
}

function chartDefaults() {
  if (typeof Chart === 'undefined') return false;
  Chart.defaults.color = '#9a93c9';
  Chart.defaults.font.family = 'Inter, sans-serif';
  Chart.defaults.borderColor = 'rgba(47,41,96,.6)';
  return true;
}
const moneyTick = { callback: v => nf0.format(v) + ' €' };
const tipMoney = { callbacks: { label: ctx => `${ctx.dataset.label} : ${fmtE(ctx.parsed.y)}` } };

function drawQGCharts() {
  if (!chartDefaults()) return;
  const n = calc.n;
  ui.charts.push(new Chart($('#chTreso'), {
    type: 'line',
    data: { labels: MONTHS, datasets: [
      { label: 'Prévi', data: calc.P.map(r => r.fin), borderColor: '#8b6cff', backgroundColor: 'rgba(139,108,255,.15)', fill: true, tension: .35, borderDash: [5, 4] },
      { label: 'Réel', data: calc.R.map((r, m) => (m < n ? r.fin : null)), borderColor: '#3ee8ff', backgroundColor: '#3ee8ff', tension: .35, borderWidth: 3, pointRadius: 4 },
      { label: 'Seuil de vigilance', data: MONTHS.map(() => state.hyp.seuilAlerte), borderColor: '#ffa53d', borderWidth: 1.5, pointRadius: 0, borderDash: [2, 3] },
    ] },
    options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { y: { ticks: moneyTick } }, plugins: { tooltip: tipMoney } },
  }));
  ui.charts.push(new Chart($('#chCA'), {
    type: 'bar',
    data: { labels: MONTHS, datasets: [
      { label: 'Prévi', data: calc.P.map(r => r.ca), backgroundColor: 'rgba(139,108,255,.45)', borderRadius: 6 },
      { label: 'Réel', data: calc.R.map((r, m) => (m < n ? r.ca : null)), backgroundColor: '#ff4fd8', borderRadius: 6 },
    ] },
    options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { y: { ticks: moneyTick } }, plugins: { tooltip: tipMoney } },
  }));
}

function monthMap(sel) {
  return `<div class="map">${MONTHS.map((lab, m) => {
    const st = m < calc.n ? 'done' : m === calc.n ? 'current' : 'locked';
    const ic = st === 'done' ? '✅' : st === 'current' ? '⚔️' : '🔒';
    const sub = st === 'done' ? fmtK(calc.R[m].ca) : st === 'current' ? 'mission' : fmtK(calc.P[m].ca);
    return `<div class="node ${st} ${m === sel ? 'sel' : ''} ${m % 3 === 2 ? 'boss' : ''}" data-month="${m}" title="${lab}">
      <div class="n-ic">${ic}</div><div class="n-m">${lab}</div><div class="n-s">${sub}</div></div>`;
  }).join('')}</div>`;
}

function viewMission() {
  const m = ui.month, n = calc.n, h = state.hyp;
  const P = calc.P[m], R = calc.R[m];
  const editable = m <= n;
  const isCurrent = m === n;
  const sectionsHtml = SECTIONS.map(sec => {
    const lines = LINES.filter(l => l.sec === sec.id);
    const isDec = sec.kind === 'dec';
    const rows = lines.map(l => {
      const pv = P.lines[l.id];
      const rv = state.reel[l.id] ? state.reel[l.id][m] : null;
      const ec = (rv ?? 0) - pv;
      return `<tr>
        <td>${esc(l.label)}${l.note ? `<span class="note" title="${esc(l.note)}">ⓘ</span>` : ''}</td>
        <td class="dim">${fmtP(l.tva, l.tva === 0.055 ? 1 : 0)}</td>
        <td>${fmtE(pv, true)}</td>
        <td>${numInput(`id="r_${l.id}_${m}" data-reel="${l.id}" data-m="${m}" ${editable ? '' : 'disabled'}`, rv, editable ? '0' : '', rv != null ? 'filled' : '')}</td>
        <td class="${rv == null ? 'dim' : isDec ? clsDec(ec) : cls(ec)}">${rv == null ? '—' : fmtS(Math.round(ec * 100) / 100)}</td>
      </tr>`;
    }).join('');
    const sp = P.sec[sec.id], sr = R.sec[sec.id];
    const open = isCurrent || sr !== 0;
    return `<details class="sec-block" ${open ? 'open' : ''} data-sec="${sec.id}">
      <summary><span class="chev">▶</span><span>${sec.icon}</span><span style="flex:1">${esc(sec.label)}</span>
        <span class="muted" style="font-family:var(--font);font-size:12px">prévi ${fmtE(sp)} · réel <b style="color:var(--text)">${fmtE(sr)}</b></span></summary>
      <div class="sec-body"><table>
        <thead><tr><th>Poste</th><th>TVA</th><th>Prévi HT</th><th>Réel HT</th><th>Écart</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${editable ? `<div class="row" style="padding:8px 10px"><button class="btn small ghost" data-fillprev="${sec.id}">⤵ Recopier le prévi dans les cases vides</button></div>` : ''}
      </div></details>`;
  }).join('');

  const tickets = state.tickets[m];
  const done = m < n;
  return `
  <div class="page-head">
    <div><h1>Mission du mois — ${MONTHS[m]}</h1>
      <div class="sub">${done ? '✅ Mois remis au réel' : isCurrent ? '⚔️ Mission en cours : saisissez les montants HT encaissés et payés' : '🔒 Mois à venir : prévisionnel seulement'} · ${esc(SAISON_NOTES[m])}</div></div>
    <div class="row">
      <button class="btn" data-month="${Math.max(0, m - 1)}" ${m === 0 ? 'disabled' : ''}>◀</button>
      <button class="btn" data-month="${Math.min(11, m + 1)}" ${m === 11 ? 'disabled' : ''}>▶</button>
    </div>
  </div>
  <div class="card" style="margin-bottom:16px">${monthMap(m)}</div>

  <div class="mission-grid">
    <div>
      ${!editable ? `<div class="alert info">🔒 Ce mois se débloquera après la remise au réel de ${MONTHS[n]}. Le prévisionnel est modifiable dans « Plan 12 mois ».</div>` : ''}
      <div class="card" style="margin-bottom:12px">
        <div class="row">
          <div class="field" style="flex:1;min-width:200px"><label>🧾 Nombre de tickets de caisse (logiciel de caisse)</label>
            <div class="row">${numInput(`id="t_${m}" data-tickets="${m}" ${editable ? '' : 'disabled'}`, tickets, `prévi ${P.tickets}`, tickets != null ? 'filled' : '')}
            <span class="muted">Panier réel : <b style="color:var(--text)">${R.tickets ? fmtE(R.panier, true) : '—'}</b> · prévi ${fmtE(P.panier, true)}</span></div></div>
          <div class="field" style="min-width:200px"><label>🏛️ TVA réellement prélevée (si différente)</label>
            <div class="row">${numInput(`id="tva_${m}" data-tvapay="${m}" ${editable ? '' : 'disabled'}`, state.tvaPayOv[m], `calcul ${nf2.format(R.tvaPayCalc)}`, state.tvaPayOv[m] != null ? 'ov' : '')}</div></div>
        </div>
      </div>
      ${sectionsHtml}
    </div>

    <div class="mission-side">
      <div class="card glow-cyan">
        <h3>📋 Bilan de la mission</h3>
        <div class="bar-label"><span>CA HT réel / prévi</span><b>${fmtE(R.ca)} / ${fmtE(P.ca)}</b></div>
        ${bar('prog', pct(R.ca, P.ca), true)}
        <div style="margin-top:12px">
          ${[
            ['Trésorerie début de mois', R.debut, P.debut],
            ['Encaissements TTC', R.encTTC, P.encTTC],
            ['  dont TVA collectée', R.tvaColl, P.tvaColl],
            ['Décaissements TTC', R.decTTC, P.decTTC],
            ['  dont TVA déductible', R.tvaDed, P.tvaDed],
            ["  dont TVA reversée à l'État", R.tvaPay, P.tvaPay],
            ['Solde du mois', R.solde, P.solde],
          ].map(([l, r, p]) => `<div class="sum-line"><span class="${l.startsWith('  ') ? 'muted' : ''}">${l.trim()}</span><span><b>${fmtE(r)}</b> <span class="dim">/ ${fmtE(p)}</span></span></div>`).join('')}
          <div class="sum-line"><span><b>Trésorerie fin de mois</b></span><span><b class="${R.fin < 0 ? 'neg' : R.fin < h.seuilAlerte ? '' : 'pos'}">${fmtE(R.fin)}</b> <span class="dim">/ ${fmtE(P.fin)}</span></span></div>
        </div>
      </div>
      <div class="card">
        <h3>📈 Indicateurs</h3>
        <div class="sum-line"><span>Marge brute</span><span><b>${fmtE(R.mb)}</b> <span class="dim">/ ${fmtE(P.mb)}</span></span></div>
        <div class="sum-line"><span>Taux de marge brute</span><span><b>${fmtP(R.tauxMB)}</b> <span class="dim">/ ${fmtP(P.tauxMB)}</span></span></div>
        <div class="sum-line"><span>EBE estimé</span><span><b class="${cls(R.ebe)}">${fmtE(R.ebe)}</b> <span class="dim">/ ${fmtE(P.ebe)}</span></span></div>
        <div class="sum-line"><span>Panier moyen</span><span><b>${R.tickets ? fmtE(R.panier, true) : '—'}</b> <span class="dim">/ ${fmtE(P.panier, true)}</span></span></div>
      </div>
      ${isCurrent ? `<div class="card glow-pink">
        <h3>🏁 Terminer la mission</h3>
        <p class="muted" style="margin:0 0 10px">Une fois le relevé bancaire pointé, validez : écarts, cumuls, boss et succès se mettent à jour. Gains : +100 XP, +20 si tickets saisis, +50 si CA ≥ prévi, +30 si tréso ≥ seuil.</p>
        <button class="btn primary" data-close="${m}" style="width:100%;justify-content:center">✅ Valider ${MONTHS[m]} (remis au réel)</button>
      </div>` : ''}
      ${m === n - 1 ? `<button class="btn ghost small" data-reopen="${m}">↩ Rouvrir ${MONTHS[m]} (annuler la remise au réel)</button>` : ''}
    </div>
  </div>`;
}

const PLAN_TOTALS = {
  before: { atelier: 'Sous-total atelier', cles: 'Sous-total clés minute', march: 'Sous-total ventes de marchandises', autresEnc: 'Sous-total autres encaissements',
    achats: 'Sous-total achats consommés', ext: 'Sous-total charges externes', com: 'Sous-total communication', perso: 'Sous-total personnel',
    gerante: 'Sous-total gérante', impots: 'Sous-total impôts & taxes', fin: 'Sous-total financement & investissements' },
};

function viewPlan() {
  const mode = ui.planMode, n = calc.n;
  const P = calc.P, R = calc.R;
  const cellVal = (getP, getR, m) => (mode === 'prev' ? getP(P[m]) : mode === 'reel' ? (m < n ? getR(R[m]) : null) : (m < n ? getR(R[m]) - getP(P[m]) : null));
  const cumCols = (getP, getR, isDec) => {
    const p12 = P.reduce((s, r) => s + getP(r), 0);
    const pd = P.slice(0, n).reduce((s, r) => s + getP(r), 0);
    const rd = R.slice(0, n).reduce((s, r) => s + getR(r), 0);
    return `<td>${fmtE(p12)}</td><td>${fmtE(pd)}</td><td>${n ? fmtE(rd) : '—'}</td><td class="${n ? (isDec ? clsDec(rd - pd) : cls(rd - pd)) : 'dim'}">${n ? fmtS(Math.round(rd - pd)) : '—'}</td>`;
  };
  const stockCols = (getP, getR) => `<td>${fmtE(getP(P[11]))}</td><td>${fmtE(n ? getP(P[n - 1]) : state.hyp.tresoInitiale)}</td><td>${fmtE(n ? getR(R[n - 1]) : state.hyp.tresoInitiale)}</td><td class="${cls(n ? getR(R[n - 1]) - getP(P[n - 1]) : 0)}">${n ? fmtS(Math.round(getR(R[n - 1]) - getP(P[n - 1]))) : '—'}</td>`;
  const fmtCell = (v, isDec) => (v == null ? '<span class="dim">·</span>' : mode === 'ecart' ? `<span class="${isDec ? clsDec(v) : cls(v)}">${fmtS(Math.round(v))}</span>` : fmtE(v));
  const rowCalc = (label, getP, getR, kind, opts = {}) => `<tr class="${kind || ''}"><td>${label}</td>${MONTHS.map((_, m) => `<td class="${m < n ? 'closed' : ''}">${fmtCell(cellVal(getP, getR, m), opts.dec)}</td>`).join('')}${opts.stock ? stockCols(getP, getR) : opts.noCum ? '<td></td><td></td><td></td><td></td>' : cumCols(getP, getR, opts.dec)}</tr>`;

  let body = rowCalc('Trésorerie en début de mois', r => r.debut, r => r.debut, 'big-row', { noCum: true });
  let lastKind = null;
  for (const sec of SECTIONS) {
    if (sec.kind !== lastKind) {
      body += `<tr class="sec-row"><td colspan="17">${sec.kind === 'enc' ? 'A. ENCAISSEMENTS (HT)' : 'B. DÉCAISSEMENTS (HT)'}</td></tr>`;
      lastKind = sec.kind;
    }
    const isDec = sec.kind === 'dec';
    body += `<tr class="sec-row"><td colspan="17">${sec.icon} ${esc(sec.label)}</td></tr>`;
    for (const l of LINES.filter(x => x.sec === sec.id)) {
      const cells = MONTHS.map((_, m) => {
        if (mode === 'prev') {
          const ov = state.prevOv[l.id] && state.prevOv[l.id][m];
          const auto = l.prev(m, state.hyp, calc.prevValue);
          return `<td>${numInput(`id="p_${l.id}_${m}" data-prev="${l.id}" data-m="${m}" title="Automatique : ${nf2.format(auto)} — videz la case pour revenir au calcul"`, ov, nf2.format(P[m].lines[l.id]), ov != null ? 'ov' : '')}</td>`;
        }
        if (mode === 'reel') {
          const rv = state.reel[l.id] && state.reel[l.id][m];
          return `<td class="${m < n ? 'closed' : ''}">${m <= n ? numInput(`id="pr_${l.id}_${m}" data-reel="${l.id}" data-m="${m}"`, rv, '', rv != null ? 'filled' : '') : '<span class="dim">🔒</span>'}</td>`;
        }
        return `<td class="${m < n ? 'closed' : ''}">${fmtCell(m < n ? R[m].lines[l.id] - P[m].lines[l.id] : null, isDec)}</td>`;
      }).join('');
      body += `<tr><td>${esc(l.label)}${l.note ? `<span class="note" title="${esc(l.note)}">ⓘ</span>` : ''}</td>${cells}${cumCols(r => r.lines[l.id], r => r.lines[l.id], isDec)}</tr>`;
    }
    body += rowCalc(PLAN_TOTALS.before[sec.id], r => r.sec[sec.id], r => r.sec[sec.id], 'sub-row', { dec: isDec });
    if (sec.id === 'march') body += rowCalc("TOTAL CHIFFRE D'AFFAIRES HT", r => r.ca, r => r.ca, 'total-row');
    if (sec.id === 'autresEnc') {
      body += rowCalc('TVA collectée', r => r.tvaColl, r => r.tvaColl);
      body += rowCalc('TOTAL ENCAISSEMENTS TTC', r => r.encTTC, r => r.encTTC, 'total-row');
    }
  }
  body += rowCalc('TVA déductible', r => r.tvaDed, r => r.tvaDed, '', { dec: true });
  body += rowCalc("TVA reversée à l'État", r => r.tvaPay, r => r.tvaPay, '', { dec: true });
  body += rowCalc('TOTAL DÉCAISSEMENTS TTC', r => r.decTTC, r => r.decTTC, 'total-row', { dec: true });
  body += `<tr class="sec-row"><td colspan="17">C. TRÉSORERIE</td></tr>`;
  body += rowCalc('Solde du mois', r => r.solde, r => r.solde);
  body += rowCalc('TRÉSORERIE EN FIN DE MOIS', r => r.fin, r => r.fin, 'big-row', { stock: true });
  body += `<tr class="sec-row"><td colspan="17">D. INDICATEURS DE GESTION (HT)</td></tr>`;
  body += rowCalc('Marge brute', r => r.mb, r => r.mb);
  body += `<tr><td>Taux de marge brute</td>${MONTHS.map((_, m) => `<td>${mode === 'prev' ? fmtP(P[m].tauxMB) : m < n ? (mode === 'reel' ? fmtP(R[m].tauxMB) : `<span class="${cls(R[m].tauxMB - P[m].tauxMB)}">${fmtP(R[m].tauxMB - P[m].tauxMB)}</span>`) : '<span class="dim">·</span>'}</td>`).join('')}<td>${fmtP(calc.prev12.tauxMB)}</td><td>${fmtP(calc.prevDate.tauxMB)}</td><td>${n ? fmtP(calc.reelDate.tauxMB) : '—'}</td><td></td></tr>`;
  body += rowCalc("Charges d'exploitation (B1 à B6)", r => r.chargesExpl, r => r.chargesExpl, '', { dec: true });
  body += rowCalc('EBE estimé', r => r.ebe, r => r.ebe, 'total-row');
  body += `<tr><td>Nombre de tickets</td>${MONTHS.map((_, m) => `<td>${mode === 'prev' ? P[m].tickets : m < n ? (mode === 'reel' ? R[m].tickets : `<span class="${cls(R[m].tickets - P[m].tickets)}">${R[m].tickets - P[m].tickets}</span>`) : '<span class="dim">·</span>'}</td>`).join('')}<td>${calc.prev12.tickets}</td><td>${calc.prevDate.tickets}</td><td>${n ? calc.reelDate.tickets : '—'}</td><td></td></tr>`;
  body += `<tr><td>Panier moyen HT</td>${MONTHS.map((_, m) => `<td>${mode === 'prev' ? fmtE(P[m].panier, true) : m < n ? fmtE(R[m].panier, true) : '<span class="dim">·</span>'}</td>`).join('')}<td>${fmtE(calc.prev12.panier, true)}</td><td>${fmtE(calc.prevDate.panier, true)}</td><td>${n ? fmtE(calc.reelDate.panier, true) : '—'}</td><td></td></tr>`;
  body += `<tr><td>Alerte trésorerie</td>${calc.alerts.map(a => `<td>${alertTag(a)}</td>`).join('')}<td colspan="4"></td></tr>`;

  return `
  <div class="page-head">
    <div><h1>Plan de trésorerie 12 mois</h1>
    <div class="sub">${mode === 'prev' ? 'Prévisionnel : les cases vides suivent le calcul automatique (gris) ; tapez un montant pour le forcer (rose).' : mode === 'reel' ? 'Réel : montants HT encaissés / payés. Saisie possible jusqu’au mois de la mission en cours.' : 'Écarts Réel − Prévi sur les mois remis au réel (décaissements : + = dépense en plus).'}</div></div>
    <div class="row">
      <div class="seg">${[['prev', 'Prévi'], ['reel', 'Réel'], ['ecart', 'Écart']].map(([k, l]) => `<button class="${mode === k ? 'on' : ''}" data-planmode="${k}">${l}</button>`).join('')}</div>
      <button class="btn small" data-export="csv">⬇ Export CSV</button>
    </div>
  </div>
  <div class="tbl-wrap" style="max-height:calc(100vh - 160px)">
    <table class="plan-tbl">
      <thead><tr><th>Poste</th>${MONTHS.map((l, m) => `<th class="${m === n ? 'cur' : ''}">${l}${m < n ? ' ✓' : ''}</th>`).join('')}<th>Prévi 12 m</th><th>Prévi à date</th><th>Réel à date</th><th>Écart à date</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function smartQuests() {
  const h = state.hyp, c = calc, n = c.n;
  const panierNov = c.R[0].tickets ? c.R[0].panier : h.panierRef;
  const t4 = [9, 10, 11].filter(m => m < n);
  const t4ca = t4.reduce((s, m) => s + c.R[m].ca, 0), t4t = t4.reduce((s, m) => s + c.R[m].tickets, 0);
  const panierT4 = t4t ? t4ca / t4t : (c.reelDate.panier || 0);
  const partNow = Math.max(0, ...state.partners.map(x => x || 0));
  const famOk = c.families.filter(f => f.caReelDate > 0 && f.tauxReel >= f.tauxCible - 0.02).length;
  const remuMax = Math.max(0, ...c.R.slice(0, n).map(r => r.lines.remu));
  return [
    { n: '01', icon: '💶', title: `${fmtE(h.caObjectif)} de CA HT sur 12 mois`, desc: 'Du 01/11/2026 au 31/10/2027, soit 6 250 €/mois en moyenne. Bilans trimestriels 15 / 18 / 20 / 22 k€.',
      v: c.reelDate.ca, obj: h.caObjectif, label: `${fmtE(c.reelDate.ca)} / ${fmtE(h.caObjectif)}`, won: c.reelDate.ca >= h.caObjectif },
    { n: '02', icon: '🛒', title: `Panier moyen +${fmtP(h.panierProg, 0)} au T4`, desc: `Référence novembre : ${fmtE(panierNov, true)} → cible ${fmtE(panierNov * (1 + h.panierProg), true)} sur août–octobre 2027.`,
      v: panierT4, obj: panierNov * (1 + h.panierProg), label: `${panierT4 ? fmtE(panierT4, true) : '—'} / ${fmtE(panierNov * (1 + h.panierProg), true)}`, won: t4.length === 3 && panierT4 >= panierNov * (1 + h.panierProg) },
    { n: '03', icon: '🤝', title: '4 partenaires prescripteurs actifs', desc: 'Partenaire « actif » = au moins une recommandation client suivie sur les 90 derniers jours. Paliers 1 / 2 / 3 / 4.',
      v: partNow, obj: 4, label: `${partNow} / 4`, won: partNow >= 4 },
    { n: '04', icon: '📐', title: 'Connaître et protéger la marge des 8 familles', desc: `10 fiches de coût au 31/01/2027, marges suivies au 30/04/2027. Familles au niveau de la cible (±2 pts) : ${famOk}/8.`,
      v: Math.min(state.fiches, 10) + famOk, obj: 18, label: `${state.fiches}/10 fiches · ${famOk}/8 familles`, won: state.fiches >= 10 && famOk >= 8, fiches: true },
    { n: '05', icon: '🛡️', title: `Réserve de trésorerie ≥ ${fmtE(h.tresoObjectif)} au 31/10/2027`, desc: '1 mois de charges notées, échéances payées à temps. Le plan de communication vise 5 000 €.',
      v: currentTreso(), obj: h.tresoObjectif, label: `${fmtE(currentTreso())} / ${fmtE(h.tresoObjectif)}`, won: n >= 12 && currentTreso() >= h.tresoObjectif },
    { n: '06', icon: '👑', title: `${fmtE(h.remuVisee)} nets/mois pour Déborah`, desc: 'Au plus tard en octobre 2027, uniquement si finançable. Paliers 0 → 1 000 → 1 500 → 2 000 €, débloqués si le bilan précédent est tenu.',
      v: remuMax, obj: h.remuVisee, label: `${fmtE(remuMax)} / ${fmtE(h.remuVisee)} (meilleur mois)`, won: remuMax >= h.remuVisee },
  ];
}

function viewQuetes() {
  const c = calc, h = state.hyp;
  const groups = [...new Set(SIDE_QUESTS.map(q => q.group))];
  return `
  <div class="page-head"><div><h1>Quêtes SMART & Boss trimestriels</h1><div class="sub">Les 6 objectifs SMART du 01/11/2026 au 31/10/2027 et les 4 bilans à 3, 6, 9 et 12 mois.</div></div></div>
  <h2>👾 Les boss du trimestre</h2>
  <div class="grid g4" style="margin-bottom:22px">
    ${c.quarters.map((q, i) => `<div class="card boss-card ${q.won ? 'won' : ''}">
      <div class="boss-ic">${BOSSES[i].icon}</div>
      <div class="player-name" style="margin-top:6px">${BOSSES[i].name}</div>
      <div class="muted" style="font-size:12px">${QUARTER_LABELS[i]} · bilan fin ${MONTHS[q.ms[2]]}</div>
      <div class="bar-label"><span>PV restants</span><b>${fmtE(Math.max(0, q.obj - q.caReel))}</b></div>
      ${bar('boss', q.obj ? Math.max(0, q.obj - q.caReel) / q.obj : 0)}
      <div class="sum-line" style="margin-top:8px"><span>Objectif CA</span><b>${fmtE(q.obj)}</b></div>
      <div class="sum-line"><span>CA prévi</span><b>${fmtE(q.caPrev)}</b></div>
      <div class="sum-line"><span>CA réel</span><b>${fmtE(q.caReel)}</b></div>
      <div class="sum-line"><span>Tréso fin réel</span><b>${q.tresoFin == null ? '—' : fmtE(q.tresoFin)}</b></div>
      <div class="sum-line"><span>🤝 Partenaires actifs (cible ${q.cible})</span>${numInput(`id="pa_${i}" data-partners="${i}" style="width:64px"`, q.partenaires, '?')}</div>
      <div style="margin-top:8px"><span class="tag ${q.won ? 'ok' : q.done ? 'bad' : 'info'}">${q.status}</span></div>
    </div>`).join('')}
  </div>

  <h2>🎯 Quêtes principales (SMART)</h2>
  <div class="grid g2" style="margin-bottom:22px">
    ${smartQuests().map(q => `<div class="card quest ${q.won ? 'won' : ''}">
      <div class="q-ic">${q.icon}</div>
      <div class="q-body">
        <div class="q-title"><span class="tag gold">SMART n°${q.n}</span>${esc(q.title)}${q.won ? '<span class="tag ok">✔ Accomplie</span>' : ''}</div>
        <div class="q-desc">${esc(q.desc)}</div>
        <div class="bar-label"><span>Progression</span><b>${q.label}</b></div>
        ${bar('prog', q.obj ? q.v / q.obj : 0)}
        ${q.fiches ? `<div class="row" style="margin-top:10px"><span class="muted">Fiches de coût réalisées</span>
          <button class="btn small" data-fiches="-1">−</button><b style="font-family:var(--head);font-size:16px">${state.fiches}</b><button class="btn small" data-fiches="1">+</button></div>` : ''}
      </div></div>`).join('')}
  </div>

  <h2>📜 Quêtes annexes <span class="tag gold">+25 XP chacune</span></h2>
  <div class="grid g3">
    ${groups.map(g => `<div class="card"><h3>${esc(g)}</h3>
      ${SIDE_QUESTS.filter(q => q.group === g).map(q => `<label class="check ${state.quests[q.id] ? 'done' : ''}"><input type="checkbox" data-quest="${q.id}" ${state.quests[q.id] ? 'checked' : ''}><span>${esc(q.label)}</span></label>`).join('')}
    </div>`).join('')}
  </div>`;
}

function viewFamilles() {
  const c = calc, n = c.n;
  const groups = [['atelier', 'A1. Atelier'], ['cles', 'A2. Clés minute'], ['march', 'A3. Ventes de marchandises']];
  const row = f => `<tr><td>${esc(f.label)}<span class="note" title="${esc(f.note)}">ⓘ</span></td><td>${fmtE(f.caObj)}</td><td>${fmtE(f.caPrevDate)}</td><td>${n ? fmtE(f.caReelDate) : '—'}</td>
    <td class="${n ? cls(f.caReelDate - f.caPrevDate) : 'dim'}">${n ? fmtS(Math.round(f.caReelDate - f.caPrevDate)) : '—'}</td><td>${n ? fmtP(f.pctRealise, 0) : '—'}</td>
    <td>${n ? fmtP(f.part) : '—'}</td><td>${n ? fmtE(f.achReel) : '—'}</td><td>${n ? fmtE(f.mbReel) : '—'}</td>
    <td class="${f.caReelDate ? (f.tauxReel >= f.tauxCible ? 'pos' : 'neg') : 'dim'}">${f.caReelDate ? fmtP(f.tauxReel) : '—'}</td><td>${fmtP(f.tauxCible)}</td></tr>`;
  const sumF = (fs, k) => fs.reduce((s, f) => s + f[k], 0);
  const sub = (label, fs, kind) => {
    const ca = sumF(fs, 'caReelDate'), ach = sumF(fs, 'achReel'), obj = sumF(fs, 'caObj');
    const cible = obj ? 1 - fs.reduce((s, f) => s + f.caObj * (1 - f.tauxCible), 0) / obj : 0;
    return `<tr class="${kind}"><td>${label}</td><td>${fmtE(obj)}</td><td>${fmtE(sumF(fs, 'caPrevDate'))}</td><td>${n ? fmtE(ca) : '—'}</td><td></td><td></td><td>${n && c.reelDate.ca ? fmtP(ca / c.reelDate.ca) : '—'}</td><td>${n ? fmtE(ach) : '—'}</td><td>${n ? fmtE(ca - ach) : '—'}</td><td>${ca ? fmtP((ca - ach) / ca) : '—'}</td><td>${fmtP(cible)}</td></tr>`;
  };
  return `
  <div class="page-head"><div><h1>Synthèse par famille d'activité</h1><div class="sub">SMART n°04 : CA, achats et taux de marge réels des 8 familles, comparés au taux cible. Réalisé jusqu'à : ${n ? MONTHS[n - 1] : 'aucun mois'}.</div></div></div>
  <div class="card" style="margin-bottom:16px"><h2>🧩 Marge brute réelle vs cible</h2><div class="chart-box"><canvas id="chFam"></canvas></div>
  ${n ? '' : '<p class="muted">Le graphique se remplira dès le premier mois remis au réel.</p>'}</div>
  <div class="tbl-wrap"><table>
    <thead><tr><th>Famille</th><th>CA objectif</th><th>CA prévi à date</th><th>CA réel à date</th><th>Écart</th><th>% réalisé</th><th>Part du CA</th><th>Achats réels</th><th>Marge réelle</th><th>Taux MB réel</th><th>Taux MB cible</th></tr></thead>
    <tbody>
      ${groups.map(([g, l]) => { const fs = c.families.filter(f => f.group === g); return fs.map(row).join('') + sub(l, fs, 'sub-row'); }).join('')}
      ${sub('TOTAL', c.families, 'total-row')}
    </tbody></table></div>
  <div class="grid g3" style="margin-top:16px">
    <div class="card kpi"><div class="k-label">CA mensuel moyen 2026 (janv.–août)</div><div class="k-val">${fmtE(state.hyp.ca2026 / 8)}</div></div>
    <div class="card kpi"><div class="k-label">CA mensuel moyen prévi (12 mois)</div><div class="k-val">${fmtE(c.prev12.ca / 12)}</div></div>
    <div class="card kpi"><div class="k-label">CA mensuel moyen réel à date</div><div class="k-val">${n ? fmtE(c.reelDate.ca / n) : '—'}</div></div>
  </div>`;
}

function drawFamChart() {
  if (!chartDefaults()) return;
  const fs = calc.families;
  ui.charts.push(new Chart($('#chFam'), {
    type: 'bar',
    data: { labels: fs.map(f => f.short), datasets: [
      { label: 'Taux MB cible', data: fs.map(f => f.tauxCible * 100), backgroundColor: 'rgba(139,108,255,.45)', borderRadius: 6 },
      { label: 'Taux MB réel', data: fs.map(f => (f.caReelDate ? f.tauxReel * 100 : null)), backgroundColor: '#45f0a0', borderRadius: 6 },
    ] },
    options: { maintainAspectRatio: false, scales: { y: { min: 0, max: 100, ticks: { callback: v => v + ' %' } } },
      plugins: { tooltip: { callbacks: { label: ctx => `${ctx.dataset.label} : ${ctx.parsed.y.toFixed(1).replace('.', ',')} %` } } } },
  }));
}

function viewSucces() {
  const got = xp.ach.filter(a => a.ok).length;
  return `
  <div class="page-head"><div><h1>Succès & progression</h1><div class="sub">${got}/${xp.ach.length} succès débloqués · ${nf0.format(xp.total)} XP</div></div></div>
  <div class="grid g2" style="margin-bottom:18px">
    <div class="card glow-gold">${playerCard()}</div>
    <div class="card"><h3>Échelle des niveaux</h3>
      ${LEVELS.map((l, i) => `<div class="sum-line"><span>${i + 1 <= xp.lvl ? '⭐' : '☆'} Niv. ${i + 1} — ${esc(l.title)}</span><b class="${i + 1 <= xp.lvl ? 'pos' : 'dim'}">${nf0.format(l.xp)} XP</b></div>`).join('')}
    </div>
  </div>
  <h2>🏆 Succès</h2>
  <div class="badges" style="margin-bottom:18px">
    ${xp.ach.map(a => `<div class="badge ${a.ok ? 'ok' : 'locked'}"><div class="b-ic">${a.icon}</div><div class="b-name">${esc(a.name)}</div><div class="b-desc">${esc(a.desc)}</div><span class="tag ${a.ok ? 'gold' : ''}">${a.ok ? '✔ ' : '🔒 '}+${a.xp} XP</span></div>`).join('')}
  </div>
  <div class="card"><h2>📒 Journal d'XP</h2>
    ${xp.log.length ? xp.log.map(l => `<div class="sum-line"><span>${esc(l.label)} <span class="dim">— ${esc(l.why)}</span></span><b class="pos">+${l.xp} XP</b></div>`).join('') : '<p class="muted">Aucune XP pour l’instant : validez votre première mission ou cochez une quête annexe !</p>'}
  </div>`;
}

function hypField(key, label, opts = {}) {
  const v = state.hyp[key];
  const shown = opts.pct ? v * 100 : v;
  return `<div class="field"><label for="h_${key}">${label}${opts.pct ? ' (%)' : ''}</label>${numInput(`id="h_${key}" data-hyp="${key}" ${opts.pct ? 'data-pct="1"' : ''}`, shown, '')}${opts.hint ? `<div class="hint">${opts.hint}</div>` : ''}</div>`;
}
function hypText(key, label) {
  return `<div class="field"><label for="h_${key}">${label}</label><input class="inp" id="h_${key}" data-hyptxt="${key}" value="${esc(state.hyp[key])}"></div>`;
}

function viewReglages() {
  const h = state.hyp;
  const mixTot = h.mix.reduce((s, x) => s + x, 0), saisTot = h.saison.reduce((s, x) => s + x, 0);
  const palTot = h.paliers.reduce((s, x) => s + x, 0);
  const totTag = (ok, txt) => `<span class="tag ${ok ? 'ok' : 'bad'}">${ok ? '✔ OK' : '⚠ ' + txt}</span>`;
  return `
  <div class="page-head"><div><h1>Réglages — hypothèses du plan</h1><div class="sub">Les prévisions se recalculent instantanément. Montants HT, taux en %.</div></div>
  <button class="btn danger small" data-reset-hyp>↺ Revenir aux hypothèses d'origine</button></div>

  <div class="card" style="margin-bottom:16px"><h2>1. Identité</h2><div class="fields">
    ${hypText('entreprise', 'Entreprise')}${hypText('gerante', 'Gérante')}${hypText('atelier', 'Atelier')}${hypText('expert', 'Expert-comptable')}
  </div></div>

  <div class="card glow-pink" style="margin-bottom:16px"><h2>2. Objectifs SMART & trésorerie de départ</h2><div class="fields">
    ${hypField('tresoInitiale', 'Trésorerie initiale au 01/11/2026 (€)', { hint: 'Solde banque + caisse au 31/10/2026 (relevés).' })}
    ${hypField('caObjectif', 'CA objectif 12 mois HT (€)', { hint: `Progression vs 2025 : ${fmtP(h.ca2025 ? h.caObjectif / h.ca2025 - 1 : 0)}` })}
    ${hypField('panierRef', 'Panier moyen HT de référence (€)', { hint: 'À remplacer par le panier réel de novembre.' })}
    ${hypField('panierProg', 'Progression visée du panier', { pct: true })}
    ${hypField('tresoObjectif', 'Trésorerie objectif au 31/10/2027 (€)')}
    ${hypField('seuilAlerte', "Seuil d'alerte trésorerie (€)")}
    ${hypField('remuVisee', 'Rémunération nette mensuelle visée (€)')}
  </div>
  <h3 style="margin-top:16px">Paliers trimestriels ${totTag(Math.abs(palTot - h.caObjectif) < 0.01, `total ${fmtE(palTot)} ≠ ${fmtE(h.caObjectif)}`)}</h3>
  <div class="fields">${h.paliers.map((p, i) => `<div class="field"><label>${QUARTER_LABELS[i]} — CA (€)</label>${numInput(`id="h_pal_${i}" data-hyparr="paliers" data-i="${i}"`, p, '')}</div>
    <div class="field"><label>${QUARTER_LABELS[i]} — partenaires cible</label>${numInput(`id="h_par_${i}" data-hyparr="partenairesCible" data-i="${i}"`, h.partenairesCible[i], '')}</div>`).join('')}</div>
  </div>

  <div class="card" style="margin-bottom:16px"><h2>3. TVA</h2><div class="fields">
    <div class="field"><label for="h_regime">Régime de TVA (à confirmer avec ${esc(h.expert)})</label>
      <select class="inp" id="h_regime" data-hypsel="regimeTVA">${TVA_REGIMES.map(r => `<option ${r === h.regimeTVA ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
    ${hypField('tvaOct', "Réel normal — TVA nette d'octobre payée en novembre (€)")}
    ${hypField('creditTVA', 'Réel normal — crédit de TVA au 31/10/2026 (€)')}
    ${hypField('acompteDec', 'Simplifié — acompte de décembre 2026 (€)')}
    ${hypField('soldeCA12', 'Simplifié — solde CA12 payé en mai 2027 (€)')}
    ${hypField('acompteJuil', 'Simplifié — acompte de juillet 2027 (€)')}
  </div></div>

  <div class="card" style="margin-bottom:16px"><h2>4. Rémunération & cotisations de la gérante</h2><div class="fields">
    ${hypField('urssaf', 'Cotisations URSSAF / SSI — échéancier mensuel (€)')}
    ${hypField('prevoyance', 'Prévoyance / Madelin (AXA) — mensuel (€)')}
    ${hypField('tauxCotis', 'Taux de cotisations sur la rémunération nette', { pct: true, hint: `Coût complet de ${fmtE(h.remuVisee)} nets : ${fmtE(h.remuVisee * (1 + h.tauxCotis))}` })}
  </div></div>

  <div class="card" style="margin-bottom:16px"><h2>5. Estimations comptables</h2><div class="fields">
    ${hypField('amort', 'Dotations aux amortissements annuelles (€)')}
    ${hypField('interets', "Intérêts d'emprunts annuels (€)")}
    ${hypField('tauxIS', "Taux d'impôt sur les sociétés", { pct: true, hint: '0 % tant que les déficits antérieurs ne sont pas épuisés.' })}
  </div></div>

  <div class="card" style="margin-bottom:16px"><h2>6. Mix du CA par famille & taux d'achats ${totTag(Math.abs(mixTot - 1) < 1e-4, `total ${fmtP(mixTot)}`)}</h2>
    <div class="tbl-wrap"><table><thead><tr><th>Famille</th><th>% du CA</th><th>CA objectif</th><th>Taux d'achats</th><th>Marge cible</th></tr></thead><tbody>
    ${FAMILIES.map((f, i) => `<tr><td>${esc(f.label)}<span class="note" title="${esc(f.note)}">ⓘ</span></td>
      <td>${numInput(`id="h_mix_${i}" data-hyparr="mix" data-i="${i}" data-pct="1"`, h.mix[i] * 100, '')}</td>
      <td>${fmtE(h.caObjectif * h.mix[i])}</td>
      <td>${numInput(`id="h_ach_${i}" data-hyparr="tauxAchat" data-i="${i}" data-pct="1"`, h.tauxAchat[i] * 100, '')}</td>
      <td>${fmtP(1 - h.tauxAchat[i])}</td></tr>`).join('')}
    <tr class="total-row"><td>Total / moyenne pondérée</td><td>${fmtP(mixTot)}</td><td>${fmtE(h.caObjectif * mixTot)}</td><td>${fmtP(1 - calc.tauxMBCible)}</td><td>${fmtP(calc.tauxMBCible)}</td></tr>
    </tbody></table></div></div>

  <div class="card" style="margin-bottom:16px"><h2>7. Saisonnalité & rémunération prévue ${totTag(Math.abs(saisTot - 1) < 1e-4, `total ${fmtP(saisTot)}`)}</h2>
    <p class="muted">Paliers 0 € → 1 000 € → 1 500 € → 2 000 €, chacun débloqué seulement si le bilan trimestriel précédent est tenu.</p>
    <div class="tbl-wrap"><table><thead><tr><th>Mois</th><th>% du CA annuel</th><th>CA prévi</th><th>Rémunération nette prévue</th><th style="text-align:left">Commentaire</th></tr></thead><tbody>
    ${MONTHS.map((l, m) => `<tr><td>${l}</td><td>${numInput(`id="h_sai_${m}" data-hyparr="saison" data-i="${m}" data-pct="1"`, h.saison[m] * 100, '')}</td>
      <td>${fmtE(h.caObjectif * h.saison[m])}</td><td>${numInput(`id="h_rem_${m}" data-hyparr="remu" data-i="${m}"`, h.remu[m], '')}</td>
      <td style="text-align:left;white-space:normal" class="muted">${esc(SAISON_NOTES[m])}</td></tr>`).join('')}
    <tr class="total-row"><td>Total</td><td>${fmtP(saisTot)}</td><td>${fmtE(h.caObjectif * saisTot)}</td><td>${fmtE(h.remu.reduce((s, x) => s + x, 0))}</td><td></td></tr>
    </tbody></table></div></div>

  <div class="card"><h2>8. Repères comptables au 31/08/2026 (${esc(h.expert)})</h2><div class="fields">
    ${hypField('ca2025', 'CA HT 2025 réalisé (€)')}
    ${hypField('ca2026', 'CA HT du 01/01 au 31/08/2026 (€)', { hint: `Moyenne : ${fmtE(h.ca2026 / 8)}/mois` })}
    ${hypField('achats2026', 'Achats consommés 01/01 → 31/08/2026 (€)', { hint: `Taux d'achats : ${fmtP(h.ca2026 ? h.achats2026 / h.ca2026 : 0)}` })}
    ${hypField('dispo3108', 'Disponibilités au 31/08/2026 (€)')}
    ${hypField('emprunt', 'Emprunt restant dû au 31/08/2026 (€)')}
    ${hypField('cca', "Compte courant d'associé au 31/08/2026 (€)")}
    ${hypField('dettesFourn', 'Dettes fournisseurs au 31/08/2026 (€)')}
  </div></div>`;
}

function viewSauvegarde() {
  const lb = state.lastBackup ? new Date(state.lastBackup) : null;
  const age = lb ? Math.floor((Date.now() - lb) / 86400000) : null;
  return `
  <div class="page-head"><div><h1>Sauvegarde & guide</h1><div class="sub">Synchronisez vos appareils (PC, téléphone) et gardez une copie de secours de vos données.</div></div></div>
  ${syncCard()}
  <div class="grid g2" style="margin-bottom:16px">
    <div class="card glow-cyan"><h2>💾 Sauvegarder / restaurer</h2>
      <div class="alert ${age == null || age > 35 ? 'warn' : 'ok'}">${lb ? `Dernière sauvegarde téléchargée le ${lb.toLocaleDateString('fr-FR')} (il y a ${age} j).` : 'Aucune sauvegarde téléchargée pour l’instant.'}</div>
      <div class="row">
        <button class="btn primary" data-export="json">⬇ Télécharger la sauvegarde (.json)</button>
        <label class="btn">⬆ Restaurer une sauvegarde<input type="file" accept=".json,application/json" id="importFile" hidden></label>
      </div>
      <p class="muted">Pour utiliser l’outil sur un autre appareil (ordinateur, tablette, téléphone) : téléchargez la sauvegarde ici, puis restaurez-la là-bas.</p>
      <div class="row"><button class="btn" data-export="csv">⬇ Exporter le plan (CSV pour Excel / l’expert-comptable)</button></div>
      <hr style="border:0;border-top:1px solid var(--line);margin:16px 0">
      <button class="btn danger small" data-reset-all>🗑 Tout effacer et repartir du plan d'origine</button>
    </div>
    <div class="card guide"><h2>📖 Le rituel du 10 (chaque mois)</h2>
      <ol>
        <li>Ouvrir <a href="#mission">Mission du mois</a> avec le relevé bancaire, la caisse et Pennylane.</li>
        <li>Saisir dans « Réel » les <b>encaissements HT reçus</b> et les <b>dépenses HT payées</b> (bouton « Recopier le prévi » pour les charges fixes identiques).</li>
        <li>Relever le <b>nombre de tickets</b> du mois dans le logiciel de caisse : le panier moyen se calcule seul.</li>
        <li>La TVA collectée, déductible et reversée se calcule seule ; si le montant prélevé diffère, le saisir.</li>
        <li>Cliquer sur <b>Valider le mois</b> : écarts, boss, quêtes et succès se mettent à jour. 🎉</li>
        <li>Télécharger la sauvegarde.</li>
      </ol>
    </div>
  </div>
  <div class="grid g2">
    <div class="card guide"><h2>🧭 Lire les écarts (Réel − Prévi)</h2>
      <ul>
        <li>Encaissements, marge, EBE et panier : un écart <span class="neg">négatif</span> = moins que prévu.</li>
        <li>Décaissements : un écart <span class="neg">positif</span> = dépense supérieure au prévu.</li>
        <li>Trésorerie : « Vigilance » sous ${fmtE(state.hyp.seuilAlerte)}, « Découvert » sous 0 €.</li>
        <li>Tous les montants sont <b>hors taxes</b>. Lignes à 0 % (assurances, banque, cotisations, prêt, impôts) : saisir le montant payé.</li>
      </ul>
    </div>
    <div class="card guide"><h2>🎮 Comment gagner de l'XP</h2>
      <ul>
        <li>+100 XP par mois remis au réel, +20 si les tickets sont saisis, +50 si le CA dépasse le prévi, +30 si la trésorerie reste au-dessus du seuil.</li>
        <li>+25 XP par quête annexe, +10 XP par fiche de coût (jusqu’à 10).</li>
        <li>Planning des tâches : +30 / +20 / +15 / +10 XP par tâche terminée selon sa priorité (P0 → P3), +5 si elle est bouclée avant sa date de fin.</li>
        <li>Succès : boss trimestriels vaincus, partenaires, panier, rémunération… (onglet <a href="#succes">Succès</a>).</li>
        <li>Les points s'échangent contre des récompenses dans l'onglet <a href="#recompenses">Récompenses</a> (le niveau ne baisse pas).</li>
      </ul>
    </div>
  </div>`;
}

// ————— Exports —————
function download(name, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function exportCSV() {
  const P = calc.P, R = calc.R, n = calc.n;
  const f = v => (v == null ? '' : (Math.round(v * 100) / 100).toString().replace('.', ','));
  const head = ['Poste', ...MONTHS.flatMap(m => [`${m} Prévi`, `${m} Réel`, `${m} Écart`])];
  const rows = [head];
  const add = (label, gp, gr) => rows.push([label, ...MONTHS.flatMap((_, m) => [f(gp(P[m])), m < n ? f(gr(R[m])) : '', m < n ? f(gr(R[m]) - gp(P[m])) : ''])]);
  add('Trésorerie début de mois', r => r.debut, r => r.debut);
  for (const sec of SECTIONS) {
    for (const l of LINES.filter(x => x.sec === sec.id)) add(l.label, r => r.lines[l.id], r => r.lines[l.id]);
    add(PLAN_TOTALS.before[sec.id], r => r.sec[sec.id], r => r.sec[sec.id]);
    if (sec.id === 'march') add("TOTAL CHIFFRE D'AFFAIRES HT", r => r.ca, r => r.ca);
    if (sec.id === 'autresEnc') { add('TVA collectée', r => r.tvaColl, r => r.tvaColl); add('TOTAL ENCAISSEMENTS TTC', r => r.encTTC, r => r.encTTC); }
  }
  add('TVA déductible', r => r.tvaDed, r => r.tvaDed);
  add("TVA reversée à l'État", r => r.tvaPay, r => r.tvaPay);
  add('TOTAL DÉCAISSEMENTS TTC', r => r.decTTC, r => r.decTTC);
  add('Solde du mois', r => r.solde, r => r.solde);
  add('Trésorerie fin de mois', r => r.fin, r => r.fin);
  add('Marge brute', r => r.mb, r => r.mb);
  add('EBE estimé', r => r.ebe, r => r.ebe);
  add('Nombre de tickets', r => r.tickets, r => r.tickets);
  add('Panier moyen HT', r => r.panier, r => r.panier);
  const csv = '﻿' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  download(`DS_CORDO_plan_tresorerie_${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8');
}
function exportJSON() {
  state.lastBackup = new Date().toISOString();
  save();
  download(`DS_CORDO_sauvegarde_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(state, null, 1), 'application/json');
  toast('💾', 'Sauvegarde téléchargée', 'Gardez ce fichier en lieu sûr.', true);
  setTimeout(render, 0);
}

// ————— Événements —————
function setArr(obj, key, m, v) {
  if (!obj[key]) obj[key] = Array(12).fill(null);
  obj[key][m] = v;
}

document.addEventListener('change', e => {
  const t = e.target;
  const d = t.dataset;
  if (t.id === 'importFile') return importFile(t.files[0]);
  if (d.quest) { state.quests[d.quest] = t.checked; if (t.checked) toast('📜', 'Quête accomplie', '+25 XP', true); return commit(); }
  if (d.hypsel) { state.hyp[d.hypsel] = t.value; return commit(); }
  if (d.hyptxt) { state.hyp[d.hyptxt] = t.value; return commit(); }
  if (!t.classList.contains('num')) return;
  const v = parseNum(t.value);
  if (Number.isNaN(v)) { t.classList.add('err'); toast('⚠️', 'Nombre attendu', 'Saisir des chiffres uniquement (ex. 1250,50).', true); return; }
  t.classList.remove('err');
  if (d.reel) setArr(state.reel, d.reel, +d.m, v);
  else if (d.prev) setArr(state.prevOv, d.prev, +d.m, v);
  else if (d.tickets != null) state.tickets[+d.tickets] = v == null ? null : Math.round(v);
  else if (d.tvapay != null) state.tvaPayOv[+d.tvapay] = v;
  else if (d.partners != null) state.partners[+d.partners] = v == null ? null : Math.round(v);
  else if (d.hyp) state.hyp[d.hyp] = v == null ? 0 : (d.pct ? v / 100 : v);
  else if (d.hyparr) state.hyp[d.hyparr][+d.i] = v == null ? 0 : (d.pct ? v / 100 : v);
  commit();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('num')) {
    e.preventDefault();
    const inputs = [...document.querySelectorAll('input.num:not(:disabled)')];
    const i = inputs.indexOf(e.target);
    (inputs[i + 1] || e.target).focus();
  }
});

document.addEventListener('click', e => {
  const t = e.target.closest('[data-month],[data-close],[data-reopen],[data-planmode],[data-export],[data-fillprev],[data-fiches],[data-reset-hyp],[data-reset-all]');
  if (!t) return;
  const d = t.dataset;
  if (d.month != null && !d.close) {
    ui.month = +d.month;
    if (ui.view !== 'mission') { e.preventDefault(); location.hash = '#mission'; } else render();
    return;
  }
  if (d.close != null) return closeMonth(+d.close);
  if (d.reopen != null) {
    if (!confirm(`Rouvrir ${MONTHS[+d.reopen]} ? Le mois repassera en mission en cours.`)) return;
    state.closed = +d.reopen; ui.month = +d.reopen; return commit();
  }
  if (d.planmode) { ui.planMode = d.planmode; return render(); }
  if (d.export === 'csv') return exportCSV();
  if (d.export === 'json') return exportJSON();
  if (d.fillprev) {
    const m = ui.month;
    for (const l of LINES.filter(x => x.sec === d.fillprev)) {
      if (!(state.reel[l.id] && state.reel[l.id][m] != null)) setArr(state.reel, l.id, m, Math.round(calc.P[m].lines[l.id] * 100) / 100);
    }
    toast('⤵', 'Prévi recopié', 'Vérifiez chaque montant avec le relevé bancaire.', true);
    return commit();
  }
  if (d.fiches) { state.fiches = Math.max(0, state.fiches + +d.fiches); return commit(); }
  if (d.resetHyp != null) {
    if (!confirm("Remettre toutes les hypothèses du fichier d'origine ? (les montants réels sont conservés)")) return;
    state.hyp = JSON.parse(JSON.stringify(DEFAULT_HYP)); return commit();
  }
  if (d.resetAll != null) {
    if (!confirm('Tout effacer (réel, quêtes, XP, réglages) ? Téléchargez une sauvegarde avant si besoin.')) return;
    state = defaultState(); ui.month = 0; return commit();
  }
});

function closeMonth(m) {
  const filled = Object.values(state.reel).filter(a => a && a[m] != null).length;
  if (filled === 0 && !confirm(`Aucun montant réel saisi pour ${MONTHS[m]}. Valider quand même ?`)) return;
  if (state.tickets[m] == null && !confirm('Le nombre de tickets n’est pas saisi (panier moyen non calculé). Valider quand même ?')) return;
  const xpBefore = xp.total;
  state.closed = m + 1;
  state.closedAt[m] = new Date().toISOString();
  ui.month = Math.min(11, m + 1);
  save(); recompute();
  const gained = xp.total - xpBefore;
  toast('⚔️', `Mission ${MONTHS[m]} accomplie !`, `+${gained} XP · trésorerie fin de mois ${fmtE(calc.R[m].fin)}`);
  celebrate(true);
  const q = calc.quarters[Math.floor(m / 3)];
  if (m % 3 === 2) setTimeout(() => toast(BOSSES[q.q].icon, q.won ? `${BOSSES[q.q].name} est vaincu !` : `Bilan ${QUARTER_LABELS[q.q]} : écart à corriger`, `CA trimestre ${fmtE(q.caReel)} / ${fmtE(q.obj)}`), 900);
  commit();
}

function importFile(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      if (!data || typeof data !== 'object' || !data.hyp) throw new Error('format');
      if (!confirm('Remplacer les données actuelles par cette sauvegarde ?')) return;
      state = normalizeState(data);
      ui.month = Math.min(state.closed, 11);
      toast('⬆', 'Sauvegarde restaurée', `${state.closed}/12 mois remis au réel`, true);
      commit();
    } catch (err) { toast('⚠️', 'Fichier invalide', 'Choisissez un fichier de sauvegarde .json de l’application.', true); }
  };
  r.readAsText(file);
}

function route() {
  const v = (location.hash || '#qg').slice(1);
  ui.view = VIEWS[v] ? v : 'qg';
  render();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

recompute();
state.seenAch = Array.from(new Set([...state.seenAch, ...xp.ach.filter(a => a.ok).map(a => a.id)]));
route();
syncInit();
