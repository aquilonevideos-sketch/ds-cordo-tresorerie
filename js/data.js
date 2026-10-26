// Données de référence issues du fichier
// « Plan_tresorerie_DS_CORDO_Deborah_SANFOURCHE_nov26-oct27.xlsx » (BE CONSULTING).
// Toutes les valeurs ci-dessous sont modifiables dans l'onglet « Réglages » de l'application.

const MONTHS = ['Nov. 26', 'Déc. 26', 'Jan. 27', 'Fév. 27', 'Mars 27', 'Avr. 27',
  'Mai 27', 'Juin 27', 'Juil. 27', 'Août 27', 'Sept. 27', 'Oct. 27'];
// Année / mois JS (0 = janvier) de chaque mois du plan
const MONTH_YM = [[2026, 10], [2026, 11], [2027, 0], [2027, 1], [2027, 2], [2027, 3],
  [2027, 4], [2027, 5], [2027, 6], [2027, 7], [2027, 8], [2027, 9]];

const FAMILIES = [
  { id: 'cordo', label: 'Cordonnerie (talons, semelles, réparations)', short: 'Cordonnerie', group: 'atelier',
    note: 'Talon 22 € TTC (≈ 48 €/h après matières), semelle 40 € TTC (≈ 52 €/h)' },
  { id: 'couture', label: 'Couture & retouches cuir', short: 'Couture', group: 'atelier',
    note: 'Tarif horaire moyen noté : 50 €/h — fils, fermetures, petites fournitures' },
  { id: 'soins', label: 'Soins & entretien (cirage, teinture, imperméabilisation)', short: 'Soins', group: 'atelier',
    note: 'Tarif horaire noté : 50 €/h — produits consommés' },
  { id: 'clesRepro', label: 'Clés — reproduction (plates, à gorge, sécurité)', short: 'Clés repro', group: 'cles',
    note: 'Marges notées : clé plate 5 €, à gorge 12 €, sécurité 28 €' },
  { id: 'clesVente', label: 'Clés — vente (clés, télécommandes, serrurerie)', short: 'Clés vente', group: 'cles',
    note: 'Marge notée : 8 €/clé ; 30 % sur les clés de sécurité → achats ≈ 70 %' },
  { id: 'maro', label: 'Maroquinerie (sacs, ceintures, portefeuilles)', short: 'Maroquinerie', group: 'march',
    note: 'Coefficient noté 3,2 → achats ≈ 37,5 % du prix HT' },
  { id: 'acces', label: 'Produits et accessoires pour le cuir', short: 'Accessoires', group: 'march',
    note: 'Coefficient noté 3,2 → achats ≈ 37,5 % du prix HT' },
  { id: 'divers', label: 'Divers', short: 'Divers', group: 'march',
    note: 'Coefficient noté 2 → achats ≈ 60 % du HT' },
];

const TVA_REGIMES = ['Réel normal (mensuel)', 'Réel simplifié (acomptes)', 'Non assujetti (franchise)'];

const DEFAULT_HYP = {
  entreprise: 'DS CORDO (SARL)',
  gerante: 'Déborah SANFOURCHE',
  atelier: 'Rue Raspail, La Garde (83)',
  expert: 'Camille ROYERE',
  // Repères comptables (situation intermédiaire de l'expert-comptable) :
  // laissés à 0 dans le code public, à renseigner dans « Réglages » ou via la sauvegarde de départ.
  ca2025: 0, ca2026: 0, achats2026: 0, dispo3108: 0,
  emprunt: 0, cca: 0, dettesFourn: 0,
  // Objectifs SMART
  caObjectif: 75000,
  panierRef: 25, panierProg: 0.10,
  tresoObjectif: 2125, seuilAlerte: 2125,
  tresoInitiale: 0,
  remuVisee: 2000,
  paliers: [15000, 18000, 20000, 22000],
  partenairesCible: [1, 2, 3, 4],
  // TVA
  regimeTVA: TVA_REGIMES[0],
  tvaOct: 0, creditTVA: 0, acompteDec: 0, soldeCA12: 0, acompteJuil: 0,
  // Gérante
  urssaf: 114, prevoyance: 120, tauxCotis: 0.5,
  // Estimations comptables
  amort: 5858, interets: 1180, tauxIS: 0,
  // Mix du CA par famille et taux d'achats
  mix: [0.39, 0.11, 0.03, 0.20, 0.06, 0.105, 0.07, 0.035],
  tauxAchat: [0.18, 0.05, 0.10, 0.25, 0.70, 0.375, 0.375, 0.60],
  // Saisonnalité (% du CA annuel) et rémunération nette prévue
  saison: [0.097, 0.092, 0.088, 0.073, 0.09, 0.093, 0.095, 0.085, 0.108, 0.037, 0.067, 0.075],
  remu: [0, 0, 0, 1000, 1000, 1000, 1500, 1500, 1500, 2000, 2000, 2000],
};

