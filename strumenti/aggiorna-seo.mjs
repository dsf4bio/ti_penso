// Aggiorna le parti di index.html che servono a Google e ai social, leggendo le schede prodotto
// scritte a mano nell'HTML (tra <!-- PRODOTTI:INIZIO --> e <!-- PRODOTTI:FINE -->):
// - meta canonical e anteprime social (tra <!-- SEO:META:INIZIO --> e <!-- SEO:META:FINE -->)
// - dati strutturati JSON-LD: sito, elenco prodotti e domande frequenti
// - numero di idee nel testo in alto, robots.txt e sitemap.xml
//
// Le schede e i link affiliati NON vengono toccati: si modificano solo a mano in index.html.
//
// Da lanciare dalla cartella del sito, dopo aver aggiunto o tolto prodotti:
//   node strumenti/aggiorna-seo.mjs

import { readFileSync, writeFileSync } from "node:fs";

// ✏️ Indirizzo definitivo del sito, con la barra finale (es. "https://www.tipenso.it/").
// Finché è vuoto, canonical, anteprime social complete e sitemap non vengono generati.
const SITE_URL = "https://www.tpenso.online/";

const page = "index.html";
let html = readFileSync(page, "utf8");

function readConst(name) {
  const match = html.match(new RegExp("const " + name + " = (\\[[\\s\\S]*?\\n    \\]|\\{[\\s\\S]*?\\n    \\});"));
  if (!match) throw new Error("Non trovo " + name + " in " + page);
  return new Function("return " + match[1])();
}

