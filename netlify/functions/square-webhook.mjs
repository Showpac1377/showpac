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
      bcc: [process.env.COURRIEL_COPIE || "info@showpac.com"],
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

  await envoyes.set(payment.id, new Date().toISOString());
  return new Response("OK");
};