const SAISON_NOTES = [
  "Ouverture le samedi 14/11 : demi-mois d'activité + lancement (boîtage, Facebook)",
  'Fêtes : clés, maroquinerie & accessoires cadeaux',
  "Ressemelages d'hiver — fin du T1 (objectif 15 000 €)",
  'Bilan à 3 mois (plan de communication)',
  'Printemps : entretien, sandales',
  'Fin du T2 (objectif 18 000 €)',
  'Revue SMART à 6 mois',
  "Avant l'été : sandales, maroquinerie",
  'Creux estival attendu',
  'Creux estival — prévoir les congés',
  "Rentrée : offres d'automne, imperméabilisation",
  "Bottes & ressemelages d'hiver — bilan annuel (T4 : 22 000 €)",
];

const SECTIONS = [
  { id: 'atelier', kind: 'enc', label: 'A1. Atelier : cordonnerie, couture & soins', icon: '🥾' },
  { id: 'cles', kind: 'enc', label: 'A2. Clés minute', icon: '🔑' },
  { id: 'march', kind: 'enc', label: 'A3. Ventes de marchandises', icon: '👜' },
  { id: 'autresEnc', kind: 'enc', label: "A4. Autres encaissements (hors CA)", icon: '💶' },
  { id: 'achats', kind: 'dec', label: 'B1. Achats consommés par famille', icon: '📦' },
  { id: 'ext', kind: 'dec', label: 'B2. Charges externes de fonctionnement', icon: '🏠' },
  { id: 'com', kind: 'dec', label: 'B3. Communication', icon: '📣' },
  { id: 'perso', kind: 'dec', label: 'B4. Personnel (apprenti·e)', icon: '🧑‍🔧' },
  { id: 'gerante', kind: 'dec', label: 'B5. Rémunération de la gérante', icon: '👑' },
  { id: 'impots', kind: 'dec', label: "B6. Impôts & taxes d'exploitation", icon: '🏛️' },
  { id: 'fin', kind: 'dec', label: 'B7. Financement, dettes, investissements & IS (hors EBE)', icon: '🏦' },
];

const rep = v => () => v;
const arr = a => m => a[m];
const famCA = i => (m, h) => h.caObjectif * h.mix[i] * h.saison[m];
// Achats : novembre saisi en dur dans le fichier, puis CA prévi de la famille × taux d'achats
const NOV_ACHATS = [416, 33, 208, 208, 33, 250, 0, 0];
const famAchat = (i, caId) => (m, h, v) => (m === 0 ? NOV_ACHATS[i] : v(caId, m) * h.tauxAchat[i]);

