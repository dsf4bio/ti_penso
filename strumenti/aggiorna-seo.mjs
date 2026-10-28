// Aggiorna le parti di index.html che servono a Google e ai social, partendo da PRODUCTS:
// - schede prodotto scritte nell'HTML (tra <!-- PRODOTTI:INIZIO --> e <!-- PRODOTTI:FINE -->)
// - meta canonical e anteprime social (tra <!-- SEO:META:INIZIO --> e <!-- SEO:META:FINE -->)
// - dati strutturati JSON-LD: sito, elenco prodotti e domande frequenti
// - robots.txt e sitemap.xml
//
// Da lanciare dalla cartella del sito, ogni volta che modifichi i prodotti:
//   node strumenti/aggiorna-seo.mjs

import { readFileSync, writeFileSync } from "node:fs";

// ✏️ Indirizzo definitivo del sito, con la barra finale (es. "https://www.tipenso.it/").
// Finché è vuoto, canonical, anteprime social complete e sitemap non vengono generati.
const SITE_URL = "";

const page = "index.html";
let html = readFileSync(page, "utf8");

function readConst(name) {
  const match = html.match(new RegExp("const " + name + " = (\\[[\\s\\S]*?\\n    \\]|\\{[\\s\\S]*?\\n    \\});"));
  if (!match) throw new Error("Non trovo " + name + " in " + page);
  return new Function("return " + match[1])();
}

const CONFIG = readConst("CONFIG");
const GROUPS = readConst("GROUPS");
const BUDGETS = readConst("BUDGETS");
const PRODUCTS = readConst("PRODUCTS");

const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const groupLabel = (id) => GROUPS.find((g) => g.id === id)?.label || id;
const budgetOf = (price) => BUDGETS.find((b) => price >= b.min && price < b.max);
const imageUrl = (code, px) => `https://m.media-amazon.com/images/I/${code}._AC_SL${px}_.jpg`;
const affiliateUrl = (p) => `https://www.amazon.it/dp/${p.asin}?tag=${encodeURIComponent(CONFIG.affiliateTag)}`;

// Stesso ordine della pagina: alterna le categorie
function curatedOrder(list) {
  const buckets = GROUPS.map((g) => list.filter((p) => p.group === g.id));
  const out = [];
  for (let i = 0; out.length < list.length; i++) buckets.forEach((b) => { if (b[i]) out.push(b[i]); });
  return out;
}
const ORDERED = curatedOrder(PRODUCTS);

// ---------- Schede statiche ----------
const cards = ORDERED.map((p) => [
  `<article class="card" id="p-${esc(p.id)}">`,
  `<div class="media"><div class="gallery"><img src="${esc(imageUrl(p.images[0], 600))}" alt="${esc(p.title)}" loading="lazy" width="600" height="600" referrerpolicy="no-referrer"></div>${p.pick ? `<span class="ribbon">Scelta Ti penso</span>` : ""}</div>`,
  `<div class="body">`,
  `<div class="meta"><span class="pill">${esc(groupLabel(p.group))}</span></div>`,
  `<h3>${esc(p.title)}</h3>`,
  `<p class="desc">${esc(p.desc)}</p>`,
  `<ul class="benefits">${p.benefits.slice(0, 3).map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`,
  `<div class="actions-row"><a class="btn" href="${esc(affiliateUrl(p))}" target="_blank" rel="sponsored nofollow noopener noreferrer">Vedi su Amazon</a></div>`,
  `</div>`,
  `</article>`,
].join("")).join("\n");

// ---------- Domande frequenti lette dalla pagina ----------
const faqs = [...html.matchAll(/<details>\s*<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>\s*<\/details>/g)]
  .map((m) => ({ q: m[1].trim(), a: m[2].replace(/<[^>]+>/g, "").trim() }));

// ---------- Dati strutturati ----------
const base = SITE_URL || "";
const graph = [
  { "@type": "WebSite", name: "Ti penso", inLanguage: "it-IT", ...(base ? { "@id": base + "#website", url: base } : {}),
    description: "Idee regalo scelte tra i best seller di Amazon.it, per ogni persona e ogni budget." },
  { "@type": "ItemList", name: "Idee regalo Natale 2026: i best seller più amati su Amazon.it", numberOfItems: ORDERED.length,
    itemListElement: ORDERED.map((p, i) => ({ "@type": "ListItem", position: i + 1, name: p.title,
      ...(base ? { url: base + "#p-" + p.id } : {}), image: imageUrl(p.images[0], 600) })) },
];
if (faqs.length) {
  graph.push({ "@type": "FAQPage", mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) });
}
const jsonld = `  <script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c")}</script>`;

// ---------- Meta e anteprime social ----------
const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "Ti penso";
const description = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "";
const meta = [
  `  <meta property="og:type" content="website">`,
  `  <meta property="og:site_name" content="Ti penso">`,
  `  <meta property="og:locale" content="it_IT">`,
  `  <meta property="og:title" content="${esc(title)}">`,
  `  <meta property="og:description" content="${esc(description)}">`,
  `  <meta name="twitter:card" content="summary_large_image">`,
  ...(base ? [
    `  <link rel="canonical" href="${esc(base)}">`,
    `  <meta property="og:url" content="${esc(base)}">`,
    `  <meta property="og:image" content="${esc(base)}img/og-tipenso.jpg">`,
    `  <meta property="og:image:width" content="1200">`,
    `  <meta property="og:image:height" content="630">`,
  ] : [`  <meta property="og:image" content="img/og-tipenso.jpg">`]),
].join("\n");

function between(start, end, content) {
  const re = new RegExp("(<!-- " + start + " -->)[\\s\\S]*?(<!-- " + end + " -->)");
  if (!re.test(html)) throw new Error("Non trovo i segnaposto " + start + " / " + end);
  html = html.replace(re, (_, a, b) => a + "\n" + content + "\n" + b);
}
between("PRODOTTI:INIZIO", "PRODOTTI:FINE", cards);
between("SEO:META:INIZIO", "SEO:META:FINE", meta);
between("SEO:JSONLD:INIZIO", "SEO:JSONLD:FINE", jsonld);
html = html.replace(/<p class="hero-lead">\d+ idee/, `<p class="hero-lead">${PRODUCTS.length} idee`);
writeFileSync(page, html);

// ---------- robots.txt e sitemap.xml ----------
const today = new Date().toISOString().slice(0, 10);
writeFileSync("robots.txt", "User-agent: *\nAllow: /\n" + (base ? `\nSitemap: ${base}sitemap.xml\n` : ""));
if (base) {
  writeFileSync("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${base}</loc>\n    <lastmod>${today}</lastmod>\n  </url>\n</urlset>\n`);
}

console.log(`Aggiornati ${PRODUCTS.length} prodotti, ${faqs.length} domande frequenti, meta e robots.txt` + (base ? " e sitemap.xml." : ". (Sitemap non creata: SITE_URL è vuoto.)"));
