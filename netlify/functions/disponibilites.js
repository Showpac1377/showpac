// GET /.netlify/functions/disponibilites  ->  { bloquees: ["2026-12-24", ...], paiement: true|false }
// "paiement" dit à la page si le paiement en ligne (Square) est configuré. Sinon, la page ne l'offre pas.
const { datesBloquees, configure } = require('../lib/square');

exports.handler = async () => {
  const paiement = configure();
  const entetes = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  try {
    const bloquees = await datesBloquees();
    return { statusCode: 200, headers: entetes, body: JSON.stringify({ bloquees, paiement }) };
  } catch (e) {
    // En cas de panne Square, on ne bloque rien: la vérification finale se refait au paiement.
    return { statusCode: 200, headers: entetes, body: JSON.stringify({ bloquees: [], erreur: true, paiement }) };
  }
};
