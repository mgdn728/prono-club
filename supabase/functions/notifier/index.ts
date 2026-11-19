// PronoClub — fonction « notifier » (Supabase Edge Function)
// Appelée chaque minute par Supabase (pg_cron). Elle prépare les notifications prévues
// (pari terminé, défi du jour, série en danger) puis envoie la file d'attente sur les téléphones.
// Toutes les 5 minutes, elle règle aussi les paris terminés des joueurs absents.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const SITE = "https://prono-club.fr/";
const TOP = ["Ligue des champions", "Ligue 1", "Premier League", "Liga", "Serie A", "Bundesliga", "Ligue des nations", "Championnat des nations", "NBA", "EuroLeague", "ATP Finals", "NHL", "UFC", "Coupe de France", "Match amical"];

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

async function cfg(k: string) {
  const { data } = await db.from("config").select("v").eq("k", k).maybeSingle();
  return data ? data.v : null;
}
function paris(d = new Date()) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(d)) p[x.type] = x.value;
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24, min: Number(p.minute) };
}
function addDays(day: string, n: number) {
  const t = new Date(day + "T12:00:00Z");
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
const rank = (m: any) => { const i = TOP.findIndex((t) => m.c === t || String(m.c).startsWith(t + " ")); return i < 0 ? 99 : i; };

const fixCache = new Map<string, any[]>();
async function fixtures(day: string) {
  if (fixCache.has(day)) return fixCache.get(day)!;
  let r: any[] = [];
  try { const res = await fetch(SITE + "fixtures/" + day + ".json?t=" + Date.now()); if (res.ok) r = await res.json(); } catch (_) { /* fichier absent */ }
  if (!Array.isArray(r) || !r.length) { // pas de fichier : programme automatique
    try { const { data } = await db.from("fix_auto").select("data").eq("day", day).maybeSingle(); if (data && Array.isArray(data.data)) r = data.data; } catch (_) { /* table absente */ }
  }
  // résultats trouvés automatiquement (scores ESPN) pour les matchs pas encore complétés à la main
  try {
    if (Array.isArray(r) && r.length) {
      const { data } = await db.from("fix_res").select("fid,s").like("fid", day + "_%");
      const M = new Map((data || []).map((x: any) => [x.fid, x.s]));
      for (const x of r) if (!Array.isArray(x.s) && !x.x && M.has(day + "_" + x.id)) { const v = M.get(day + "_" + x.id); if (Array.isArray(v)) x.s = v; else if (v && v.x) x.x = v.x; }
    }
  } catch (_) { /* table absente */ }
  fixCache.set(day, r);
  return r;
}
async function marquer(jid: number, cle: string) {
  const { error } = await db.from("notif_faits").insert({ joueur_id: jid, cle });
  return !error; // déjà fait = erreur de doublon
}
async function ajouter(jid: number, type: string, titre: string, texte: string, url: string) {
  await db.from("notifs").insert({ joueur_id: jid, type, titre: titre.slice(0, 80), texte: texte.slice(0, 180), url });
}


// ---------- Règlement des paris côté serveur ----------
// Les paris des joueurs qui ne sont pas connectés sont réglés ici (gagné / perdu / remboursé),
// avec exactement les mêmes règles que l'appli : le code des marchés est repris du site lui-même.
let engine: any = null, engineT = 0;
async function moteur() {
  if (engine && Date.now() - engineT < 3600e3) return engine;
  const html = await (await fetch(SITE + "index.html?t=" + Date.now())).text();
  const cut = (a: string, b: string) => { const i = html.indexOf(a), j = html.indexOf(b, i); if (i < 0 || j < 0) throw new Error("extraction " + a); return html.slice(i, j); };
  const src = cut("function pois(", "\n") + "\n" + cut("function weekId(", "\n") + "\n" + cut("const MARKETS=", "\nconst DEFI_GAIN") + "\n" +
    cut("/* ---------- Sports et marchés", "function findMatch") + "\nreturn {FIX,build,SPORTS,weekId,liveBuild};";
  engine = new Function(src)(); engineT = Date.now();
  return engine;
}
const DEFI_GAIN = 300;
async function regler(prefs: Map<number, Record<string, boolean>>) {
  const E = await moteur();
  const now = paris();
  const [y, mo, d] = now.day.split("-").map(Number);
  const semaine = E.weekId(new Date(y, mo - 1, d));
  const limite = new Date(Date.now() - 10 * 60e3).toISOString(); // joueurs absents depuis 10 min (les autres règlent eux-mêmes dans l'appli)
  const { data: js, error } = await db.from("joueurs").select("id,etat,maj_le")
    .filter("etat->bets", "cs", '[{"status":"pending"}]').lt("maj_le", limite).limit(500);
  if (error) { console.error("regler", error); return; }
  const built = new Set<string>();
  const lives = new Map<string, any>();
  const match = async (mid: string) => {
    if (mid.startsWith("L:")) {
      if (!lives.has(mid)) { const { data } = await db.from("live_ev").select("*").eq("id", mid.slice(2)).maybeSingle(); lives.set(mid, data ? E.liveBuild(data) : null); }
      return lives.get(mid);
    }
    const k = mid.indexOf("_"), day = mid.slice(0, k);
    if (!built.has(day)) { built.add(day); const arr = await fixtures(day); if (Array.isArray(arr) && arr.length) E.build(day, arr); }
    return (E.FIX[day] || []).find((m: any) => m.id === mid) || null;
  };
  const opt = (m: any, mk: string, o: string) => {
    const K = (m._mk || E.SPORTS[m.sp].markets(m)).find((x: any) => x.key === mk);
    if (K && K.parse) return K.parse(m, o);
    return K ? K.opts(m).find((x: any) => x.id === o) || null : null;
  };
  for (const j of js || []) {
    const e = j.etat || {};
    if (!Array.isArray(e.bets)) continue;
    e.stats = e.stats || { won: 0, lost: 0, earned: 0, best: 0 };
    let ch = false;
    const msgs: string[] = [];
    for (const b of e.bets) {
      if (b.status !== "pending" || !Array.isArray(b.sels) || !b.sels.length) continue;
      const ms: any[] = [];
      for (const s of b.sels) ms.push(await match(String(s.matchId)));
      if (ms.some((m) => !m || (!m.s && !m.x))) continue;
      let won = true, odds = 1, allVoid = true;
      b.sels.forEach((s: any, i: number) => {
        const m = ms[i];
        if (m.x) { s.void = true; return; }
        allVoid = false;
        const o = opt(m, s.mk, s.opt);
        if (!(o && o.fn(m.s[0], m.s[1], m.s[2]))) won = false; else odds *= s.odds;
      });
      if (b.boost) odds *= b.boost === true ? 1.1 : Math.min(1.25, Number(b.boost) || 1);
      const PC = b.pay === "c";
      const addCoins = (v: number) => {
        if (e.day !== now.day) { // nouveau jour : +20 000 pièces par jour (7 jours rattrapés au maximum), on garde les pièces
          const nd = e.day ? Math.max(1, Math.min(7, Math.round((Date.parse(now.day + "T12:00:00Z") - Date.parse(e.day + "T12:00:00Z")) / 864e5) || 1)) : 1;
          e.coins = (Number(e.coins) || 0) + 20000 * nd; e.day = now.day; e.d20 = 1;
        }
        e.coins = (Number(e.coins) || 0) + v;
      };
      const quoi = b.sels.length > 1 ? `Ton combiné de ${b.sels.length} matchs` : (b.sels[0].match || "Ton pari");
      if (allVoid) {
        b.status = "void"; b.payout = b.stake; if (PC) addCoins(b.stake); else e.diamonds = (e.diamonds || 0) + b.stake;
        msgs.push(`↩️ ${quoi} : match annulé, mise rendue (${b.stake} ${PC ? "🪙" : "💎"})`);
      } else if (won && PC) {
        b.odds = Math.round(odds * 100) / 100; b.status = "won"; b.payout = Math.round(b.stake * b.odds);
        addCoins(b.payout); e.stats.won++; e.stats.best = Math.max(e.stats.best || 0, b.odds);
        msgs.push(`🎉 ${quoi} : gagné ! +${b.payout} 🪙`);
      } else if (won) {
        b.odds = Math.round(odds * 100) / 100; b.status = "won"; b.payout = Math.round(b.stake * b.odds * (Number(b.evx) > 1 && Number(b.evx) <= 2 ? Number(b.evx) : 1));
        e.diamonds = (e.diamonds || 0) + b.payout;
        e.stats.won++; e.stats.earned += b.payout; e.stats.best = Math.max(e.stats.best || 0, b.odds);
        if (e.week && e.week.id === semaine) e.week.earned = (e.week.earned || 0) + b.payout;
        if (e.month && e.month.id === now.day.slice(0, 7)) e.month.earned = (e.month.earned || 0) + b.payout;
        msgs.push(`🎉 ${quoi} : gagné ! +${b.payout} 💎`);
      } else {
        b.status = "lost"; b.payout = 0; e.stats.lost++;
        if (b.shield) { b.refund = b.stake; if (PC) addCoins(b.stake); else e.diamonds = (e.diamonds || 0) + b.stake; }
        msgs.push(`❌ ${quoi} : perdu${b.shield ? " (assuré : mise rendue)" : ""}`);
      }
      b.settledAt = Date.now(); b.server = true; ch = true;
      (b as any)._notif = msgs[msgs.length - 1];
    }
    for (const dd of e.defis || []) {
      if (dd.status !== "pending") continue;
      const m = await match(String(dd.matchId));
      if (!m) continue;
      if (m.x) { dd.status = "void"; ch = true; }
      else if (m.s) {
        const o = opt(m, dd.mk, dd.opt);
        if (o && o.fn(m.s[0], m.s[1], m.s[2])) {
          dd.status = "won"; e.diamonds = (e.diamonds || 0) + DEFI_GAIN;
          if (e.week && e.week.id === semaine) e.week.earned = (e.week.earned || 0) + DEFI_GAIN;
          if (e.month && e.month.id === now.day.slice(0, 7)) e.month.earned = (e.month.earned || 0) + DEFI_GAIN;
        } else dd.status = "lost";
        ch = true;
      }
    }
    if (!ch) continue;
    const notifs = e.bets.filter((b: any) => b._notif).map((b: any) => { const n = { id: b.id, t: b._notif }; delete b._notif; return n; });
    e.updated = Date.now();
    const row: Record<string, unknown> = { etat: e, diamants: Math.round(e.diamonds || 0), gagnes: e.stats.won || 0 };
    // Verrou : si le joueur s'est reconnecté entre-temps (maj_le a changé), on ne touche à rien.
    let { data: ok, error: err } = await db.from("joueurs").update({ ...row, hebdo: e.week && e.week.id === semaine ? Math.round(e.week.earned || 0) : 0 })
      .eq("id", j.id).eq("maj_le", j.maj_le).select("id");
    if (err) ({ data: ok, error: err } = await db.from("joueurs").update(row).eq("id", j.id).eq("maj_le", j.maj_le).select("id"));
    if (err || !ok || !ok.length) continue;
    if ((prefs.get(j.id) || {}).paris) {
      for (const n of notifs) if (await marquer(j.id, "pari:" + n.id)) await ajouter(j.id, "paris", "🏁 Ton pari est terminé !", n.t, "?paris");
    }
  }
}

async function preparer() {
  const { data: subs } = await db.from("abonnements").select("joueur_id,prefs");
  const prefs = new Map<number, Record<string, boolean>>();
  for (const s of subs || []) {
    const p = prefs.get(s.joueur_id) || {};
    for (const [k, v] of Object.entries(s.prefs || {})) if (v === true) p[k] = true;
    prefs.set(s.joueur_id, p);
  }
  if (paris().min % 5 === 4) { try { await progAuto(); } catch (e) { console.error("progAuto", e); } } // programme + résultats automatiques : toutes les 5 min
  try { await autoRes(); } catch (e) { console.error("autoRes", e); } // résultats automatiques : chaque minute
  if (paris().min % 2 === 0) { try { await regler(prefs); } catch (e) { console.error("regler", e); } } // paiement des paris des joueurs absents : toutes les 2 min
  if (paris().min % 5 === 2) { try { await duels(); } catch (e) { console.error("duels", e); } }
  if (paris().min === 30) { try { await rangs(prefs); } catch (e) { console.error("rangs", e); } }
  const ids = [...prefs.keys()];
  if (!ids.length) return;
  const { data: js } = await db.from("joueurs").select("id,pseudo,etat").in("id", ids);
  const now = paris();

  // 1. Paris dont tous les matchs sont terminés (vérifié toutes les 5 minutes)
  if (now.min % 5 === 0) {
    for (const j of js || []) {
      if (!prefs.get(j.id)!.paris) continue;
      for (const b of (j.etat && j.etat.bets) || []) {
        if (b.status !== "pending" || !b.sels || !b.sels.length) continue;
        let fini = true;
        for (const s of b.sels) {
          const k = String(s.matchId).indexOf("_");
          const day = String(s.matchId).slice(0, k), id = String(s.matchId).slice(k + 1);
          const m = (await fixtures(day)).find((x: any) => x.id === id);
          if (!m || !(m.s || m.x)) { fini = false; break; }
        }
        if (!fini || !(await marquer(j.id, "pari:" + b.id))) continue;
        const quoi = b.sels.length > 1 ? `Ton combiné de ${b.sels.length} matchs` : (b.sels[0].match || "Ton match");
        await ajouter(j.id, "paris", "🏁 Ton pari est terminé !", `${quoi} : ouvre PronoClub pour découvrir le résultat 👀`, "?paris");
      }
    }
  }

  // 2. Défi du jour (à partir de 11 h)
  if (now.hour >= 11 && now.hour < 21) {
    const list = (await fixtures(now.day)).filter((m: any) => !m.s && !m.x && Date.parse(m.t) > Date.now() + 30 * 60e3);
    if (list.length) {
      const m = list.sort((a: any, b: any) => rank(a) - rank(b) || Date.parse(a.t) - Date.parse(b.t))[0];
      for (const j of js || []) {
        if (!prefs.get(j.id)!.defi) continue;
        if (((j.etat && j.etat.defis) || []).some((d: any) => d.day === now.day)) continue;
        if (await marquer(j.id, "defi:" + now.day)) {
          await ajouter(j.id, "defi", "🎯 Défi du jour", `Qui gagne ${m.h} – ${m.a} ? Bonne réponse = +300 💎. Réponds avant le coup d'envoi !`, "?");
        }
      }
    }
  }

  // 2 bis. Coffre du jour pas encore ouvert (entre 12 h et 14 h)
  if (now.hour >= 12 && now.hour < 14) {
    for (const j of js || []) {
      if (!prefs.get(j.id)!.defi) continue;
      const c = j.etat && j.etat.chest;
      if (c && c.day === now.day) continue;
      if (await marquer(j.id, "coffre:" + now.day)) await ajouter(j.id, "defi", "🧰 Ton coffre du jour t'attend !", "Pièces, diamants, boost… ou le jackpot de 5 000 pièces. Ouvre-le vite !", "?");
    }
  }
  // 2 ter. (supprimé : les pièces se gardent maintenant d'un jour à l'autre)

  // 3. Série en danger (à partir de 19 h)
  if (now.hour >= 19) {
    const hier = addDays(now.day, -1);
    for (const j of js || []) {
      const s = j.etat && j.etat.streak;
      if (!prefs.get(j.id)!.serie || !s || s.n < 2 || s.last !== hier) continue;
      if (await marquer(j.id, "serie:" + now.day)) {
        await ajouter(j.id, "serie", `🔥 Ta série de ${s.n} jours est en danger !`, `Ouvre PronoClub avant minuit pour la garder et gagner +${Math.min(s.n + 1, 7) * 100} pièces.`, "?");
      }
    }
  }
}

// ---------- Duels sur un match (réglés quand le match est terminé) ----------
async function duels() {
  const E = await moteur();
  const { data: ds } = await db.from("duels").select("id,match_id,ko").eq("statut", "accepte").lt("ko", new Date(Date.now() - 100 * 60e3).toISOString()).limit(200);
  const built = new Set<string>();
  for (const d of ds || []) {
    const mid = String(d.match_id), k = mid.indexOf("_"), day = mid.slice(0, k);
    if (!built.has(day)) { built.add(day); const arr = await fixtures(day); if (Array.isArray(arr) && arr.length) E.build(day, arr); }
    const m = (E.FIX[day] || []).find((x: any) => x.id === mid);
    if (!m) { if (Date.parse(d.ko) < Date.now() - 4 * 864e5) await db.rpc("duel_regler", { p_id: d.id, p_h: 0, p_a: 0, p_annule: true }); continue; }
    if (m.x) await db.rpc("duel_regler", { p_id: d.id, p_h: 0, p_a: 0, p_annule: true });
    else if (m.s) await db.rpc("duel_regler", { p_id: d.id, p_h: m.s[0], p_a: m.s[1], p_annule: false });
  }
}

// ---------- « Tu t'es fait dépasser » au classement de la semaine (une fois par heure) ----------
async function rangs(prefs: Map<number, Record<string, boolean>>) {
  const E = await moteur();
  const now = paris();
  const [y, mo, d] = now.day.split("-").map(Number);
  const semaine = E.weekId(new Date(y, mo - 1, d));
  const { data: top } = await db.from("joueurs").select("id,pseudo,rang_sem").eq("semaine", semaine).eq("admin", false).gt("hebdo", 0).order("hebdo", { ascending: false }).limit(50);
  const list = top || [];
  for (let i = 0; i < list.length; i++) {
    const j = list[i], r = i + 1, old = j.rang_sem;
    if (old && r > old && old <= 20 && (prefs.get(j.id) || {}).social) {
      const qui = list[old - 1];
      if (qui && qui.id !== j.id && await marquer(j.id, `rang:${semaine}:${now.day}:${now.hour}`)) {
        await ajouter(j.id, "social", `📉 ${qui.pseudo} t'a dépassé !`, `Tu es maintenant ${r}e du classement de la semaine. Reprends ta place 💪`, "?classement");
      }
    }
    if (old !== r) await db.from("joueurs").update({ rang_sem: r }).eq("id", j.id);
  }
}

async function envoyer() {
  const { data: q } = await db.from("notifs").select("id,joueur_id,type,titre,texte,url")
    .is("envoye_le", null).gt("cree_le", new Date(Date.now() - 864e5).toISOString()).order("id").limit(300);
  let n = 0;
  for (const x of q || []) {
    await db.from("notifs").update({ envoye_le: new Date().toISOString() }).eq("id", x.id);
    const { data: ss } = await db.from("abonnements").select("id,endpoint,p256dh,auth,prefs").eq("joueur_id", x.joueur_id);
    for (const s of ss || []) {
      if (!(s.prefs || {})[x.type]) continue;
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: x.titre, body: x.texte, url: x.url || "?", tag: x.type }),
          { TTL: 6 * 3600 },
        );
        n++;
      } catch (e: any) {
        if (e && (e.statusCode === 404 || e.statusCode === 410)) await db.from("abonnements").delete().eq("id", s.id);
      }
    }
  }
  return n;
}