// prev(m, hyp, valueOf) → montant prévisionnel automatique (HT)
const LINES = [
  ...FAMILIES.map((f, i) => ({ id: 'ca_' + f.id, sec: f.group, label: f.label, tva: 0.2, ca: i, prev: famCA(i),
    note: i === 0 ? "CA prévi = CA objectif × % de la famille × % du mois. Inclure la part « Bonus Réparation » remboursée par l'éco-organisme." : '' })),
  { id: 'creances', sec: 'autresEnc', label: 'Encaissement de créances antérieures au 01/11/2026', tva: 0.2, prev: rep(0),
    note: "Créances clients restant à encaisser au 01/11/2026 (à vérifier avec l'expert-comptable)." },
  { id: 'apport', sec: 'autresEnc', label: "Apport en compte courant d'associé (Déborah)", tva: 0, prev: rep(0),
    note: 'Apports de Déborah dans la société.' },
  { id: 'emprunt', sec: 'autresEnc', label: "Emprunt / financement reçu (prêt d'honneur, BPI…)", tva: 0, prev: rep(0) },
  { id: 'subv', sec: 'autresEnc', label: "Subventions & aides (Région Sud, aide à l'apprentissage…)", tva: 0, prev: rep(0),
    note: "Subventions d'exploitation reçues." },
  { id: 'rembDiv', sec: 'autresEnc', label: 'Remboursements divers (assurances, crédit de TVA…)', tva: 0, prev: rep(0) },

  { id: 'ach_cordo', sec: 'achats', label: 'Crépins (fournitures cordonnerie)', tva: 0.2, achat: 0, prev: famAchat(0, 'ca_cordo'),
    note: "Achats prévi = CA prévi de la famille × taux d'achats de la famille." },
  { id: 'ach_couture', sec: 'achats', label: 'Petites fournitures (amazon, mondial tissus)', tva: 0.2, achat: 1, prev: famAchat(1, 'ca_couture') },
  { id: 'ach_soins', sec: 'achats', label: 'FAMACO - Pfirter', tva: 0.2, achat: 2, prev: famAchat(2, 'ca_soins') },
  { id: 'ach_clesRepro', sec: 'achats', label: 'Ébauches de clés & consommables de reproduction', tva: 0.2, achat: 3, prev: famAchat(3, 'ca_clesRepro') },
  { id: 'ach_clesVente', sec: 'achats', label: 'Clés, télécommandes & serrurerie achetées pour la revente', tva: 0.2, achat: 4, prev: famAchat(4, 'ca_clesVente') },
  { id: 'ach_maro', sec: 'achats', label: 'Grossistes maroquinerie', tva: 0.2, achat: 5, prev: famAchat(5, 'ca_maro') },
  { id: 'ach_acces', sec: 'achats', label: 'Accessoires achetés pour la revente', tva: 0.2, achat: 6, prev: famAchat(6, 'ca_acces') },
  { id: 'ach_divers', sec: 'achats', label: 'Articles divers achetés pour la revente', tva: 0.2, achat: 7, prev: famAchat(7, 'ca_divers') },

  { id: 'loyer', sec: 'ext', label: 'Loyer & charges locatives (atelier rue Raspail)', tva: 0, prev: m => (m === 0 ? 600 : 500) },
  { id: 'elec', sec: 'ext', label: 'Électricité (EDF)', tva: 0.2, prev: m => (m === 0 ? 70 : 50), note: 'Noté 60 €/mois TTC.' },
  { id: 'eau', sec: 'ext', label: 'Eau', tva: 0.055, prev: rep(9.5), note: 'Noté 10 €/mois TTC (TVA 5,5 %).' },
  { id: 'tel', sec: 'ext', label: 'Téléphone & internet', tva: 0.2, prev: rep(31), note: 'Noté 37 €/mois TTC.' },
  { id: 'assur', sec: 'ext', label: 'Assurances (RC pro, multirisque)', tva: 0, prev: rep(33),
    note: 'Noté 33 €/mois (pas de TVA). Compta 2026 : ≈ 52 €/mois — à vérifier.' },
  { id: 'banque', sec: 'ext', label: 'Frais bancaires & terminal de paiement', tva: 0, prev: rep(70),
    note: 'Noté 70 €/mois. Compta 2026 : ≈ 105 €/mois — à vérifier.' },
  { id: 'pennylane', sec: 'ext', label: 'Logiciel de comptabilité Pennylane', tva: 0.2, prev: m => (m === 0 ? 28 : 23.33), note: 'Noté 28 €/mois TTC.' },
  { id: 'caisse', sec: 'ext', label: 'Logiciel de caisse', tva: 0.2, prev: rep(75), note: 'Noté 90 €/mois TTC.' },
  { id: 'avocat', sec: 'ext', label: "Honoraires d'avocat", tva: 0.2, prev: rep(83.33), note: 'Noté 100 €/mois TTC.' },
  { id: 'expert', sec: 'ext', label: 'Expert-comptable (honoraires)', tva: 0.2, prev: rep(44) },
  { id: 'outillage', sec: 'ext', label: "Petit outillage, entretien des machines & fournitures d'atelier", tva: 0.2, prev: rep(40),
    note: 'Compta 2026 : ≈ 47 €/mois.' },
  { id: 'location', sec: 'ext', label: 'Location de matériel', tva: 0.2, prev: rep(0),
    note: "Compta 2026 : ≈ 98 €/mois de locations — vérifier si c'est déjà le logiciel de caisse." },
  { id: 'divExt', sec: 'ext', label: 'Divers & imprévus (déplacements, fournitures, frais postaux…)', tva: 0.2, prev: rep(50) },

  { id: 'comBudget', sec: 'com', label: 'Budget communication courant (noté 100 €/mois TTC)', tva: 0.2, prev: rep(83.33) },
  { id: 'flyers', sec: 'com', label: 'Flyers, cartes de visite & boîtages', tva: 0.2, prev: m => (m === 2 ? 100 : 0),
    note: "Plan de com : 2 000 flyers ≈ 150 à 200 € — 1er boîtage à l'ouverture, 2e aux mois 2-3." },
  { id: 'pubFb', sec: 'com', label: 'Publicité Facebook / Instagram (lancement)', tva: 0.2, prev: m => (m === 0 ? 90 : 0),
    note: 'Plan de com : 50 à 100 €, optionnel, La Garde + 10 km.' },
  { id: 'vitrine', sec: 'com', label: 'Vitrine, kakémono, stickers & carte de fidélité', tva: 0.2, prev: rep(0),
    note: "Saisir le devis de l'imprimeur." },
  { id: 'site', sec: 'com', label: 'Site internet (refonte, option sobre)', tva: 0.2, prev: rep(0) },

  { id: 'salaire', sec: 'perso', label: "Salaire net versé à l'apprenti·e / salarié·e", tva: 0, prev: rep(0) },
  { id: 'cotisSal', sec: 'perso', label: 'Cotisations sociales employeur & salarié', tva: 0, prev: rep(0) },

  { id: 'remu', sec: 'gerante', label: 'Rémunération nette de la gérante', tva: 0, prev: (m, h) => (m === 0 ? 0 : h.remu[m]) },
  { id: 'urssaf', sec: 'gerante', label: 'Cotisations URSSAF / SSI (échéancier actuel)', tva: 0, prev: (m, h) => (m === 0 ? 0 : h.urssaf) },
  { id: 'prevoyance', sec: 'gerante', label: 'Prévoyance / Madelin (AXA)', tva: 0, prev: (m, h) => h.prevoyance },
  { id: 'cotisRemu', sec: 'gerante', label: 'Cotisations sur la rémunération (estimation)', tva: 0, prev: (m, h, v) => v('remu', m) * h.tauxCotis },

  { id: 'cfe', sec: 'impots', label: 'CFE (cotisation foncière des entreprises)', tva: 0, prev: rep(0),
    note: 'Aucune CFE dans les comptes 2025-2026 : à vérifier (avis en novembre, paiement au 15 décembre).' },
  { id: 'autresImpots', sec: 'impots', label: 'Autres impôts & taxes', tva: 0, prev: rep(0) },

  { id: 'pret', sec: 'fin', label: 'Remboursement du prêt bancaire (capital + intérêts)', tva: 0, prev: rep(763),
    note: 'Noté 763 €/mois. Compta 2026 : ≈ 650 €/mois. Vérifier que les « 760 €/mois de dettes » désignent la même échéance.' },
  { id: 'dettesAnt', sec: 'fin', label: 'Règlement de dettes fournisseurs antérieures au 01/11/2026', tva: 0, prev: rep(0),
    note: "Dettes fournisseurs antérieures : saisir l'échéancier de ce qui reste dû (montants TTC)." },
  { id: 'invest', sec: 'fin', label: 'Investissements matériel & aménagement (HT)', tva: 0.2, prev: rep(0) },
  { id: 'is', sec: 'fin', label: 'Impôt sur les sociétés (acomptes / solde)', tva: 0, prev: rep(0) },
  { id: 'rembCca', sec: 'fin', label: "Remboursement du compte courant d'associé", tva: 0, prev: m => (m === 0 ? 2000 : 0) },
];

