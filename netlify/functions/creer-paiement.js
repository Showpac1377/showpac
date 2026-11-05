// POST /.netlify/functions/creer-paiement
// Reçoit les choix du client, RECALCULE le prix, vérifie la date, crée la page de paiement Square.
const { calculer, FORFAITS, ACOMPTE_CENTS } = require('../lib/prix');
const { datesBloquees, creerLienPaiement, configure } = require('../lib/square');

const json = (code, obj) => ({ statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
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
  const dollars = (c) => (c / 100).toFixed(2).replace('.', ',') + ' $';
  let lignesCommande;
  if (d.mode === 'acompte') {
    lignesCommande = [{
      name: `Dépôt de réservation — ${calc.forfaitNom} — ${d.date}`,
      quantity: '1',
      base_price_money: { amount: ACOMPTE_CENTS, currency: 'CAD' },
    }];
  } else {
    lignesCommande = calc.lignes.map((l) => ({
      name: l.nom, quantity: '1', base_price_money: { amount: l.cents, currency: 'CAD' },
    }));
    if (calc.assuranceCents) lignesCommande.push({ name: 'Protection Tranquillité (10 %)', quantity: '1', base_price_money: { amount: calc.assuranceCents, currency: 'CAD' } });
    lignesCommande.push({ name: 'Taxes (TPS + TVQ)', quantity: '1', base_price_money: { amount: calc.taxes, currency: 'CAD' } });
    if (calc.frais) lignesCommande.push({ name: 'Frais administratifs (3 %)', quantity: '1', base_price_money: { amount: calc.frais, currency: 'CAD' } });
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
    (d.extras.length ? ' — extras: ' + d.extras.join(', ') : '');

  try {
    const url = await creerLienPaiement(commande, site + '/merci.html', courriel, note);
    if (!url) return json(502, { erreur: 'paiement' });
    return json(200, { url });
  } catch (e) {
    console.error('Square:', e.message, JSON.stringify(e.details || {}));
    return json(502, { erreur: 'paiement' });
  }
};
