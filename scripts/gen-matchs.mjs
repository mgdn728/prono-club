// PronoClub — génère une page Google par gros match (prono/*.html), la page « Pronos du jour » et le sitemap.
// Lancé automatiquement par GitHub Actions (.github/workflows/site.yml). Aucune clé secrète : seulement la clé publique.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SITE = 'https://prono-club.fr';
const SB = 'https://akxsucplmrdrbsmhdmvj.supabase.co/rest/v1/rpc/';
const KEY = 'sb_publishable_y0r-6RnFOCPZffZJSCxvQg_whwl47yx';
const MAXJ = 16; // pages par jour au maximum

/* ---------- noms français (repris de l'appli) ---------- */
const appSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
let frn = x => x, frc = x => x;
try {
  const a = appSrc.indexOf('const FRN='), b = appSrc.indexOf('function frc(x){return x&&FRC[x]||x}');
  if (a > 0 && b > a) ({ frn, frc } = new Function(appSrc.slice(a, b) + 'function frc(x){return x&&FRC[x]||x};return{frn,frc}')());
} catch (e) { console.error('noms FR indisponibles', e.message) }

/* ---------- dates (heure de Paris) ---------- */
const dayOf = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const today = dayOf(new Date());
const shift = n => dayOf(new Date(Date.now() + n * 864e5));
const DAYS = [-7, -6, -5, -4, -3, -2, -1, 0, 1, 2].map(shift);
const fJour = t => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(t));
const fJourAn = t => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(t));
const fHeure = t => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(new Date(t)).replace(':', 'h');
const fDayLabel = d => d === today ? "aujourd'hui" : d === shift(1) ? 'demain' : d === shift(-1) ? 'hier' : fJour(d + 'T12:00:00+01:00');

/* ---------- outils ---------- */
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const slug = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'et').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const nf = x => String(x.toFixed(2)).replace('.', ',');
const hsh = s => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h) };
const pickV = (arr, seed) => arr[seed % arr.length];
const SPORT = { foot: 'Football', basket: 'Basketball', hockey: 'Hockey sur glace', rugby: 'Rugby', tennis: 'Tennis' };
const COMP = [[/ligue des champions|champions league/i, 'pronostics-ligue-des-champions.html', 'Ligue des champions'], [/^ligue 1/i, 'pronostics-ligue-1.html', 'Ligue 1'],
  [/premier league/i, 'pronostics-premier-league.html', 'Premier League'], [/liga|laliga/i, 'pronostics-liga.html', 'Liga'], [/serie a/i, 'pronostics-serie-a.html', 'Serie A'],
  [/bundesliga/i, 'pronostics-bundesliga.html', 'Bundesliga'], [/nba/i, 'pronostics-nba.html', 'NBA'], [/nhl/i, 'pronostics-nhl.html', 'NHL'], [/atp|wta|tennis/i, 'pronostics-tennis.html', 'tennis']];
const EXACT = { 'pronostics-ligue-1.html': ['Ligue 1'], 'pronostics-ligue-des-champions.html': ['Ligue des champions'], 'pronostics-premier-league.html': ['Premier League'],
  'pronostics-liga.html': ['Liga'], 'pronostics-serie-a.html': ['Serie A'], 'pronostics-bundesliga.html': ['Bundesliga'], 'pronostics-nba.html': ['NBA'] };
const inComp = (x, c) => { c = String(c || '').trim(); const e = EXACT[x[1]]; if (e) return e.includes(c); if (x[1] === 'pronostics-nhl.html') return /^NHL/.test(c); return x[0].test(c) };
const compPage = c => COMP.find(x => inComp(x, c));
const TOP = /ligue 1|premier league|liga|serie a|bundesliga|ligue des champions|champions league|europa|conference|nba|coupe de france|top 14|six nations|coupe du monde|euro|ligue des nations/i;

