// PronoClub — fonction « notifier » (Supabase Edge Function)
// Appelée chaque minute par Supabase (pg_cron). Elle prépare les notifications prévues
// (pari terminé, défi du jour, série en danger) puis envoie la file d'attente sur les téléphones.
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

async function preparer() {
  const { data: subs } = await db.from("abonnements").select("joueur_id,prefs");
  const prefs = new Map<number, Record<string, boolean>>();
  for (const s of subs || []) {
    const p = prefs.get(s.joueur_id) || {};
    for (const [k, v] of Object.entries(s.prefs || {})) if (v === true) p[k] = true;
    prefs.set(s.joueur_id, p);
  }
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
