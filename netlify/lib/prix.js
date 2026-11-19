// Grille de prix et calcul du total — SEULE source de vérité côté serveur.
// Le montant payé est toujours recalculé ici, jamais pris tel quel du navigateur.

const FORFAITS = {
  cle:   { nom: 'Clé en main', prix: 219 },
  party: { nom: 'Party PAC',   prix: 299 },
  corpo: { nom: 'Corporatif',  prix: 499 },
};

// "inclus": forfaits pour lesquels l'extra est déjà compris (donc non facturé)
const EXTRAS = {
  micros2:      { nom: 'Deux micros sans fil',                       prix: 35, inclus: ['party', 'corpo'] },
  tablette1500: { nom: 'Super tablette (1 500 chansons pour danser)', prix: 49, inclus: ['party', 'corpo'] },
  projecteur:   { nom: 'Projecteur multimédia',                      prix: 50, inclus: ['corpo'] },
  ecran72:      { nom: 'Écran de 72 po',                             prix: 15, inclus: ['corpo'] },
  hp320:        { nom: 'Haut-parleur 320 W supplémentaire',          prix: 49 },
  hp500:        { nom: 'Haut-parleur 500 W supplémentaire',          prix: 64 },
  tablette7:    { nom: 'Tablette de 7 po supplémentaire',            prix: 10 },
  micro:        { nom: 'Microphone supplémentaire',                  prix: 5 },
  melangeur:    { nom: 'Mini mélangeur audio avec préamplificateur', prix: 10 },
  adaptateur:   { nom: 'Adaptateur audio 3/16',                      prix: 5 },
};

// Options de livraison (non comprises dans le 20 % par journée ni dans la protection)
const LIVRAISON = {
  express:   { nom: 'Livraison express (24 h)', prix: 50 },
  ramassage: { nom: 'Ramassage le jour même',   prix: 60 },
};

const TAUX_JOUR_SUP = 0.20;     // chaque journée de plus = 20 % de la location (forfait + extras)
const MAX_JOURS_SUP = 6;
const TAUX_TAXES = 0.14975;      // TPS 5 % + TVQ 9,975 %
const TAUX_ASSURANCE = 0.10;     // 10 % du solde avant taxes (facultative)
const ACOMPTE_CENTS = 5000;      // dépôt de 50 $

// Frais ajoutés si paiement en ligne par carte (0 = aucun). À décider avec Pierre.
const FRAIS_CARTE_TAUX = 0.03;   // 3 % sur le total payé en ligne par carte (le dépôt de 50 $ n'est pas touché)

const cents = (dollars) => Math.round(dollars * 100);

function calculer({ forfait, extras = [], assurance = false, jours = 0, livraison = [], deplacement = null }) {
  const f = FORFAITS[forfait];
  if (!f) throw new Error('forfait_invalide');

  const lignes = [{ nom: `${f.nom} (forfait)`, cents: cents(f.prix), taxable: true }];
  const vus = new Set();
  for (const cle of extras) {
    const e = EXTRAS[cle];
    if (!e) throw new Error('extra_invalide');
    if (vus.has(cle)) continue;          // doublon ignoré
    vus.add(cle);
    if (e.inclus && e.inclus.includes(forfait)) continue; // déjà inclus: jamais facturé
    lignes.push({ nom: e.nom, cents: cents(e.prix), taxable: true });
  }

  const nj = Math.max(0, Math.min(MAX_JOURS_SUP, parseInt(jours, 10) || 0));
  if (nj) lignes.push({ nom: `Journée supplémentaire (${nj} × 20 % de la location)`, cents: Math.round(lignes.reduce((t, l) => t + l.cents, 0) * TAUX_JOUR_SUP) * nj, taxable: true, joursSup: nj });

  const locationCents = lignes.reduce((s, l) => s + l.cents, 0);
  const options = [];
  for (const k of new Set(Array.isArray(livraison) ? livraison : [])) {
    const o = LIVRAISON[k];
    if (!o) throw new Error('livraison_invalide');
    if (k === 'ramassage' && nj) throw new Error('ramassage_jours');
    lignes.push({ nom: o.nom, cents: cents(o.prix), taxable: true });
    options.push(k);
  }
  // Frais de déplacement au-delà de 25 km (calculés par lib/geo.js)
  if (deplacement && deplacement.cents > 0)
    lignes.push({ nom: `Frais de déplacement (${deplacement.kmSup} km × 4 trajets)`, cents: deplacement.cents, taxable: true });

  const sousTotal = lignes.reduce((s, l) => s + l.cents, 0);
  const assuranceCents = assurance ? Math.round(locationCents * TAUX_ASSURANCE) : 0;
  const taxes = Math.round(sousTotal * TAUX_TAXES);
  let total = sousTotal + assuranceCents + taxes;
  const frais = Math.round(total * FRAIS_CARTE_TAUX);
  total += frais;

  return { forfaitNom: f.nom, joursSup: nj, options, lignes, sousTotal, assuranceCents, taxes, frais, total, acompte: ACOMPTE_CENTS };
}

module.exports = { FORFAITS, EXTRAS, LIVRAISON, TAUX_TAXES, ACOMPTE_CENTS, MAX_JOURS_SUP, calculer };