const head = (title, desc, url, extra = '') => `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${SITE}/icons/og-image.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:locale" content="fr_FR">
<link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" type="image/png" sizes="96x96" href="/icons/favicon-96.png"><link rel="icon" type="image/png" sizes="144x144" href="/icons/favicon-144.png"><link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png">
<link rel="stylesheet" href="/pages.css">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5089292083768259" crossorigin="anonymous"></script>
${extra}</head>
<body>
<header><div class="in"><img src="/icons/icon-192.png" alt=""><a href="/">Prono<span>Club</span></a><nav><a href="/pronostics-du-jour.html">Pronos du jour</a></nav></div></header>
<main>
`;
const foot = `</main>
<footer>
<a href="/">Accueil</a><a href="/pronostics-du-jour.html">Pronos du jour</a><a href="/guides.html">Guides</a><a href="/a-propos.html">À propos</a><a href="/confidentialite.html">Confidentialité</a><a href="/mentions-legales.html">Mentions légales</a><a href="/contact.html">Contact</a>
<p>PronoClub · jeu gratuit, sans argent réel. Les pronostics de cette page sont donnés à titre indicatif.</p>
</footer>
</body>
</html>
`;

/* ---------- analyse d'un match ---------- */
function analyse(m) {
  const H = m.H, A = m.A, o = m.o, three = o.length === 3, seed = hsh(m.id);
  const inv = o.map(x => 1 / x), S = inv.reduce((a, b) => a + b, 0), p = inv.map(x => Math.round(x / S * 100));
  const names = three ? [H, 'Match nul', A] : [H, A];
  const fi = p.indexOf(Math.max(...(three ? [p[0], p[2]] : p)));
  const fav = names[fi], gap = three ? Math.abs(p[0] - p[2]) : Math.abs(p[0] - p[1]);
  const txt = [];
  if (gap < 8) txt.push(pickV([`Les cotes annoncent un match très serré : ${esc(H)} (${p[0]} %) et ${esc(A)} (${p[three ? 2 : 1]} %) ont presque les mêmes chances de l'emporter.`,
    `Affiche équilibrée : selon les cotes, aucune des deux équipes ne se détache vraiment (${p[0]} % pour ${esc(H)}, ${p[three ? 2 : 1]} % pour ${esc(A)}).`], seed));
  else txt.push(pickV([`${esc(fav)} part favori avec une cote de ${nf(o[fi])}, soit environ ${p[fi]} % de chances de victoire selon les cotes.`,
    `Les cotes placent ${esc(fav)} en favori : ${nf(o[fi])}, ce qui correspond à environ ${p[fi]} % de chances de gagner.`,
    `Avantage ${esc(fav)} sur le papier, avec une cote de ${nf(o[fi])} (environ ${p[fi]} % de probabilité).`], seed));
  if (three) txt.push(`Le match nul est coté ${nf(o[1])}, soit environ ${p[1]} % de probabilité.`);
  const x = m.stx || {};
  const form = (f, team) => { if (!f) return ''; const s = String(f).slice(0, 5), v = (s.match(/V/g) || []).length, d = (s.match(/D/g) || []).length;
    if (v >= 4) return `${esc(team)} est en grande forme, avec ${v} victoires lors de ses ${s.length} derniers matchs.`;
    if (d >= 3) return `${esc(team)} traverse une période difficile : ${d} défaites sur ses ${s.length} derniers matchs.`;
    return `Sur ses ${s.length} derniers matchs, ${esc(team)} compte ${v} victoire${v > 1 ? 's' : ''} et ${d} défaite${d > 1 ? 's' : ''}.` };
  if (x.f) { const a = form(x.f[0], H), b = form(x.f[1], A); if (a) txt.push(a); if (b) txt.push(b) }
  if (x.r && x.r[0] && x.r[1]) txt.push(`Au classement, ${esc(H)} est ${x.r[0]}${x.r[0] === 1 ? 'er' : 'e'} et ${esc(A)} ${x.r[1]}${x.r[1] === 1 ? 'er' : 'e'}.`);
  if (x.h && x.h[0] + x.h[1] + x.h[2] > 0) txt.push(`Lors des ${x.h[0] + x.h[1] + x.h[2]} derniers face-à-face, ${esc(H)} compte ${x.h[0]} victoire${x.h[0] > 1 ? 's' : ''}, ${x.h[1]} nul${x.h[1] > 1 ? 's' : ''} et ${x.h[2]} défaite${x.h[2] > 1 ? 's' : ''}.`);
  if (m.tl) txt.push(`La ligne des buts est fixée à ${String(m.tl).replace('.', ',')} : un bon repère pour les paris « plus ou moins ».`);
  // prono indicatif
  let prono, ok = null;
  if (!three) prono = { t: `Victoire de ${fav}`, k: [fi] };
  else if (p[fi] >= 55) prono = { t: `Victoire de ${fav}`, k: [fi] };
  else prono = { t: `${fav} ou match nul (double chance)`, k: [fi, 1] };
  if (Array.isArray(m.s)) { const r = m.s[0] > m.s[1] ? 0 : m.s[0] < m.s[1] ? (three ? 2 : 1) : 1; ok = prono.k.includes(r) }
  return { p, names, txt, prono, ok };
}

