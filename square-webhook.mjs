// Square appelle cette fonction quand un paiement change de statut.
// Paiement complété → on lit la commande → on envoie le courriel via Resend.
import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";
import { courrielConfirmation } from "../lib/email-template.mjs";

// Noms de variables à confirmer avec netlify/lib/square.js
const SQUARE_TOKEN = process.env.SQUARE_ACCESS_TOKEN || process.env.SQUARE_TOKEN;
const SQUARE_ENV = process.env.SQUARE_ENV || process.env.SQUARE_ENVIRONMENT;
const SQUARE_BASE = SQUARE_ENV === "production"
  ? "https://connect.squareup.com"
  : "https://connect.squareupsandbox.com";

export const config = { path: "/api/square-webhook" };

function signatureValide(raw, signature) {
  const attendu = crypto
    .createHmac("sha256", process.env.SQUARE_WEBHOOK_SIGNATURE_KEY)
    .update(process.env.SQUARE_WEBHOOK_URL + raw)
    .digest("base64");
  const a = Buffer.from(signature || "");
  const b = Buffer.from(attendu);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// --- Avis interne à Pierre ----------------------------------------------------
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const dollars = (m) => (m ? (m.amount / 100).toLocaleString("fr-CA", { style: "currency", currency: m.currency || "CAD" }) : "");
const jour = (iso) => { const d = new Date(`${iso}T12:00:00`); return isNaN(d) ? iso : d.toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); };

function avisPierre(m, payment, order) {
  const acompte = m.mode === "acompte";
  const lignes = [
    ["Client", m.nom], ["Courriel", m.courriel], ["Téléphone", m.telephone],
    ["Forfait", m.forfait], ["Date", jour(m.date_evenement)], ["Adresse", m.adresse],
    ["Type d’événement", m.type_evenement], ["Invités", m.invites],
    [acompte ? "Dépôt payé" : "Payé au complet", dollars(payment.total_money)],
    ["Total estimé", acompte ? m.total_estime : ""],
  ].filter(([, v]) => v);
  const articles = (order?.line_items || []).map((l) => `${l.name} — ${dollars(l.base_price_money)}`);
  const sujet = `Nouvelle réservation : ${m.forfait} — ${jour(m.date_evenement)} — ${m.nom}`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#171A20">
  <h2 style="margin:0 0 12px">Nouvelle réservation payée ${acompte ? "(dépôt)" : "(au complet)"}</h2>
  <table cellpadding="6" style="border-collapse:collapse">${lignes.map(([k, v]) => `<tr><td style="color:#6B6F76">${esc(k)}</td><td><b>${esc(v)}</b></td></tr>`).join("")}</table>
  ${articles.length ? `<p style="margin:16px 0 4px;color:#6B6F76">Détail de la commande Square :</p><ul style="margin:0">${articles.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}
  <p style="margin-top:16px;color:#6B6F76">Répondez à ce courriel pour écrire directement au client.</p></div>`;
  const texte = [ "Nouvelle réservation payée", "", ...lignes.map(([k, v]) => `${k} : ${v}`), "", ...articles ].join("\n");
  return { sujet, html, texte };
}

export default async (req) => {
  const raw = await req.text();
  if (!signatureValide(raw, req.headers.get("x-square-hmacsha256-signature"))) {
    return new Response("Signature invalide", { status: 401 });
  }

  const event = JSON.parse(raw);
  const payment = event?.data?.object?.payment;
  if (!event.type?.startsWith("payment.") || payment?.status !== "COMPLETED" || !payment.order_id) {
    return new Response("Ignoré");
  }

  // Square peut envoyer le même paiement plusieurs fois (reprises, remboursements…)
  const envoyes = getStore("confirmations-envoyees");
  if (await envoyes.get(payment.id)) return new Response("Déjà envoyé");

  const r = await fetch(`${SQUARE_BASE}/v2/orders/${payment.order_id}`, {
    headers: {
      Authorization: `Bearer ${SQUARE_TOKEN}`,
      "Square-Version": "2025-01-23",
    },
  });
  if (!r.ok) {
    console.error("Commande introuvable :", await r.text());
    return new Response("Erreur Square", { status: 500 }); // Square réessaiera
  }
  const { order } = await r.json();
  const m = order?.metadata;

  // Ventes Square qui ne viennent pas du site (ex. paiement en personne) : on ignore
  if (!m?.courriel) return new Response("Pas une réservation du site");

  const { sujet, html, texte } = courrielConfirmation({ ...m, total: payment.total_money });

  const envoi = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
   from: process.env.COURRIEL_EXPEDITEUR || "ShowPAC <info@showpac.com>",
      to: [m.courriel],
      reply_to: "info@showpac.com",
      subject: sujet,
      html,
      text: texte,
    }),
  });

  if (!envoi.ok) {
    console.error("Erreur Resend :", await envoi.text());
    return new Response("Erreur d'envoi", { status: 500 }); // Square réessaiera
  }

  // Avis séparé pour Pierre : autre expéditeur et sujet clair, pour qu'il ne soit pas
  // classé comme « envoyé par moi-même » ni caché par la messagerie.
  try {
    const avis = avisPierre(m, payment, order);
    const dest = (process.env.COURRIEL_COPIE || "info@showpac.com").split(",").map((x) => x.trim()).filter(Boolean);
    const r2 = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.COURRIEL_AVIS_EXPEDITEUR || "Réservations ShowPAC <reservations@showpac.com>",
        to: dest,
        reply_to: m.courriel,
        subject: avis.sujet,
        html: avis.html,
        text: avis.texte,
      }),
    });
    if (!r2.ok) console.error("Erreur Resend (avis Pierre) :", await r2.text());
  } catch (e) {
    console.error("Avis Pierre :", e.message);
  }

  await envoyes.set(payment.id, new Date().toISOString());
  return new Response("OK");
};