// ---------- Scores en direct (flux publics ESPN) ----------
// Appelé toutes les 20 secondes avec {"live":1} : on lit les tableaux de scores ESPN
// et on enregistre chaque match (avant, pendant, après) dans la table live_ev.
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/";
const FEEDS: [string, string][] = [
  ["soccer/all", "foot"],
  ["basketball/nba", "basket"], ["basketball/wnba", "basket"], ["basketball/mens-college-basketball", "basket"], ["basketball/womens-college-basketball", "basket"],
  ["hockey/nhl", "hockey"], ["hockey/mens-college-hockey", "hockey"], ["hockey/womens-college-hockey", "hockey"],
  ["tennis/atp", "tennis"], ["tennis/wta", "tennis"],
  ["football/nfl", "usf"], ["football/college-football", "usf"], ["football/cfl", "usf"], ["football/ufl", "usf"],
  ["baseball/mlb", "base"], ["baseball/college-baseball", "base"],
  ["volleyball/mens-college-volleyball", "volley"], ["volleyball/womens-college-volleyball", "volley"],
  ["lacrosse/nll", "lax"], ["lacrosse/pll", "lax"], ["lacrosse/mens-college-lacrosse", "lax"],
  ["australian-football/afl", "afl"],
  ["field-hockey/womens-college-field-hockey", "fhk"],
  ["water-polo/mens-college-water-polo", "wpolo"],
  ["mma/ufc", "mma"],
];
const LG: Record<string, string> = {
  "basketball/nba": "NBA", "basketball/wnba": "WNBA", "basketball/mens-college-basketball": "NCAA (basket)", "basketball/womens-college-basketball": "NCAA F. (basket)",
  "hockey/nhl": "NHL", "hockey/mens-college-hockey": "NCAA (hockey)", "hockey/womens-college-hockey": "NCAA F. (hockey)",
  "football/nfl": "NFL", "football/college-football": "NCAA (foot US)", "football/cfl": "CFL", "football/ufl": "UFL",
  "baseball/mlb": "MLB", "baseball/college-baseball": "NCAA (baseball)",
  "volleyball/mens-college-volleyball": "NCAA (volley)", "volleyball/womens-college-volleyball": "NCAA F. (volley)",
  "lacrosse/nll": "NLL", "lacrosse/pll": "PLL", "lacrosse/mens-college-lacrosse": "NCAA (crosse)",
  "australian-football/afl": "AFL", "field-hockey/womens-college-field-hockey": "NCAA F. (hockey sur gazon)",
  "water-polo/mens-college-water-polo": "NCAA (water-polo)", "mma/ufc": "UFC",
};
const amer = (v: any) => { const n = Number(String(v ?? "").replace(/[^0-9+\-.]/g, "")); if (!n || !isFinite(n)) return null; return Math.round((n > 0 ? 1 + n / 100 : 1 + 100 / Math.abs(n)) * 100) / 100; };
const numv = (v: any) => { const n = Number(String(v ?? "").replace(/[^0-9+\-.]/g, "")); return isFinite(n) && String(v ?? "").trim() !== "" ? n : null; };
function cotes(c: any) {
  const o = Array.isArray(c?.odds) ? c.odds[0] : null; if (!o) return null;
  const ml = o.moneyline || {};
  const h = amer(ml.home?.close?.odds ?? ml.home?.open?.odds ?? o.homeTeamOdds?.moneyLine);
  const a = amer(ml.away?.close?.odds ?? ml.away?.open?.odds ?? o.awayTeamOdds?.moneyLine);
  const d = amer(ml.draw?.close?.odds ?? ml.draw?.open?.odds ?? o.drawOdds?.moneyLine);
  const tot = numv(o.overUnder ?? o.total?.over?.close?.line), spr = numv(o.spread ?? o.pointSpread?.home?.close?.line);
  if (!h && !a && tot == null && spr == null) return null;
  return { h, d, a, tot, spr };
}
function nom(x: any) { return String(x?.team?.displayName || x?.athlete?.displayName || x?.roster?.displayName || (Array.isArray(x?.roster?.athletes) ? x.roster.athletes.map((a: any) => a.displayName).join(" / ") : "") || x?.team?.name || "?").slice(0, 60); }
function ligne(sp: string, path: string, ev: any, c: any, lg: string) {
  const L = c.competitors || []; if (L.length !== 2) return null;
  const H = L.find((x: any) => x.homeAway === "home" || x.order === 1) || L[0], A = L.find((x: any) => x !== H) || L[1];
  const stt = c.status || ev.status || {}, ty = stt.type || {};
  const st = ty.state === "in" || ty.state === "post" ? ty.state : "pre";
  const ls = (x: any) => Array.isArray(x.linescores) ? x.linescores.map((l: any) => Number(l.value ?? l.displayValue ?? 0) || 0) : [];
  const lh = ls(H), la = ls(A);
  let s: number[];
  if (sp === "tennis" || sp === "volley") {
    let w1 = 0, w2 = 0; const n = Math.min(lh.length, la.length), done = st === "post" ? n : n - 1;
    for (let i = 0; i < done; i++) { if (lh[i] > la[i]) w1++; else if (la[i] > lh[i]) w2++; }
    s = [w1, w2];
  } else s = [Number(H.score?.value ?? H.score ?? 0) || 0, Number(A.score?.value ?? A.score ?? 0) || 0];
  const win = H.winner === true ? 1 : A.winner === true ? 2 : 0;
  const nm = String(ev.name || ""), bo = sp === "tennis" ? (/atp/.test(path) && /(Australian Open|French Open|Roland|Wimbledon|US Open)/i.test(nm) ? 5 : 3) : sp === "volley" ? 5 : 0;
  return {
    id: sp + "-" + String(c.id || ev.id), sp, lp: path, lg: lg.slice(0, 80), h: nom(H), a: nom(A),
    t: c.date || ev.date, st, per: Number(stt.period ?? 0) || 0, clk: String(stt.displayClock ?? "").slice(0, 12),
    det: String(ty.shortDetail || ty.detail || "").slice(0, 60), s, ls: lh.length ? lh.map((v: number, i: number) => {
      const e: any[] = [v, la[i] ?? 0];
      if (sp === "tennis") { // points du tie-break et serveur (balle) sur le set en cours
        const th = H.linescores?.[i]?.tiebreak, ta = A.linescores?.[i]?.tiebreak;
        const last = i === lh.length - 1 && st === "in";
        const srv = last ? (H.possession === true ? 1 : A.possession === true ? 2 : 0) : 0;
        if (th != null || ta != null || srv) e.push(th != null ? Number(th) : null, ta != null ? Number(ta) : null);
        if (srv) e.push(srv);
      }
      return e;
    }) : null,
    buts: sp === "foot" && Array.isArray(c.details) ? c.details.filter((d: any) => d.scoringPlay).map((d: any) => [String(d.athletesInvolved?.[0]?.displayName || ""), String(d.team?.id || "") === String(H.team?.id || H.id) ? 1 : 2, d.ownGoal ? 1 : 0]) : null,
    win, bo, o: cotes(c), fin: st === "post" && /postpon|cancel|abandon|forfeit/i.test(String(ty.name || "") + " " + String(ty.detail || "")) ? 1 : 0,
  };
}
// Tennis : points du jeu en cours (0, 15, 30, 40, AV) et du tie-break, avec l'accord de Sofascore.
// Si Sofascore ne répond pas, rien ne change : on garde les scores ESPN.
async function sofaPoints(rows: any[]) {
  const T = rows.filter((r) => r.sp === "tennis" && r.st === "in" && Array.isArray(r.ls) && r.ls.length);
  if (!T.length) return;
  const diag = (v: string) => { for (const x of T) { const c = x.ls[x.ls.length - 1]; while (c.length < 7) c.push(c.length < 4 ? null : c.length === 4 ? 0 : null); c[7] = v; } };
  let r: Response;
  try { r = await fetch("https://api.sofascore.com/api/v1/sport/tennis/events/live", {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", "Accept": "application/json", "Referer": "https://www.sofascore.com/" },
  }); } catch (e) { console.log("sofascore erreur réseau", String(e)); diag("NET"); return; }
  if (!r.ok) { console.log("sofascore statut", r.status); diag("E" + r.status); return; }
  let j: any; try { j = await r.json(); } catch (_) { console.log("sofascore réponse illisible"); diag("JSON"); return; }
  const evs = Array.isArray(j?.events) ? j.events : [];
  console.log("sofascore ok", evs.length, "matchs");
  const cle = (n: string) => String(n || "").split(/\s*\/\s*/).map((p) => nomFin(p.replace(/^[A-Z]\.\s*/, ""))).filter(Boolean).sort().join("+");
  const pt = (v: any) => { const t = String(v ?? "").trim().toUpperCase(); return t === "A" || t === "AD" ? "AV" : t; };
  for (const x of T) {
    const kh = cle(x.h), ka = cle(x.a);
    if (!kh || !ka) continue;
    let vu = false;
    for (const e of evs) {
      const sh = cle(e.homeTeam?.name || e.homeTeam?.shortName), sa = cle(e.awayTeam?.name || e.awayTeam?.shortName);
      const inv = sh === ka && sa === kh;
      if (!(sh === kh && sa === ka) && !inv) continue;
      vu = true;
      const H = inv ? e.awayScore : e.homeScore, A = inv ? e.homeScore : e.awayScore;
      if (!H || !A || H.point == null || A.point == null) { const c = x.ls[x.ls.length - 1]; while (c.length < 7) c.push(c.length < 4 ? null : c.length === 4 ? 0 : null); c[7] = "NP:" + Object.keys(H || {}).join(","); break; }
      const cur = x.ls[x.ls.length - 1];
      while (cur.length < 5) cur.push(cur.length < 4 ? null : 0);
      cur[5] = pt(H.point); cur[6] = pt(A.point);
      if (!cur[4] && (e.homeScore?.serve || e.awayScore?.serve)) cur[4] = (inv ? e.awayScore?.serve : e.homeScore?.serve) ? 1 : 2;
      break;
    }
    if (!vu) { const c = x.ls[x.ls.length - 1]; while (c.length < 7) c.push(c.length < 4 ? null : c.length === 4 ? 0 : null); c[7] = "NM:" + evs.length + ":" + evs.slice(0, 3).map((e: any) => cle(e.homeTeam?.name) + "-" + cle(e.awayTeam?.name)).join("|").slice(0, 80); }
  }
}

