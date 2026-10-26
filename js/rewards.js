// Onglet « Récompenses » : les points d'XP gagnés s'échangent contre des récompenses.
// Le total d'XP (et donc le niveau) ne baisse jamais ; seuls les « points disponibles » sont dépensés.

const rw = () => state.rewards;

function rewardStatus(r) {
  const claimedCount = rw().claims.filter(c => c.rewardId === r.id).length;
  if (!r.repeatable && claimedCount) return { id: 'claimed', txt: '✔ Déjà obtenue', cls: 'ok', claimedCount };
  if (xp.lvl < (r.minLevel || 1)) return { id: 'level', txt: `🔒 Niveau ${r.minLevel} requis`, cls: '', claimedCount };
  if (xp.points < r.cost) return { id: 'points', txt: `Encore ${nf0.format(r.cost - xp.points)} pts`, cls: 'warn', claimedCount };
  return { id: 'ok', txt: '🎉 Disponible', cls: 'gold', claimedCount };
}
const affordableRewards = () => rw().items.filter(r => rewardStatus(r).id === 'ok');

function viewRecompenses() {
  const items = [...rw().items].sort((a, b) => a.cost - b.cost);
  const claims = [...rw().claims].sort((a, b) => b.date.localeCompare(a.date));
  const next = items.find(r => ['points', 'level'].includes(rewardStatus(r).id));
  return `
  <div class="page-head">
    <div><h1>Boutique des récompenses</h1><div class="sub">Chaque point d'XP gagné peut être échangé contre une récompense. Le niveau, lui, ne baisse jamais.</div></div>
    <button class="btn primary" data-rw-new>＋ Ajouter une récompense</button>
  </div>

  <div class="grid g3" style="margin-bottom:18px">
    <div class="card glow-gold kpi"><div class="k-label">💰 Points disponibles</div><div class="k-val" style="color:var(--gold)">${nf0.format(xp.points)} pts</div><div class="k-sub">${nf0.format(xp.total)} XP gagnés · ${nf0.format(xp.spent)} pts dépensés</div></div>
    <div class="card kpi"><div class="k-label">🎁 Récompenses disponibles maintenant</div><div class="k-val">${affordableRewards().length}</div><div class="k-sub">${claims.length} récompense(s) obtenue(s) au total</div></div>
    <div class="card kpi"><div class="k-label">🎯 Prochaine récompense</div>
      ${next ? `<div class="k-val" style="font-size:18px">${next.icon} ${esc(next.name)}</div>
      <div class="bar-label"><span>${nf0.format(Math.min(xp.points, next.cost))} / ${nf0.format(next.cost)} pts</span><b>${rewardStatus(next).txt}</b></div>${bar('xp', next.cost ? xp.points / next.cost : 0)}`
      : '<div class="k-sub">Toutes les récompenses sont accessibles 🎉</div>'}</div>
  </div>

  <div class="badges rewards" style="margin-bottom:18px">
    ${items.map(r => {
      const st = rewardStatus(r);
      return `<div class="badge reward ${st.id === 'ok' ? 'ok' : st.id === 'claimed' ? '' : 'locked'}">
        <button class="rw-edit" data-rw-edit="${r.id}" title="Modifier">✎</button>
        <div class="b-ic">${esc(r.icon)}</div>
        <div class="b-name">${esc(r.name)}</div>
        <div class="b-desc">${esc(r.desc || '')}</div>
        <div class="rw-cost">${nf0.format(r.cost)} pts${r.minLevel > 1 ? ` · niv. ${r.minLevel}` : ''}${r.repeatable ? '' : ' · unique'}</div>
        ${st.id === 'points' ? bar('xp', xp.points / r.cost) : ''}
        <span class="tag ${st.cls}">${st.txt}</span>
        ${st.claimedCount && r.repeatable ? `<div class="dim" style="font-size:11px">Obtenue ${st.claimedCount} fois</div>` : ''}
        <button class="btn ${st.id === 'ok' ? 'gold' : ''} small" data-rw-claim="${r.id}" ${st.id === 'ok' ? '' : 'disabled'} style="width:100%;justify-content:center">🎁 Réclamer</button>
      </div>`;
    }).join('')}
  </div>

  <div class="grid g2">
    <div class="card"><h2>📜 Historique des récompenses</h2>
      ${claims.length ? claims.map(c => `<div class="sum-line"><span>${esc(c.icon)} ${esc(c.name)} <span class="dim">— ${new Date(c.date).toLocaleDateString('fr-FR')}</span></span>
        <span class="row" style="gap:8px"><b class="neg">−${nf0.format(c.cost)} pts</b><button class="btn small ghost" data-rw-undo="${c.id}" title="Annuler et récupérer les points">↩</button></span></div>`).join('')
      : '<p class="muted">Aucune récompense réclamée pour l’instant. Validez vos missions, terminez vos tâches et débloquez des succès pour gagner des points !</p>'}
    </div>
    <div class="card guide"><h2>💡 Comment gagner des points</h2>
      <ul>
        <li>⚔️ <b>Mission du mois</b> : +100 par mois remis au réel, +20 tickets saisis, +50 CA ≥ prévi, +30 trésorerie ≥ seuil.</li>
        <li>📋 <b>Planning</b> : +10 à +30 par tâche terminée selon la priorité, +5 si dans les délais.</li>
        <li>🎯 <b>Quêtes</b> : +25 par quête annexe, +10 par fiche de coût.</li>
        <li>🏆 <b>Succès</b> : de +30 à +400 (boss vaincus, partenaires, objectif 75 k€…).</li>
      </ul>
      <p class="muted">Les récompenses proposées sont des exemples : modifiez-les (✎) ou ajoutez les vôtres, avec le nombre de points et le niveau requis.</p>
    </div>
  </div>`;
}

