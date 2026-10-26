// Moteur de calcul : reproduit les formules du plan de trésorerie Excel
// (feuilles « Plan Trésorerie », « Tableau de bord » et « Synthèse Familles »).

const N = 12;
const empty = () => Array(N).fill(null);
const clone = o => JSON.parse(JSON.stringify(o));
const sum = a => a.reduce((s, x) => s + (x || 0), 0);

function defaultState() {
  return {
    v: 1,
    hyp: clone(DEFAULT_HYP),
    prevOv: {},       // montants prévi forcés : { lineId: [12] }
    reel: {},         // montants réels saisis : { lineId: [12] }
    tickets: empty(), // nombre de tickets de caisse réels
    tvaPayOv: empty(),// TVA réellement prélevée si différente du calcul
    closed: 0,        // nombre de mois remis au réel (0 → 12)
    partners: [null, null, null, null],
    fiches: 0,        // fiches de coût réalisées (SMART n°04)
    quests: {},
    seenAch: [],
    closedAt: {},     // date de clôture de chaque mois (rituel du 10)
    lastBackup: null,
  };
}

// Complète un état chargé (ancienne version, import) avec les valeurs par défaut
function normalizeState(s) {
  const d = defaultState();
  const out = Object.assign(d, s || {});
  out.hyp = Object.assign(clone(DEFAULT_HYP), (s && s.hyp) || {});
  for (const k of ['tickets', 'tvaPayOv']) if (!Array.isArray(out[k]) || out[k].length !== N) out[k] = empty();
  if (!Array.isArray(out.partners) || out.partners.length !== 4) out.partners = [null, null, null, null];
  return out;
}

const SEC_IDS = SECTIONS.map(s => s.id);
const ENC_LINES = LINES.filter(l => SECTIONS.find(s => s.id === l.sec).kind === 'enc');
const DEC_LINES = LINES.filter(l => SECTIONS.find(s => s.id === l.sec).kind === 'dec');
const LINE_BY_ID = Object.fromEntries(LINES.map(l => [l.id, l]));

function computeMode(state, mode) {
  const h = state.hyp;
  const memo = {};
  const prevValue = (id, m) => {
    const key = id + '|' + m;
    if (key in memo) return memo[key];
    const ov = state.prevOv[id] && state.prevOv[id][m];
    const v = ov != null ? ov : LINE_BY_ID[id].prev(m, h, prevValue);
    return (memo[key] = v || 0);
  };
  const reelValue = (id, m) => (state.reel[id] && state.reel[id][m]) || 0;
  const val = mode === 'prev' ? prevValue : reelValue;

  const franchise = h.regimeTVA === TVA_REGIMES[2];
  const months = [];
  let prevNette = 0, prevCredit = 0, prevFin = h.tresoInitiale;

  for (let m = 0; m < N; m++) {
    const r = { m, lines: {}, sec: {} };
    for (const l of LINES) r.lines[l.id] = val(l.id, m);
    for (const s of SEC_IDS) r.sec[s] = 0;
    for (const l of LINES) r.sec[l.sec] += r.lines[l.id];

    r.ca = r.sec.atelier + r.sec.cles + r.sec.march;
    r.autresEnc = r.sec.autresEnc;
    r.tvaColl = franchise ? 0 : sum(ENC_LINES.map(l => l.tva * r.lines[l.id]));
    r.tvaDed = franchise ? 0 : sum(DEC_LINES.map(l => l.tva * r.lines[l.id]));
    r.tvaNette = r.tvaColl - r.tvaDed;
    r.tvaDue = m === 0 ? h.tvaOct - h.creditTVA : prevNette + prevCredit;
    r.tvaCredit = Math.min(0, r.tvaDue);
    if (h.regimeTVA === TVA_REGIMES[0]) r.tvaPay = Math.max(0, r.tvaDue);
    else if (h.regimeTVA === TVA_REGIMES[1]) r.tvaPay = m === 1 ? h.acompteDec : m === 6 ? h.soldeCA12 : m === 8 ? h.acompteJuil : 0;
    else r.tvaPay = 0;
    r.tvaPayCalc = r.tvaPay;
    if (mode === 'reel' && state.tvaPayOv[m] != null) r.tvaPay = state.tvaPayOv[m];

    r.encTTC = r.ca + r.autresEnc + r.tvaColl;
    r.achats = r.sec.achats;
    r.chargesExpl = r.sec.achats + r.sec.ext + r.sec.com + r.sec.perso + r.sec.gerante + r.sec.impots;
    r.decTTC = r.chargesExpl + r.sec.fin + r.tvaDed + r.tvaPay;
    r.debut = prevFin;
    r.solde = r.encTTC - r.decTTC;
    r.fin = r.debut + r.solde;
    r.mb = r.ca - r.achats;
    r.tauxMB = r.ca === 0 ? 0 : r.mb / r.ca;
    r.ebe = r.ca - r.chargesExpl;
    if (mode === 'prev') {
      const panier = h.panierRef * (1 + h.panierProg * Math.min(1, m / 9));
      r.tickets = h.panierRef === 0 ? 0 : Math.round(r.ca / panier);
    } else r.tickets = state.tickets[m] || 0;
    r.panier = r.tickets === 0 ? 0 : r.ca / r.tickets;

    prevNette = r.tvaNette; prevCredit = r.tvaCredit; prevFin = r.fin;
    months.push(r);
  }
  return { months, value: val };
}