async function liveMaj() {
  const rows: any[] = [];
  await Promise.all(FEEDS.map(async ([path, sp]) => {
    try {
      const r = await fetch(ESPN + path + "/scoreboard?limit=500", { headers: { "User-Agent": "Mozilla/5.0 PronoClub" } });
      if (!r.ok) return;
      const j = await r.json();
      for (const ev of j.events || []) {
        const lgName = LG[path] || String(ev.competitions?.[0]?.altGameNote || ev.league?.name || ev.season?.slug || "").split(",")[0] || "Football";
        const comps = Array.isArray(ev.groupings) ? ev.groupings.flatMap((g: any) => g.competitions || []) : (ev.competitions || []);
        for (const c of comps) {
          const x = ligne(sp, path, ev, c, sp === "tennis" ? (ev.name || "Tennis") : lgName);
          if (!x) continue;
          const t = Date.parse(x.t || "");
          if (!t || t > Date.now() + 6 * 3600e3 || t < Date.now() - 30 * 3600e3) continue;
          rows.push(x);
        }
      }
    } catch (_) { /* flux indisponible : on ignore */ }
  }));
  if (!rows.length) return 0;
  try { await sofaPoints(rows); } catch (e) { console.error("sofascore", e); }
  const now = new Date().toISOString();
  const old = new Map<string, any>();
  for (let i = 0; i < rows.length; i += 200) {
    const { data } = await db.from("live_ev").select("id,st,s,o,chg,det,clk").in("id", rows.slice(i, i + 200).map((r) => r.id));
    for (const d of data || []) old.set(d.id, d);
  }
  const up: any[] = [];
  for (const r of rows) {
    const p = old.get(r.id);
    const sc = JSON.stringify(r.s), chg = !p || JSON.stringify(p.s) !== sc;
    const row = { ...r, o: r.o || p?.o || null, chg: chg && p && r.st === "in" ? now : (p?.chg || now), maj: now };
    if (!p || chg || p.st !== r.st || p.clk !== r.clk || p.det !== r.det || r.st === "in" || (r.o && !p.o)) up.push(row);
  }
  for (let i = 0; i < up.length; i += 200) {
    const { error } = await db.from("live_ev").upsert(up.slice(i, i + 200), { onConflict: "id" });
    if (error) console.error("live_ev", error);
  }
  return up.length;
}