// Quêtes annexes (cases à cocher) issues du mode d'emploi
const SIDE_QUESTS = [
  { group: 'Démarrage', id: 'tresoInit', label: 'Renseigner la trésorerie initiale : solde banque + caisse au 31/10/2026' },
  { group: 'Démarrage', id: 'regimeTVA', label: "Faire confirmer le régime de TVA et la TVA d'octobre payée en novembre par Camille ROYERE" },
  { group: 'Démarrage', id: 'cotis', label: 'Vérifier le taux de cotisations et la rémunération nette prévue mois par mois' },
  { group: 'Démarrage', id: 'mix', label: "Ajuster le mix des 8 familles, leurs taux d'achats et la saisonnalité" },
  { group: 'Expert-comptable', id: 'bail', label: 'Bail du nouveau local soumis ou non à TVA (600 € TTC noté)' },
  { group: 'Expert-comptable', id: 'pret', label: 'Échéance du prêt (763 € noté vs ≈ 650 € dans les comptes) et « 760 €/mois de dettes »' },
  { group: 'Expert-comptable', id: 'remu', label: "Coût complet d'une rémunération de 2 000 € nets (statut TNS, cotisations)" },
  { group: 'Expert-comptable', id: 'dettes', label: 'Dettes fournisseurs et créances clients restant au 01/11' },
  { group: 'Expert-comptable', id: 'cfe', label: 'CFE et honoraires annuels' },
  { group: 'Plan de communication', id: 'boitage1', label: "1er boîtage de flyers à l'ouverture (14/11/2026)" },
  { group: 'Plan de communication', id: 'fb', label: 'Campagne Facebook / Instagram de lancement (La Garde + 10 km)' },
  { group: 'Plan de communication', id: 'google', label: 'Fiche Google à jour et premiers avis clients' },
  { group: 'Plan de communication', id: 'boitage2', label: '2e boîtage aux mois 2-3' },
  { group: 'Plan de communication', id: 'fidelite', label: 'Carte de fidélité et vitrine (devis imprimeur)' },
];

