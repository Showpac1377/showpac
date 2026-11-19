// POST /.netlify/functions/creer-paiement
// Reçoit les choix du client, RECALCULE le prix, vérifie la date, crée la page de paiement Square.
const { calculer, FORFAITS, ACOMPTE_CENTS } = require('../lib/prix');
const { datesBloquees, creerLienPaiement, configure } = require('../lib/square');
const { calculerDistance, configureDistance } = require('../lib/geo');

const json = (code, obj) => ({ statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
// Noms anglais pour la page de paiement Square quand le client réserve depuis /en/
const EN = {
  'Clé en main': 'Plug & Play', 'Party PAC': 'Party PAC', 'Corporatif': 'Corporate',
  'Clé en main (forfait)': 'Plug & Play (package)', 'Party PAC (forfait)': 'Party PAC (package)', 'Corporatif (forfait)': 'Corporate (package)',
  'Deux micros sans fil': 'Two wireless mics', 'Super tablette (1 500 chansons pour danser)': 'Super tablet (1,500 dance tracks)',
  'Projecteur multimédia': 'Multimedia projector', 'Écran de 72 po': '72-inch screen',
  'Haut-parleur 320 W supplémentaire': 'Extra 320 W speaker', 'Haut-parleur 500 W supplémentaire': 'Extra 500 W speaker',
  'Tablette de 7 po supplémentaire': 'Extra 7-inch tablet', 'Microphone supplémentaire': 'Extra microphone',
  'Mini mélangeur audio avec préamplificateur': 'Mini audio mixer with preamp', 'Adaptateur audio 3/16': '3/16 audio adapter',
  'Livraison express (24 h)': 'Express delivery (24 h)', 'Ramassage le jour même': 'Same-day pickup',
};
const texte = (v, n) => String(v == null ? '' : v).replace(/[\r\n]+/g, ' ').trim().slice(0, n);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { erreur: 'methode' });
  if (!configure()) return json(503, { erreur: 'paiement_non_configure' });

  let d;
  try { d = JSON.parse(event.body || '{}'); } catch { return json(400, { erreur: 'json' }); }

  // --- Validation ---
  if (!FORFAITS[d.forfait]) return json(400, { erreur: 'forfait' });
  if (d.mode !== 'acompte' && d.mode !== 'total') return json(400, { erreur: 'mode' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) return json(400, { erreur: 'date' });
  const aujourdhui = new Date().toISOString().slice(0, 10);
  if (d.date < aujourdhui) return json(400, { erreur: 'date_passee' });
  const courriel = texte(d.courriel, 120);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(courriel)) return json(400, { erreur: 'courriel' });
  const nom = texte(d.nom, 80), telephone = texte(d.telephone, 30), adresse = texte(d.adresse, 200);
  if (!nom || !telephone || !adresse) return json(400, { erreur: 'champs' });
  if (telephone.replace(/\D/g, '').length < 10) return json(400, { erreur: 'telephone' });
  if (!Array.isArray(d.extras)) d.extras = [];

  // Distance recalculée ici (jamais prise du navigateur). En cas de panne : pas de frais, Pierre vérifie.
  let dep = null, depErreur = false;
  if (configureDistance()) {
    try { dep = await calculerDistance(adresse, texte(d.cp, 10)); } catch (e) { depErreur = true; console.error('Distance:', e.message); }
  }

  let calc;
  try { calc = calculer({ forfait: d.forfait, extras: d.extras, assurance: !!d.assurance, jours: d.jours, livraison: d.livraison, deplacement: dep ? { kmSup: dep.kmSup, cents: dep.fraisCents } : null }); }
  catch (e) { return json(400, { erreur: e.message }); }

  // --- Disponibilité (2 machines par jour par défaut) ---
  try {
    const bloquees = await datesBloquees();
    for (let i = 0; i <= calc.joursSup; i++) {
      const j = new Date(d.date + 'T12:00:00Z'); j.setUTCDate(j.getUTCDate() + i);
      if (bloquees.includes(j.toISOString().slice(0, 10))) return json(409, { erreur: 'date_complete' });
    }
  } catch (e) {
    return json(502, { erreur: 'verification_impossible' });
  }

  // --- Commande Square ---
  const en = d.lang === 'en';
  const nomL = (n) => (en && /^Frais de déplacement/.test(n)) ? n.replace(/^Frais de déplacement \((\d+) km × 4 trajets\)$/, 'Travel fee ($1 km × 4 trips)') : (en && /^Journée supplémentaire/.test(n)) ? n.replace(/^Journée supplémentaire \((\d+) × 20 % de la location\)$/, (m, k) => `Extra day${k > 1 ? 's' : ''} (${k} × 20% of rental)`) : ((en && EN[n]) || n);
  const dollars = (c) => (c / 100).toFixed(2).replace('.', ',') + ' $';
  let lignesCommande;
  if (d.mode === 'acompte') {
    lignesCommande = [{
      name: (en ? `Booking deposit — ${nomL(calc.forfaitNom)}` : `Dépôt de réservation — ${calc.forfaitNom}`) + (calc.joursSup ? (en ? ` + ${calc.joursSup} extra day${calc.joursSup > 1 ? 's' : ''}` : ` + ${calc.joursSup} jour${calc.joursSup > 1 ? 's' : ''}`) : '') + ` — ${d.date}`,
      quantity: '1',
      base_price_money: { amount: ACOMPTE_CENTS, currency: 'CAD' },
    }];
  } else {
    lignesCommande = calc.lignes.map((l) => ({
      name: nomL(l.nom), quantity: '1', base_price_money: { amount: l.cents, currency: 'CAD' },
    }));
    if (calc.assuranceCents) lignesCommande.push({ name: en ? 'Peace-of-Mind Protection (10%)' : 'Protection Tranquillité (10 %)', quantity: '1', base_price_money: { amount: calc.assuranceCents, currency: 'CAD' } });
    lignesCommande.push({ name: en ? 'Taxes (GST + QST)' : 'Taxes (TPS + TVQ)', quantity: '1', base_price_money: { amount: calc.taxes, currency: 'CAD' } });
    if (calc.frais) lignesCommande.push({ name: en ? 'Administrative fee (3%)' : 'Frais administratifs (3 %)', quantity: '1', base_price_money: { amount: calc.frais, currency: 'CAD' } });
  }

  const commande = {
    line_items: lignesCommande,
    metadata: {                               // max. 10 entrées
      date_evenement: d.date,
      forfait: calc.forfaitNom + (calc.joursSup ? ` + ${calc.joursSup} jour${calc.joursSup > 1 ? 's' : ''} supplémentaire${calc.joursSup > 1 ? 's' : ''}` : '') +
        (calc.options.includes('express') ? ' + livraison express' : '') + (calc.options.includes('ramassage') ? ' + ramassage le jour même' : ''),
      mode: d.mode,
      nom, courriel, telephone,
      adresse,
      invites: texte(d.invites, 10),
      type_evenement: texte(d.type, 40),
      total_estime: dollars(calc.total),
    },
  };

  const site = (process.env.SITE_URL || '').replace(/\/$/, '');
  const contactPlace = [texte(d.contact_nom, 60), texte(d.contact_tel, 30)].filter(Boolean).join(' ');
  const note = `${calc.forfaitNom}${calc.joursSup ? ' + ' + calc.joursSup + ' JOUR(S) SUPPLÉMENTAIRE(S)' : ''} le ${d.date} — ${nom} — ${telephone} — ${adresse}` +
    (dep ? ` — DISTANCE : ${dep.km} km` + (dep.kmSup ? ` (${dep.kmSup} km sup. facturés)` : ' (incluse)') : (depErreur ? ' — DISTANCE À VÉRIFIER' : '')) +
    (calc.options.includes('express') ? ' — LIVRAISON EXPRESS (24 h)' : '') +
    (calc.options.includes('ramassage') ? ' — RAMASSAGE LE JOUR MÊME' + (contactPlace ? ' (sur place : ' + contactPlace + ')' : '') : '') +
    (d.djmc ? ' — DJ/MC demandé' : '') +
    (d.facture ? ' — SOLDE SUR FACTURE' + (d.entreprise ? ' : ' + texte(d.entreprise, 80) : ' (entreprise à préciser)') : '') +
    (d.extras.length ? ' — extras: ' + d.extras.join(', ') : '') +
    (en ? ' — CLIENT ANGLOPHONE (EN)' : '');

  try {
    const url = await creerLienPaiement(commande, site + (en ? '/merci-en.html' : '/merci.html'), courriel, note);
    if (!url) return json(502, { erreur: 'paiement' });
    return json(200, { url });
  } catch (e) {
    console.error('Square:', e.message, JSON.stringify(e.details || {}));
    return json(502, { erreur: 'paiement' });
  }
};