/* ---------- page d'un match ---------- */
function matchPage(m) {
  const a = analyse(m), url = `${SITE}/prono/${m.file}`, comp = compPage(m.c), done = Array.isArray(m.s), annul = m.s && !Array.isArray(m.s);
  const title = `Pronostic ${m.H} – ${m.A} (${m.C}) : cotes et analyse du ${fJourAn(m.t)}`;
  const desc = done ? `${m.H} – ${m.A} (${m.C}, ${fJourAn(m.t)}) : score final ${m.s[0]}-${m.s[1]}, cotes d'avant-match et notre pronostic. Pariez gratuitement sur PronoClub.`
    : `Pronostic ${m.H} – ${m.A} (${m.C}) le ${fJour(m.t)} à ${fHeure(m.t)} : cotes, forme des équipes, face-à-face et notre prono. Pariez gratuitement, sans argent réel.`;
  const ld = { '@context': 'https://schema.org', '@type': 'SportsEvent', name: `${m.H} – ${m.A}`, startDate: m.t, sport: SPORT[m.sp] || 'Football',
    eventStatus: annul ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    homeTeam: { '@type': 'SportsTeam', name: m.H }, awayTeam: { '@type': 'SportsTeam', name: m.A }, location: { '@type': 'Place', name: `Stade de ${m.H}` },
    organizer: { '@type': 'Organization', name: m.C }, description: desc };
  const bc = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Accueil', item: SITE + '/' },
    { '@type': 'ListItem', position: 2, name: 'Pronos du jour', item: SITE + '/pronostics-du-jour.html' }, { '@type': 'ListItem', position: 3, name: `${m.H} – ${m.A}`, item: url }] };
  let h = head(title, desc, url, `<script type="application/ld+json">${JSON.stringify(ld)}</script>\n<script type="application/ld+json">${JSON.stringify(bc)}</script>\n`);
  h += `<p class="maj"><a href="/pronostics-du-jour.html">Pronos du jour</a> › ${esc(m.f || '')} ${esc(m.C)}</p>\n`;
  h += `<h1>Pronostic ${esc(m.H)} – ${esc(m.A)}</h1>\n<p class="maj">${esc(SPORT[m.sp] || 'Football')} · ${esc(m.C)} · ${esc(fJour(m.t))} à ${fHeure(m.t)}</p>\n`;
  if (done) h += `<div class="box"><b>Score final : ${esc(m.H)} ${m.s[0]} – ${m.s[1]} ${esc(m.A)}</b><br>Notre pronostic (${esc(a.prono.t)}) ${a.ok ? 'était ✅ <b>correct</b>' : 'était ❌ <b>raté</b>'}.</div>\n`;
  else if (annul) h += `<div class="box"><b>Match annulé ou reporté.</b></div>\n`;
  h += `<p><a class="btn" href="/">⚽ Parier gratuitement sur ce match</a></p>\n`;
  h += `<h2>Les cotes ${done ? "d'avant-match" : 'du match'}</h2>\n<table><tr><th>Pari</th><th>Cote</th><th>Probabilité</th></tr>${a.names.map((n, i) => `<tr><td>${esc(i === 1 && m.o.length === 3 ? 'Match nul' : 'Victoire ' + n)}</td><td><b>${nf(m.o[i])}</b></td><td>${a.p[i]} %</td></tr>`).join('')}</table>\n`;
  h += `<p class="maj">La probabilité est calculée à partir des cotes : plus la cote est basse, plus l'issue est jugée probable. <a href="/guide-cotes.html">Comment lire une cote ?</a></p>\n`;
  h += `<h2>Notre analyse</h2>\n${a.txt.map(t => `<p>${t}</p>`).join('\n')}\n`;
  const x = m.stx || {};
  if (x.f && (x.f[0] || x.f[1])) h += `<h2>Forme des équipes</h2>\n<table><tr><th>Équipe</th><th>5 derniers matchs</th></tr><tr><td>${esc(m.H)}</td><td>${esc(String(x.f[0] || '–').slice(0, 5).split('').join(' '))}</td></tr><tr><td>${esc(m.A)}</td><td>${esc(String(x.f[1] || '–').slice(0, 5).split('').join(' '))}</td></tr></table>\n<p class="maj">V = victoire · N = nul · D = défaite</p>\n`;
  h += `<h2>Notre pronostic</h2>\n<div class="box"><b>🎯 ${esc(a.prono.t)}</b><br>Un pronostic simple, basé sur les cotes et la forme des équipes. Sur PronoClub, vous pouvez le jouer (ou faire le vôtre) avec des pièces gratuites : aucun argent réel n'est misé.</div>\n`;
  h += `<h2>Comment parier gratuitement sur ${esc(m.H)} – ${esc(m.A)}</h2>\n<ol><li>Ouvrez <a href="/">PronoClub</a> : 20 000 pièces gratuites vous attendent chaque jour.</li><li>Trouvez ${esc(m.H)} – ${esc(m.A)} dans le programme ${m.day === today ? "du jour" : "du " + esc(fJour(m.t))}.</li><li>Touchez une cote, choisissez votre mise en pièces et validez.</li><li>Si vous avez raison, vous gagnez des diamants et vous grimpez dans le classement entre amis.</li></ol>\n`;
  const others = m.others.filter(o => o.id !== m.id).slice(0, 6);
  if (others.length) h += `<h2>Les autres pronos ${m.day === today ? "du jour" : "du " + esc(fJour(m.t))}</h2>\n<ul>${others.map(o => `<li><a href="/prono/${o.file}">${esc(o.H)} – ${esc(o.A)}</a> <span class="maj">(${esc(o.C)}, ${fHeure(o.t)})</span></li>`).join('')}</ul>\n`;
  h += `<div class="box">${comp ? `Toute la compétition : <a href="/${comp[1]}">nos conseils pour pronostiquer ${esc(comp[2])}</a> · ` : ''}<a href="/guide-types-de-paris.html">Les types de paris</a> · <a href="/guide-bien-debuter.html">Bien débuter</a></div>\n`;
  h += `<p><a class="btn" href="/">⚽ Parier gratuitement sur ce match</a></p>\n`;
  return h + foot;
}

