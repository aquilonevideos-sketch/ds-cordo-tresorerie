# 🥾 DS CORDO — Quête de Trésorerie

Outil de pilotage gamifié du plan de trésorerie de **DS CORDO** (Déborah SANFOURCHE), cordonnerie & clés minute à La Garde (83), pour la période **novembre 2026 → octobre 2027**.

Il reprend fidèlement le classeur Excel *Plan de trésorerie DS CORDO* (BE CONSULTING) : hypothèses, plan prévisionnel / réel / écarts, TVA, tableau de bord SMART, bilans trimestriels et synthèse des 8 familles. Les calculs ont été vérifiés : ils donnent les mêmes résultats que les formules Excel.

## Ce que fait l'application

| Onglet | Rôle |
|---|---|
| 🏠 **QG** | Niveau & XP, trésorerie en « points de vie », prochaine mission (rituel du 10), boss du trimestre, indicateurs SMART, graphiques, alertes |
| ⚔️ **Mission du mois** | Saisie du réel du mois (montants HT encaissés / payés, tickets de caisse, TVA prélevée) puis validation du mois |
| 🗺️ **Plan 12 mois** | Tableau complet Prévi / Réel / Écart, cumuls « à date », prévi modifiable ligne par ligne, export CSV |
| 📋 **Planning des tâches** | Tableaux de tâches (Tâche, Priorité P0→P3, Propriétaire, État, dates, Étape, Livrable, Notes) en vues Kanban (glisser-déposer), Liste et Frise ; retards et échéances signalés au QG ; import / export Excel au format du modèle de planning ; XP à chaque tâche terminée |
| 🎯 **Quêtes & Boss** | Les 6 objectifs SMART, les 4 bilans trimestriels (15 / 18 / 20 / 22 k€), partenaires actifs, fiches de coût, quêtes annexes |
| 🧩 **Familles** | CA, achats et taux de marge réels des 8 familles vs taux cible |
| 🏆 **Succès** | Badges, niveaux et journal d'XP |
| 🎁 **Récompenses** | Boutique : les points d'XP gagnés s'échangent contre des récompenses (coût en points, niveau minimum, unique ou répétable), liste personnalisable, historique avec annulation |
| ⚙️ **Réglages** | Toutes les hypothèses du fichier Excel (trésorerie initiale, TVA, mix, saisonnalité, rémunération…) |
| 💾 **Sauvegarde & guide** | Sauvegarde / restauration (.json), export CSV, mode d'emploi |

## Où sont les données ?

Les données sont enregistrées dans le navigateur de chaque appareil **et** peuvent être synchronisées entre le PC et le téléphone via un **dépôt GitHub privé** (onglet *Sauvegarde & guide → Synchronisation*) :

1. Créer une clé d'accès GitHub *fine-grained* limitée au dépôt privé de données, avec la seule permission **Contents : Read and write**.
2. La coller sur l'ordinateur (« Connecter cet appareil »).
3. Sur le téléphone : scanner le **QR code** affiché par l'ordinateur.

Ensuite, chaque saisie est envoyée automatiquement et récupérée à l'ouverture de l'outil sur l'autre appareil. La clé reste sur l'appareil et n'est jamais incluse dans les sauvegardes. La sauvegarde par fichier (.json) reste disponible en secours.

## Utilisation en local

Ouvrir `index.html` dans un navigateur, ou lancer un petit serveur :

```bash
npx serve .
```

## Structure

```
index.html      page unique
css/style.css   thème « arcade »
js/data.js      hypothèses et lignes du plan (issues du fichier Excel)
js/engine.js    moteur de calcul (formules du plan) + XP / succès
js/planning.js  planning des tâches (Kanban, liste, frise, import/export Excel)
js/rewards.js   boutique des récompenses
js/sync.js      synchronisation PC ↔ téléphone (dépôt GitHub privé)
js/app.js       interface
```