// ---------- Résultats automatiques des matchs d'avant-match ----------
// On retrouve chaque match du fichier du jour dans les scores ESPN (même sport, même heure, noms proches).
const PAYS: Record<string, string> = {
  "allemagne": "germany", "angleterre": "england", "espagne": "spain", "italie": "italy", "pays bas": "netherlands", "belgique": "belgium", "suisse": "switzerland",
  "autriche": "austria", "pologne": "poland", "suede": "sweden", "norvege": "norway", "danemark": "denmark", "finlande": "finland", "irlande": "republic of ireland",
  "irlande du nord": "northern ireland", "ecosse": "scotland", "pays de galles": "wales", "grece": "greece", "turquie": "turkiye", "croatie": "croatia", "serbie": "serbia",
  "hongrie": "hungary", "roumanie": "romania", "bulgarie": "bulgaria", "russie": "russia", "georgie": "georgia", "armenie": "armenia", "bielorussie": "belarus",
  "albanie": "albania", "macedoine du nord": "north macedonia", "montenegro": "montenegro", "bosnie herzegovine": "bosnia herzegovina", "slovenie": "slovenia",
  "slovaquie": "slovakia", "tchequie": "czechia", "republique tcheque": "czechia", "lituanie": "lithuania", "lettonie": "latvia", "estonie": "estonia", "islande": "iceland",
  "chypre": "cyprus", "malte": "malta", "israel": "israel", "moldavie": "moldova", "saint marin": "san marino", "bresil": "brazil", "argentine": "argentina",
  "colombie": "colombia", "chili": "chile", "perou": "peru", "equateur": "ecuador", "bolivie": "bolivia", "mexique": "mexico", "etats unis": "united states",
  "japon": "japan", "coree du sud": "south korea", "chine": "china", "australie": "australia", "maroc": "morocco", "algerie": "algeria", "tunisie": "tunisia",
  "egypte": "egypt", "libye": "libya", "senegal": "senegal", "cote d ivoire": "ivory coast", "cameroun": "cameroon", "afrique du sud": "south africa",
  "rd congo": "congo dr", "gambie": "gambia", "guinee": "guinea", "mauritanie": "mauritania", "tanzanie": "tanzania", "ouganda": "uganda", "ethiopie": "ethiopia",
  "zambie": "zambia", "namibie": "namibia", "comores": "comoros", "benin": "benin", "cap vert": "cape verde", "soudan": "sudan", "soudan du sud": "south sudan",
  "guinee equatoriale": "equatorial guinea", "guinee bissau": "guinea bissau", "somalie": "somalia", "arabie saoudite": "saudi arabia", "irak": "iraq",
  "jordanie": "jordan", "emirats arabes unis": "united arab emirates", "inde": "india", "nouvelle zelande": "new zealand", "syrie": "syria", "liban": "lebanon",
  "koweit": "kuwait", "ouzbekistan": "uzbekistan", "kirghizistan": "kyrgyz republic", "bahrein": "bahrain", "yemen": "yemen", "palestine": "palestine",
  "oh louvain": "oud heverlee leuven", "louvain": "leuven", "paris sg": "paris saint germain", "psg": "paris saint germain", "inter milan": "internazionale", "om": "marseille", "ol": "lyon", "barca": "barcelona",
};
const STOP = new Set(["fc", "cf", "sc", "ac", "as", "afc", "cd", "club", "de", "the", "us", "sv", "fk", "bk", "if", "ff", "w", "women", "f", "fem", "feminines", "de", "la", "le", "ud", "rc", "ca", "cs", "real"]);
function nrm(x: string) {
  let t = String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  if (PAYS[t]) t = PAYS[t];
  return t;
}
function simil(a: string, b: string) {
  const x = nrm(a), y = nrm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if ((x.length >= 4 && y.includes(x)) || (y.length >= 4 && x.includes(y))) return 0.9;
  const A = new Set(x.split(" ").filter((w) => w.length > 1 && !STOP.has(w))), B = new Set(y.split(" ").filter((w) => w.length > 1 && !STOP.has(w)));
  if (!A.size || !B.size) return 0;
  let n = 0; for (const w of A) if (B.has(w) || [...B].some((z) => z.length >= 5 && w.length >= 5 && (z.startsWith(w) || w.startsWith(z)))) n++;
  return n / Math.max(A.size, B.size);
}
const nomFin = (x: string) => nrm(x).split(" ").filter((w) => w.length > 1).pop() || "";
async function autoRes() {
  const now = paris(), days = [addDays(now.day, -1), now.day];
  for (const day of days) {
    const arr = await fixtures(day);
    if ((arr || []).some((r: any) => r.e)) continue; // programme automatique : résultats gérés par progAuto
    const vieux = (arr || []).filter((r: any) => !Array.isArray(r.s) && !r.x && Date.parse(r.t) < Date.now() - 12 * 3600e3);
    if (vieux.length) { // plus personne pour remplir ce résultat : mise remboursée
      const { error } = await db.from("fix_res").upsert(vieux.map((r: any) => ({ fid: day + "_" + r.id, s: { x: "Résultat indisponible : mise remboursée" }, src: "auto", maj: new Date().toISOString() })), { onConflict: "fid", ignoreDuplicates: true });
      if (error) console.error("fix_res x", error); else fixCache.delete(day);
    }
    const cand = (arr || []).filter((r: any) => !Array.isArray(r.s) && !r.x && ["foot", "basket", "hockey", "tennis"].includes(r.sp || "foot") && Date.parse(r.t) < Date.now() - 100 * 60e3);
    if (!cand.length) continue;
    const ts = cand.map((r: any) => Date.parse(r.t));
    const { data: evs } = await db.from("live_ev").select("id,sp,h,a,t,st,s,ls,det,buts,fin").eq("st", "post").eq("fin", 0)
      .gte("t", new Date(Math.min(...ts) - 50 * 60e3).toISOString()).lte("t", new Date(Math.max(...ts) + 50 * 60e3).toISOString());
    const up: any[] = [];
    for (const r of cand) {
      const sp = r.sp || "foot", tr = Date.parse(r.t);
      let best: any = null, bs = 0, second = 0;
      for (const e of evs || []) {
        if (e.sp !== sp || Math.abs(Date.parse(e.t) - tr) > 50 * 60e3) continue;
        const d = [simil(r.h, e.h), simil(r.a, e.a)], v = [simil(r.h, e.a), simil(r.a, e.h)];
        for (const [p, inv] of [[d, false], [v, true]] as [number[], boolean][]) {
          const ok = (p[0] >= 0.5 && p[1] >= 0.5) || (Math.max(...p) >= 0.85 && Math.min(...p) >= 0.34);
          const sc = p[0] + p[1];
          if (ok && sc > bs) { second = bs; bs = sc; best = { e, inv }; } else if (ok && sc > second) second = sc;
        }
      }
      if (!best || bs - second < 0.3) continue;
      const e = best.e, inv = best.inv, det = String(e.det || "");
      let h = Number(e.s?.[0]), a = Number(e.s?.[1]);
      if (!isFinite(h) || !isFinite(a)) continue;
      if (sp === "foot" && /AET|Pen|ET\b|extra/i.test(det)) continue; // prolongations : on laisse faire à la main
      if (sp === "hockey") {
        if (Array.isArray(e.ls) && e.ls.length >= 3) { h = e.ls.slice(0, 3).reduce((t: number, x: number[]) => t + (Number(x[0]) || 0), 0); a = e.ls.slice(0, 3).reduce((t: number, x: number[]) => t + (Number(x[1]) || 0), 0); }
        else if (/OT|SO/i.test(det)) continue;
      }
      let res: any[] = inv ? [a, h] : [h, a];
      if (sp === "foot" && Array.isArray(r.bt) && r.bt.length) {
        const buts = Array.isArray(e.buts) ? e.buts : [];
        if (buts.length !== h + a) continue; // buteurs incomplets : on attend
        const L: string[] = [];
        for (const g of buts) {
          if (g[2]) continue;
          const side = inv ? (g[1] === 1 ? 2 : 1) : g[1], fin = nomFin(g[0]);
          const p = r.bt.find((x: any) => x[1] === side && fin && (nomFin(x[0]) === fin || nrm(g[0]).includes(nrm(x[0])) || nrm(x[0]).includes(fin)));
          if (p) L.push(p[0]);
        }
        res = [res[0], res[1], L];
      }
      up.push({ fid: day + "_" + r.id, s: res, src: e.id, maj: new Date().toISOString() });
    }
    if (up.length) { const { error } = await db.from("fix_res").upsert(up, { onConflict: "fid" }); if (error) console.error("fix_res", error); }
  }
}