function qgRewardsLine() {
  const n = affordableRewards().length;
  return `<div class="bar-label rw-line" style="margin-top:10px"><span>💰 Points à dépenser <b>${nf0.format(xp.points)}</b></span>
    <a href="#recompenses" class="tag ${n ? 'gold' : ''}" style="text-decoration:none">🎁 ${n} récompense${n > 1 ? 's' : ''} disponible${n > 1 ? 's' : ''}</a></div>`;
}

// ————— Fiche récompense —————
function openReward(id) {
  const r = id ? rw().items.find(x => x.id === id) : { icon: '🎁', name: '', desc: '', cost: 300, minLevel: 1, repeatable: true };
  if (!r) return;
  let dlg = document.getElementById('rewardDlg');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'rewardDlg';
    dlg.className = 'dlg';
    document.body.appendChild(dlg);
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  }
  dlg.innerHTML = `<form id="rewardForm">
    <div class="row"><h2 style="margin:0">${id ? '✎ Modifier la récompense' : '＋ Nouvelle récompense'}</h2><span class="spacer"></span><button type="button" class="btn small ghost" data-rw-close>✕</button></div>
    <div class="fields" style="margin-top:12px">
      <div class="field"><label>Icône (emoji)</label><input class="inp" name="icon" maxlength="4" value="${esc(r.icon)}"></div>
      <div class="field" style="grid-column:span 2"><label>Récompense *</label><input class="inp" name="name" required value="${esc(r.name)}"></div>
    </div>
    <div class="field" style="margin-top:12px"><label>Description</label><input class="inp" name="desc" value="${esc(r.desc || '')}"></div>
    <div class="fields" style="margin-top:12px">
      <div class="field"><label>Coût (points)</label><input class="inp" type="number" min="1" step="1" name="cost" required value="${r.cost}"></div>
      <div class="field"><label>Niveau minimum</label><select class="inp" name="minLevel">${LEVELS.map((l, i) => `<option value="${i + 1}" ${i + 1 === (r.minLevel || 1) ? 'selected' : ''}>Niv. ${i + 1} — ${esc(l.title)}</option>`).join('')}</select></div>
      <label class="check" style="border:0;align-self:end"><input type="checkbox" name="repeatable" ${r.repeatable ? 'checked' : ''}><span>Peut être obtenue plusieurs fois</span></label>
    </div>
    <div class="row" style="margin-top:16px">
      ${id ? `<button type="button" class="btn danger small" data-rw-del="${id}">🗑 Supprimer</button>` : ''}
      <span class="spacer"></span>
      <button type="button" class="btn ghost" data-rw-close>Annuler</button>
      <button type="submit" class="btn primary">💾 Enregistrer</button>
    </div>
  </form>`;
  dlg.querySelector('#rewardForm').addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const data = {
      icon: (f.get('icon') || '🎁').toString().trim() || '🎁',
      name: f.get('name').toString().trim(),
      desc: f.get('desc').toString().trim(),
      cost: Math.max(1, Math.round(Number(f.get('cost')) || 0)),
      minLevel: Number(f.get('minLevel')) || 1,
      repeatable: f.get('repeatable') === 'on',
    };
    if (!data.name) return;
    if (id) Object.assign(r, data);
    else rw().items.push({ id: 'r_' + Date.now().toString(36), ...data });
    dlg.close();
    commit();
  });
  dlg.showModal();
}

function claimReward(id) {
  const r = rw().items.find(x => x.id === id);
  if (!r || rewardStatus(r).id !== 'ok') return;
  if (!confirm(`Échanger ${nf0.format(r.cost)} points contre « ${r.name} » ?`)) return;
  rw().claims.push({ id: 'c_' + Date.now().toString(36), rewardId: r.id, name: r.name, icon: r.icon, cost: r.cost, date: new Date().toISOString() });
  toast(r.icon, 'Récompense obtenue !', `${r.name} — profitez-en, vous l'avez méritée 🎉`);
  celebrate(true);
  commit();
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-rw-new],[data-rw-edit],[data-rw-claim],[data-rw-undo],[data-rw-del],[data-rw-close]');
  if (!t) return;
  const d = t.dataset;
  if (d.rwNew != null) return openReward(null);
  if (d.rwEdit) return openReward(d.rwEdit);
  if (d.rwClaim) return claimReward(d.rwClaim);
  if (d.rwClose != null) return document.getElementById('rewardDlg').close();
  if (d.rwUndo) {
    const c = rw().claims.find(x => x.id === d.rwUndo);
    if (!c || !confirm(`Annuler « ${c.name} » et récupérer ${nf0.format(c.cost)} points ?`)) return;
    rw().claims = rw().claims.filter(x => x.id !== d.rwUndo);
    return commit();
  }
  if (d.rwDel) {
    if (!confirm('Supprimer cette récompense de la boutique ? (l’historique est conservé)')) return;
    rw().items = rw().items.filter(x => x.id !== d.rwDel);
    document.getElementById('rewardDlg').close();
    return commit();
  }
});