// Cumul de 0 à n-1 d'un champ (ou d'une fonction)
function cumul(months, n, f) {
  const get = typeof f === 'function' ? f : r => r[f];
  let s = 0;
  for (let m = 0; m < n; m++) s += get(months[m]);
  return s;
}

function aggregate(months, n) {
  const ca = cumul(months, n, 'ca'), mb = cumul(months, n, 'mb'), ebe = cumul(months, n, 'ebe');
  const tickets = cumul(months, n, 'tickets');
  return {
    ca, mb, ebe, tickets,
    tauxMB: ca === 0 ? 0 : mb / ca,
    panier: tickets === 0 ? 0 : ca / tickets,
    remu: cumul(months, n, r => r.lines.remu),
    treso: n === 0 ? null : months[n - 1].fin,
  };
}

function compute(state) {
  const h = state.hyp;
  const prev = computeMode(state, 'prev');
  const reel = computeMode(state, 'reel');
  const n = state.closed;
  const P = prev.months, R = reel.months;

  const prev12 = aggregate(P, N);
  const prevDate = aggregate(P, n);
  const reelDate = aggregate(R, n);
  prev12.treso = P[N - 1].fin;
  prevDate.treso = n === 0 ? h.tresoInitiale : prevDate.treso;
  reelDate.treso = n === 0 ? h.tresoInitiale : reelDate.treso;

  const fixedCharges = (h.amort + h.interets);
  const resNet = (ebe, frac) => {
    const base = ebe - fixedCharges * frac;
    return base - Math.max(0, base) * h.tauxIS;
  };
  prev12.resNet = resNet(prev12.ebe, 1);
  prevDate.resNet = resNet(prevDate.ebe, n / 12);
  reelDate.resNet = resNet(reelDate.ebe, n / 12);

  // Panier prévi du T4 (août → octobre)
  const t4ca = P[9].ca + P[10].ca + P[11].ca, t4t = P[9].tickets + P[10].tickets + P[11].tickets;
  prev12.panierT4 = t4t === 0 ? 0 : t4ca / t4t;
  const panierCible = h.panierRef * (1 + h.panierProg);

  // Alerte trésorerie par mois
  const alerts = P.map((p, m) => {
    const v = m < n ? Math.min(p.fin, R[m].fin) : p.fin;
    return v < 0 ? 'Découvert' : v < h.seuilAlerte ? 'Vigilance' : 'OK';
  });

  // Bilans trimestriels (boss)
  const quarters = [0, 1, 2, 3].map(q => {
    const ms = [q * 3, q * 3 + 1, q * 3 + 2];
    const obj = h.paliers[q];
    const caPrev = sum(ms.map(m => P[m].ca));
    const caReel = sum(ms.map(m => R[m].ca));
    const partenaires = state.partners[q];
    const cible = h.partenairesCible[q];
    const done = n >= (q + 1) * 3;
    const won = done && caReel >= obj && (partenaires == null || partenaires >= cible);
    const monthsDone = Math.max(0, Math.min(3, n - q * 3));
    return { q, ms, obj, caPrev, caReel, partenaires, cible, done, won, monthsDone,
      status: !done ? 'À venir' : won ? 'Objectif atteint' : 'Écart à corriger',
      tresoFin: done ? R[ms[2]].fin : null };
  });

  // Synthèse par famille
  const families = FAMILIES.map((f, i) => {
    const caId = 'ca_' + f.id, achId = LINES.find(l => l.achat === i).id;
    const caObj = h.caObjectif * h.mix[i];
    const ca12 = cumul(P, N, r => r.lines[caId]);
    const caPrevDate = cumul(P, n, r => r.lines[caId]);
    const caReelDate = cumul(R, n, r => r.lines[caId]);
    const achReel = cumul(R, n, r => r.lines[achId]);
    const mbReel = caReelDate - achReel;
    return { ...f, i, caObj, ca12, caPrevDate, caReelDate, achReel, mbReel,
      tauxReel: caReelDate === 0 ? 0 : mbReel / caReelDate,
      tauxCible: 1 - h.tauxAchat[i],
      pctRealise: caPrevDate === 0 ? 0 : caReelDate / caPrevDate,
      part: reelDate.ca === 0 ? 0 : caReelDate / reelDate.ca };
  });

  // Contrôles de saisie
  const checks = [];
  const mixTotal = sum(h.mix), saisonTotal = sum(h.saison), paliersTotal = sum(h.paliers);
  if (Math.abs(mixTotal - 1) > 1e-4) checks.push(`Le mix des familles fait ${(mixTotal * 100).toFixed(1)} % au lieu de 100 %.`);
  if (Math.abs(saisonTotal - 1) > 1e-4) checks.push(`La saisonnalité fait ${(saisonTotal * 100).toFixed(1)} % au lieu de 100 %.`);
  if (Math.abs(paliersTotal - h.caObjectif) > 0.01) checks.push('La somme des paliers trimestriels doit être égale au CA objectif.');
  const lateEntries = [];
  for (let m = n + 1; m < N; m++) {
    const has = Object.values(state.reel).some(a => a && a[m] != null) || state.tickets[m] != null;
    if (has) lateEntries.push(MONTHS[m]);
  }
  if (lateEntries.length) checks.push(`Réel saisi après la mission en cours : ${lateEntries.join(', ')}.`);

  const tauxAchatMoyen = sum(h.mix.map((x, i) => x * h.tauxAchat[i]));

  return { P, R, n, prev12, prevDate, reelDate, alerts, quarters, families, checks,
    panierCible, tauxMBCible: 1 - tauxAchatMoyen, prevValue: prev.value };
}