const GROUPS = readConst("GROUPS");
const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---------- Prodotti letti dalle schede HTML ----------
const gridHtml = (html.match(/<!-- PRODOTTI:INIZIO -->([\s\S]*?)<!-- PRODOTTI:FINE -->/) || [])[1];
if (gridHtml === undefined) throw new Error("Non trovo i segnaposto PRODOTTI:INIZIO / PRODOTTI:FINE");
const unesc = (v) => String(v ?? "").replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&amp;/g, "&").trim();
const PRODUCTS = [...gridHtml.matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article>/g)].map((m) => {
  const attr = (name) => (m[1].match(new RegExp(name + '="([^"]*)"')) || [])[1] || "";
  const body = m[2];
  const href = unesc((body.match(/<a class="btn" href="([^"]*)"/) || [])[1]);
  return {
    id: attr("id").replace(/^p-/, ""),
    group: attr("data-group"),
    price: attr("data-price"),
    title: unesc((body.match(/<h3[^>]*>([\s\S]*?)<\/h3>/) || [])[1]),
    image: unesc((body.match(/<img[^>]*\ssrc="([^"]*)"/) || [])[1]),
    href,
  };
});

// Controlli: segnala i problemi più comuni nelle schede scritte a mano
const problems = [];
const seen = new Set();
PRODUCTS.forEach((p, i) => {
  const who = p.title || p.id || "scheda n. " + (i + 1);
  if (!p.id) problems.push(`${who}: manca id="p-..."`);
  else if (seen.has(p.id)) problems.push(`${who}: id "p-${p.id}" usato due volte`);
  seen.add(p.id);
  if (!GROUPS.some((g) => g.id === p.group)) problems.push(`${who}: data-group "${p.group}" non valido (usa ${GROUPS.map((g) => g.id).join(", ")})`);
  if (!/^\d+(\.\d+)?$/.test(p.price)) problems.push(`${who}: data-price "${p.price}" non valido (es. 49.99)`);
  if (!p.title) problems.push(`${who}: manca il titolo <h3>`);
  if (!p.image) problems.push(`${who}: manca la foto <img>`);
  if (!/^https:\/\/\S+$/.test(p.href)) problems.push(`${who}: link del pulsante mancante o non valido ("${p.href}")`);
});
if (problems.length) {
  console.error("⚠️  Da sistemare in index.html:\n- " + problems.join("\n- "));
  process.exitCode = 1;
}

// Stesso ordine della pagina: alterna le categorie (quelle sconosciute in fondo)
function curatedOrder(list) {
  const buckets = GROUPS.map((g) => list.filter((p) => p.group === g.id));
  const longest = Math.max(0, ...buckets.map((b) => b.length));
  const out = [];
  for (let i = 0; i < longest; i++) buckets.forEach((b) => { if (b[i]) out.push(b[i]); });
  return out.concat(list.filter((p) => !out.includes(p)));
}
const ORDERED = curatedOrder(PRODUCTS);

// ---------- Domande frequenti lette dalla pagina ----------
const faqs = [...html.matchAll(/<details>\s*<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>\s*<\/details>/g)]
  .map((m) => ({ q: m[1].trim(), a: m[2].replace(/<[^>]+>/g, "").trim() }));

// ---------- Dati strutturati ----------
const base = SITE_URL || "";
const today = new Date().toISOString().slice(0, 10);
const pageTitle = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "Ti penso";
const pageDescription = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "";
const graph = [
  { "@type": "WebSite", name: "Ti penso", alternateName: ["TiPenso", "tpenso.online"], inLanguage: "it-IT",
    ...(base ? { "@id": base + "#website", url: base, publisher: { "@id": base + "#organization" } } : {}),
    description: "Idee regalo scelte tra i best seller di Amazon.it, per ogni persona e ogni budget." },
  ...(base ? [
    { "@type": "Organization", "@id": base + "#organization", name: "Ti penso", url: base,
      logo: { "@type": "ImageObject", url: base + "icone/icona-512.png", width: 512, height: 512 } },
    { "@type": "WebPage", "@id": base + "#webpage", url: base, name: pageTitle, description: pageDescription,
      inLanguage: "it-IT", isPartOf: { "@id": base + "#website" }, about: { "@id": base + "#itemlist" },
      primaryImageOfPage: { "@type": "ImageObject", url: base + "img/og-tipenso.jpg", width: 1200, height: 630 },
      dateModified: today },
  ] : []),
  { "@type": "ItemList", ...(base ? { "@id": base + "#itemlist" } : {}), name: "Idee regalo Natale 2026: i best seller più amati su Amazon.it", numberOfItems: ORDERED.length,
    itemListElement: ORDERED.map((p, i) => ({ "@type": "ListItem", position: i + 1, name: p.title,
      ...(base ? { url: base + "#p-" + p.id } : {}), image: p.image })) },
];
if (faqs.length) {
  graph.push({ "@type": "FAQPage", mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) });
}
const jsonld = `  <script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c")}</script>`;

// ---------- Meta e anteprime social ----------
const title = pageTitle;
const description = pageDescription;
const ogAlt = "Ti penso: idee regalo per Natale 2026 tra i best seller di Amazon.it";
const meta = [
  `  <meta property="og:type" content="website">`,
  `  <meta property="og:site_name" content="Ti penso">`,
  `  <meta property="og:locale" content="it_IT">`,
  `  <meta property="og:title" content="${esc(title)}">`,
  `  <meta property="og:description" content="${esc(description)}">`,
  `  <meta name="twitter:card" content="summary_large_image">`,
  `  <meta name="twitter:title" content="${esc(title)}">`,
  `  <meta name="twitter:description" content="${esc(description)}">`,
  ...(base ? [
    `  <link rel="canonical" href="${esc(base)}">`,
    `  <meta property="og:url" content="${esc(base)}">`,
    `  <meta property="og:image" content="${esc(base)}img/og-tipenso.jpg">`,
    `  <meta property="og:image:width" content="1200">`,
    `  <meta property="og:image:height" content="630">`,
    `  <meta property="og:image:type" content="image/jpeg">`,
    `  <meta property="og:image:alt" content="${esc(ogAlt)}">`,
    `  <meta name="twitter:image" content="${esc(base)}img/og-tipenso.jpg">`,
    `  <meta name="twitter:image:alt" content="${esc(ogAlt)}">`,
  ] : [`  <meta property="og:image" content="img/og-tipenso.jpg">`]),
].join("\n");

function between(start, end, content) {
  const re = new RegExp("(<!-- " + start + " -->)[\\s\\S]*?(<!-- " + end + " -->)");
  if (!re.test(html)) throw new Error("Non trovo i segnaposto " + start + " / " + end);
  html = html.replace(re, (_, a, b) => a + "\n" + content + "\n" + b);
}
between("SEO:META:INIZIO", "SEO:META:FINE", meta);
between("SEO:JSONLD:INIZIO", "SEO:JSONLD:FINE", jsonld);
html = html.replace(/<p class="hero-lead">\d+ idee/, `<p class="hero-lead">${PRODUCTS.length} idee`);
writeFileSync(page, html);

// ---------- robots.txt e sitemap.xml ----------
writeFileSync("robots.txt", "User-agent: *\nAllow: /\n" + (base ? `\nSitemap: ${base}sitemap.xml\n` : ""));
if (base) {
  writeFileSync("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${base}</loc>\n    <lastmod>${today}</lastmod>\n  </url>\n</urlset>\n`);
}

console.log(`Letti ${PRODUCTS.length} prodotti (schede e link non modificati): aggiornati, ${faqs.length} domande frequenti, meta e robots.txt` + (base ? " e sitemap.xml." : ". (Sitemap non creata: SITE_URL è vuoto.)"));