// ————— Planning de gestion des tâches —————
// Même structure que le modèle Excel « Planning de gestion des tâches » :
// Tâche · Priorité · Propriétaire · État · Date de début · Date de fin · Étape · Livrable · Notes
const TASK_STATUSES = [
  { id: 'Pas commencé', icon: '💤', color: 'muted' },
  { id: 'En cours', icon: '⚔️', color: 'info' },
  { id: 'Bloqué', icon: '🧱', color: 'bad' },
  { id: 'Terminé', icon: '🏁', color: 'ok' },
];
const TASK_PRIOS = [
  { id: 'P0', label: 'Critique', icon: '🔥', xp: 30 },
  { id: 'P1', label: 'Haute', icon: '⚡', xp: 20 },
  { id: 'P2', label: 'Moyenne', icon: '🔷', xp: 15 },
  { id: 'P3', label: 'Basse', icon: '🌱', xp: 10 },
];

// Tâches d'exemple (fictives) pour montrer le fonctionnement — à supprimer ou modifier librement
const EXAMPLE_TASKS = {
  boards: [
    { id: 'b_lancement', name: "Exemple — Lancement de l'atelier" },
    { id: 'b_gestion', name: 'Exemple — Gestion & administratif' },
  ],
  items: [
    { board: 'b_lancement', title: "Préparer l'ouverture du samedi 14 novembre", prio: 'P0', owner: 'Déborah', status: 'En cours',
      start: '2026-10-20', end: '2026-11-14', step: 'Vitrine, caisse et stock prêts', deliverable: 'Atelier ouvert', notes: '' },
    { board: 'b_lancement', title: '1er boîtage de flyers autour de La Garde', prio: 'P1', owner: 'Déborah', status: 'Pas commencé',
      start: '2026-11-07', end: '2026-11-14', step: "Récupérer les 2 000 flyers chez l'imprimeur", deliverable: 'Flyers distribués', notes: 'Exemple de tâche' },
    { board: 'b_lancement', title: 'Campagne Facebook / Instagram de lancement', prio: 'P2', owner: 'Déborah', status: 'Pas commencé',
      start: '2026-11-10', end: '2026-11-30', step: 'Ciblage La Garde + 10 km', deliverable: 'Campagne en ligne', notes: '' },
    { board: 'b_lancement', title: 'Obtenir les 10 premiers avis Google', prio: 'P2', owner: 'Déborah', status: 'Pas commencé',
      start: '2026-11-14', end: '2027-01-31', step: 'QR code au comptoir', deliverable: '10 avis', notes: '' },
    { board: 'b_lancement', title: 'Rencontrer un 1er partenaire prescripteur', prio: 'P1', owner: 'Déborah', status: 'Pas commencé',
      start: '2026-11-15', end: '2027-01-31', step: 'Liste de commerces voisins à démarcher', deliverable: 'Partenaire actif', notes: 'SMART n°03' },
    { board: 'b_gestion', title: 'Confirmer le régime de TVA avec l’expert-comptable', prio: 'P0', owner: 'Déborah', status: 'Bloqué',
      start: '2026-10-15', end: '2026-10-31', step: 'En attente de réponse', deliverable: 'Régime confirmé', notes: 'Exemple de tâche bloquée' },
    { board: 'b_gestion', title: 'Réaliser 10 fiches de coût (cordonnerie, clés)', prio: 'P1', owner: 'Déborah', status: 'Pas commencé',
      start: '2026-11-15', end: '2027-01-31', step: 'Chronométrer les prestations', deliverable: '10 fiches', notes: 'SMART n°04' },
    { board: 'b_gestion', title: 'Remise au réel de novembre (rituel du 10)', prio: 'P1', owner: 'Déborah', status: 'Pas commencé',
      start: '2026-12-01', end: '2026-12-10', step: 'Relevé bancaire + caisse + Pennylane', deliverable: 'Mission validée', notes: '' },
    { board: 'b_gestion', title: 'Ouvrir le compte Pennylane du nouvel atelier', prio: 'P3', owner: 'Déborah', status: 'Terminé',
      start: '2026-10-01', end: '2026-10-10', step: '', deliverable: 'Compte actif', notes: '' },
  ],
};
