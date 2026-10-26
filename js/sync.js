// Synchronisation PC ↔ téléphone via un dépôt GitHub PRIVÉ (sans serveur ni Supabase).
// Les données sont enregistrées dans un fichier JSON du dépôt grâce à l'API GitHub.
// Le jeton d'accès reste sur l'appareil (localStorage) et n'est jamais inclus dans les sauvegardes.

const SYNC_KEY = 'dscordo-sync-v1';
const SYNC_DEFAULT = { owner: 'aquilonevideos-sketch', repo: 'ds-cordo-donnees', path: 'ds-cordo-sauvegarde.json', branch: 'main' };
const QR_URL = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';

const sync = { cfg: loadSyncCfg(), status: 'off', msg: '', busy: false, timer: null, again: false };

function loadSyncCfg() {
  try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || null; } catch (e) { return null; }
}
function saveSyncCfg() {
  try {
    if (sync.cfg) localStorage.setItem(SYNC_KEY, JSON.stringify(sync.cfg));
    else localStorage.removeItem(SYNC_KEY);
  } catch (e) { /* ignoré */ }
}
const syncOn = () => !!(sync.cfg && sync.cfg.token);

// Encodage base64 compatible UTF-8 (accents, emojis)
function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64decode(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}

async function gh(method, body) {
  const c = sync.cfg;
  const url = `https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/contents/${c.path.split('/').map(encodeURIComponent).join('/')}` +
    (method === 'GET' ? `?ref=${encodeURIComponent(c.branch)}` : '');
  const res = await fetch(url, {
    method,
    cache: 'no-store',
    headers: { Authorization: `Bearer ${c.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 404 && method === 'GET') return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || 'HTTP ' + res.status);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function pullRemote() {
  const d = await gh('GET');
  if (!d) return null;
  return { sha: d.sha, state: JSON.parse(b64decode(d.content)) };
}

async function pushLocal(sha) {
  const body = {
    message: `Synchro ${new Date().toLocaleString('fr-FR')}`,
    content: b64encode(JSON.stringify(state)),
    branch: sync.cfg.branch,
  };
  if (sha) body.sha = sha;
  const d = await gh('PUT', body);
  sync.cfg.sha = d.content.sha;
  sync.cfg.syncedAt = state.updatedAt;
  saveSyncCfg();
}

function adoptRemote(remoteState) {
  state = normalizeState(remoteState);
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignoré */ }
  recompute();
  state.seenAch = Array.from(new Set([...state.seenAch, ...xp.ach.filter(a => a.ok).map(a => a.id)]));
  ui.month = Math.min(state.closed, 11);
  render();
}

// Une synchronisation complète : récupère la version du dépôt, garde la plus récente, renvoie si besoin
async function syncNow(opts = {}) {
  if (!syncOn()) return;
  if (sync.busy) { sync.again = true; return; }
  sync.busy = true;
  setSyncStatus('busy', 'Synchronisation…');
  try {
    const remote = await pullRemote();
    const c = sync.cfg;
    const localChanged = !!state.updatedAt && state.updatedAt !== c.syncedAt;
    if (!remote) {
      await pushLocal(null);
    } else {
      const rAt = remote.state.updatedAt || '';
      const remoteChanged = rAt !== c.syncedAt;
      if (remoteChanged && (!localChanged || rAt > (state.updatedAt || ''))) {
        if (localChanged) backupConflict();
        adoptRemote(remote.state);
        c.sha = remote.sha; c.syncedAt = rAt; saveSyncCfg();
        if (!opts.silent) toast('☁️', 'Données mises à jour', 'La dernière version (autre appareil) a été récupérée.', true);
        if (localChanged) toast('⚠️', 'Modifications sur deux appareils', 'La version la plus récente a été gardée ; l’autre est conservée en secours sur cet appareil.', true);
      } else if (localChanged) {
        if (remoteChanged) backupConflict(remote.state);
        await pushLocal(remote.sha);
      } else {
        c.sha = remote.sha; saveSyncCfg();
      }
    }
    sync.cfg.lastOk = new Date().toISOString();
    saveSyncCfg();
    setSyncStatus('ok', 'Synchronisé');
  } catch (e) {
    if (e.status === 409 && !opts.retried) { sync.busy = false; return syncNow({ ...opts, retried: true }); }
    const why = e.status === 401 ? 'Jeton invalide ou expiré' : e.status === 403 ? 'Accès refusé (droits du jeton)' : e.status === 404 ? 'Dépôt introuvable' : !navigator.onLine ? 'Hors ligne' : e.message;
    setSyncStatus('err', why);
    if (opts.manual) toast('⚠️', 'Synchronisation impossible', why, true);
  } finally {
    sync.busy = false;
    if (sync.again) { sync.again = false; scheduleSync(500); }
  }
}

function backupConflict(other) {
  try { localStorage.setItem('dscordo-conflit-secours', JSON.stringify({ at: new Date().toISOString(), state: other || state })); } catch (e) { /* ignoré */ }
}

function scheduleSync(delay = 2500) {
  if (!syncOn()) return;
  clearTimeout(sync.timer);
  sync.timer = setTimeout(() => syncNow({ silent: true }), delay);
}

function setSyncStatus(st, msg) {
  sync.status = st; sync.msg = msg;
  const el = document.getElementById('syncBadge');
  if (el) el.outerHTML = syncBadge();
  const box = document.getElementById('syncState');
  if (box) box.innerHTML = syncStateHtml();
}

function syncBadge() {
  if (!syncOn()) return `<a id="syncBadge" href="#sauvegarde" class="sync-badge off" title="Synchronisation désactivée">☁️ Synchro désactivée</a>`;
  const map = { ok: ['ok', '☁️ Synchronisé'], busy: ['busy', '⏳ Synchro…'], err: ['err', '⚠️ ' + sync.msg], off: ['busy', '☁️ Connexion…'] };
  const [cls, txt] = map[sync.status] || map.off;
  return `<a id="syncBadge" href="#sauvegarde" class="sync-badge ${cls}" title="${esc(sync.msg)}">${esc(txt)}</a>`;
}

function syncStateHtml() {
  if (!syncOn()) return '<div class="alert warn">☁️ <div>Synchronisation <b>désactivée</b> sur cet appareil : les données restent uniquement dans ce navigateur.</div></div>';
  const last = sync.cfg.lastOk ? new Date(sync.cfg.lastOk).toLocaleString('fr-FR') : 'jamais';
  return `<div class="alert ${sync.status === 'err' ? 'bad' : 'ok'}">${sync.status === 'err' ? '⚠️' : '☁️'} <div><b>${sync.status === 'err' ? esc(sync.msg) : 'Synchronisation active'}</b> — dépôt privé <code>${esc(sync.cfg.owner)}/${esc(sync.cfg.repo)}</code><br><span class="muted">Dernière synchro réussie : ${last}</span></div></div>`;
}

// ————— Écran de réglage (dans « Sauvegarde & guide ») —————
function syncCard() {
  const c = sync.cfg || SYNC_DEFAULT;
  return `<div class="card glow-pink" style="margin-bottom:16px">
    <h2>☁️ Synchronisation PC ↔ téléphone</h2>
    <div id="syncState">${syncStateHtml()}</div>
    ${syncOn() ? `
      <div class="row">
        <button class="btn primary" data-sync="now">🔄 Synchroniser maintenant</button>
        <button class="btn" data-sync="qr">📱 Connecter un téléphone (QR code)</button>
        <button class="btn danger small" data-sync="off">Déconnecter cet appareil</button>
      </div>
      <div id="qrBox" style="margin-top:14px"></div>
      <p class="muted" style="margin-top:12px">Les modifications sont envoyées automatiquement quelques secondes après chaque saisie, et récupérées à l’ouverture de l’outil ou au retour sur l’onglet.</p>`
    : `
      <p class="muted">Les données sont enregistrées dans un fichier d’un <b>dépôt GitHub privé</b>. Il suffit de connecter chaque appareil une seule fois.</p>
      <details class="sec-block"><summary><span class="chev">▶</span>Comment obtenir la clé d’accès (une seule fois, sur ordinateur)</summary>
        <div class="sec-body guide" style="padding:6px 16px">
          <ol>
            <li>Ouvrir <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">GitHub → Fine-grained token</a> (connecté au compte propriétaire du dépôt).</li>
            <li>Nom : « DS CORDO synchro » · Expiration : la plus longue proposée.</li>
            <li>Repository access : <b>Only select repositories</b> → <code>${esc(c.repo)}</code>.</li>
            <li>Permissions → Repository permissions → <b>Contents : Read and write</b> (rien d’autre).</li>
            <li>Générer, copier la clé (<code>github_pat_…</code>) et la coller ci-dessous.</li>
          </ol>
          <p class="muted">Cette clé ne donne accès qu’à ce dépôt de données. Pour le téléphone, inutile de la retaper : utilisez ensuite le QR code.</p>
        </div></details>
      <div class="fields" style="margin-top:12px">
        <div class="field"><label>Compte GitHub</label><input class="inp" id="syOwner" value="${esc(c.owner)}"></div>
        <div class="field"><label>Dépôt privé</label><input class="inp" id="syRepo" value="${esc(c.repo)}"></div>
        <div class="field" style="grid-column:1/-1"><label>Clé d’accès (jeton GitHub)</label><input class="inp" id="syToken" type="password" autocomplete="off" placeholder="github_pat_…"></div>
      </div>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-sync="connect">🔗 Connecter cet appareil</button></div>`}
  </div>`;
}

async function connectSync(cfg) {
  sync.cfg = { ...SYNC_DEFAULT, ...cfg, sha: null, syncedAt: null, lastOk: null };
  saveSyncCfg();
  try {
    const remote = await pullRemote();
    if (remote && remote.state && remote.state.hyp) {
      const hasLocalWork = state.closed > 0 || Object.keys(state.reel).length > 0;
      const useRemote = !hasLocalWork || confirm('Des données existent déjà dans le cloud. Les récupérer sur cet appareil ?\n\nOK = récupérer les données du cloud\nAnnuler = envoyer les données de cet appareil (elles remplaceront celles du cloud)');
      if (useRemote) {
        adoptRemote(remote.state);
        sync.cfg.sha = remote.sha; sync.cfg.syncedAt = remote.state.updatedAt || null;
      } else {
        state.updatedAt = new Date().toISOString();
        await pushLocal(remote.sha);
      }
    } else {
      if (!state.updatedAt) state.updatedAt = new Date().toISOString();
      await pushLocal(remote ? remote.sha : null);
    }
    sync.cfg.lastOk = new Date().toISOString();
    saveSyncCfg();
    setSyncStatus('ok', 'Synchronisé');
    toast('☁️', 'Appareil connecté', 'Les données se synchronisent désormais automatiquement.', true);
    celebrate();
  } catch (e) {
    const why = e.status === 401 ? 'Clé invalide ou expirée' : e.status === 403 || e.status === 404 ? 'Accès refusé : vérifiez le dépôt et les droits « Contents : Read and write »' : 'Connexion impossible (internet ?)';
    sync.cfg = null; saveSyncCfg();
    toast('⚠️', 'Connexion refusée', why, true);
  }
  render();
}

function loadQR() {
  if (window.qrcode) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = QR_URL; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}
async function showPhoneQR() {
  const box = document.getElementById('qrBox');
  if (box.innerHTML) { box.innerHTML = ''; return; }
  try { await loadQR(); } catch (e) { return toast('⚠️', 'QR code indisponible', 'Connexion internet requise.', true); }
  const { owner, repo, path, branch, token } = sync.cfg;
  // Le paramètre est dans le « # » de l'adresse : il n'est jamais envoyé au serveur et il est effacé dès l'ouverture.
  const link = location.origin + location.pathname + '#connect=' + b64encode(JSON.stringify({ owner, repo, path, branch, token }));
  const qr = qrcode(0, 'M');
  qr.addData(link);
  qr.make();
  box.innerHTML = `<div class="qr-wrap"><div class="qr">${qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true })}</div>
    <div><b>Sur le téléphone :</b> ouvrez l’appareil photo, scannez ce code et ouvrez le lien. Le téléphone est alors connecté.
    <p class="muted">⚠️ Ce code contient la clé d’accès : ne le montrez pas et ne le partagez pas. Cliquez à nouveau sur le bouton pour le masquer.</p></div></div>`;
}

// Lien « #connect=… » ouvert depuis le QR code
function handleConnectLink() {
  const m = location.hash.match(/^#connect=(.+)$/);
  if (!m) return false;
  history.replaceState(null, '', location.pathname + '#sauvegarde');
  try {
    const cfg = JSON.parse(b64decode(decodeURIComponent(m[1])));
    if (!cfg.token) throw new Error('jeton');
    connectSync(cfg);
  } catch (e) { toast('⚠️', 'Lien de connexion invalide', 'Regénérez le QR code sur l’ordinateur.', true); }
  return true;
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-sync]');
  if (!t) return;
  const a = t.dataset.sync;
  if (a === 'connect') {
    const token = document.getElementById('syToken').value.trim();
    if (!token) return toast('⚠️', 'Clé manquante', 'Collez la clé d’accès GitHub.', true);
    return connectSync({ owner: document.getElementById('syOwner').value.trim(), repo: document.getElementById('syRepo').value.trim(), token });
  }
  if (a === 'now') return syncNow({ manual: true });
  if (a === 'qr') return showPhoneQR();
  if (a === 'off') {
    if (!confirm('Déconnecter cet appareil ? Les données restent dans ce navigateur et dans le cloud.')) return;
    sync.cfg = null; saveSyncCfg(); setSyncStatus('off', ''); render();
  }
});

function syncInit() {
  if (handleConnectLink()) route();
  if (syncOn()) syncNow({ silent: false });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow({ silent: false }); });
  window.addEventListener('online', () => syncNow({ silent: true }));
  setInterval(() => { if (document.visibilityState === 'visible') syncNow({ silent: false }); }, 90000);
}