// ————— Gamification —————
const LEVELS = [
  { xp: 0, title: "Apprentie de l'atelier" },
  { xp: 250, title: 'Compagnonne du cuir' },
  { xp: 600, title: 'Artisane confirmée' },
  { xp: 1100, title: 'Maîtresse des clés' },
  { xp: 1800, title: 'Gardienne de la trésorerie' },
  { xp: 2700, title: "Cheffe d'entreprise" },
  { xp: 3800, title: 'Légende de La Garde' },
];

function ritualDeadline(m) {
  const [y, mo] = MONTH_YM[m];
  return new Date(y, mo + 1, 10, 23, 59, 59);
}

function achievementsList(state, c) {
  const h = state.hyp, n = c.n, R = c.R, P = c.P;
  const closedMonths = [...Array(n).keys()];
  const onTime = closedMonths.filter(m => state.closedAt[m] && new Date(state.closedAt[m]) <= ritualDeadline(m)).length;
  const caBeat = closedMonths.filter(m => R[m].ca >= P[m].ca).length;
  const ticketsDone = closedMonths.filter(m => state.tickets[m] > 0).length;
  const panierNov = R[0].panier || h.panierRef;
  const panierUp = closedMonths.some(m => m > 0 && R[m].panier > 0 && R[m].panier >= panierNov * 1.05);
  const questDone = Object.values(state.quests).filter(Boolean).length;
  const noOverdraft = n >= 3 && closedMonths.every(m => R[m].fin >= 0);
  const remuOn = closedMonths.some(m => R[m].lines.remu > 0);
  const remu2000 = closedMonths.some(m => R[m].lines.remu >= h.remuVisee);
  const partnersMax = Math.max(0, ...state.partners.map(x => x || 0));
  return [
    { id: 'first', icon: '🎮', name: 'Partie lancée', desc: 'Remettre un premier mois au réel', xp: 50, ok: n >= 1 },
    { id: 'ticket', icon: '🧾', name: 'Œil de lynx', desc: 'Saisir le nombre de tickets de caisse d\'un mois', xp: 30, ok: ticketsDone >= 1 },
    { id: 'beat', icon: '🚀', name: 'Au-dessus du plan', desc: 'Faire un CA réel supérieur au prévi sur un mois', xp: 60, ok: caBeat >= 1 },
    { id: 'beat3', icon: '🔥', name: 'En feu', desc: 'Battre le prévi de CA sur 3 mois', xp: 120, ok: caBeat >= 3 },
    { id: 'ritual3', icon: '📅', name: 'Rituel du 10', desc: 'Clôturer 3 mois avant le 10 du mois suivant', xp: 100, ok: onTime >= 3 },
    { id: 'safe', icon: '🛡️', name: 'Bouclier de tréso', desc: '3 mois clôturés sans découvert', xp: 100, ok: noOverdraft },
    { id: 'boss1', icon: '🐉', name: 'Boss T1 vaincu', desc: `${fmtK(h.paliers[0])} de CA sur nov. → janv.`, xp: 150, ok: c.quarters[0].won },
    { id: 'boss2', icon: '🐲', name: 'Boss T2 vaincu', desc: `${fmtK(h.paliers[1])} de CA sur févr. → avr.`, xp: 150, ok: c.quarters[1].won },
    { id: 'boss3', icon: '👹', name: 'Boss T3 vaincu', desc: `${fmtK(h.paliers[2])} de CA sur mai → juil.`, xp: 150, ok: c.quarters[2].won },
    { id: 'boss4', icon: '🏆', name: 'Boss final vaincu', desc: `${fmtK(h.paliers[3])} de CA sur août → oct.`, xp: 200, ok: c.quarters[3].won },
    { id: 'partner', icon: '🤝', name: 'Premier allié', desc: 'Un partenaire prescripteur actif', xp: 60, ok: partnersMax >= 1 },
    { id: 'partner4', icon: '🏰', name: 'Guilde complète', desc: '4 partenaires actifs', xp: 150, ok: partnersMax >= 4 },
    { id: 'fiches', icon: '📐', name: 'Architecte des marges', desc: '10 fiches de coût réalisées', xp: 120, ok: state.fiches >= 10 },
    { id: 'panier', icon: '🛒', name: 'Panier garni', desc: 'Panier moyen réel +5 % vs novembre', xp: 80, ok: panierUp },
    { id: 'remu', icon: '💰', name: 'Première paie', desc: 'Verser une rémunération à Déborah', xp: 100, ok: remuOn },
    { id: 'remu2000', icon: '👑', name: 'Objectif 2 000 €', desc: `Se verser ${fmtE(h.remuVisee)} nets sur un mois`, xp: 200, ok: remu2000 },
    { id: 'quests5', icon: '📜', name: 'Aventurière', desc: 'Accomplir 5 quêtes annexes', xp: 60, ok: questDone >= 5 },
    { id: 'year', icon: '🌟', name: 'Année complète', desc: 'Remettre les 12 mois au réel', xp: 300, ok: n >= 12 },
    { id: 'ca75', icon: '💎', name: 'Objectif 75 k€', desc: `Atteindre ${fmtK(h.caObjectif)} de CA réel`, xp: 400, ok: c.reelDate.ca >= h.caObjectif },
  ];
}