/* ---------- page « Pronos du jour » ---------- */
function hubPage(byDay) {
  const url = `${SITE}/pronostics-du-jour.html`;
  const title = `Pronostics du jour gratuits : cotes et analyses des matchs (${fJourAn(today + 'T12:00:00+01:00')})`;
  const desc = `Les pronostics gratuits des grands matchs d'aujourd'hui et de demain : Ligue 1, Ligue des champions, Premier League, NBA… Cotes, analyse et prono, sans argent réel.`;
  let h = head(title, desc, url);
  h += `<h1>Pronostics du jour</h1>\n<p class="maj">Mis à jour automatiquement plusieurs fois par jour · ${esc(fJourAn(today + 'T12:00:00+01:00'))}</p>\n`;
  h += `<p>Retrouvez ici les grands matchs du moment avec leurs cotes, une analyse rapide et notre pronostic. Sur PronoClub, tous les paris sont <b>gratuits</b> : vous jouez avec des pièces offertes chaque jour, jamais avec de l'argent réel.</p>\n<p><a class="btn" href="/">⚽ Parier gratuitement</a></p>\n`;
  const sec = (d, label) => { const L = byDay[d] || []; if (!L.length) return '';
    return `<h2>${esc(label)}</h2>\n<table><tr><th>Heure</th><th>Match</th><th>Cotes</th></tr>${L.map(m => `<tr><td>${fHeure(m.t)}</td><td><a href="/prono/${m.file}">${esc(m.H)} – ${esc(m.A)}</a><br><span class="maj">${esc(m.f || '')} ${esc(m.C)}</span></td><td>${Array.isArray(m.s) ? `<b>${m.s[0]}-${m.s[1]}</b>` : m.o.map(nf).join(' · ')}</td></tr>`).join('')}</table>\n` };
  const a = sec(today, `Les matchs d'aujourd'hui (${fJour(today + 'T12:00:00+01:00')})`), b = sec(shift(1), `Les matchs de demain (${fJour(shift(1) + 'T12:00:00+01:00')})`), c = sec(shift(2), `Plus tard (${fJour(shift(2) + 'T12:00:00+01:00')})`);
  h += (a || b || c) ? a + b + c : `<p>Le programme des prochains matchs arrive bientôt. En attendant, tous les matchs sont dans <a href="/">l'appli PronoClub</a>.</p>\n`;
  const y = byDay[shift(-1)] || [];
  if (y.length) h += `<h2>Les résultats d'hier</h2>\n<ul>${y.map(m => `<li><a href="/prono/${m.file}">${esc(m.H)} – ${esc(m.A)}</a> : ${Array.isArray(m.s) ? `<b>${m.s[0]}-${m.s[1]}</b>` : 'en attente'}</li>`).join('')}</ul>\n`;
  h += `<div class="box"><b>Par compétition :</b> ${COMP.map(c => `<a href="/${c[1]}">${esc(c[2])}</a>`).join(' · ')}</div>\n`;
  return h + foot;
}

