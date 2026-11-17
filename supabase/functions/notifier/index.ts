// PronoClub — fonction « notifier » (Supabase Edge Function)
// Appelée chaque minute par Supabase (pg_cron). Elle prépare les notifications prévues
// (pari terminé, défi du jour, série en danger) puis envoie la file d'attente sur les téléphones.
// Toutes les 5 minutes, elle règle aussi les paris terminés des joueurs absents.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const SITE = "https://mgdn728.github.io/pronoclub/";
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
    cut("/* ---------- Sports et marchés", "function findMatch") + "\nreturn {FIX,build,SPORTS,weekId};";
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
  const match = async (mid: string) => {
    const k = mid.indexOf("_"), day = mid.slice(0, k);
    if (!built.has(day)) { built.add(day); const arr = await fixtures(day); if (Array.isArray(arr) && arr.length) E.build(day, arr); }
    return (E.FIX[day] || []).find((m: any) => m.id === mid) || null;
  };
  const opt = (m: any, mk: string, o: string) => {
    const K = E.SPORTS[m.sp].markets(m).find((x: any) => x.key === mk);
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
      const addCoins = (v: number) => { if (e.day !== now.day) { e.day = now.day; e.coins = 20000; e.d20 = 1; } e.coins = (e.coins || 0) + v; };
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
  if (paris().min % 5 === 0) { try { await regler(prefs); } catch (e) { console.error("regler", e); } }
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
  // 2 ter. Pièces pas jouées (entre 20 h et 22 h)
  if (now.hour >= 20 && now.hour < 22) {
    for (const j of js || []) {
      if (!prefs.get(j.id)!.serie) continue;
      const e = j.etat || {};
      if (e.day !== now.day || (e.coins || 0) < 5000) continue;
      if (await marquer(j.id, "pieces:" + now.day)) await ajouter(j.id, "serie", `🪙 Il te reste ${Math.round(e.coins)} pièces !`, "Elles repartent à 20 000 à minuit : joue-les avant qu'il soit trop tard ⏳", "?");
    }
  }

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

Deno.serve(async (req) => {
  const secret = await cfg("cron_secret");
  if (!secret || req.headers.get("x-cron") !== secret) return new Response("Accès refusé", { status: 401 });
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
