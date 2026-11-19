// GET /.netlify/functions/distance?adresse=...&cp=...  ->  { km, kmSup, fraisCents }
// Sert seulement à l'affichage : le prix payé est recalculé par creer-paiement.
const { calculerDistance, configureDistance } = require('../lib/geo');

exports.handler = async (event) => {
  const h = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (!configureDistance()) return { statusCode: 503, headers: h, body: JSON.stringify({ erreur: 'non_configure' }) };
  const q = event.queryStringParameters || {};
  if (!q.adresse || String(q.adresse).length < 5) return { statusCode: 400, headers: h, body: JSON.stringify({ erreur: 'adresse' }) };
  try {
    const d = await calculerDistance(q.adresse, q.cp);
    return { statusCode: 200, headers: h, body: JSON.stringify(d) };
  } catch (e) {
    console.error('distance:', e.message);
    return { statusCode: 502, headers: h, body: JSON.stringify({ erreur: e.message }) };
  }
};
