// FICHIER TEMPORAIRE — à supprimer après le test.
// Visiter /api/test-courriel envoie un exemple de confirmation à COURRIEL_COPIE.
import { courrielConfirmation } from "../lib/email-template.mjs";

export const config = { path: "/api/test-courriel" };

export default async () => {
  const dest = process.env.COURRIEL_COPIE;
  if (!dest) return texte("Variable COURRIEL_COPIE manquante dans Netlify.", 500);
  if (!process.env.RESEND_API_KEY) return texte("Variable RESEND_API_KEY manquante dans Netlify.", 500);

  const { sujet, html, texte: corps } = courrielConfirmation({
    nom: "Julie Tremblay",
    courriel: dest,
    forfait: "Party PAC",
    mode: "acompte",
    date_evenement: "2026-12-12",
    adresse: "123 rue Principale, Châteauguay",
    type_evenement: "Party des fêtes",
    invites: "40",
    total_estime: "343,80 $",
    total: { amount: 5000, currency: "CAD" },
  });

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.COURRIEL_EXPEDITEUR || "ShowPAC <info@showpac.com>",
      to: [dest],
      subject: `[TEST] ${sujet}`,
      html,
      text: corps,
    }),
  });

  const reponse = await r.text();
  return r.ok
    ? texte(`✅ Courriel de test envoyé à ${dest}\n\n${reponse}`)
    : texte(`❌ Erreur Resend (${r.status})\n\n${reponse}`, 500);
};

function texte(msg, status = 200) {
  return new Response(msg, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