/* ---------- pages par compétition : section mise à jour automatiquement ---------- */
function compSection(cp, all) {
  const name = cp[2], L = all.filter(m => inComp(cp, m.C));
  const up = L.filter(m => !Array.isArray(m.s) && !(m.s && !Array.isArray(m.s)) && m.day >= today).sort((a, b) => a.t.localeCompare(b.t)).slice(0, 14);
  const past = L.filter(m => Array.isArray(m.s)).sort((a, b) => b.t.localeCompare(a.t)).slice(0, 8);
  const link = m => m.file ? `<a href="/prono/${m.file}">${esc(m.H)} – ${esc(m.A)}</a>` : `${esc(m.H)} – ${esc(m.A)}`;
  let h = `<!--AUTO-->\n<p class="maj">🔄 Mis à jour automatiquement le ${esc(fJourAn(today + 'T12:00:00+01:00'))}</p>\n`;
  h += `<h2>Pronostic ${esc(name)} : les prochains matchs</h2>\n`;
  if (up.length) {
    h += `<table><tr><th>Date</th><th>Match</th><th>Cotes</th><th>Notre prono</th></tr>${up.map(m => { const a = analyse(m); return `<tr><td>${esc(fDayLabel(m.day))}<br><span class="maj">${fHeure(m.t)}</span></td><td>${link(m)}</td><td>${m.o.map(nf).join(' · ')}</td><td><b>${esc(a.prono.t)}</b></td></tr>` }).join('')}</table>\n`;
    h += `<p class="maj">Pronostics indicatifs calculés à partir des cotes et de la forme des équipes. Cliquez sur un match pour l'analyse complète.</p>\n<p><a class="btn" href="/">⚽ Parier gratuitement sur ces matchs</a></p>\n`;
    const ld = { '@context': 'https://schema.org', '@type': 'ItemList', name: `Prochains matchs de ${name}`, itemListElement: up.map((m, i) => ({ '@type': 'ListItem', position: i + 1,
      item: { '@type': 'SportsEvent', name: `${m.H} – ${m.A}`, startDate: m.t, eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        location: { '@type': 'Place', name: `Stade de ${m.H}` }, homeTeam: { '@type': 'SportsTeam', name: m.H }, awayTeam: { '@type': 'SportsTeam', name: m.A }, ...(m.file ? { url: `${SITE}/prono/${m.file}` } : {}) } })) };
    h += `<script type="application/ld+json">${JSON.stringify(ld)}</script>\n`;
  } else h += `<p>Pas de match de ${esc(name)} programmé dans les tout prochains jours. Cette page se met à jour toute seule : revenez bientôt, ou retrouvez <a href="/pronostics-du-jour.html">tous les pronos du jour</a>.</p>\n`;
  if (past.length) h += `<h2>Derniers résultats de ${esc(name)} et nos pronos</h2>\n<ul>${past.map(m => { const a = analyse(m); return `<li>${link(m)} : <b>${m.s[0]}-${m.s[1]}</b> · notre prono (${esc(a.prono.t)}) ${a.ok ? '✅' : '❌'}</li>` }).join('')}</ul>\n`;
  return h + `<!--/AUTO-->`;
}
function updateComp(cp, all) {
  const f = path.join(ROOT, cp[1]); if (!fs.existsSync(f)) return false;
  let s = fs.readFileSync(f, 'utf8'); const sec = compSection(cp, all), name = cp[2];
  if (s.includes('<!--AUTO-->')) s = s.replace(/<!--AUTO-->[\s\S]*?<!--\/AUTO-->/, sec);
  else { const i = s.indexOf('</p>', s.indexOf('class="btn"')); if (i < 0) return false; s = s.slice(0, i + 4) + '\n' + sec + s.slice(i + 4) }
  s = s.replace(/<title>[^<]*<\/title>/, `<title>Pronostic ${esc(name)} : nos pronos gratuits des prochains matchs — PronoClub</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="Pronostic ${esc(name)} gratuit : les prochains matchs avec leurs cotes et notre prono, mis à jour chaque jour. Pariez entre amis sur PronoClub, sans argent réel.">`)
    .replace(/<h1>[^<]*<\/h1>/, `<h1>Pronostic ${esc(name)}</h1>`);
  return writeIf(f, s);
}

