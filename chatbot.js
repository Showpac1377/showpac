/*!
 * Assistant ShowPAC : clavardage scripté (aucune IA, aucun serveur)
 * Installation : <script src="/chatbot.js" defer></script> juste avant </body> de chaque page.
 * Le bot répond aux questions de base et dirige vers les pages existantes
 * (réservation, soumission d'animation, répertoire). Il ne collecte aucune donnée.
 */
(function () {
  "use strict";

  /* ===== À PERSONNALISER ===== */
  const CONFIG = {
    marque: "ShowPAC",
    telephone: "(450) 699-5914",
    telLien: "+14506995914",
    courriel: "info@showpac.com",
    liens: {
      reservation: "/reservation",            // + ?forfait=cle|party|corpo
      animation: "/soumission-animation",
      repertoire: "/repertoire",              // + ?q=recherche
      forfaits: "/#forfaits",
    },
    heures: "Lundi au vendredi : 9 h à 21 h\nSamedi : 10 h à 17 h\nDimanche : 11 h à 17 h",
    forfaits: [
      { id: "cle", nom: "Clé en main", prix: "219 $", details: "L’essentiel du karaoké : moniteur 20 po, enceinte 100 W pro et plus de 14 000 chansons. Idéal pour un petit groupe ou une soirée entre amis." },
      { id: "party", nom: "Party PAC", prix: "299 $", details: "Tout le Clé en main, plus une console audio Bluetooth 320 W, 2 micros sans fil et 1 500 chansons pour danser. Notre forfait le plus polyvalent pour une fête à la maison." },
      { id: "corpo", nom: "Corporatif", prix: "499 $", details: "Tout le Party PAC, plus un projecteur avec écran 72 po, 2 enceintes 320 W et un effet de lumière. Pensé pour les salles de réception et les groupes de 50 à 200 personnes. Fonctionne en libre-service : vos invités gèrent la file d’attente avec l’application." },
    ],
    livraison: "La livraison et l’installation sont gratuites à moins de 25 km de nos bureaux de Châteauguay. Notre équipe arrive avant vos invités, installe le matériel et teste le son. Plus loin? Appelez Pierre pour confirmer ce qui s’applique à votre adresse.",
    animation: "Pierre anime votre soirée du début à la fin : maître de cérémonie, chanteur et DJ selon le moment, quiz et jeux, coordination avec le traiteur et la salle. À partir de 899 $. Un animateur peut aussi être ajouté à un forfait de location en tout temps.",
    reserver: "Choisissez un forfait et remplissez le formulaire en ligne (date, adresse, extras) : le total s’affiche en direct. Payez le dépôt de 50 $ (ou le total) par carte et votre date est réservée tout de suite. Vous préférez un autre mode de paiement? Pierre confirme alors votre date.",
    // Ne mettez ici que des réponses confirmées par Pierre.
    faq: [
      { q: "Combien de temps d’avance réserver?", a: "Dès que votre date est fixée, surtout pour un événement d’entreprise en haute saison (novembre-décembre et mai-juin)." },
      { q: "Faut-il un dépôt?", a: "Oui : 50 $ à la réservation, payable en ligne par carte. Vous pouvez aussi payer le total d’un coup." },
      { q: "Peut-on choisir nos chansons à l’avance?", a: "Oui. Dans le répertoire, ajoutez jusqu’à 50 chansons à votre liste et envoyez-la-nous par courriel en un clic." },
      { q: "Les chansons varient-elles selon le forfait?", a: "Non. Chaque forfait comprend le même lecteur avec plus de 14 000 titres franco et anglo. Le Party PAC et le Corporatif ajoutent 1 500 chansons pour danser." },
      { q: "Pour quels types d’événements?", a: "Soirées d’entreprise (5 à 7, soirées d’équipe, lancements, soupers de bureau, galas), mariages, fêtes de famille et activités scolaires." },
      { q: "Ça marche pour un grand groupe?", a: "Oui. Le forfait Corporatif est pensé pour 50 à 200 personnes, avec deux enceintes de 320 W et un écran de 72 po." },
      { q: "Peut-on ajouter de l’équipement?", a: "Oui. Micros, tablette supplémentaire ou projecteur peuvent être ajoutés à la carte dans le formulaire de réservation." },
      // { q: "Quelle est la durée de la location?", a: "…" },
      // { q: "Politique d’annulation?", a: "…" },
    ],
  };
  /* ============================ */

  const C = { creme: "var(--bg,#F7F5F1)", papier: "var(--bg-elevated,#FFFFFF)", or: "var(--gold-ui,#C4451B)", emeraude: "var(--emerald,#16594A)", encre: "var(--text,#171A20)", gris: "var(--text-muted,#6B6F76)" };
  const css = `
.spc-launch{position:fixed;right:20px;bottom:calc(20px + env(safe-area-inset-bottom,0px));z-index:9998;display:flex;align-items:center;gap:10px;padding:12px 18px 12px 14px;border:0;border-radius:999px;background:${C.emeraude};color:${C.papier};font:600 15px/1 var(--font-head,system-ui),sans-serif;cursor:pointer;box-shadow:0 6px 20px rgba(22,89,74,.35)}
.spc-launch[hidden]{display:none}
.spc-launch svg{width:22px;height:22px;flex:none}
.spc-launch:hover{filter:brightness(1.08)}
.spc-launch:focus-visible,.spc-panel button:focus-visible,.spc-panel input:focus-visible,.spc-panel a:focus-visible{outline:3px solid ${C.or};outline-offset:2px}
.spc-panel{position:fixed;right:20px;bottom:calc(20px + env(safe-area-inset-bottom,0px));z-index:9999;width:min(380px,calc(100vw - 32px));height:min(600px,calc(100vh - 120px));display:flex;flex-direction:column;background:${C.creme};color:${C.encre};border:1px solid rgba(23,26,32,.12);border-radius:18px;overflow:hidden;box-shadow:0 18px 50px rgba(30,38,34,.25);font:15px/1.5 var(--font-body,system-ui),sans-serif}
.spc-panel[hidden]{display:none}
.spc-head{display:flex;align-items:center;gap:10px;padding:14px 14px 14px 18px;background:${C.emeraude};color:${C.papier}}
.spc-head strong{font:600 16px/1.2 var(--font-head,system-ui),sans-serif;flex:1}
.spc-head small{display:block;font:400 12.5px/1.3 var(--font-body,system-ui),sans-serif;opacity:.8}
.spc-head button{border:0;background:transparent;color:${C.papier};font:500 14px/1 var(--font-body,system-ui),sans-serif;padding:8px 10px;border-radius:8px;cursor:pointer}
.spc-head button:hover{background:rgba(255,255,255,.12)}
.spc-log{flex:1;overflow-y:auto;padding:16px 14px 8px;display:flex;flex-direction:column;gap:10px}
.spc-msg{max-width:86%;padding:10px 13px;border-radius:14px;white-space:pre-line;word-wrap:break-word}
.spc-bot{align-self:flex-start;background:${C.papier};border:1px solid rgba(23,26,32,.1);border-bottom-left-radius:4px}
.spc-user{align-self:flex-end;background:${C.emeraude};color:${C.papier};border-bottom-right-radius:4px}
.spc-msg a{color:${C.emeraude};font-weight:600}
.spc-songs{list-style:none;margin:8px 0 0;padding:0;max-height:260px;overflow-y:auto}
.spc-songs li{padding:7px 0;border-top:1px solid rgba(23,26,32,.1)}
.spc-songs b{display:block;font-weight:600}
.spc-songs span{color:${C.gris};font-size:13.5px}
.spc-prices{margin:8px 0 0;padding:0;list-style:none}
.spc-prices li{display:flex;justify-content:space-between;gap:16px;padding:6px 0;border-top:1px solid rgba(23,26,32,.1)}
.spc-prices li span:last-child{font-family:var(--font-head,system-ui),sans-serif;font-weight:600;color:${C.emeraude}}
.spc-chips{display:flex;flex-wrap:wrap;gap:8px;padding:6px 14px 10px}
.spc-chips button{border:1.5px solid ${C.or};background:${C.papier};color:${C.encre};border-radius:999px;padding:8px 13px;font:500 14px/1.2 var(--font-body,system-ui),sans-serif;cursor:pointer;text-align:left}
.spc-chips button:hover{background:${C.or};color:${C.papier}}
.spc-form{display:flex;gap:8px;padding:10px 12px calc(12px + env(safe-area-inset-bottom,0px));border-top:1px solid rgba(23,26,32,.12);background:${C.papier}}
.spc-form input{flex:1;min-width:0;border:1px solid rgba(30,38,34,.2);border-radius:10px;padding:10px 12px;font:15px/1.3 var(--font-body,system-ui),sans-serif;color:${C.encre};background:#fff}
.spc-form button{border:0;border-radius:10px;padding:0 16px;background:${C.emeraude};color:${C.papier};font:600 14px/1 var(--font-head,system-ui),sans-serif;cursor:pointer}
.spc-new{animation:spcIn .18s ease-out}
@keyframes spcIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.spc-new{animation:none}}
@media (max-width:520px){
 .spc-panel{inset:0;width:100%;height:100%;border-radius:0;border:0;padding-top:env(safe-area-inset-top,0px)}
 .spc-launch span{display:none}.spc-launch{padding:14px}
}`;

  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9$]+/g, " ").trim();

  /* ---------- Interface ---------- */
  const launch = el("button", "spc-launch");
  launch.type = "button";
  launch.setAttribute("aria-expanded", "false");
  launch.setAttribute("aria-controls", "spc-panel");
  launch.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg><span>Une question?</span>';

  const panel = el("section", "spc-panel");
  panel.id = "spc-panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Questions sur " + CONFIG.marque);

  const head = el("div", "spc-head");
  const title = el("strong", null, CONFIG.marque);
  title.appendChild(el("small", null, "Forfaits, livraison, réservation"));
  const btnMenu = el("button", null, "Menu"); btnMenu.type = "button";
  const btnClose = el("button", null, "Fermer"); btnClose.type = "button";
  head.append(title, btnMenu, btnClose);

  const log = el("div", "spc-log");
  log.setAttribute("role", "log");
  log.setAttribute("aria-live", "polite");
  const chips = el("div", "spc-chips");
  const form = el("form", "spc-form");
  const input = el("input");
  input.type = "text";
  input.setAttribute("aria-label", "Votre question");
  input.placeholder = "Posez votre question…";
  const send = el("button", null, "Envoyer"); send.type = "submit";
  form.append(input, send);
  panel.append(head, log, chips, form);
  document.body.append(panel, launch);

  const scroll = () => (log.scrollTop = log.scrollHeight);
  function bot(content) {
    const b = el("div", "spc-msg spc-bot spc-new");
    if (typeof content === "string") b.textContent = content; else b.append(...[].concat(content));
    log.appendChild(b); scroll(); return b;
  }
  function user(text) { log.appendChild(el("div", "spc-msg spc-user spc-new", text)); scroll(); }
  function link(text, href) { const a = el("a", null, text); a.href = href; return a; }
  const txt = (s) => document.createTextNode(s);
  function setChips(list) {
    chips.replaceChildren();
    list.forEach(([label, fn]) => {
      const c = el("button", null, label); c.type = "button";
      c.addEventListener("click", () => { user(label); fn(); });
      chips.appendChild(c);
    });
    scroll();
  }
  const go = (href) => () => { window.location.href = href; };

  /* ---------- Réponses ---------- */
  const menu = () => [
    ["Forfaits et prix", forfaits],
    ["Livraison et zone", livraison],
    ["Animateur / DJ", animation],
    ["Chercher une chanson", chercher],
    ["Réserver", reserver],
    ["Autres questions", faq],
    ["Joindre Pierre", contact],
  ];
  const suite = (extra) => setChips([...(extra || []), ["Autres questions", faq], ["Menu", () => showMenu()]]);

  let mode = "menu";
  function showMenu(greet) {
    mode = "menu";
    input.placeholder = "Posez votre question…";
    bot(greet ? "Bonjour! Je réponds aux questions sur nos forfaits, la livraison, l’animation et la réservation. Choisissez un sujet ou écrivez votre question." : "Que voulez-vous savoir?");
    setChips(menu());
  }

  function forfaits() {
    const ul = el("ul", "spc-prices");
    CONFIG.forfaits.forEach((f) => { const li = el("li"); li.append(el("span", null, f.nom), el("span", null, f.prix)); ul.appendChild(li); });
    bot([txt("Nos trois forfaits (taxes en sus), livraison et installation gratuites à moins de 25 km de Châteauguay :"), ul]);
    setChips([...CONFIG.forfaits.map((f) => [f.nom + " : c’est quoi?", () => detail(f)]), ["Réserver", reserver], ["Menu", () => showMenu()]]);
  }
  function detail(f) {
    bot(f.nom + " (" + f.prix + " + taxes) : " + f.details);
    setChips([["Réserver ce forfait", go(CONFIG.liens.reservation + "?forfait=" + f.id)], ["Comparer les forfaits", forfaits], ["Menu", () => showMenu()]]);
  }
  function livraison() { bot(CONFIG.livraison); suite([["Forfaits et prix", forfaits]]); }
  function animation() {
    bot(CONFIG.animation);
    setChips([["Demander un animateur", go(CONFIG.liens.animation)], ["Forfaits de location", forfaits], ["Menu", () => showMenu()]]);
  }
  function reserver() {
    bot(CONFIG.reserver);
    setChips([["Réserver mon karaoké", go(CONFIG.liens.reservation)], ["Faire animer ma soirée", go(CONFIG.liens.animation)], ["Menu", () => showMenu()]]);
  }
  function faq() {
    bot("Choisissez une question :");
    setChips(CONFIG.faq.map((f) => [f.q, () => { bot(f.a); suite(); }]).concat([["Menu", () => showMenu()]]));
  }
  function contact() {
    bot([txt("Appelez Pierre au "), link(CONFIG.telephone, "tel:" + CONFIG.telLien), txt(" ou écrivez à "), link(CONFIG.courriel, "mailto:" + CONFIG.courriel), txt(".\n\n" + CONFIG.heures)]);
    setChips([["Réserver", reserver], ["Menu", () => showMenu()]]);
  }
  function chercher() {
    mode = "search";
    input.placeholder = "Titre ou artiste…";
    bot("Tapez un titre ou un artiste, je vous ouvre le répertoire de plus de 14 000 chansons.");
    setChips([["Menu", () => showMenu()]]);
    input.focus();
  }
  function rechercher(q) {
    const href = CONFIG.liens.repertoire + "?q=" + encodeURIComponent(q);
    bot([txt("Voici les résultats pour « " + q + " » : "), link("ouvrir le répertoire", href), txt(".")]);
    mode = "menu";
    input.placeholder = "Posez votre question…";
    setChips([["Ouvrir le répertoire", go(href)], ["Autre recherche", chercher], ["Menu", () => showMenu()]]);
  }

  /* ---------- Texte libre ---------- */
  const INTENTS = [
    [/\b(annul|rembours)/, () => { bot("Pour une annulation ou un changement de date, voyez directement avec Pierre."); contact(); }],
    [/\b(depot|acompte)\b/, () => { bot(CONFIG.faq[1].a); suite([["Réserver", reserver]]); }],
    [/\b(livr|install|zone|region|secteur|distance|km|deplac|loin|ou etes)/, livraison],
    [/\b(anima|dj|maitre de ceremonie|mc|quiz|jeux)\b/, animation],
    [/\b(cle en main)\b/, () => detail(CONFIG.forfaits[0])],
    [/\b(party pac|party)\b/, () => detail(CONFIG.forfaits[1])],
    [/\b(corpo|entreprise|bureau|gala|grand groupe|200)/, () => detail(CONFIG.forfaits[2])],
    [/\b(prix|cout|coute|combien|tarif|forfait|budget|\$)/, forfaits],
    [/\b(reserv|disponib|booker|louer|location|payer|paiement|carte)/, reserver],
    [/\b(avance|haute saison|delai)\b/, () => { bot(CONFIG.faq[0].a); suite([["Réserver", reserver]]); }],
    [/\b(chanson|repertoire|titre|artiste|toune|liste)/, chercher],
    [/\b(mariage|fete|evenement|scolaire|ecole)\b/, () => { bot(CONFIG.faq[4].a); suite([["Forfaits et prix", forfaits]]); }],
    [/\b(ajout|extra|micro|projecteur|tablette|equipement)/, () => { bot(CONFIG.faq[6].a); suite([["Forfaits et prix", forfaits]]); }],
    [/\b(heure|ouvert|telephone|appeler|parler|contact|courriel|joindre|pierre)\b/, contact],
  ];

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v) return;
    input.value = "";
    user(v);
    if (mode === "search") return rechercher(v);
    const n = norm(v);
    const hit = INTENTS.find(([re]) => re.test(n));
    if (hit) return hit[1]();
    bot([txt("Je n’ai pas de réponse toute faite à cette question. Pierre peut vous répondre au "), link(CONFIG.telephone, "tel:" + CONFIG.telLien), txt(". C’est peut-être une chanson? Je peux la chercher dans le répertoire.")]);
    setChips([["Chercher « " + v + " »", () => rechercher(v)], ["Autres questions", faq], ["Menu", () => showMenu()]]);
  });

  /* ---------- Ouverture ---------- */
  let started = false;
  function open() {
    panel.hidden = false; launch.hidden = true; launch.setAttribute("aria-expanded", "true");
    if (!started) { started = true; showMenu(true); }
    input.focus();
  }
  function close() { panel.hidden = true; launch.hidden = false; launch.setAttribute("aria-expanded", "false"); launch.focus(); }
  launch.addEventListener("click", open);
  btnClose.addEventListener("click", close);
  btnMenu.addEventListener("click", () => { user("Menu"); showMenu(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) close(); });
  window.ShowpacChat = { open, close };
})();