// ---------- Programme des matchs automatique (sans fichier du jour) ----------
// Toutes les 5 minutes : on lit les calendriers ESPN des grands championnats pour aujourd'hui,
// demain et après-demain, avec les cotes des bookmakers, et on remplit la table fix_auto.
// Les résultats des matchs déjà au programme sont ajoutés au même moment.
const PRE: [string, string, string, string][] = [
  ["soccer/uefa.champions", "foot", "Ligue des champions", "🇪🇺"], ["soccer/fra.1", "foot", "Ligue 1", "🇫🇷"], ["soccer/eng.1", "foot", "Premier League", "🏴󠁧󠁢󠁥󠁮󠁧󠁿"],
  ["soccer/esp.1", "foot", "Liga", "🇪🇸"], ["soccer/ita.1", "foot", "Serie A", "🇮🇹"], ["soccer/ger.1", "foot", "Bundesliga", "🇩🇪"],
  ["soccer/uefa.nations", "foot", "Ligue des nations", "🇪🇺"], ["soccer/fifa.worldq.uefa", "foot", "Qualif. Coupe du monde", "🌍"],
  ["soccer/uefa.europa", "foot", "Ligue Europa", "🇪🇺"], ["soccer/uefa.europa.conf", "foot", "Ligue Conférence", "🇪🇺"],
  ["soccer/fra.coupe_de_france", "foot", "Coupe de France", "🇫🇷"], ["soccer/fifa.friendly", "foot", "Match amical", "🌍"],
  ["soccer/fra.2", "foot", "Ligue 2", "🇫🇷"], ["soccer/por.1", "foot", "Liga Portugal", "🇵🇹"], ["soccer/ned.1", "foot", "Eredivisie", "🇳🇱"],
  ["soccer/bel.1", "foot", "Pro League", "🇧🇪"], ["soccer/esp.copa_del_rey", "foot", "Coupe du Roi", "🇪🇸"], ["soccer/ita.coppa_italia", "foot", "Coupe d'Italie", "🇮🇹"],
  ["soccer/ger.dfb_pokal", "foot", "Coupe d'Allemagne", "🇩🇪"], ["soccer/eng.fa", "foot", "FA Cup", "🏴󠁧󠁢󠁥󠁮󠁧󠁿"], ["soccer/eng.league_cup", "foot", "Carabao Cup", "🏴󠁧󠁢󠁥󠁮󠁧󠁿"],
  ["soccer/eng.2", "foot", "Championship", "🏴󠁧󠁢󠁥󠁮󠁧󠁿"], ["soccer/tur.1", "foot", "Süper Lig", "🇹🇷"], ["soccer/sco.1", "foot", "Premiership (Écosse)", "🏴󠁧󠁢󠁳󠁣󠁴󠁿"],
  ["soccer/sau.1", "foot", "Saudi Pro League", "🇸🇦"], ["soccer/usa.1", "foot", "MLS", "🇺🇸"], ["soccer/bra.1", "foot", "Brasileirão", "🇧🇷"],
  ["soccer/arg.1", "foot", "Liga Argentine", "🇦🇷"], ["soccer/mex.1", "foot", "Liga MX", "🇲🇽"], ["soccer/uefa.wchampions", "foot", "Ligue des champions F.", "🇪🇺"],
  ["basketball/nba", "basket", "NBA", "🇺🇸"], ["hockey/nhl", "hockey", "NHL", "🇺🇸"], ["tennis/atp", "tennis", "ATP", "🎾"], ["tennis/wta", "tennis", "WTA", "🎾"],
];
const CAP: Record<string, number> = { foot: 25, basket: 10, hockey: 8, tennis: 12 };
const cote = (p: number) => Math.min(60, Math.max(1.02, Math.floor(100 / (p * 1.06)) / 100));
function preCotes(sp: string, c: any, H: any, A: any) {
  if (sp === "tennis") {
    const rh = Number(H.curatedRank?.current) || 400, ra = Number(A.curatedRank?.current) || 400;
    if (rh >= 400 && ra >= 400) return null;
    const p = Math.min(0.93, Math.max(0.07, 1 / (1 + Math.pow(rh / ra, 0.75))));
    return { o: [cote(p), cote(1 - p)] };
  }
  const k = cotes(c); if (!k || !k.h || !k.a) return null;
  if (sp === "foot") { if (!k.d) return null; return { o: [k.h, k.d, k.a], tl: k.tot ?? undefined }; }
  if (sp === "hockey") { // cote ESPN avec prolongation → cotes en temps réglementaire (nul possible)
    const ph = 1 / k.h, pa = 1 / k.a, t = ph + pa, D = 0.22;
    return { o: [cote(ph / t * (1 - D)), cote(D), cote(pa / t * (1 - D))], tl: k.tot ?? 6 };
  }
  return { o: [k.h, k.a], tl: k.tot ?? undefined };
}
function preRes(sp: string, x: any, bt?: any[]) {
  if (!x || x.st !== "post") return null;
  if (x.fin) return { x: "Match reporté ou annulé : mise remboursée" };
  const det = String(x.det || "");
  let h = Number(x.s?.[0]), a = Number(x.s?.[1]);
  if (!isFinite(h) || !isFinite(a)) return null;
  if (sp === "foot" && /AET|Pen|ET\b|extra/i.test(det)) {
    if (Array.isArray(bt) && bt.length) return null; // buteurs du temps réglementaire impossibles à séparer : remboursé au bout de 12 h
    if (!Array.isArray(x.ls) || x.ls.length < 2) return null;
    h = Number(x.ls[0][0]) + Number(x.ls[1][0]); a = Number(x.ls[0][1]) + Number(x.ls[1][1]);
  }
  if (sp === "hockey") {
    if (Array.isArray(x.ls) && x.ls.length >= 3) { h = x.ls.slice(0, 3).reduce((t: number, v: number[]) => t + (Number(v[0]) || 0), 0); a = x.ls.slice(0, 3).reduce((t: number, v: number[]) => t + (Number(v[1]) || 0), 0); }
    else if (/OT|SO/i.test(det)) return null;
  }
  if (sp === "tennis" && h === a) return null;
  if (sp === "foot" && Array.isArray(bt) && bt.length) { // paris buteurs : il faut la liste des buteurs
    const buts = Array.isArray(x.buts) ? x.buts : [];
    if (buts.length !== h + a) return null;
    const L: string[] = [];
    for (const g of buts) { if (g[2]) continue; const p = bt.find((b: any) => b[1] === g[1] && nrm(b[0]) === nrm(g[0])) || bt.find((b: any) => b[1] === g[1] && nomFin(b[0]) && nomFin(b[0]) === nomFin(g[0])); if (p) L.push(p[0]); }
    return { s: [h, a, L] };
  }
  return { s: [h, a] };
}
// Paris buteurs : cotes réelles des bookmakers (via ESPN) quand elles existent, sinon estimées à partir des titulaires officiels
function frac(v: any) { const t = String(v || "").trim().toLowerCase(); if (/^ev/.test(t)) return 2; const m = t.match(/^(\d+)\/(\d+)$/); if (m) return 1 + Number(m[1]) / Number(m[2]); const d = Number(t); return isFinite(d) && d > 1 ? d : 0; }
function buteurs(j: any, m: any) {
  const R = Array.isArray(j?.rosters) ? j.rosters : [];
  const sideOfTeam = new Map<string, number>();
  for (const T of R) sideOfTeam.set(String(T.team?.id || ""), T.homeAway === "away" ? 2 : 1);
  for (const c of j?.header?.competitions?.[0]?.competitors || []) sideOfTeam.set(String(c.id || c.team?.id || ""), c.homeAway === "away" ? 2 : 1);
  const sideOf = new Map<string, number>();
  const put = (n: any, sd: number | undefined) => { const k = nrm(String(n || "")); if (k && sd) sideOf.set(k, sd); };
  for (const T of R) { const sd = T.homeAway === "away" ? 2 : 1; for (const x of T.roster || []) put(x.athlete?.displayName, sd); }
  for (const T of j?.leaders || []) { const sd = sideOfTeam.get(String(T.team?.id || "")); for (const c of T.leaders || []) for (const x of c.leaders || []) put(x.athlete?.displayName, sd); }
  for (const T of j?.boxscore?.players || []) { const sd = sideOfTeam.get(String(T.team?.id || "")); for (const st of T.statistics || []) for (const x of st.athletes || []) put(x.athlete?.displayName, sd); }
  // 1) cotes « buteur à tout moment » d'un bookmaker
  let mk: any[] = [];
  for (const o of j?.odds || []) { const L = o?.bettingOdds?.playerOdds?.preMatchAnyTimeGoalScorer; if (Array.isArray(L) && L.length > mk.length) mk = L; }
  if (mk.length && sideOf.size) {
    const by: Record<number, any[]> = { 1: [], 2: [] };
    for (const e of mk) {
      const n = String(e.player || "").trim(), c = frac(e.value), sd = sideOf.get(nrm(n)) || 0;
      if (n && c > 1 && sd) by[sd].push([n, sd, Math.min(30, Math.round(c * 100) / 100)]);
    }
    if (by[1].length >= 3 && by[2].length >= 3) return [...by[1].sort((p, q) => p[2] - q[2]).slice(0, 6), ...by[2].sort((p, q) => p[2] - q[2]).slice(0, 6)];
  }
  // 2) sinon : titulaires officiels, cotes estimées selon le poste et la force des équipes
  if (R.length !== 2) return null;
  const o = Array.isArray(m.o) ? m.o.map(Number) : [];
  const ph = o[0] ? 1 / o[0] : 0.4, pa = o[2] ? 1 / o[2] : 0.3;
  const tot = Math.max(2, Math.min(3.6, (Number(m.tl) || 2.5) + 0.2));
  const share = Math.max(0.2, Math.min(0.8, 0.5 + (ph - pa) * 0.6));
  const poids = (pos: string) => { const p = pos.toUpperCase(); if (/^G/.test(p)) return 0; if (/F|S|W|CF|ST/.test(p) && !/D|B/.test(p)) return 1; if (/AM/.test(p)) return 0.55; if (/M/.test(p)) return 0.28; return 0.07; };
  const out: any[] = [];
  for (const T of R) {
    const side = T.homeAway === "away" ? 2 : 1;
    const tit = (T.roster || []).filter((x: any) => x.starter);
    if (tit.length < 11) return null; // compositions pas encore publiées
    const L = tit.map((x: any) => ({ n: String(x.athlete?.displayName || "").trim(), w: poids(String(x.position?.abbreviation || x.position?.name || "")) })).filter((x: any) => x.n && x.w > 0);
    const sw = L.reduce((t: number, x: any) => t + x.w, 0) || 1;
    const lam = tot * (side === 1 ? share : 1 - share) * 0.88;
    L.sort((p: any, q: any) => q.w - p.w);
    for (const x of L.slice(0, 6)) {
      const p = 1 - Math.exp(-lam * x.w / sw);
      out.push([x.n, side, Math.min(25, Math.max(1.4, Math.floor(100 / (p * 1.08)) / 100))]);
    }
  }
  return out.length >= 6 ? out : null;
}

