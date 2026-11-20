/* PronoClub — « Mon Club » : crée ton club, ouvre des packs, entraîne tes joueurs,
   joue des matchs animés contre les clubs des autres joueurs et monte de division.
   Utilise les fonctions de l'appli : state, save, nf, esc, toast, popup, closePop, celebrate, winFx, renderView, renderHeader, rpc, session, ui, bjRand. */
(function(){
'use strict';
const $=s=>document.querySelector(s);
const R=n=>bjRand(n);
const pick=a=>a[R(a.length)];
const DIVN=['','Ligue des Légendes','Élite','Division 3','Division 4','Division 5','Division 6','Division 7','Division 8','Division 9','Division 10'];
const RAR={b:{n:'Bronze',min:46,max:59,cap:66,sell:300,c:'#b87333'},a:{n:'Argent',min:60,max:69,cap:76,sell:1500,c:'#9aa4b2'},o:{n:'Or',min:70,max:79,cap:86,sell:6000,c:'#e6b422'},l:{n:'Légende',min:80,max:88,cap:93,sell:25000,c:'#a855f7'},i:{n:'Icône',min:89,max:95,cap:99,sell:80000,c:'#00e5ff'}};
const POSN={G:'Gardien',D:'Défenseur',M:'Milieu',A:'Attaquant'};
const SLOTS=['G','D','D','D','D','M','M','M','A','A','A'];
const PACKS=[
  {id:'free',n:'Pack du jour',ic:'🎁',cur:'free',cost:0,nb:3,odds:{b:88,a:11,o:1},desc:'Gratuit chaque jour'},
  {id:'bronze',n:'Pack Bronze',ic:'🟫',cur:'c',cost:5000,nb:3,odds:{b:85,a:13,o:2},desc:'3 joueurs'},
  {id:'argent',n:'Pack Argent',ic:'⬜',cur:'c',cost:25000,nb:3,odds:{b:35,a:52,o:12,l:1},desc:'3 joueurs · 1 % Légende'},
  {id:'or',n:'Pack Or',ic:'🟨',cur:'d',cost:15000,nb:3,odds:{a:38,o:54,l:7.5,i:.5},desc:'3 joueurs · Icône possible'},
  {id:'legende',n:'Pack Légende',ic:'🟪',cur:'d',cost:60000,nb:3,odds:{o:62,l:34,i:4},desc:'1 Légende garantie'}];
const PRE=['Lucas','Hugo','Nathan','Enzo','Léo','Mathis','Noah','Gabriel','Adam','Rayan','Ilyes','Yanis','Sami','Moussa','Ibrahim','Théo','Jules','Malik','Bilal','Diego','Mateo','Luca','Marco','Pablo','Rafael','Tiago','Jonas','Erik','Lars','Ivan','Luka','Omar','Youssef','Amine','Samuel','Kenji','Hiro','Kwame','Kofi','Emeka','Aliou','Seydou','Nolan','Timéo','Evan','Axel','Sacha','Elias','Ismaël','Naïm'];
const NOMS=[['Martin','🇫🇷'],['Bernard','🇫🇷'],['Dubois','🇫🇷'],['Moreau','🇫🇷'],['Laurent','🇫🇷'],['Garnier','🇫🇷'],['Fontaine','🇫🇷'],['Rousseau','🇫🇷'],['Lemoine','🇫🇷'],['Chevalier','🇫🇷'],['Diallo','🇸🇳'],['Traoré','🇲🇱'],['Koné','🇨🇮'],['Camara','🇬🇳'],['Mendy','🇸🇳'],['Benali','🇩🇿'],['Haddad','🇲🇦'],['Mansour','🇹🇳'],['Rossi','🇮🇹'],['Bianchi','🇮🇹'],['Ricci','🇮🇹'],['Silva','🇵🇹'],['Santos','🇧🇷'],['Costa','🇧🇷'],['Pereira','🇵🇹'],['Navarro','🇪🇸'],['Ortega','🇪🇸'],['Becker','🇩🇪'],['Krüger','🇩🇪'],['Novak','🇨🇿'],['Horvat','🇭🇷'],['Petrov','🇧🇬'],['Jensen','🇩🇰'],['Larsen','🇳🇴'],['Nilsson','🇸🇪'],['Janssen','🇳🇱'],['De Vries','🇳🇱'],['Okafor','🇳🇬'],['Mensah','🇬🇭'],['Owusu','🇬🇭'],['Tanaka','🇯🇵'],['Sato','🇯🇵'],['Park','🇰🇷'],['Nguyen','🇻🇳'],['Morales','🇦🇷'],['Vargas','🇺🇾'],['Rojas','🇨🇱'],['Ndiaye','🇸🇳'],['Bakari','🇨🇲'],['Lindqvist','🇸🇪']];
const CRESTS=['🦁','🐺','🦅','🐉','⚡','🔥','👑','🦈','🐯','🌟','🛡️','🐻'];
const COLS=[['#e5126b','#111827'],['#1d4ed8','#ffffff'],['#16a34a','#facc15'],['#111827','#f59e0b'],['#7c3aed','#22d3ee'],['#dc2626','#ffffff'],['#0f766e','#f97316'],['#f8fafc','#1e3a8a']];
const BOTN=['FC Lumière','Olympique Tonnerre','AS Comète','Racing Éclair','US Phénix','Sporting Mistral','Stade Aurore','Real Orage','AC Volcan','Dynamo Boréal','Inter Galaxie','Atlético Tempête','SC Horizon','FC Météore','Union Zénith','Athletic Cyclone'];
const uid=()=>Date.now().toString(36)+R(1e6).toString(36);
const mk=(k,p)=>{const r=RAR[k],[ln,f]=pick(NOMS);return{id:uid(),n:pick(PRE)+' '+ln,f,p,k,r:r.min+R(r.max-r.min+1),t:0}};
const C=()=>state.club;
const today=()=>new Date(Date.now()+60e3*(-new Date().getTimezoneOffset())).toISOString().slice(0,10);
function rollK(odds){let x=Math.random()*100;for(const k of Object.keys(odds)){x-=odds[k];if(x<0)return k}return Object.keys(odds)[0]}
function rollPos(){const x=R(100);return x<10?'G':x<40?'D':x<72?'M':'A'}

/* ---------- état du club ---------- */
function eff(c,pl,slot){if(!pl)return 0;return pl.r-(pl.p===SLOTS[slot]?0:15)}
function byId(id){return C().sq.find(x=>x.id===id)}
function lineup(){const c=C();return c.xi.map((id,i)=>({pl:byId(id),i,pos:SLOTS[i]}))}
function notes(){const L=lineup(),avg=f=>{const a=L.filter(f);return a.length?Math.round(a.reduce((t,x)=>t+eff(C(),x.pl,x.i),0)/a.length):0};
  return{gk:avg(x=>x.pos==='G'),def:avg(x=>x.pos==='D'),mid:avg(x=>x.pos==='M'),att:avg(x=>x.pos==='A'),note:avg(()=>true)}}
function autoXI(){const c=C(),used=new Set(),xi=[];
  for(const pos of SLOTS){const best=c.sq.filter(p=>!used.has(p.id)&&p.p===pos).sort((a,b)=>b.r-a.r)[0]||c.sq.filter(p=>!used.has(p.id)).sort((a,b)=>b.r-a.r)[0];
    if(best){used.add(best.id);xi.push(best.id)}else xi.push(null)}
  c.xi=xi}
function pub(){const c=C(),n=notes(),L=lineup();
  c.pub={n:c.n,e:c.e,c1:c.c1,c2:c.c2,note:n.note,att:n.att,mid:n.mid,def:n.def,gk:n.gk,div:c.div,pts:c.pts,tr:c.tr||0,w:c.w||0,
    noms:L.filter(x=>x.pos==='A'&&x.pl).map(x=>x.pl.n).concat(L.filter(x=>x.pos==='M'&&x.pl).map(x=>x.pl.n)).slice(0,6)}}
function csave(){pub();save()}
function energy(){const c=C(),now=Date.now();if(c.en>=5){c.enT=now;return 5}
  const gain=Math.floor((now-(c.enT||now))/(20*60e3));if(gain>0){c.en=Math.min(5,c.en+gain);c.enT=c.en>=5?now:(c.enT+gain*20*60e3)}return c.en}
function nextEn(){const c=C();return c.en>=5?0:Math.max(0,20*60e3-(Date.now()-c.enT))}
function income(){const c=C(),h=Math.min(8,(Date.now()-(c.inT||Date.now()))/3600e3);return Math.floor(h*800*c.st)}
function create(name,e,ci){
  const sq=[];SLOTS.forEach(p=>sq.push(mk('b',p)));['D','M','A','G'].forEach(p=>sq.push(mk('b',p)));
  sq.forEach(x=>{x.r=Math.max(46,Math.min(56,x.r))});
  state.club={v:1,n:name,e,c1:COLS[ci][0],c2:COLS[ci][1],sq,xi:[],div:10,pts:0,w:0,d:0,l:0,tr:0,en:5,enT:Date.now(),st:1,inT:Date.now(),free:null,hist:[]};
  autoXI();csave()}

/* ---------- vues ---------- */
function head(){const c=C(),n=notes();const pct=Math.min(100,c.pts/30*100);
  return '<div class="cl-head" style="--c1:'+c.c1+';--c2:'+c.c2+'"><div class="cl-crest">'+c.e+'</div><div class="cl-hn"><b>'+esc(c.n)+'</b><span>'+DIVN[c.div]+(c.tr?' · 🏆 ×'+c.tr:'')+'</span>'+
    '<div class="cl-bar"><i style="width:'+pct+'%"></i></div><small>'+c.pts+' / 30 pts '+(c.div>1?'pour monter en '+DIVN[c.div-1]:'pour soulever le trophée')+'</small></div><div class="cl-note"><b>'+n.note+'</b><small>NOTE</small></div></div>'}
const SK=['#f1c9a5','#e0ac80','#c68955','#a0693e','#7a4a28','#5a3519'],HR=['#1f1a17','#3b2416','#6b4423','#a0703a','#d8b25a','#111'];
function hsh(s){let h=7;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return Math.abs(h)}
function avatar(p){const c=C()||{c1:'#16a34a',c2:'#ffffff'},h=hsh(p.id+p.n),sk=SK[h%6],hr=HR[(h>>3)%6],st=(h>>6)%5,gk=p.p==='G',j=gk?'#facc15':c.c1,j2=gk?'#111827':c.c2;
  const hair=[ '<path d="M18.5 23 C18 9 42 9 41.5 23 C39 15.5 21 15.5 18.5 23Z" fill="'+hr+'"/>',
    '<ellipse cx="30" cy="15" rx="14" ry="9.5" fill="'+hr+'"/>','',
    '<path d="M17.5 29 C14 7 46 7 42.5 29 L41 19 C36 14 24 14 19 19Z" fill="'+hr+'"/>',
    '<path d="M19 21 C20 11 40 11 41 21 L38 16 L34 18 L30 14 L26 18 L22 16Z" fill="'+hr+'"/>'][st];
  const beard=(h>>9)%5===0?'<path d="M20 27 C21 37 39 37 40 27 C37 33 23 33 20 27Z" fill="'+hr+'" opacity=".85"/>':'';
  return '<svg viewBox="0 0 60 56" class="cc-av"><path d="M5 56 C7 43 17 39 30 39 C43 39 53 43 55 56Z" fill="'+j+'"/><path d="M5 56 C6 49 9 45 13 43 L15 56Z" fill="'+j2+'" opacity=".9"/><path d="M55 56 C54 49 51 45 47 43 L45 56Z" fill="'+j2+'" opacity=".9"/><path d="M23.5 39.5 L30 47 L36.5 39.5Z" fill="'+j2+'"/><text x="30" y="54.5" text-anchor="middle" font-size="7" font-weight="900" fill="'+j2+'" font-family="system-ui">'+(p.r)+'</text>'+
    '<rect x="25" y="31" width="10" height="9" rx="3" fill="'+sk+'"/><ellipse cx="18.5" cy="25" rx="2" ry="3" fill="'+sk+'"/><ellipse cx="41.5" cy="25" rx="2" ry="3" fill="'+sk+'"/><ellipse cx="30" cy="24" rx="11" ry="12.5" fill="'+sk+'"/>'+hair+beard+
    '<circle cx="26" cy="24.5" r="1.4" fill="#1f2937"/><circle cx="34" cy="24.5" r="1.4" fill="#1f2937"/><path d="M24 21 L28 20.6 M32 20.6 L36 21" stroke="'+hr+'" stroke-width="1.1" stroke-linecap="round"/><path d="M26.8 30.5 Q30 32.6 33.2 30.5" stroke="#7c2d12" stroke-width="1.1" fill="none" stroke-linecap="round"/></svg>'}
function card(p,opts){opts=opts||{};const r=RAR[p.k];
  return '<div class="cl-card k-'+p.k+(opts.sm?' sm':'')+'"'+(opts.attr||'')+'><div class="cc-top"><b>'+p.r+'</b><span>'+p.p+'</span><i>'+p.f+'</i></div><div class="cc-face">'+avatar(p)+'</div><div class="cc-n">'+esc(p.n.split(' ').slice(-1)[0])+'</div><div class="cc-k">'+r.n+'</div></div>'}
function renderClub(){
  if(!session)return '<div class="cl-wrap"><div class="cl-intro"><div class="cl-big">⚽</div><h2>Mon Club</h2><p>Crée ton propre club, ouvre des packs de joueurs, entraîne ton équipe et affronte les clubs des autres joueurs pour monter jusqu\'à la Ligue des Légendes.</p><button class="cl-go" data-auth="signup">Créer mon compte pour jouer</button></div></div>';
  if(!C())return renderCreate();
  energy();const v=ui.cv||'home';
  const tabs='<div class="cl-tabs">'+[['home','🏟️','Club'],['team','👕','Équipe'],['packs','🎁','Packs'],['board','🏆','Classement']].map(t=>'<button class="'+(v===t[0]?'on':'')+'" data-cv="'+t[0]+'">'+t[1]+'<span>'+t[2]+'</span>'+(t[0]==='packs'&&C().free!==today()?'<em></em>':'')+'</button>').join('')+'</div>';
  return '<div class="cl-wrap">'+head()+tabs+(v==='team'?vTeam():v==='packs'?vPacks():v==='board'?vBoard():vHome())+'</div>'}
function renderCreate(){const ci=ui.clCol||0,e=ui.clE||'🦁';
  return '<div class="cl-wrap"><div class="cl-intro"><div class="cl-big">⚽</div><h2>Crée ton club</h2><p>Tu commences en Division 10 avec 15 jeunes joueurs. À toi de les entraîner, d\'ouvrir des packs et de battre les autres clubs pour grimper jusqu\'à la <b>Ligue des Légendes</b>.</p>'+
    '<input id="clName" maxlength="22" placeholder="Nom du club (ex. FC Épône)" value="'+esc(ui.clNm||'')+'">'+
    '<div class="cl-pick">'+CRESTS.map(x=>'<button class="'+(x===e?'on':'')+'" data-cle="'+x+'">'+x+'</button>').join('')+'</div>'+
    '<div class="cl-pick">'+COLS.map((c,i)=>'<button class="cl-col'+(i===ci?' on':'')+'" data-clc="'+i+'" style="background:linear-gradient(135deg,'+c[0]+' 50%,'+c[1]+' 50%)"></button>').join('')+'</div>'+
    '<button class="cl-go" data-clcreate="1">🚀 Fonder mon club</button></div></div>'}
function vHome(){const c=C(),en=energy(),inc=income(),up=25000*c.st*c.st,ne=nextEn();
  const last=(c.hist||[]).slice(-5).reverse();
  return '<button class="cl-play" data-clplay="1"'+(en<1?' disabled':'')+'><b>▶ JOUER UN MATCH</b><span>'+(en>0?'⚡ '+en+'/5 énergie':'⚡ Prochaine énergie dans '+Math.ceil(ne/60e3)+' min')+'</span></button>'+
    (en<5?'<p class="cl-en">⚡ +1 énergie toutes les 20 min'+(en<1?' · <button class="cl-link" data-clrefill="1">Recharger (2 000 💎)</button>':'')+'</p>':'')+
    '<div class="cl-grid"><div class="cl-tile"><i>🏟️</i><b>Stade niv. '+c.st+'</b><span>'+nf(800*c.st)+' 🪙 / heure (8 h max)</span><button class="cl-sbtn" data-clcollect="1"'+(inc<1?' disabled':'')+'>Récupérer '+nf(inc)+' 🪙</button>'+(c.st<10?'<button class="cl-sbtn alt" data-clstade="1">Agrandir · '+nf(up)+' 🪙</button>':'<small>Niveau maximum</small>')+'</div>'+
    '<div class="cl-tile"><i>📊</i><b>Saison</b><span>'+(c.w||0)+' V · '+(c.d||0)+' N · '+(c.l||0)+' D</span>'+(last.length?'<div class="cl-form">'+last.map(h=>'<i class="fm fm-'+h.r+'">'+h.r+'</i>').join('')+'</div>':'<small>Joue ton premier match !</small>')+'</div></div>'+
    '<div class="cl-help"><b>Comment progresser ?</b><ul><li>🏆 Victoire = 3 pts, nul = 1 pt. <b>30 pts</b> pour monter de division.</li><li>🎁 Un <b>pack gratuit</b> chaque jour, et des packs à acheter avec tes pièces ou tes diamants.</li><li>💪 Entraîne tes joueurs dans <b>Équipe</b> pour augmenter leur note.</li><li>🏟️ Ton stade te rapporte des pièces même quand tu ne joues pas.</li></ul></div>'}
function vTeam(){const c=C(),L=lineup(),sel=ui.clSel;
  const pitch='<div class="cl-pitch">'+[[8,9,10],[5,6,7],[1,2,3,4],[0]].map(row=>'<div class="cl-row">'+row.map(i=>{const x=L[i];
    return '<button class="cl-slot'+(sel===i?' sel':'')+'" data-clslot="'+i+'">'+(x.pl?card(x.pl,{sm:1}):'<div class="cl-card sm empty">+</div>')+(x.pl&&x.pl.p!==x.pos?'<em class="cl-bad">'+x.pos+' −15</em>':'')+'</button>'}).join('')+'</div>').join('')+'</div>';
  const inXI=new Set(c.xi);
  let bench=c.sq.filter(p=>!inXI.has(p.id));if(sel!=null)bench=bench.sort((a,b)=>(b.p===SLOTS[sel])-(a.p===SLOTS[sel])||b.r-a.r);else bench=bench.sort((a,b)=>b.r-a.r);
  const info=sel!=null?'<p class="cl-hint">Choisis un remplaçant pour le poste de <b>'+POSN[SLOTS[sel]]+'</b>, ou <button class="cl-link" data-clslot="'+sel+'">annuler</button>.</p>':'<p class="cl-hint">Touche un joueur du terrain pour le remplacer. <button class="cl-link" data-clauto="1">⚡ Meilleure équipe auto</button></p>';
  return pitch+info+'<h3 class="cl-h3">Effectif ('+c.sq.length+'/40)</h3><div class="cl-bench">'+bench.map(p=>{const cost=2000*(p.t+1),cap=RAR[p.k].cap;
    return '<div class="cl-bp">'+card(p,{sm:1,attr:sel!=null?' data-clsub="'+p.id+'"':''})+'<div class="cl-bpa">'+(sel!=null?'<button class="cl-sbtn" data-clsub="'+p.id+'">Faire entrer</button>':'<button class="cl-sbtn" data-cltrain="'+p.id+'"'+(p.r>=cap?' disabled':'')+'>'+(p.r>=cap?'Max':'💪 +1 · '+nf(cost)+' 🪙')+'</button><button class="cl-sbtn alt" data-clsell="'+p.id+'">Vendre '+nf(RAR[p.k].sell)+' 🪙</button>')+'</div></div>'}).join('')+'</div>'+
    '<h3 class="cl-h3">Titulaires</h3><div class="cl-bench">'+L.filter(x=>x.pl).map(x=>{const p=x.pl,cost=2000*(p.t+1),cap=RAR[p.k].cap;return '<div class="cl-bp">'+card(p,{sm:1})+'<div class="cl-bpa"><button class="cl-sbtn" data-cltrain="'+p.id+'"'+(p.r>=cap?' disabled':'')+'>'+(p.r>=cap?'Max':'💪 +1 · '+nf(cost)+' 🪙')+'</button></div></div>'}).join('')+'</div>'}
function vPacks(){const c=C();
  return '<div class="cl-packs">'+PACKS.map(p=>{const free=p.cur==='free',ok=free?c.free!==today():(p.cur==='c'?state.coins:state.diamonds)>=p.cost;
    return '<div class="cl-pack pk-'+p.id+'"><div class="pk-ic">'+p.ic+'</div><b>'+p.n+'</b><span>'+p.desc+'</span><small>'+Object.entries(p.odds).map(([k,v])=>RAR[k].n+' '+String(v).replace('.',',')+' %').join(' · ')+'</small>'+
      '<button class="cl-sbtn" data-clpack="'+p.id+'"'+(ok?'':' disabled')+'>'+(free?(ok?'Ouvrir gratuitement':'Revient demain'):'Ouvrir · '+nf(p.cost)+' '+(p.cur==='c'?'🪙':'💎'))+'</button></div>'}).join('')+'</div>'+
    '<p class="cl-hint">Effectif limité à 40 joueurs : vends les joueurs en trop dans <b>Équipe</b>.</p>'}
function vBoard(){
  if(!ui.clBoard){loadBoard();return '<p class="cl-hint">Chargement du classement…</p>'}
  if(ui.clBoard==='off')return '<p class="cl-hint">Le classement des clubs n\'est pas encore activé.</p>';
  const me=session&&session.pseudo;
  return '<div class="cl-board">'+ui.clBoard.map((x,i)=>'<div class="cl-br'+(x.pseudo===me?' me':'')+'"><em>'+(i+1)+'</em><i style="background:linear-gradient(135deg,'+esc(x.c1||'#333')+' 50%,'+esc(x.c2||'#999')+' 50%)">'+esc(x.e||'⚽')+'</i><span><b>'+esc(x.n||'Club')+'</b><small>'+esc(x.pseudo)+' · '+DIVN[x.div||10]+(x.tr?' · 🏆×'+x.tr:'')+'</small></span><strong>'+(x.pts||0)+' pts<small>note '+(x.note||0)+'</small></strong></div>').join('')+'</div>'}
async function loadBoard(){try{ui.clBoard=await rpc('club_classement',{})||[]}catch(e){ui.clBoard='off'}if(ui.tab==='club')renderView()}

/* ---------- packs ---------- */
function openPack(id){const c=C(),p=PACKS.find(x=>x.id===id);if(!p)return;
  if(p.cur==='free'){if(c.free===today())return;c.free=today()}
  else if(p.cur==='c'){if(state.coins<p.cost)return;state.coins-=p.cost}
  else{if(state.diamonds<p.cost)return;state.diamonds-=p.cost;state.spent=(state.spent||0)+p.cost}
  const got=[];for(let i=0;i<p.nb;i++){let k=rollK(p.odds);if(p.id==='legende'&&i===0&&k!=='i')k='l';got.push(mk(k,rollPos()))}
  got.sort((a,b)=>'bao li'.indexOf(a.k)-'bao li'.indexOf(b.k));
  c.sq.push(...got);const over=c.sq.length-40;
  if(over>0){const L=c.sq.filter(x=>!c.xi.includes(x.id)&&!got.includes(x)).sort((a,b)=>a.r-b.r).slice(0,over);let v=0;for(const x of L){v+=RAR[x.k].sell;c.sq.splice(c.sq.indexOf(x),1)}state.coins+=v;if(v)toast('Effectif plein : '+L.length+' joueur(s) vendu(s) automatiquement (+'+nf(v)+' 🪙)')}
  csave();renderHeader();packShow(got,p)}
function packShow(got,p){const ov=document.createElement('div');ov.className='cl-pov';
  ov.innerHTML='<div class="pov-t">'+p.ic+' '+p.n+'</div><div class="pov-cards">'+got.map((x,i)=>'<div class="pov-c" data-i="'+i+'"><div class="pov-in"><div class="pov-back k-'+x.k+'"><span>?</span></div><div class="pov-front">'+card(x)+'</div></div></div>').join('')+'</div><p class="pov-h">Touche les cartes pour les retourner</p><button class="cl-go pov-ok" style="display:none">Super !</button>';
  document.body.appendChild(ov);let n=0;
  const flip=el=>{if(el.classList.contains('fl'))return;const x=got[+el.dataset.i];
    if(x.k==='l'||x.k==='i'){ov.classList.add('walk','w-'+x.k);setTimeout(()=>{el.classList.add('fl');try{navigator.vibrate&&navigator.vibrate([60,40,120])}catch(e){}winFx(x.k==='i'?'fx-fireworks':'fx-gold')},900);setTimeout(()=>ov.classList.remove('walk','w-'+x.k),2200)}
    else el.classList.add('fl');
    if(++n===got.length){ov.querySelector('.pov-h').textContent=got.some(x=>x.k==='l'||x.k==='i')?'🔥 Énorme tirage !':'Ajoutés à ton effectif';ov.querySelector('.pov-ok').style.display=''}};
  ov.addEventListener('click',e=>{const c=e.target.closest('.pov-c');if(c)flip(c);if(e.target.closest('.pov-ok')){ov.remove();ui.cv='team';renderView()}});
  setTimeout(()=>ov.classList.add('in'),20)}

/* ---------- adversaires ---------- */
function bot(note,used){const n=Math.max(45,Math.min(95,note+R(9)-4)),v=()=>Math.max(40,Math.min(99,n+R(7)-3)),ci=R(COLS.length);let nm=pick(BOTN),k=0;while(used&&used.has(nm)&&k++<20)nm=pick(BOTN);used&&used.add(nm);
  return{bot:1,pseudo:'IA',n:nm,e:pick(CRESTS),c1:COLS[ci][0],c2:COLS[ci][1],note:n,att:v(),mid:v(),def:v(),gk:v(),div:C().div,noms:[0,1,2,3,4,5].map(()=>pick(PRE).slice(0,1)+'. '+pick(NOMS)[0])}}
async function choose(){const c=C();if(energy()<1){toast('Plus d\'énergie : reviens dans quelques minutes ⚡');return}
  const me=notes().note;let L=[];
  try{L=(await rpc('club_adversaires',{p_token:session.token,p_note:me}))||[]}catch(e){}
  L=L.filter(x=>x&&x.n&&x.note).slice(0,3);const used=new Set(L.map(x=>x.n));while(L.length<3)L.push(bot(me,used));
  ui.clOpp=L;
  popup('<div class="pop-ic big">⚔️</div><h3>Choisis ton adversaire</h3><div class="cl-opps">'+L.map((o,i)=>{const d=o.note-me;
    return '<button class="cl-opp" data-clopp="'+i+'"><i style="background:linear-gradient(135deg,'+esc(o.c1)+' 50%,'+esc(o.c2)+' 50%)">'+esc(o.e)+'</i><span><b>'+esc(o.n)+'</b><small>'+(o.bot?'Club IA':'Club de '+esc(o.pseudo))+' · '+DIVN[o.div||10]+'</small></span><strong class="'+(d>3?'hard':d<-3?'easy':'mid')+'">'+o.note+'<small>'+(d>3?'Difficile':d<-3?'Facile':'Équilibré')+'</small></strong></button>'}).join('')+'</div><button class="pbtn ghost2" data-popclose="1">Annuler</button>')}

/* ---------- match ---------- */
function rng(seed){let a=seed>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function simulate(H,A,seed){const r=rng(seed),ev=[];let sh=0,sa=0;
  const pa=Math.max(.3,Math.min(.7,.5+(H.mid-A.mid)/140+.03));
  const who=(T,mine)=>{if(mine){const L=lineup().filter(x=>x.pl&&x.pos!=='G'),w=L.map(x=>x.pos==='A'?6:x.pos==='M'?3:1),t=w.reduce((a,b)=>a+b,0);let v=r()*t;for(let i=0;i<L.length;i++){v-=w[i];if(v<0)return L[i].pl.n}return L[0]?L[0].pl.n:'?'}
    const N=T.noms&&T.noms.length?T.noms:['n°9','n°10','n°7'];const x=r();return N[x<.55?Math.floor(r()*Math.min(3,N.length)):Math.floor(r()*N.length)]};
  for(let m=1;m<=90;m++){
    if(r()<.17){const home=r()<pa,T=home?H:A,O=home?A:H;
      const ps=Math.max(.3,Math.min(.8,.55+(T.att-O.def)/160)),pg=Math.max(.12,Math.min(.55,.3+(T.att-O.gk)/200));
      if(r()<ps){const p=who(T,home);if(r()<pg){if(home)sh++;else sa++;ev.push({m,s:home?1:2,t:'g',p,sc:[sh,sa]})}else ev.push({m,s:home?1:2,t:r()<.55?'sv':'ms',p})}
      else ev.push({m,s:home?1:2,t:'ch'})}
    else if(r()<.012)ev.push({m,s:r()<.5?1:2,t:'yc',p:who(r()<.5?H:A,false)})}
  return{ev,sh,sa}}
const TXT={g:['BUUUT ! {p} trompe le gardien !','BUT ! Frappe imparable de {p} !','BUT ! {p} conclut une action magnifique !','BUT ! Tête rageuse de {p} !'],sv:['Arrêt du gardien sur la frappe de {p} !','{p} tente sa chance… parade décisive !'],ms:['{p} frappe… à côté !','{p} trouve le poteau !','Énorme occasion pour {p}, ça passe au-dessus !'],ch:['Belle action collective…','Le ballon circule bien.','Centre dangereux, dégagé de justesse !','Accélération sur l\'aile !'],yc:['Carton jaune pour {p}.']};
function play(i){const o=ui.clOpp&&ui.clOpp[i];if(!o)return;ui.clOi=i;closePop();
  setTimeout(()=>popup('<div class="pop-ic big">⚽</div><h3>Comment veux-tu jouer ?</h3><p>Contre <b>'+esc(o.n)+'</b> ('+o.note+')</p><div class="cl-modes">'+
    '<button class="cl-mode main" data-clmode="live"><b>🎮 Jouer moi-même</b><small>Tu contrôles tes joueurs : joystick, passe, tir, tacle · <em>+25 % de pièces</em></small></button>'+
    '<button class="cl-mode" data-clmode="watch"><b>📺 Regarder le match</b><small>Ton équipe joue toute seule, en direct</small></button>'+
    '<button class="cl-mode" data-clmode="fast"><b>⚡ Résultat rapide</b><small>Le résumé du match en quelques secondes</small></button></div><button class="pbtn ghost2" data-popclose="1">Annuler</button>'),200)}
function cdist(a,b){const f=h=>{h=String(h||'#000').replace('#','');if(h.length===3)h=h.split('').map(x=>x+x).join('');const n=parseInt(h,16)||0;return[n>>16,n>>8&255,n&255]};const x=f(a),y=f(b);return Math.hypot(x[0]-y[0],x[1]-y[1],x[2]-y[2])}
function go(mode){const o=ui.clOpp&&ui.clOpp[ui.clOi];if(!o)return;closePop();const c=C();energy();if(c.en<1){toast('Plus d\'énergie : reviens dans quelques minutes ⚡');return}c.en--;if(c.en===4)c.enT=Date.now();csave();
  if(mode==='fast'||!window.ClMatch){quick(o);return}
  const home={n:c.n,e:c.e,c1:c.c1,c2:c.c2,pl:lineup().map(x=>({n:x.pl?x.pl.n:'Remplaçant',r:x.pl?eff(c,x.pl,x.i)+2:40}))};
  let a1=o.c1,a2=o.c2;if(cdist(a1,c.c1)<110){if(cdist(a2,c.c1)>=110){a1=o.c2;a2=o.c1}else{a1=cdist('#f8fafc',c.c1)>150?'#f8fafc':'#111827';a2=c.c1}}
  const nm=(o.noms||[]).slice(),RL=['gk','def','def','def','def','mid','mid','mid','att','att','att'],ord=[9,8,10,6,5,7,1,2,3,4,0];const names=new Array(11);
  ord.forEach((k,j)=>{names[k]=nm[j]||(pick(PRE)+' '+pick(NOMS)[0])});
  const away={n:o.n,e:o.e,c1:a1,c2:a2,pl:RL.map((k,j)=>({n:names[j],r:Math.max(40,Math.min(99,(o[k]||o.note||60)+R(5)-2))}))};
  window.ClMatch.start({mode,home,away,onEnd:(ov,res)=>finish(ov,o,{sh:res.sh,sa:res.sa},mode==='live'&&!res.abandon?1.25:1,res)})}
function quick(o){const c=C();
  const n=notes(),H={att:n.att+2,mid:n.mid+2,def:n.def+2,gk:n.gk+2},S=simulate(H,o,Date.now()%1e9);csave();
  const ov=document.createElement('div');ov.className='cl-mov';ov.style.setProperty('--h1',c.c1);ov.style.setProperty('--h2',c.c2);ov.style.setProperty('--a1',o.c1);ov.style.setProperty('--a2',o.c2);
  ov.innerHTML='<div class="mv-sb"><div class="mv-t"><i>'+c.e+'</i><b>'+esc(c.n)+'</b></div><div class="mv-sc"><b id="mvS">0 - 0</b><small id="mvM">0\'</small></div><div class="mv-t a"><i>'+esc(o.e)+'</i><b>'+esc(o.n)+'</b></div></div>'+
    '<div class="mv-pitch"><div class="mv-l"></div><div class="mv-c"></div><div class="mv-g l"></div><div class="mv-g r"></div><div class="mv-ball" id="mvB">⚽</div><div class="mv-flash" id="mvF">BUT !</div></div>'+
    '<div class="mv-feed" id="mvFeed"></div><div class="mv-ctl"><button data-mvsp="1">×1</button><button data-mvsp="3">×3</button><button data-mvsp="0">Résultat</button></div>';
  document.body.appendChild(ov);
  let t=0,sp=1,done=false,bx=50,by=50,tx=50,ty=50,ei=0,last=performance.now(),flash=0;
  const B=ov.querySelector('#mvB'),F=ov.querySelector('#mvF'),FD=ov.querySelector('#mvFeed');
  const say=(m,txt,cls)=>{const d=document.createElement('div');d.className='mv-e '+(cls||'');d.innerHTML='<em>'+m+'\'</em>'+txt;FD.prepend(d)};
  ov.addEventListener('click',e=>{const b=e.target.closest('[data-mvsp]');if(!b)return;const v=+b.dataset.mvsp;if(v===0){t=91;}else sp=v});
  const frame=now=>{if(done)return;const dt=Math.min(.1,(now-last)/1000);last=now;t+=dt*2*sp;
    while(ei<S.ev.length&&S.ev[ei].m<=t){const e=S.ev[ei++],home=e.s===1;
      if(e.t==='g'){tx=home?96:4;ty=50;flash=1.4;F.textContent='BUT ! '+(home?c.e:o.e);ov.classList.add('goal');setTimeout(()=>ov.classList.remove('goal'),700);try{navigator.vibrate&&navigator.vibrate(home?[80,50,160]:60)}catch(_){}
        ov.querySelector('#mvS').textContent=e.sc[0]+' - '+e.sc[1];say(e.m,'<b>'+pick(TXT.g).replace('{p}',esc(e.p))+'</b>','goal '+(home?'h':'a'))}
      else if(e.t==='sv'||e.t==='ms'){tx=home?88:12;ty=30+R(40);say(e.m,pick(TXT[e.t]).replace('{p}',esc(e.p)))}
      else if(e.t==='ch'){tx=home?72:28;ty=20+R(60);if(R(3)===0)say(e.m,pick(TXT.ch))}
      else if(e.t==='yc')say(e.m,'🟨 '+pick(TXT.yc).replace('{p}',esc(e.p)))}
    if(R(40)===0&&flash<=0){tx=30+R(40);ty=15+R(70)}
    bx+=(tx-bx)*Math.min(1,dt*3*sp);by+=(ty-by)*Math.min(1,dt*3*sp);B.style.left=bx+'%';B.style.top=by+'%';
    if(flash>0){flash-=dt*sp;F.style.opacity=1;if(flash<=0){F.style.opacity=0;tx=50;ty=50}}
    ov.querySelector('#mvM').textContent=Math.min(90,Math.floor(t))+'\'';
    if(t>=90){done=true;while(ei<S.ev.length){const e=S.ev[ei++];if(e.t==='g'){ov.querySelector('#mvS').textContent=e.sc[0]+' - '+e.sc[1];say(e.m,'<b>⚽ '+esc(e.p)+'</b>','goal '+(e.s===1?'h':'a'))}}setTimeout(()=>finish(ov,o,S),600);return}
    requestAnimationFrame(frame)};
  requestAnimationFrame(frame)}
function finish(ov,o,S,mult,info){const c=C(),pen=info&&info.pens&&S.sh===S.sa?info.pens:null,pw=pen?pen[0]>pen[1]:false;
  const res=pen?(pw?'V':'N'):S.sh>S.sa?'V':S.sh<S.sa?'D':'N';
  const gain=Math.round((res==='V'?1500+(10-c.div)*500:res==='N'?500:200)*(mult||1)),pts=pen?(pw?2:1):res==='V'?3:res==='N'?1:0;
  state.coins+=gain;c.pts+=pts;if(res==='V')c.w=(c.w||0)+1;else if(res==='N')c.d=(c.d||0)+1;else c.l=(c.l||0)+1;
  c.hist=(c.hist||[]).concat({r:res,s:S.sh+'-'+S.sa+(pen?' ('+pen[0]+'-'+pen[1]+' tab)':''),o:o.n,t:Date.now()}).slice(-20);
  let promo='';
  if(c.pts>=30){if(c.div>1){c.div--;c.pts=0;const b=20000*(11-c.div);state.coins+=b;promo='<div class="mv-promo">🎉 PROMOTION en <b>'+DIVN[c.div]+'</b> ! +'+nf(b)+' 🪙</div>'}
    else{c.pts=0;c.tr=(c.tr||0)+1;state.diamonds+=50000;promo='<div class="mv-promo">🏆 TROPHÉE de la Ligue des Légendes ! +50 000 💎</div>'}}
  csave();renderHeader();
  const box=document.createElement('div');box.className='mv-end '+(pen&&!pw?'D':res);
  box.innerHTML='<div class="mv-res">'+(pen?(pw?'VICTOIRE':'DÉFAITE')+'<small class="mv-tab">aux tirs au but</small>':res==='V'?'VICTOIRE':res==='N'?'MATCH NUL':'DÉFAITE')+'</div><div class="mv-fs">'+S.sh+' - '+S.sa+'</div>'+(pen?'<div class="mv-pen">Tirs au but : <b>'+pen[0]+' - '+pen[1]+'</b></div>':'')+(info&&info.scorers&&info.scorers.length?'<div class="mv-scr">'+info.scorers.map(x=>'<span class="t'+x.t+'">⚽ '+esc(x.n==='csc'?'csc':x.n.split(' ').slice(-1)[0])+' '+x.m+'\'</span>').join('')+'</div>':'')+(info&&info.live&&!info.abandon?'<div class="mv-st">Tirs '+info.shots[0]+' - '+info.shots[1]+' · Possession '+info.poss+' %</div>':'')+'<p>+'+nf(gain)+' 🪙'+(mult>1?' <small>(+25 % bonus 🎮)</small>':'')+' · +'+pts+' pt'+(pts>1?'s':'')+'</p>'+promo+
    '<div class="cl-bar big"><i style="width:'+Math.min(100,c.pts/30*100)+'%"></i></div><small>'+c.pts+' / 30 pts · '+DIVN[c.div]+'</small><div class="mv-btns"><button class="cl-go" data-mvend="again">'+(energy()>0?'▶ Rejouer ('+C().en+' ⚡)':'Plus d\'énergie')+'</button><button class="cl-go alt" data-mvend="close">Retour au club</button></div>';
  ov.appendChild(box);if(res==='V'){winFx(promo?'fx-fireworks':null)}
  box.addEventListener('click',e=>{const b=e.target.closest('[data-mvend]');if(!b)return;ov.remove();renderView();if(b.dataset.mvend==='again'&&energy()>0)choose()})}

/* ---------- actions ---------- */
document.addEventListener('click',e=>{
  const t=e.target.closest('[data-cv],[data-cle],[data-clc],[data-clcreate],[data-clplay],[data-clopp],[data-clslot],[data-clsub],[data-clauto],[data-cltrain],[data-clsell],[data-clpack],[data-clcollect],[data-clstade],[data-clrefill],[data-clopen],[data-clmode]');if(!t)return;
  const d=t.dataset,c=C();
  if(d.clopen){ui.tab='club';ui.cv='home';closePop();renderHeader();renderView();window.scrollTo(0,0);return}
  if(d.cv){ui.cv=d.cv;ui.clSel=null;if(d.cv==='board')ui.clBoard=null;renderView();return}
  if(d.cle){ui.clNm=($('#clName')||{}).value||'';ui.clE=d.cle;renderView();return}
  if(d.clc){ui.clNm=($('#clName')||{}).value||'';ui.clCol=+d.clc;renderView();return}
  if(d.clcreate){const n=(($('#clName')||{}).value||'').trim().replace(/\s+/g,' ');if(n.length<3){toast('Donne un nom à ton club (3 lettres minimum)');return}
    create(n.slice(0,22),ui.clE||'🦁',ui.clCol||0);celebrate(ui.clE||'🦁','Bienvenue au '+esc(n)+' !','Ton club est né en <b>Division 10</b>. Ouvre ton <b>pack gratuit du jour</b>, puis joue ton premier match !');renderView();return}
  if(!c)return;
  if(d.clplay){choose();return}
  if(d.clmode){go(d.clmode);return}
  if(d.clopp!=null&&d.clopp!==undefined&&t.matches('[data-clopp]')){play(+d.clopp);return}
  if(d.clslot){const i=+d.clslot;ui.clSel=ui.clSel===i?null:i;renderView();return}
  if(d.clsub&&ui.clSel!=null){const i=ui.clSel,id=d.clsub;const j=c.xi.indexOf(id);if(j>=0)c.xi[j]=c.xi[i];c.xi[i]=id;ui.clSel=null;csave();renderView();return}
  if(d.clauto){autoXI();csave();toast('⚡ Meilleure équipe alignée');renderView();return}
  if(d.cltrain){const p=byId(d.cltrain);if(!p)return;const cost=2000*(p.t+1);if(p.r>=RAR[p.k].cap)return;if(state.coins<cost){toast('Pas assez de pièces');return}
    state.coins-=cost;p.t++;p.r++;csave();renderHeader();toast('💪 '+p.n+' passe à '+p.r);renderView();return}
  if(d.clsell){const p=byId(d.clsell);if(!p)return;if(c.xi.includes(p.id)){toast('Retire-le d\'abord des titulaires');return}if(c.sq.length<=12){toast('Garde au moins 12 joueurs');return}
    c.sq.splice(c.sq.indexOf(p),1);state.coins+=RAR[p.k].sell;csave();renderHeader();toast('Vendu : +'+nf(RAR[p.k].sell)+' 🪙');renderView();return}
  if(d.clpack){openPack(d.clpack);return}
  if(d.clcollect){const v=income();if(v<1)return;state.coins+=v;c.inT=Date.now();csave();renderHeader();toast('🏟️ +'+nf(v)+' 🪙 de recettes');renderView();return}
  if(d.clstade){const up=25000*c.st*c.st;if(c.st>=10)return;if(state.coins<up){toast('Pas assez de pièces');return}const v=income();state.coins+=v-up;c.inT=Date.now();c.st++;csave();renderHeader();celebrate('🏟️','Stade agrandi !','Niveau <b>'+c.st+'</b> : il rapporte maintenant <b>'+nf(800*c.st)+' 🪙 par heure</b>.');renderView();return}
  if(d.clrefill){if(state.diamonds<2000){toast('Pas assez de diamants');return}state.diamonds-=2000;state.spent=(state.spent||0)+2000;c.en=5;c.enT=Date.now();csave();renderHeader();toast('⚡ Énergie rechargée !');renderView();return}
},true);
setInterval(()=>{if(ui.tab==='club'&&C()&&(ui.cv||'home')==='home'&&document.visibilityState==='visible'&&!document.querySelector('.cl-mov,.cl-pov,#popModal.open'))renderView()},30000);

window.renderClub=renderClub;window._clSim=simulate;
window.clubBanner=function(){if(!session)return '';const c=C();
  if(!c)return '<button class="cl-ban" data-clopen="1"><span class="cl-new">NOUVEAU</span><i>⚽</i><span><b>Mon Club</b><small>Crée ton club, ouvre des packs et affronte les autres joueurs</small></span><em>›</em></button>';
  energy();const free=c.free!==today();
  return '<button class="cl-ban on" data-clopen="1" style="--c1:'+c.c1+';--c2:'+c.c2+'"><i>'+c.e+'</i><span><b>'+esc(c.n)+'</b><small>'+DIVN[c.div]+' · '+c.pts+'/30 pts · ⚡ '+c.en+'/5'+(free?' · 🎁 pack gratuit !':'')+'</small></span><em>Jouer ›</em></button>'};
})();
/* ---------- styles ---------- */
(function(){const css=`
.cl-wrap{padding:0 0 30px}
.cl-ban{position:relative;display:flex;align-items:center;gap:12px;width:100%;text-align:left;border:0;cursor:pointer;color:#fff;border-radius:20px;padding:14px 16px;margin:0 0 14px;background:linear-gradient(135deg,#064e3b,#047857 45%,#22c55e);box-shadow:0 12px 28px rgba(4,120,87,.35);overflow:hidden}
.cl-ban.on{background:linear-gradient(135deg,var(--c1) 0%,color-mix(in srgb,var(--c1) 55%,#000) 100%)}
.cl-ban>i{font-style:normal;font-size:34px;width:52px;height:52px;display:grid;place-items:center;background:rgba(255,255,255,.16);border-radius:16px;flex:none}
.cl-ban span b{display:block;font-size:17px;font-weight:900}.cl-ban span small{font-size:12.5px;opacity:.9}
.cl-ban em{margin-left:auto;font-style:normal;font-weight:900;white-space:nowrap}
.cl-new{position:absolute;top:8px;right:12px;font-size:10px;font-weight:900;background:#facc15;color:#111;border-radius:999px;padding:3px 8px;animation:grPulse 1.4s infinite}
.cl-intro{text-align:center;padding:20px 8px}.cl-big{font-size:64px}.cl-intro h2{margin:6px 0}.cl-intro p{opacity:.85;line-height:1.5}
.cl-intro input{width:100%;margin:14px 0 8px;padding:14px;border-radius:14px;border:2px solid var(--line,#e3e6ee);font-size:17px;font-weight:700;background:var(--card,#fff);color:inherit}
.cl-pick{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:8px 0}
.cl-pick button{width:46px;height:46px;border-radius:14px;border:2px solid transparent;background:var(--card2,#f1f3f8);font-size:24px;cursor:pointer}
.cl-pick button.on{border-color:#16a34a;transform:scale(1.08)}.cl-col{border:2px solid rgba(0,0,0,.1)!important}.cl-col.on{border-color:#16a34a!important}
.cl-go{display:block;width:100%;border:0;border-radius:16px;padding:15px;font-size:17px;font-weight:900;color:#06281a;background:linear-gradient(90deg,#4ade80,#facc15);box-shadow:0 10px 24px rgba(34,197,94,.35);cursor:pointer;margin-top:12px}
.cl-go.alt{background:rgba(255,255,255,.15);color:#fff;box-shadow:none}
.cl-head{display:flex;align-items:center;gap:12px;color:#fff;border-radius:22px;padding:14px;margin-bottom:10px;background:linear-gradient(135deg,var(--c1),color-mix(in srgb,var(--c1) 45%,#000));box-shadow:0 12px 28px rgba(0,0,0,.2)}
.cl-crest{width:58px;height:58px;border-radius:18px;display:grid;place-items:center;font-size:34px;background:var(--c2);box-shadow:inset 0 0 0 3px rgba(255,255,255,.35)}
.cl-hn{flex:1;min-width:0}.cl-hn b{display:block;font-size:19px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cl-hn span{font-size:12.5px;opacity:.9}.cl-hn small{font-size:11px;opacity:.8}
.cl-bar{height:8px;border-radius:8px;background:rgba(255,255,255,.25);margin:6px 0 3px;overflow:hidden}.cl-bar i{display:block;height:100%;background:linear-gradient(90deg,#facc15,#4ade80);border-radius:8px}
.cl-bar.big{height:12px;margin:12px 0 4px}
.cl-note{text-align:center;background:rgba(0,0,0,.25);border-radius:14px;padding:6px 10px}.cl-note b{display:block;font-size:26px;font-weight:900;line-height:1}.cl-note small{font-size:9px;font-weight:800;opacity:.8}
.cl-tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:12px}
.cl-tabs button{position:relative;border:0;border-radius:14px;padding:8px 2px;background:var(--card,#fff);color:inherit;font-size:20px;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.06)}
.cl-tabs button span{display:block;font-size:11.5px;font-weight:800}.cl-tabs button.on{background:#111827;color:#fff}
.cl-tabs em{position:absolute;top:6px;right:10px;width:9px;height:9px;border-radius:50%;background:#ef4444}
.cl-play{display:block;width:100%;border:0;border-radius:20px;padding:18px;cursor:pointer;color:#fff;background:linear-gradient(135deg,#16a34a,#065f46);box-shadow:0 14px 30px rgba(22,163,74,.4);animation:clPulse 2.2s ease-in-out infinite}
.cl-play b{display:block;font-size:22px;font-weight:900;letter-spacing:.02em}.cl-play span{font-size:13px;opacity:.9}.cl-play:disabled{filter:grayscale(.8);animation:none;opacity:.7}
@keyframes clPulse{50%{transform:scale(1.02)}}
.cl-en{text-align:center;font-size:12.5px;opacity:.75;margin:6px 0}
.cl-link{border:0;background:none;color:#7c3aed;font-weight:800;cursor:pointer;padding:0;font-size:inherit}
.cl-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
.cl-tile{background:var(--card,#fff);border-radius:18px;padding:12px;box-shadow:0 2px 8px rgba(0,0,0,.06);display:flex;flex-direction:column;gap:4px}
.cl-tile i{font-style:normal;font-size:26px}.cl-tile b{font-size:15px}.cl-tile span,.cl-tile small{font-size:12px;opacity:.75}
.cl-form{display:flex;gap:2px}
.cl-sbtn{border:0;border-radius:10px;padding:8px 6px;font-size:12px;font-weight:800;cursor:pointer;color:#fff;background:linear-gradient(90deg,#16a34a,#15803d);margin-top:4px;width:100%}
.cl-sbtn.alt{background:var(--card2,#eef0f5);color:inherit}.cl-sbtn:disabled{opacity:.45;cursor:default}
.cl-help{margin-top:12px;background:var(--card2,#f4f6fa);border-radius:16px;padding:12px;font-size:13px}.cl-help ul{margin:6px 0 0;padding-left:18px;line-height:1.6}
.cl-pitch{border-radius:20px;padding:12px 6px;background:repeating-linear-gradient(0deg,#15803d 0 34px,#16a34a 34px 68px);box-shadow:inset 0 0 0 3px rgba(255,255,255,.35);display:grid;gap:8px}
.cl-row{display:flex;justify-content:center;gap:6px}
.cl-slot{position:relative;border:0;background:none;padding:0;cursor:pointer}.cl-slot.sel .cl-card{outline:3px solid #facc15;transform:scale(1.06)}
.cl-bad{position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);font-style:normal;font-size:9px;font-weight:900;background:#dc2626;color:#fff;border-radius:6px;padding:1px 4px;white-space:nowrap}
.cl-card{width:96px;border-radius:14px 14px 22px 22px;padding:6px 6px 8px;text-align:center;color:#111;position:relative;box-shadow:0 6px 14px rgba(0,0,0,.25);background:linear-gradient(160deg,#f3d6b6,#b87333)}
.cl-card.k-a{background:linear-gradient(160deg,#f1f5f9,#94a3b8)}.cl-card.k-o{background:linear-gradient(160deg,#fff4c2,#e6b422)}
.cl-card.k-l{background:linear-gradient(160deg,#f5d0fe,#7e22ce);color:#fff}.cl-card.k-i{background:linear-gradient(160deg,#cffafe,#0891b2 45%,#1e1b4b);color:#fff;box-shadow:0 0 18px rgba(0,229,255,.7)}
.cl-card.k-l::after,.cl-card.k-i::after{content:"";position:absolute;inset:0;border-radius:inherit;background:linear-gradient(110deg,transparent 35%,rgba(255,255,255,.45) 50%,transparent 65%);background-size:250% 100%;animation:clGlint 2.6s linear infinite;pointer-events:none}
@keyframes clGlint{from{background-position:150% 0}to{background-position:-100% 0}}
.cc-top{display:flex;align-items:center;justify-content:space-between}.cc-top b{font-size:22px;font-weight:900;line-height:1}.cc-top span{font-size:11px;font-weight:900}.cc-top i{font-style:normal}
.cc-face{font-size:30px;margin:2px 0 3px;line-height:0}.cc-av{width:70px;height:65px;filter:drop-shadow(0 2px 2px rgba(0,0,0,.2))}.cl-card.sm .cc-av{width:48px;height:45px}.cc-n{font-size:12px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cc-k{font-size:9px;font-weight:800;opacity:.75;text-transform:uppercase;letter-spacing:.08em}
.cl-card.sm{width:66px;padding:4px 4px 6px}.cl-card.sm .cc-top b{font-size:16px}.cl-card.sm .cc-face{margin:1px 0}.cl-card.sm .cc-n{font-size:10px}.cl-card.sm .cc-k{display:none}
.cl-card.empty{display:grid;place-items:center;height:82px;font-size:26px;background:rgba(255,255,255,.35)}
.cl-hint{font-size:12.5px;opacity:.8;text-align:center;margin:10px 0}
.cl-h3{font-size:15px;margin:14px 0 8px}
.cl-bench{display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:10px}
.cl-bp{display:flex;flex-direction:column;align-items:center;gap:2px}.cl-bpa{width:100%}
.cl-packs{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.cl-pack{border-radius:18px;padding:12px;text-align:center;color:#fff;display:flex;flex-direction:column;gap:3px;background:linear-gradient(160deg,#334155,#0f172a);box-shadow:0 8px 20px rgba(0,0,0,.18)}
.cl-pack.pk-free{background:linear-gradient(160deg,#22c55e,#065f46)}.cl-pack.pk-bronze{background:linear-gradient(160deg,#d6a46b,#7c4a1e)}.cl-pack.pk-argent{background:linear-gradient(160deg,#cbd5e1,#475569)}
.cl-pack.pk-or{background:linear-gradient(160deg,#fde68a,#b45309)}.cl-pack.pk-legende{background:linear-gradient(160deg,#c084fc,#3b0764);grid-column:span 2}
.pk-ic{font-size:36px}.cl-pack b{font-size:15px}.cl-pack span{font-size:12px;opacity:.9}.cl-pack small{font-size:10px;opacity:.8;line-height:1.35}
.cl-pov{position:fixed;inset:0;z-index:10060;background:radial-gradient(circle at 50% 40%,#312e81,#020617 70%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;opacity:0;transition:opacity .3s}
.cl-pov.in{opacity:1}.pov-t{color:#fff;font-size:22px;font-weight:900}.pov-h{color:#fff;opacity:.85;font-weight:700}
.pov-cards{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;padding:0 10px}
.pov-c{width:104px;height:150px;perspective:800px;cursor:pointer}.pov-in{position:relative;width:100%;height:100%;transition:transform .7s cubic-bezier(.2,.8,.2,1.2);transform-style:preserve-3d}
.pov-c.fl .pov-in{transform:rotateY(180deg)}
.pov-back,.pov-front{position:absolute;inset:0;backface-visibility:hidden;display:grid;place-items:center}
.pov-front{transform:rotateY(180deg)}.pov-front .cl-card{width:104px}
.pov-back{border-radius:16px;background:linear-gradient(160deg,#1e293b,#020617);border:3px solid rgba(255,255,255,.25);animation:povShake 1.2s ease-in-out infinite}
.pov-back span{font-size:40px;color:#fff;font-weight:900}
.pov-back.k-l,.pov-back.k-i{animation:povShake .5s ease-in-out infinite;box-shadow:0 0 30px rgba(168,85,247,.9)}.pov-back.k-i{box-shadow:0 0 34px rgba(0,229,255,1)}
@keyframes povShake{0%,100%{transform:rotate(0)}25%{transform:rotate(-2deg)}75%{transform:rotate(2deg)}}
.cl-pov.walk::before{content:"";position:absolute;inset:0;background:conic-gradient(from 0deg,transparent,rgba(168,85,247,.55),transparent 20%,rgba(250,204,21,.5),transparent 45%);animation:povSpin 2s linear infinite;pointer-events:none}
.cl-pov.w-i::before{background:conic-gradient(from 0deg,transparent,rgba(0,229,255,.6),transparent 20%,rgba(255,255,255,.5),transparent 45%)}
@keyframes povSpin{to{transform:rotate(360deg)}}
.pov-ok{max-width:260px}
.cl-opps{display:grid;gap:8px;margin:10px 0}
.cl-modes{display:grid;gap:8px;margin:12px 0}.cl-mode{display:block;text-align:left;border:0;border-radius:16px;padding:12px 14px;background:var(--card2,#f4f6fa);color:inherit;cursor:pointer}
.cl-mode b{display:block;font-size:16px;font-weight:900}.cl-mode small{font-size:12.5px;opacity:.8}.cl-mode em{font-style:normal;font-weight:900;color:#16a34a}
.cl-mode.main{background:linear-gradient(135deg,#065f46,#16a34a);color:#fff;box-shadow:0 10px 24px rgba(22,163,74,.35)}.cl-mode.main small{opacity:.95}.cl-mode.main em{color:#fde047}
.mv-scr{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin:4px 0 6px;max-width:340px}.mv-scr span{font-size:12px;font-weight:800;padding:3px 8px;border-radius:999px;background:rgba(74,222,128,.18)}.mv-scr span.t1{background:rgba(248,113,113,.18)}
.mv-st{font-size:12.5px;opacity:.8;margin-bottom:4px}.mv-tab{display:block;font-size:15px;opacity:.85;letter-spacing:0}.mv-pen{font-size:16px;margin:-4px 0 6px}.mv-pen b{color:#facc15}.cm-ov .mv-end{z-index:10}
.cl-opp{display:flex;align-items:center;gap:10px;border:0;border-radius:16px;padding:10px 12px;background:var(--card2,#f4f6fa);color:inherit;cursor:pointer;text-align:left}
.cl-opp i,.cl-br i{font-style:normal;width:42px;height:42px;border-radius:12px;display:grid;place-items:center;font-size:22px;flex:none}
.cl-opp span{flex:1;min-width:0}.cl-opp b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cl-opp small{font-size:11.5px;opacity:.7}
.cl-opp strong{text-align:center;font-size:20px}.cl-opp strong small{display:block;font-size:10px}.cl-opp .hard{color:#dc2626}.cl-opp .easy{color:#16a34a}.cl-opp .mid{color:#d97706}
.cl-mov{position:fixed;inset:0;z-index:10060;background:#0b1220;color:#fff;display:flex;flex-direction:column;padding:calc(10px + env(safe-area-inset-top)) 10px 10px}
.mv-sb{display:flex;align-items:center;gap:8px;background:#111827;border-radius:16px;padding:10px}
.mv-t{flex:1;display:flex;align-items:center;gap:6px;min-width:0}.mv-t.a{flex-direction:row-reverse;text-align:right}
.mv-t i{font-style:normal;font-size:22px;width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:var(--h2);flex:none}.mv-t.a i{background:var(--a2)}
.mv-t b{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mv-sc{text-align:center}.mv-sc b{display:block;font-size:30px;font-weight:900;font-variant-numeric:tabular-nums}.mv-sc small{font-size:12px;opacity:.7}
.cl-mov.goal .mv-sc b{animation:mvPop .7s ease}@keyframes mvPop{30%{transform:scale(1.4);color:#facc15}}
.mv-pitch{position:relative;height:44vh;max-height:340px;margin:10px 0;border-radius:18px;overflow:hidden;background:repeating-linear-gradient(90deg,#15803d 0 9%,#16a34a 9% 18%);box-shadow:inset 0 0 0 3px rgba(255,255,255,.5)}
.mv-l{position:absolute;left:50%;top:0;bottom:0;width:3px;background:rgba(255,255,255,.55);transform:translateX(-50%)}
.mv-c{position:absolute;left:50%;top:50%;width:70px;height:70px;border:3px solid rgba(255,255,255,.55);border-radius:50%;transform:translate(-50%,-50%)}
.mv-g{position:absolute;top:32%;bottom:32%;width:16px;border:3px solid rgba(255,255,255,.8);background:rgba(255,255,255,.12)}.mv-g.l{left:-3px;border-left:0}.mv-g.r{right:-3px;border-right:0}
.mv-ball{position:absolute;left:50%;top:50%;font-size:22px;transform:translate(-50%,-50%);filter:drop-shadow(0 3px 3px rgba(0,0,0,.4));transition:none}
.mv-flash{position:absolute;inset:0;display:grid;place-items:center;font-size:44px;font-weight:900;color:#facc15;text-shadow:0 4px 18px rgba(0,0,0,.6);opacity:0;pointer-events:none;transition:opacity .2s}
.mv-feed{flex:1;overflow:auto;display:flex;flex-direction:column;gap:6px;padding:4px}
.mv-e{background:#111827;border-radius:12px;padding:8px 10px;font-size:13.5px;animation:mvIn .35s ease}.mv-e em{font-style:normal;font-weight:900;color:#94a3b8;margin-right:8px}
.mv-e.goal.h{background:linear-gradient(90deg,#166534,#111827)}.mv-e.goal.a{background:linear-gradient(90deg,#7f1d1d,#111827)}
@keyframes mvIn{from{opacity:0;transform:translateY(-6px)}}
.mv-ctl{display:flex;gap:6px;padding-top:6px}.mv-ctl button{flex:1;border:0;border-radius:12px;padding:10px;font-weight:900;background:#1f2937;color:#fff;cursor:pointer}
.mv-end{position:absolute;inset:0;background:rgba(2,6,23,.92);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:20px;animation:mvIn .4s ease}
.mv-res{font-size:34px;font-weight:900;letter-spacing:.04em}.mv-end.V .mv-res{color:#4ade80}.mv-end.D .mv-res{color:#f87171}.mv-end.N .mv-res{color:#facc15}
.mv-fs{font-size:56px;font-weight:900}.mv-end p{font-size:17px;font-weight:800}
.mv-promo{margin:10px 0;padding:12px 16px;border-radius:16px;background:linear-gradient(90deg,#facc15,#f97316);color:#111;font-weight:800;animation:clPulse 1.2s infinite}
.mv-end .cl-bar{width:80%}.mv-btns{width:100%;max-width:340px}
.cl-board{display:grid;gap:6px}
.cl-br{display:flex;align-items:center;gap:10px;background:var(--card,#fff);border-radius:14px;padding:8px 10px;box-shadow:0 1px 4px rgba(0,0,0,.05)}.cl-br.me{outline:2px solid #16a34a}
.cl-br em{font-style:normal;font-weight:900;width:22px;text-align:center}.cl-br span{flex:1;min-width:0}.cl-br b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cl-br small{font-size:11px;opacity:.7}
.cl-br strong{text-align:right;font-size:14px}.cl-br strong small{display:block}
`;const st=document.createElement('style');st.textContent=css;document.head.appendChild(st)})();