/* ---------- sitemap ---------- */
function sitemap() {
  const statics = fs.readdirSync(ROOT).filter(f => f.endsWith('.html') && !['index.html', '404.html'].includes(f));
  const dir = path.join(ROOT, 'prono'), pr = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.html')) : [];
  const lm = f => dayOf(fs.statSync(f).mtime);
  const urls = [[`${SITE}/`, today, '1.0'], ...statics.map(f => [`${SITE}/${f}`, f === 'pronostics-du-jour.html' ? today : lm(path.join(ROOT, f)), f === 'pronostics-du-jour.html' ? '0.9' : '0.6']),
    ...pr.sort().reverse().map(f => [`${SITE}/prono/${f}`, lm(path.join(dir, f)), '0.7'])];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${u[0]}</loc><lastmod>${u[1]}</lastmod><priority>${u[2]}</priority></url>`).join('\n')}\n</urlset>\n`;
}

/* ---------- main ---------- */
async function load() {
  const r = await fetch(SB + 'fix_auto_liste', { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_days: DAYS }) });
  if (!r.ok) throw new Error('Supabase ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return await r.json();
}
const writeIf = (f, s) => { if (fs.existsSync(f) && fs.readFileSync(f, 'utf8') === s) return false; fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); return true };

const data = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) : await load();
const byDay = {}, ALL = [];
let n = 0;
for (const d of DAYS) {
  const L0 = (data[d] || []).filter(m => m && m.h && m.a && Array.isArray(m.o) && m.o.length >= 2 && m.o.every(x => x > 1))
    .map(m => ({ ...m, day: d, H: frn(m.h), A: frn(m.a), C: frc(m.c) || m.c || '' }));
  ALL.push(...L0);
  const L = L0.filter(m => m.big || TOP.test(m.C))
    .sort((a, b) => (b.big ? 1 : 0) - (a.big ? 1 : 0) || (TOP.test(b.C) ? 1 : 0) - (TOP.test(a.C) ? 1 : 0) || a.t.localeCompare(b.t))
    .slice(0, MAXJ).sort((a, b) => a.t.localeCompare(b.t));
  L.forEach(m => { m.file = `${d}-${slug(m.H)}-${slug(m.A)}.html`; m.others = L });
  byDay[d] = L;
  for (const m of L) if (writeIf(path.join(ROOT, 'prono', m.file), matchPage(m))) n++;
}
const hub = writeIf(path.join(ROOT, 'pronostics-du-jour.html'), hubPage(byDay));
let nc = 0;for (const cp of COMP) if (updateComp(cp, ALL)) nc++;
writeIf(path.join(ROOT, 'sitemap.xml'), sitemap());
console.log(`${n} page(s) de match écrite(s), page du jour ${hub ? 'mise à jour' : 'inchangée'}, ${nc} page(s) de compétition mise(s) à jour, ${Object.values(byDay).reduce((a, b) => a + b.length, 0)} match(s) au total.`);
