// Petit client Square (sans dépendance). Variables d'environnement à définir dans Netlify:
//   SQUARE_ACCESS_TOKEN  clé d'accès (sandbox pour les tests, production ensuite)
//   SQUARE_LOCATION_ID   identifiant de l'emplacement Square de Pierre
//   SQUARE_ENV           "sandbox" (par défaut) ou "production"
//   SITE_URL             adresse du site, ex. https://showpac.com
//   BLOCKED_DATES        (facultatif) dates fermées à la main, ex. 2026-12-24,2026-12-31
//   RESERVATIONS_MANUELLES (facultatif) dates réservées hors ligne, chacune compte pour 1 machine
//   MAX_PAR_JOUR         (facultatif) nombre de machines par jour, 2 par défaut

const VERSION = process.env.SQUARE_VERSION || '2024-10-17';

function configure() {
  return !!(process.env.SQUARE_ACCESS_TOKEN && process.env.SQUARE_LOCATION_ID);
}

function base() {
  return process.env.SQUARE_ENV === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com';
}

async function appel(chemin, corps) {
  const res = await fetch(base() + chemin, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + process.env.SQUARE_ACCESS_TOKEN,
      'Square-Version': VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(corps),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error('square_' + res.status);
    err.details = json;
    throw err;
  }
  return json;
}

// Compte les commandes PAYÉES par date d'événement (métadonnée "date_evenement").
// Une commande Checkout reste DRAFT tant qu'elle n'est pas payée, puis passe à OPEN une fois payée.
async function compterReservations() {
  const compte = {};
  const depuis = new Date(Date.now() - 400 * 24 * 3600 * 1000).toISOString();
  let cursor;
  let pages = 0;
  do {
    const rep = await appel('/v2/orders/search', {
      location_ids: [process.env.SQUARE_LOCATION_ID],
      limit: 500,
      cursor,
      query: {
        filter: {
          state_filter: { states: ['OPEN', 'COMPLETED'] },
          date_time_filter: { created_at: { start_at: depuis } },
        },
        sort: { sort_field: 'CREATED_AT', sort_order: 'DESC' },
      },
    });
    for (const o of rep.orders || []) {
      const d = o.metadata && o.metadata.date_evenement;
      if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) compte[d] = (compte[d] || 0) + 1;
    }
    cursor = rep.cursor;
    pages += 1;
  } while (cursor && pages < 10);
  return compte;
}

// Réservations prises hors ligne (Interac, comptant, facture): chaque date listée compte pour 1 machine.
function reservationsManuelles() {
  return (process.env.RESERVATIONS_MANUELLES || '')
    .split(',').map((s) => s.trim()).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));
}

function datesBloqueesManuelles() {
  return (process.env.BLOCKED_DATES || '')
    .split(',').map((s) => s.trim()).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));
}

async function datesBloquees() {
  const max = parseInt(process.env.MAX_PAR_JOUR || '2', 10);
  const compte = configure() ? await compterReservations() : {};
  for (const d of reservationsManuelles()) compte[d] = (compte[d] || 0) + 1;
  const pleines = Object.keys(compte).filter((d) => compte[d] >= max);
  return Array.from(new Set([...pleines, ...datesBloqueesManuelles()])).sort();
}

async function creerLienPaiement(commande, redirectUrl, courriel, note) {
  const rep = await appel('/v2/online-checkout/payment-links', {
    idempotency_key: require('crypto').randomUUID(),
    order: Object.assign({ location_id: process.env.SQUARE_LOCATION_ID }, commande),
    checkout_options: { redirect_url: redirectUrl, ask_for_shipping_address: false },
    pre_populated_data: courriel ? { buyer_email: courriel } : undefined,
    payment_note: note ? String(note).slice(0, 450) : undefined,
  });
  return rep.payment_link && (rep.payment_link.url || rep.payment_link.long_url);
}

module.exports = { datesBloquees, creerLienPaiement, configure };
