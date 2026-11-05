// Courriel de confirmation — lit les métadonnées créées par creer-paiement.js :
// date_evenement, forfait, mode, nom, courriel, telephone, adresse, invites, type_evenement, total_estime
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const dateFr = (iso) => {
  const d = new Date(`${iso}T12:00:00`);
  return isNaN(d) ? iso : d.toLocaleDateString("fr-CA", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
};

const argent = (m) => m
  ? (m.amount / 100).toLocaleString("fr-CA", { style: "currency", currency: m.currency || "CAD" })
  : "";

export function courrielConfirmation(r) {
  const prenom = String(r.nom || "").trim().split(/\s+/)[0] || "";
  const acompte = r.mode === "acompte";

  const details = [
    ["Forfait", r.forfait],
    ["Date de l’événement", dateFr(r.date_evenement)],
    ["Adresse de livraison", r.adresse],
    ["Type d’événement", r.type_evenement],
    ["Nombre d’invités", r.invites],
    [acompte ? "Dépôt payé" : "Montant payé", argent(r.total)],
    ["Total estimé", acompte ? r.total_estime : ""],
  ].filter(([, v]) => v);

  const paiementTxt = acompte
    ? "Votre dépôt a bien été reçu et votre date est réservée. Le solde sera à régler avant l’événement ; Pierre vous indiquera comment."
    : "Votre paiement complet a bien été reçu et votre date est réservée.";

  const sujet = "Confirmation de votre réservation – Location Karaoké Showpac";

  const lignesHtml = details.map(([k, v]) => `
          <tr>
            <td style="padding:8px 0;color:#6b6b6b;width:42%;vertical-align:top">${esc(k)}</td>
            <td style="padding:8px 0;color:#1f1f1f;font-weight:600">${esc(v)}</td>
          </tr>`).join("");

  const html = `<!doctype html>
<html lang="fr"><body style="margin:0;background:#f7f5f1;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f5f1;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
        <tr><td style="background:#1b5e4f;padding:24px 28px">
          <div style="color:#f2b705;font-size:13px;letter-spacing:2px;text-transform:uppercase">ShowPAC · Karaoké &amp; animation</div>
          <div style="color:#ffffff;font-size:22px;font-weight:700;margin-top:6px">Votre réservation est confirmée !</div>
        </td></tr>
        <tr><td style="padding:28px;font-size:15px;line-height:1.55;color:#1f1f1f">
          <p style="margin:0 0 16px">Bonjour ${esc(prenom)},</p>
          <p style="margin:0 0 20px">Merci d’avoir choisi ShowPAC ! ${esc(paiementTxt)}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e6e1d6;border-bottom:1px solid #e6e1d6;font-size:14px">${lignesHtml}
          </table>
          <p style="margin:20px 0 0"><strong>Prochaines étapes</strong><br>
          Pierre vous écrira sous peu pour confirmer l’heure de livraison et d’installation. D’ici là, parcourez notre <a href="https://showpac.com/repertoire.html" style="color:#1b5e4f">répertoire de chansons</a> et préparez vos demandes spéciales.</p>
          <p style="margin:16px 0 0">Une question ou un changement ? Écrivez à <a href="mailto:info@showpac.com" style="color:#1b5e4f">info@showpac.com</a> ou appelez au (450) 699-5914.</p>
          <p style="margin:20px 0 0">À très bientôt, et préparez vos cordes vocales !</p>
          <p style="margin:16px 0 0">Pierre Champoux<br><span style="color:#6b6b6b">ShowPAC – Les Productions PAC<br>
          <a href="https://showpac.com" style="color:#1b5e4f">showpac.com</a></span></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const texte = [
    `Bonjour ${prenom},`,
    "",
    `Merci d’avoir choisi ShowPAC ! ${paiementTxt}`,
    "",
    ...details.map(([k, v]) => `${k} : ${v}`),
    "",
    "Pierre vous écrira sous peu pour confirmer l’heure de livraison et d’installation.",
    "Une question ? info@showpac.com ou (450) 699-5914.",
    "",
    "Pierre Champoux",
    "ShowPAC – Les Productions PAC",
    "showpac.com",
  ].join("\n");

  return { sujet, html, texte };
}