async function progAuto() {
  const now = paris(), days = [now.day, addDays(now.day, 1), addDays(now.day, 2)], prev = addDays(now.day, -1);
  const ymd = (d: string) => d.replace(/-/g, "");
  const dates = [prev, ...days].map(ymd);
  const { data: rows } = await db.from("fix_auto").select("day,data").in("day", [prev, ...days]);
  const DB = new Map<string, any[]>((rows || []).map((r: any) => [r.day, Array.isArray(r.data) ? r.data : []]));
  const cand: any[] = [];
  await Promise.all(PRE.flatMap(([path, sp, cn, fl], pi) => dates.map(async (dt) => {
    try {
      const r = await fetch(ESPN + path + "/scoreboard?limit=300&dates=" + dt, { headers: { "User-Agent": "Mozilla/5.0 PronoClub" } });
      if (!r.ok) return;
      const j = await r.json();
      for (const ev of j.events || []) {
        const comps = Array.isArray(ev.groupings) ? ev.groupings.flatMap((g: any) => g.competitions || []) : (ev.competitions || []);
        for (const c of comps) {
          const L = c.competitors || []; if (L.length !== 2) continue;
          const H = L.find((x: any) => x.homeAway === "home" || x.order === 1) || L[0], A = L.find((x: any) => x !== H) || L[1];
          const x = ligne(sp, path, ev, c, cn); if (!x) continue;
          if (sp === "tennis" && (/ \/ /.test(x.h) || /ITF|Challenger/i.test(String(ev.name || "")))) continue; // simples des grands tournois seulement
          const t = Date.parse(x.t || ""); if (!t) continue;
          const day = paris(new Date(t)).day;
          cand.push({ pi, sp, path, day, t, x, c, H, A, cn: sp === "tennis" ? String(ev.name || cn).replace(/^Nitto /, "").slice(0, 40) : cn, fl });
        }
      }
    } catch (_) { /* flux indisponible */ }
  })));
  const seen = new Set<string>();
  const ch = new Set<string>();
  cand.sort((p, q) => p.pi - q.pi || p.t - q.t);
  for (const k of cand) {
    const id = k.sp[0] + String(k.c.id || k.x.id).replace(/\D/g, "");
    if (seen.has(k.day + id)) continue; seen.add(k.day + id);
    if (!DB.has(k.day)) DB.set(k.day, []);
    const arr = DB.get(k.day)!, old = arr.find((m: any) => m.id === id);
    if (old) {
      if (!old.lp) { old.lp = k.path; old.big = k.pi < 10 ? 1 : 0; ch.add(k.day); }
      if (!Array.isArray(old.s) && !old.x) {
        const R = preRes(k.sp, k.x, old.bt);
        if (R) { Object.assign(old, R); ch.add(k.day); continue; }
        if (k.x.st === "pre" && k.t > Date.now() + 5 * 60e3) { // cotes et horaire mis à jour avant le match
          const C = preCotes(k.sp, k.c, k.H, k.A);
          const t = new Date(k.t).toISOString();
          if ((C && JSON.stringify(C.o) !== JSON.stringify(old.o)) || old.t !== t) { if (C) { old.o = C.o; if (C.tl != null) old.tl = C.tl; } old.t = t; ch.add(k.day); }
        }
      }
      continue;
    }
    if (!days.includes(k.day) || k.x.st !== "pre" || k.t < Date.now() + 10 * 60e3) continue;
    if (arr.filter((m: any) => m.sp === k.sp).length >= (CAP[k.sp] || 8)) continue;
    const C = preCotes(k.sp, k.c, k.H, k.A); if (!C) continue;
    const m: any = { id, sp: k.sp, c: k.cn, f: k.fl, h: k.x.h, a: k.x.a, t: new Date(k.t).toISOString(), o: C.o, e: k.x.id, lp: k.path, big: k.pi < 10 ? 1 : 0 };
    if (C.tl != null) m.tl = C.tl;
    if (k.sp === "tennis") m.bo = k.x.bo || 3;
    arr.push(m); ch.add(k.day);
  }
  // compositions officielles (~1 h avant les gros matchs de foot) : paris buteurs automatiques
  for (const [day, arr] of DB) for (const m of arr) {
    if (m.sp !== "foot" || !m.big || !m.lp || m.bt || m.s || m.x) continue;
    const dt = Date.parse(m.t) - Date.now();
    if (dt > 24 * 3600e3 || dt < 2 * 60e3) continue;
    if (m.btTry && Date.now() - m.btTry < (dt > 90 * 60e3 ? 30 : 9) * 60e3) continue;
    m.btTry = Date.now(); ch.add(day);
    try {
      const ev = String(m.e || "").split("-").pop();
      const r = await fetch(ESPN + m.lp + "/summary?event=" + ev, { headers: { "User-Agent": "Mozilla/5.0 PronoClub" } });
      if (!r.ok) continue;
      const bt = buteurs(await r.json(), m);
      if (bt) { m.bt = bt; delete m.btTry; }
    } catch (_) { /* compositions pas encore publiées */ }
  }
  // matchs jamais terminés (ESPN muet) : remboursés après 12 h
  for (const [day, arr] of DB) for (const m of arr) if (!Array.isArray(m.s) && !m.x && Date.parse(m.t) < Date.now() - 12 * 3600e3) { m.x = "Résultat indisponible : mise remboursée"; ch.add(day); }
  const up = [...ch].map((day) => ({ day, data: DB.get(day)!.sort((p: any, q: any) => Date.parse(p.t) - Date.parse(q.t)), maj: new Date().toISOString() }));
  if (up.length) { const { error } = await db.from("fix_auto").upsert(up, { onConflict: "day" }); if (error) console.error("fix_auto", error); }
  for (const d of ch) fixCache.delete(d);
}

Deno.serve(async (req) => {
  const secret = await cfg("cron_secret");
  if (!secret || req.headers.get("x-cron") !== secret) return new Response("Accès refusé", { status: 401 });
  let corps: any = {};
  try { corps = await req.json(); } catch (_) { /* pas de corps */ }
  if (corps && corps.live) {
    let n = 0;
    try { n = await liveMaj(); } catch (e) { console.error("live", e); }
    return new Response(JSON.stringify({ ok: true, live: n }), { headers: { "Content-Type": "application/json" } });
  }
  let pub = await cfg("vapid_public"), priv = await cfg("vapid_private");
  if (!pub || !priv) {
    const k = webpush.generateVAPIDKeys();
    await db.from("config").upsert([{ k: "vapid_public", v: k.publicKey }, { k: "vapid_private", v: k.privateKey }], { onConflict: "k", ignoreDuplicates: true });
    pub = await cfg("vapid_public"); priv = await cfg("vapid_private");
  }
  webpush.setVapidDetails(SITE, pub!, priv!);
  try { await preparer(); } catch (e) { console.error("preparer", e); }
  const n = await envoyer();
  return new Response(JSON.stringify({ ok: true, envoyees: n }), { headers: { "Content-Type": "application/json" } });
});