function computeXP(state, c) {
  const n = c.n, R = c.R, P = c.P, h = state.hyp;
  const log = [];
  for (let m = 0; m < n; m++) {
    let x = 100; const why = ['mois remis au réel +100'];
    if (state.tickets[m] > 0) { x += 20; why.push('tickets +20'); }
    if (R[m].ca >= P[m].ca) { x += 50; why.push('CA ≥ prévi +50'); }
    if (R[m].fin >= h.seuilAlerte) { x += 30; why.push('tréso ≥ seuil +30'); }
    log.push({ label: MONTHS[m], xp: x, why: why.join(' · ') });
  }
  const q = Object.values(state.quests).filter(Boolean).length;
  if (q) log.push({ label: 'Quêtes annexes', xp: q * 25, why: `${q} × 25` });
  if (state.fiches) log.push({ label: 'Fiches de coût', xp: Math.min(state.fiches, 10) * 10, why: `${Math.min(state.fiches, 10)} × 10` });
  const ach = achievementsList(state, c);
  const achXp = sum(ach.filter(a => a.ok).map(a => a.xp));
  if (achXp) log.push({ label: 'Succès débloqués', xp: achXp, why: `${ach.filter(a => a.ok).length} succès` });
  const total = sum(log.map(l => l.xp));
  let lvl = 0;
  for (let i = 0; i < LEVELS.length; i++) if (total >= LEVELS[i].xp) lvl = i;
  const next = LEVELS[lvl + 1];
  return { total, lvl: lvl + 1, title: LEVELS[lvl].title, cur: LEVELS[lvl].xp, next: next ? next.xp : null,
    nextTitle: next ? next.title : null, log, ach };
}

// ————— Formats —————
const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmtE(v, dec) { if (v == null || isNaN(v)) return '—'; return (dec ? nf2 : nf0).format(v) + ' €'; }
function fmtK(v) { return Math.abs(v) >= 1000 ? nf0.format(v / 1000) + ' k€' : fmtE(v); }
function fmtP(v, d = 1) { if (v == null || isNaN(v)) return '—'; return (v * 100).toFixed(d).replace('.', ',') + ' %'; }
function fmtS(v) { return (v > 0 ? '+' : '') + fmtE(v); }
function parseNum(s) {
  if (s == null) return null;
  const t = String(s).replace(/\s|€| /g, '').replace(',', '.');
  if (t === '') return null;
  const v = Number(t);
  return isNaN(v) ? NaN : v;
}

if (typeof module !== 'undefined') {
  module.exports = { defaultState, normalizeState, compute, computeXP, achievementsList, LEVELS, ritualDeadline };
}
