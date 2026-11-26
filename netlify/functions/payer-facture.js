// POST /.netlify/functions/payer-facture
// Paiement d'une facture déjà envoyée par Pierre (animation, solde, montant convenu).
// Le client entre le montant de sa facture; on ajoute les frais administratifs par carte.
// Aucune date n'est enregistrée : ce paiement ne bloque pas de place au calendrier.
const { creerLienPaiement, ficheClient, configure } = require('../lib/square');

const json = (code, obj) => ({ statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
const texte = (v, n) => String(v == null ? '' : v).replace(/[\r\n]+/g, ' ').trim().slice(0, n);
const dollars = (c) => (c / 100).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' });
const TAUX_FRAIS = () => { const t = parseFloat(process.env.FRAIS_FACTURE_TAUX ?? '0.03'); return isNaN(t) || t < 0 || t > 0.1 ? 0.03 : t; };

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { erreur: 'methode' });
  if (!configure()) return json(503, { erreur: 'paiement_non_configure' });
  let d;
  try { d = JSON.parse(event.body || '{}'); } catch { return json(400, { erreur: 'json' }); }

  const en = d.lang === 'en';
  const nom = texte(d.nom, 80), courriel = texte(d.courriel, 120), telephone = texte(d.telephone, 30);
  const description = texte(d.description, 100), entreprise = texte(d.entreprise, 80);
  if (!nom || !description) return json(400, { erreur: 'champs' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(courriel)) return json(400, { erreur: 'courriel' });
  if (telephone.replace(/\D/g, '').length < 10) return json(400, { erreur: 'telephone' });
  const montant = Math.round(parseFloat(String(d.montant).replace(',', '.').replace(/[^\d.]/g, '')) * 100);
  if (!montant || montant < 500 || montant > 1000000) return json(400, { erreur: 'montant' });

  const frais = Math.round(montant * TAUX_FRAIS());
  const total = montant + frais;
  const CAD = (c) => ({ amount: c, currency: 'CAD' });
  const lignes = [{ name: (en ? 'Invoice payment — ' : 'Paiement de facture — ') + description, quantity: '1', base_price_money: CAD(montant) }];
  if (frais) lignes.push({ name: en ? 'Administrative fee (card)' : 'Frais administratif (carte)', quantity: '1', base_price_money: CAD(frais) });

  const commande = {
    line_items: lignes,
    metadata: { type: 'facture', nom, courriel, telephone, description, montant_facture: dollars(montant), total_paye: dollars(total), langue: en ? 'en' : 'fr' },
  };
  if (entreprise) commande.metadata.entreprise = entreprise;   // Square refuse les valeurs vides
  const note = `PAIEMENT DE FACTURE : ${description} — ${nom} — TÉL. ${telephone} — ${courriel}` + (entreprise ? ` — ${entreprise}` : '') + (en ? ' — CLIENT ANGLOPHONE (EN)' : '');

  try {
    const clientId = await ficheClient({ nom, courriel, telephone, entreprise });
    if (clientId) commande.customer_id = clientId;
    const site = (process.env.SITE_URL || '').replace(/\/$/, '');
    const url = await creerLienPaiement(commande, site + (en ? '/pay-en.html?merci=1' : '/payer.html?merci=1'), courriel, note, telephone);
    if (!url) throw new Error('pas_de_lien');
    return json(200, { url });
  } catch (e) {
    console.error('Paiement facture:', e.message, JSON.stringify(e.details || {}));
    return json(502, { erreur: 'square' });
  }
};
