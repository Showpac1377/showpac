// Distance routière entre le bureau et l'adresse du client (Geoapify, plan gratuit).
// Variables Netlify : GEOAPIFY_KEY (clé) et BUREAU_ADRESSE (adresse du bureau, point de départ).
const KM_INCLUS = 25;
const TAUX_KM_CENTS = 60;   // 0,60 $ par km additionnel
const NB_TRAJETS = 4;       // aller-retour livraison + aller-retour récupération

const cle = () => process.env.GEOAPIFY_KEY;
const configureDistance = () => !!(cle() && (process.env.BUREAU_ADRESSE || process.env.BUREAU_COORD));

const cache = new Map();
async function geocoder(texte) {
  const k = texte.toLowerCase().replace(/\s+/g, ' ').trim();
  if (cache.has(k)) return cache.get(k);
  const url = 'https://api.geoapify.com/v1/geocode/search?format=json&limit=1&filter=countrycode:ca&bias=proximity:-73.75,45.36&lang=fr'
    + '&text=' + encodeURIComponent(texte) + '&apiKey=' + cle();
  const r = await fetch(url);
  if (!r.ok) throw new Error('geocode_' + r.status);
  const j = await r.json();
  const p = j.results && j.results[0];
  if (!p) return null;
  const res = { lat: p.lat, lon: p.lon, precision: p.result_type, confiance: p.rank && p.rank.confidence, trouve: p.formatted };
  cache.set(k, res);
  return res;
}

async function origine() {
  const c = process.env.BUREAU_COORD;
  if (c && /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(c)) { const [lat, lon] = c.split(',').map(Number); return { lat, lon }; }
  const o = await geocoder(process.env.BUREAU_ADRESSE);
  if (!o) throw new Error('bureau_introuvable');
  return o;
}

// Calcule la distance et les frais. Lance une erreur si le calcul est impossible.
async function calculerDistance(adresse, codePostal) {
  if (!configureDistance()) throw new Error('distance_non_configuree');
  const texte = String(adresse || '').slice(0, 200);
  let dest = await geocoder(texte + ', QC, Canada');
  // Repli sur le code postal si l'adresse n'est pas trouvée ou trop imprécise
  if ((!dest || (dest.confiance != null && dest.confiance < 0.4)) && codePostal) dest = await geocoder(codePostal + ', QC, Canada') || dest;
  if (!dest) throw new Error('adresse_introuvable');
  const o = await origine();
  const url = `https://api.geoapify.com/v1/routing?mode=drive&waypoints=${o.lat},${o.lon}|${dest.lat},${dest.lon}&apiKey=${cle()}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('routing_' + r.status);
  const j = await r.json();
  const m = j.features && j.features[0] && j.features[0].properties && j.features[0].properties.distance;
  if (typeof m !== 'number') throw new Error('routing_vide');
  const km = Math.round(m / 1000);
  const kmSup = Math.max(0, km - KM_INCLUS);
  return { km, kmSup, fraisCents: kmSup * NB_TRAJETS * TAUX_KM_CENTS, trouve: dest.trouve, precision: dest.precision };
}

module.exports = { calculerDistance, configureDistance, KM_INCLUS, TAUX_KM_CENTS, NB_TRAJETS };
