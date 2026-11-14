// POST /.netlify/functions/creer-paiement
// Reçoit les choix du client, RECALCULE le prix, vérifie la date, crée la page de paiement Square.
const { calculer, FORFAITS, ACOMPTE_CENTS } = require('../lib/prix');
const { datesBloquees, creerLienPaiement, configure } = require('../lib/square');

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
  if (!Array.isArray(d.extras)) d.extras = [];

  let calc;
  try { calc = calculer({ forfait: d.forfait, extras: d.extras, assurance: !!d.assurance }); }
  catch (e) { return json(400, { erreur: e.message }); }

  // --- Disponibilité (2 machines par jour par défaut) ---
  try {
    const bloquees = await datesBloquees();
    if (bloquees.includes(d.date)) return json(409, { erreur: 'date_complete' });
  } catch (e) {
    return json(502, { erreur: 'verification_impossible' });
  }

  // --- Commande Square ---
  const en = d.lang === 'en';
  const nomL = (n) => (en && EN[n]) || n;
  const dollars = (c) => (c / 100).toFixed(2).replace('.', ',') + ' $';
  let lignesCommande;
  if (d.mode === 'acompte') {
    lignesCommande = [{
      name: en ? `Booking deposit — ${nomL(calc.forfaitNom)} — ${d.date}` : `Dépôt de réservation — ${calc.forfaitNom} — ${d.date}`,
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
      forfait: calc.forfaitNom,
      mode: d.mode,
      nom, courriel, telephone,
      adresse,
      invites: texte(d.invites, 10),
      type_evenement: texte(d.type, 40),
      total_estime: dollars(calc.total),
    },
  };

  const site = (process.env.SITE_URL || '').replace(/\/$/, '');
  const note = `${calc.forfaitNom} le ${d.date} — ${nom} — ${telephone} — ${adresse}` +
    (d.djmc ? ' — DJ/MC demandé' : '') +
    (d.facture ? ' — SOLDE SUR FACTURE' + (d.entreprise ? ' : ' + texte(d.entreprise, 80) : ' (entreprise à préciser)') : '') +
    (d.extras.length ? ' — extras: ' + d.extras.join(', ') : '') +
    (en ? ' — CLIENT ANGLOPHONE (EN)' : '');

  try {
    const url = await creerLienPaiement(commande, site + (en ? '/en/merci.html' : '/merci.html'), courriel, note);
    if (!url) return json(502, { erreur: 'paiement' });
    return json(200, { url });
  } catch (e) {
    console.error('Square:', e.message, JSON.stringify(e.details || {}));
    return json(502, { erreur: 'paiement' });
  }
};
