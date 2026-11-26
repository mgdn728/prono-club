/* PronoClub — Mon Club : match jouable en vue du dessus (joystick + Passe / Tir / Tacle) */
(function(){
'use strict';
const PW=68,PL=105,GW=7.32,GH=2.44,CX=34,HALF=90;
const FORM=[[.5,.03],[.13,.2],[.37,.15],[.63,.15],[.87,.2],[.27,.4],[.5,.33],[.73,.4],[.17,.64],[.5,.7],[.83,.64]];
const KOA=[[.5,.03],[.13,.2],[.37,.15],[.63,.15],[.87,.2],[.27,.36],[.5,.33],[.73,.36],[.22,.47],[.5,.5],[.78,.47]];
const KOD=[[.5,.03],[.13,.2],[.37,.15],[.63,.15],[.87,.2],[.27,.33],[.5,.3],[.73,.33],[.2,.4],[.5,.41],[.8,.4]];
const ROLE=['G','D','D','D','D','M','M','M','A','A','A'];
const SKIN=['#f1c9a5','#e0ac80','#c68955','#a0693e','#7a4a28','#5a3519'],HAIR=['#1f1a17','#3b2416','#6b4423','#a0703a','#d8b25a','#111'];
const cl=(v,a,b)=>v<a?a:v>b?b:v,hyp=Math.hypot,rnd=Math.random;
const W2=(t,xn,yn)=>t===0?[xn*PW,PL*(1-yn)]:[(1-xn)*PW,PL*yn];
const YN=(t,y)=>t===0?1-y/PL:y/PL,XN=(t,x)=>t===0?x/PW:1-x/PW;
const goalY=t=>t===0?0:PL,ownY=t=>t===0?PL:0,fwd=t=>t===0?-1:1;
const gauss=()=>(rnd()+rnd()+rnd()-1.5)/1.5;
function hash(s){let h=7;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return Math.abs(h)}
function gkCol(c){const y=/^#(f|e|d)[0-9a-f](f|e|d|c)/i.test(c);return y?'#22d3ee':'#facc15'}
function shade(hex,f){let h=hex.replace('#','');if(h.length===3)h=h.split('').map(x=>x+x).join('');const n=parseInt(h,16);let r=n>>16,g=n>>8&255,b=n&255;
  r=cl(Math.round(r*f),0,255);g=cl(Math.round(g*f),0,255);b=cl(Math.round(b*f),0,255);return 'rgb('+r+','+g+','+b+')'}

/* ---------- son du stade (synthétisé, aucun fichier) ---------- */
function mkSound(){let ac=null,on=true,cg=null,cf=null,lvl=.16,master=null;try{on=localStorage.getItem('cm_snd')!=='0'}catch(e){}
  function init(){if(ac)return;try{ac=new(window.AudioContext||window.webkitAudioContext)()}catch(e){return}
    master=ac.createGain();master.gain.value=on?1:0;master.connect(ac.destination);
    const len=ac.sampleRate*4,b=ac.createBuffer(2,len,ac.sampleRate);
    for(let ch=0;ch<2;ch++){const d=b.getChannelData(ch);let l=0;for(let i=0;i<len;i++){const w=Math.random()*2-1;l=(l+.03*w)/1.03;d[i]=l*4*(1+.25*Math.sin(i/ac.sampleRate*2*Math.PI*(.3+ch*.07)))}}
    const src=ac.createBufferSource();src.buffer=b;src.loop=true;cf=ac.createBiquadFilter();cf.type='bandpass';cf.frequency.value=650;cf.Q.value=.5;cg=ac.createGain();cg.gain.value=lvl;
    src.connect(cf);cf.connect(cg);cg.connect(master);src.start()}
  function env(g,t0,a,peak,d){g.gain.setValueAtTime(0.0001,t0);g.gain.exponentialRampToValueAtTime(peak,t0+a);g.gain.exponentialRampToValueAtTime(0.0001,t0+a+d)}
  function noise(dur,f,q,peak,a,at){if(!ac)return;const t=ac.currentTime+(at||0),n=ac.sampleRate*dur,b=ac.createBuffer(1,n,ac.sampleRate),d=b.getChannelData(0);for(let i=0;i<n;i++)d[i]=Math.random()*2-1;
    const s=ac.createBufferSource();s.buffer=b;const fl=ac.createBiquadFilter();fl.type='bandpass';fl.frequency.value=f;fl.Q.value=q;const g=ac.createGain();env(g,t,a||.02,peak,dur-(a||.02));s.connect(fl);fl.connect(g);g.connect(master);s.start(t);s.stop(t+dur+.05)}
  function tone(f0,f1,dur,peak,type,at){if(!ac)return;const t=ac.currentTime+(at||0),o=ac.createOscillator(),g=ac.createGain();o.type=type||'sine';o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(f1,t+dur);env(g,t,.005,peak,dur);o.connect(g);g.connect(master);o.start(t);o.stop(t+dur+.05)}
  function clapBuf(dur,events){const sr=ac.sampleRate,n=Math.floor(sr*dur),b=ac.createBuffer(1,n,sr),d=b.getChannelData(0);
    for(const ev of events){const s=Math.floor(ev[0]*sr),L=Math.floor(sr*(.01+Math.random()*.018)),a=ev[1];for(let i=0;i<L;i++){const k=s+i;if(k>=0&&k<n)d[k]+=(Math.random()*2-1)*a*Math.exp(-i/(L*.3))}}return b}
  function playBuf(b,peak,at,f){const t=ac.currentTime+(at||0),src=ac.createBufferSource();src.buffer=b;const fl=ac.createBiquadFilter();fl.type='bandpass';fl.frequency.value=f||1500;fl.Q.value=.7;const g=ac.createGain();
    g.gain.setValueAtTime(peak,t);g.gain.linearRampToValueAtTime(peak*.7,t+b.duration*.7);g.gain.linearRampToValueAtTime(0.0001,t+b.duration);src.connect(fl);fl.connect(g);g.connect(master);src.start(t);src.stop(t+b.duration+.05)}
  function blast(at,dur){if(!ac)return;const t=ac.currentTime+at,o=ac.createOscillator(),o2=ac.createOscillator(),lf=ac.createOscillator(),lg=ac.createGain(),g=ac.createGain();
    o.type='square';o2.type='square';o.frequency.value=2950;o2.frequency.value=3120;lf.frequency.value=32;lg.gain.value=180;lf.connect(lg);lg.connect(o.frequency);lg.connect(o2.frequency);
    const fl=ac.createBiquadFilter();fl.type='bandpass';fl.frequency.value=3000;fl.Q.value=2;g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(.09,t+.02);g.gain.setValueAtTime(.09,t+dur-.04);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.connect(fl);o2.connect(fl);fl.connect(g);g.connect(master);[o,o2,lf].forEach(x=>{x.start(t);x.stop(t+dur+.05)})}
  return{init,
    whistle(n){if(!ac)return;if(n===3){blast(0,.35);blast(.45,.35);blast(.9,1.1)}else if(n===2){blast(0,.3);blast(.4,.9)}else blast(0,.55)},
    kick(p){if(!ac)return;tone(150,45,.12,.5*p,'sine');noise(.05,2500,1,.12*p)},
    goal(home){if(!ac)return;const t=ac.currentTime;cg.gain.cancelScheduledValues(t);cg.gain.setValueAtTime(cg.gain.value,t);cg.gain.linearRampToValueAtTime(home?1.1:.55,t+.35);cg.gain.linearRampToValueAtTime(lvl,t+5);
      noise(3.2,900,.4,home?.5:.22,.25);if(home){tone(220,220,.5,.08,'sawtooth',.2);tone(277,277,.5,.07,'sawtooth',.2);tone(330,330,.9,.07,'sawtooth',.75)}},
    ooh(){if(!ac)return;noise(1.3,420,1.2,.28,.15);const t=ac.currentTime;cg.gain.setValueAtTime(cg.gain.value,t);cg.gain.linearRampToValueAtTime(.45,t+.2);cg.gain.linearRampToValueAtTime(lvl,t+2)},
    tension(x){if(!ac||!cg)return;const v=.14+x*.2;lvl=v;if(cg.gain.value<.5){cg.gain.setTargetAtTime(v,ac.currentTime,.6)}},
    applause(dur,pk){if(!ac)return;dur=dur||2.5;const ev=[];const c=Math.floor(dur*170);for(let i=0;i<c;i++){const u=Math.random();ev.push([u*dur,(.3+Math.random()*.7)*(1-u*.6)])}playBuf(clapBuf(dur,ev),pk||.25,0)},
    chant(big){if(!ac)return;const pk=big?.24:.13,ev=[],beats=[];for(let r=0;r<3;r++){const o=r*2.2;beats.push(o,o+.42,o+1.1,o+1.38,o+1.66)}
      for(const bt of beats)for(let c=0;c<45;c++)ev.push([bt+(Math.random()-.5)*.06,.2+Math.random()*.5]);playBuf(clapBuf(7.2,ev),pk,0);
      for(const bt of beats)tone(120,48,.2,pk*1.5,'sine',bt);
      for(let r=0;r<3;r++){const o=r*2.2;noise(.38,520,2.2,pk*.9,.05,o);noise(.38,640,2.2,pk*.8,.05,o+.42);noise(.55,560,2,pk,.05,o+1.1)}noise(.6,700,1.4,pk*1.3,.03,6.6)},
    sifflets(){if(!ac)return;for(let i=0;i<16;i++)tone(2200+Math.random()*1600,2000+Math.random()*1500,.25+Math.random()*.5,.012,'sine',Math.random()*.7)},
    toggle(){on=!on;try{localStorage.setItem('cm_snd',on?'1':'0')}catch(e){}if(master)master.gain.value=on?1:0;return on},
    get on(){return on},
    stop(){try{ac&&ac.close()}catch(e){}ac=null}}}

/* ---------- touches du clavier (modifiables, gardées dans le navigateur) ---------- */
const KDEF={up:'z',down:'s',left:'q',right:'d',pass:' ',lob:'l',shoot:'k',sprint:'shift',skill:'j'};
const KLAB={up:'Haut',down:'Bas',left:'Gauche',right:'Droite',pass:'Passe / changer de joueur',lob:'Lob / pressing',shoot:'Tir / tacle / plonger',sprint:'Sprint',skill:'Geste technique / frappe enroulée'};
const GDEF={pass:0,lob:1,shoot:2,sprint:7,skill:3};
const GLAB={pass:'Passe / changer de joueur',lob:'Lob / pressing',shoot:'Tir / tacle / plonger',sprint:'Sprint',skill:'Geste technique / frappe enroulée'};
function gLoad(){let r;try{const o=JSON.parse(localStorage.getItem('cm_pad')||'{}');r=Object.assign({},GDEF,o)}catch(e){r=Object.assign({},GDEF)}for(const a in r)if(a!=='skill'&&r[a]===r.skill){const v=Object.values(r);r.skill=[3,4,5,6,10,11].find(k=>!v.includes(k));if(r.skill==null)r.skill=3;break}return r}
function gName(i){return(['A / ✕','B / ○','X / □','Y / △','LB / L1','RB / R1','LT / L2','RT / R2','Select','Start','L3','R3','Croix ↑','Croix ↓','Croix ←','Croix →'])[i]||('Bouton '+i)}
function gPad(){try{const L=navigator.getGamepads?navigator.getGamepads():[];for(const g of L)if(g&&g.connected)return g}catch(e){}return null}
function kLoad(){let r;try{const o=JSON.parse(localStorage.getItem('cm_keys')||'{}');r=Object.assign({},KDEF,o)}catch(e){r=Object.assign({},KDEF)}for(const a in r)if(a!=='skill'&&r[a]===r.skill){const v=Object.values(r);r.skill=['j','u','i','o','h','g','y'].find(k=>!v.includes(k))||'j';break}return r}
function kName(k){return({' ':'Espace',shift:'Maj',enter:'Entrée',control:'Ctrl',alt:'Alt',tab:'Tab',arrowup:'↑',arrowdown:'↓',arrowleft:'←',arrowright:'→',backspace:'Retour',capslock:'Verr. Maj'})[k]||String(k).toUpperCase()}
function start(cfg){
  const SN=mkSound();SN.init();
  const CO={on:true,last:0,quiet:0,v:null,busyUntil:0};try{CO.on=localStorage.getItem('cm_com')!=='0'}catch(e){}
  const PC=!!(window.matchMedia&&matchMedia('(hover:hover) and (pointer:fine)').matches);
  let KB=kLoad();
  const live=cfg.mode==='live',T=[cfg.home,cfg.away];
  const P=[];
  T.forEach((tm,t)=>tm.pl.forEach((q,i)=>{const h=hash((q.n||'')+i+t);
    P.push({t,i,role:ROLE[i],gk:i===0,n:q.n||'?',sn:q.sn||(q.n||'?').split(' ').slice(-1)[0],num:[1,2,4,5,3,8,6,10,7,9,11][i],r:cl(q.r||60,35,99),
      x:0,y:0,vx:0,vy:0,dir:t===0?-Math.PI/2:Math.PI/2,ph:0,cd:0,stun:0,slide:0,kick:0,dive:0,diveS:0,dc:0,mv:[0,0],
      skin:SKIN[h%SKIN.length],hair:HAIR[(h>>3)%HAIR.length],bald:(h>>6)%9===0})}));
  P.forEach(p=>{p.spd=(5.5+(p.r-60)*.045)*(p.gk?.92:1)});
  const team=t=>P.filter(p=>p.t===t);
  const REF={x:CX+9,y:PL/2,vx:0,vy:0,dir:Math.PI,ph:0,stun:0,slide:0,kick:0,dive:0,diveS:0,gk:false,ref:true,t:0,i:0,r:70,n:'Arbitre',sn:'Arbitre',num:'',skin:SKIN[1],hair:HAIR[0],bald:true,cardT:0,card:null};
  const B={x:CX,y:PL/2,z:0,vx:0,vy:0,vz:0,own:null,lt:0,lock:null,lockT:0,shot:false,shooter:null,gkTry:false,tgt:null,kicker:null,rot:0,net:0};
  const G={t:0,half:1,sc:[0,0],ph:'kick',phT:1.2,kt:0,ctrl:null,end:false,speed:1,msg:'',msgT:0,flash:'',flashT:0,shake:0,feed:[],scorers:[],charge:-1,buf:null,bufT:0,stats:{sh:[0,0],pos:[0,0],tk:0,pa:0,sv:0,out:0,usv:0,umiss:0,utk:0,ublk:0}};
  G.ex=[null,null];
  const cam={x:CX,y:PL/2};

  /* ---------- DOM ---------- */
  const ov=document.createElement('div');ov.className='cl-mov cm-ov'+(live?'':' watch');
  const short=s=>{s=String(s||'');return s.length>12?s.slice(0,11)+'…':s};
  ov.innerHTML='<canvas class="cm-cv"></canvas>'+
   '<div class="cm-top"><button class="cm-x" data-cm="quit">✕</button><button class="cm-x cm-snd" data-cm="snd">'+(SN.on?'🔊':'🔇')+'</button><button class="cm-x cm-com'+(CO.on?'':' off')+'" data-cm="com" title="Commentateur">🎙️</button>'+(PC?'<button class="cm-x cm-kb" data-cm="keys" title="Changer les touches">⌨️</button>':'')+(live?'<button class="cm-x cm-gp'+(PC?'':' m')+'" data-cm="pad" title="Manette"'+(gPad()?'':' hidden')+'>🎮</button>':'')+'<div class="cm-sb"><span class="cm-tm" style="--a:'+T[0].c1+';--b:'+T[0].c2+'"><i>'+T[0].e+'</i><b>'+esc(short(T[0].n))+'</b></span><span class="cm-sc"><b id="cmS">0 - 0</b><small id="cmM">0\'</small></span><span class="cm-tm r" style="--a:'+T[1].c1+';--b:'+T[1].c2+'"><b>'+esc(short(T[1].n))+'</b><i>'+T[1].e+'</i></span></div>'+
   (live?'':'<div class="cm-spd"><button data-cm="sp1" class="on">×1</button><button data-cm="sp2">×2</button><button data-cm="sp4">×4</button><button data-cm="skip">Résultat</button></div>')+'</div>'+
   '<canvas class="cm-mini"></canvas><div class="cm-feed" id="cmFeed"></div><div class="cm-flash" id="cmFlash"></div><div class="cm-rp"><i></i>RALENTI<button data-cm="rpskip">Passer ⏭</button></div>'+
   (live?'<div class="cm-joy" id="cmJoy"><i></i></div><div class="cm-pad">'+
     '<button class="cm-b b-spr" data-k="spr"><span>SPRINT</span><small class="kh" id="khS"></small></button>'+
     '<button class="cm-b b-2" data-k="b2"><span id="cmL2">LOB</span><small class="kh" id="khL"></small></button>'+
     '<button class="cm-b b-1" data-k="b1"><span id="cmL1">PASSE</span><small class="kh" id="khP"></small></button>'+
     '<button class="cm-b b-3" data-k="b3"><span id="cmL3">GESTE</span><small class="kh" id="khG"></small></button>'+
     '<button class="cm-b b-0" data-k="b0"><span id="cmL0">TIR</span><small class="kh" id="khT"></small><em id="cmPow"></em></button></div>'+
     (PC?'<div class="cm-keys" id="cmKbar"></div>':'')+
     (PC?'<div class="cm-help" id="cmHelp"><b>🎮 À toi de jouer (clavier) !</b><div id="cmHelpK"></div><button data-cm="keys" class="alt">⌨️ Changer les touches</button>'
     :'<div class="cm-help" id="cmHelp"><b>🎮 À toi de jouer !</b><p class="rot">📱↪️ Tourne ton téléphone sur le côté</p><p>🕹️ <b>Joystick</b> (gauche) : déplacer ton joueur</p><p>⚽ <b>PASSE</b> : passe dans la direction du joystick · <b>LOB</b> : passe en hauteur</p><p>🎯 <b>TIR</b> : reste appuyé pour la puissance, relâche pour frapper</p><p>✨ <b>GESTE</b> : crochet pour éliminer un défenseur · près du but : <b>frappe enroulée</b></p><p>🛡️ En défense : <b>TACLE</b> pour récupérer le ballon, <b>CHANGER</b> de joueur, <b>PRESSING</b> pour qu\'un coéquipier presse</p><p>🤕 Un centre en hauteur (<b>LOB</b>) dans la surface se reprend de la tête</p><p>🎮 Tu as une manette ? Connecte-la et appuie sur un bouton.</p>')+'<button data-cm="go">C\'est parti !</button></div>':'');
  if(PC)ov.classList.add('pc');
  document.body.appendChild(ov);
  function kFill(){if(!PC)return;const n=a=>'<b>'+esc(kName(KB[a]))+'</b>',mv=kName(KB.up)+' '+kName(KB.left)+' '+kName(KB.down)+' '+kName(KB.right);
    const set=(id,t)=>{const e=ov.querySelector('#'+id);if(e)e.innerHTML=t};
    set('khS',esc(kName(KB.sprint)));set('khL',esc(kName(KB.lob)));set('khP',esc(kName(KB.pass)));set('khT',esc(kName(KB.shoot)));set('khG',esc(kName(KB.skill)));
    set('cmKbar','⌨️ Flèches / '+esc(mv)+' : bouger · '+n('pass')+' passe · '+n('lob')+' lob · '+n('shoot')+' tir (maintenir) · '+n('skill')+' geste · '+n('sprint')+' sprint');
    set('cmHelpK','<p>⬆️⬇️⬅️➡️ <b>Flèches</b> ou <b>'+esc(mv)+'</b> : déplacer ton joueur</p><p>⚽ '+n('pass')+' : passe dans la direction choisie · '+n('lob')+' : passe en hauteur</p><p>🎯 '+n('shoot')+' : reste appuyé pour la puissance, relâche pour tirer</p><p>⚡ '+n('sprint')+' : sprint</p><p>✨ '+n('skill')+' : geste technique (crochet) · près du but : frappe enroulée</p><p>🤕 Un centre en hauteur ('+n('lob')+') dans la surface se reprend de la tête</p><p>🛡️ En défense : '+n('shoot')+' tacle · '+n('pass')+' changer de joueur · '+n('lob')+' pressing</p><p>🥅 Tirs au but : vise avec les flèches, tire avec '+n('shoot')+' · en gardien : flèche + '+n('shoot')+' pour plonger</p>'+'<p>🎮 Tu as une manette ? Branche-la et appuie sur un bouton, puis touche 🎮 en haut pour choisir tes boutons.</p>');
    const P=ov.querySelector('#cmKeys');if(P)P.querySelector('.ck-l').innerHTML=Object.keys(KDEF).map(a=>'<button class="ck-r'+(G.kcap===a?' cap':'')+'" data-ck="'+a+'"><span>'+KLAB[a]+'</span><b>'+(G.kcap===a?'Appuie sur une touche…':esc(kName(KB[a])))+'</b></button>').join('')}
  let GB=gLoad();
  function gFill(){const P=ov.querySelector('#cmPad');if(!P)return;const g=gPad();
    P.querySelector('.gp-st').innerHTML=g?'✅ Manette détectée : <b>'+esc(String(g.id).replace(/\(.*\)/,'').slice(0,40))+'</b>':'❌ Aucune manette détectée. Branche-la (ou connecte-la en Bluetooth) puis appuie sur un bouton.';
    P.querySelector('.ck-l').innerHTML='<div class="ck-r"><span>Bouger</span><b>Joystick gauche / croix</b></div>'+Object.keys(GDEF).map(a=>'<button class="ck-r'+(G.gcap===a?' cap':'')+'" data-gk="'+a+'"><span>'+GLAB[a]+'</span><b>'+(G.gcap===a?'Appuie sur un bouton…':esc(gName(GB[a])))+'</b></button>').join('')}
  function gPanel(){if(ov.querySelector('#cmPad'))return;const k=ov.querySelector('#cmKeys');if(k)k.remove();if(!ov.querySelector('#cmKeys'))G.kWas=paused;paused=true;const P=document.createElement('div');P.className='cm-help cm-kp';P.id='cmPad';
    P.innerHTML='<b>🎮 Manette</b><p class="gp-st"></p><p>Touche une action, puis appuie sur le bouton de la manette que tu veux. Start = reprendre le match.</p><div class="ck-l"></div><button data-cm="greset" class="alt">Remettre les boutons d\'origine</button><button data-cm="gclose">Terminé</button>';
    ov.appendChild(P);gFill()}
  function coFill(){const P=ov.querySelector('#cmCom');if(!P)return;const L=coVoices(),cur=coVoice();
    P.querySelector('.co-on').textContent=CO.on?'🎙️ Commentateur : activé (toucher pour couper)':'🔇 Commentateur : coupé (toucher pour activer)';
    P.querySelector('.ck-l').innerHTML=L.length?L.slice().sort((a,b)=>coScore(b)-coScore(a)).map(v=>'<button class="ck-r'+(cur&&cur.name===v.name?' cap':'')+'" data-cm="cov:'+esc(v.name)+'"><span>'+esc(v.name.replace(/Microsoft /,'').slice(0,34))+'</span><b>'+(cur&&cur.name===v.name?'✓':'▶︎')+'</b></button>').join(''):'<p>Aucune voix française trouvée sur cet appareil.</p>'}
  function coPanel(){if(ov.querySelector('#cmCom'))return;paused=live?true:paused;const P=document.createElement('div');P.className='cm-help cm-kp';P.id='cmCom';
    P.innerHTML='<b>🎙️ Commentateur</b><button data-cm="coon" class="alt co-on"></button><p>Choisis la voix la plus naturelle (les voix « Natural », « Online », « Premium » ou « Améliorée » sont les plus humaines). Touche une voix pour l\'écouter.</p><div class="ck-l"></div><button data-cm="cotest" class="alt">▶︎ Tester un but</button><button data-cm="coclose">Terminé</button>';
    ov.appendChild(P);coFill()}
  function kPanel(){if(ov.querySelector('#cmKeys'))return;G.kWas=paused;paused=true;const P=document.createElement('div');P.className='cm-help cm-kp';P.id='cmKeys';
    P.innerHTML='<b>⌨️ Changer les touches</b><p>Clique sur une action, puis appuie sur la nouvelle touche (Échap pour annuler). Les flèches marchent toujours pour bouger.</p><div class="ck-l"></div><button data-cm="kreset" class="alt">Remettre les touches d\'origine</button><button data-cm="kclose">Terminé</button>';
    ov.appendChild(P);kFill()}
  kFill();
  const cv=ov.querySelector('.cm-cv'),ctx=cv.getContext('2d'),mini=ov.querySelector('.cm-mini'),mc=mini.getContext('2d');
  const FD=ov.querySelector('#cmFeed'),FL=ov.querySelector('#cmFlash');
  let W=0,H=0,DPR=1,S=10;
  let ROT=false;
  function resize(){if(!ov.isConnected&&G.end){window.removeEventListener('resize',resize);return}
    DPR=Math.min(2.5,window.devicePixelRatio||1);const vw=window.innerWidth,vh=window.innerHeight,cr=vh>vw;ov.classList.toggle('crot',cr);
    if(cr){ov.style.width=vh+'px';ov.style.height=vw+'px';ov.style.left=vw+'px'}else{ov.style.width=ov.style.height=ov.style.left=''}
    W=ov.clientWidth;H=ov.clientHeight;ROT=W>H;ov.classList.toggle('land',ROT);cv.width=W*DPR;cv.height=H*DPR;cv.style.width=W+'px';cv.style.height=H+'px';
    S=ROT?(PC?Math.min(W/58,H/34):Math.min(W/44,H/24)):Math.min(W/22,H/36);const mw=ROT?105:68,mh=ROT?68:105;mini.width=mw*1.4*DPR;mini.height=mh*1.4*DPR;mini.style.width=mw+'px';mini.style.height=mh+'px'}
  function joyW(){let jx=inp.jx,jy=inp.jy;const K=inp.keys;if(K.arrowleft||K.left)jx=-1;if(K.arrowright||K.right)jx=1;if(K.arrowup||K.up)jy=-1;if(K.arrowdown||K.down)jy=1;const l=hyp(jx,jy);if(l>1){jx/=l;jy/=l}return ROT?[jy,-jx]:[jx,jy]}
  function goFS(){try{const d=document.documentElement;if(d.requestFullscreen&&!document.fullscreenElement){d.requestFullscreen({navigationUI:'hide'}).then(()=>{try{screen.orientation&&screen.orientation.lock&&screen.orientation.lock('landscape').catch(()=>{})}catch(e){}}).catch(()=>{})}}catch(e){}}
  function exitFS(){try{screen.orientation&&screen.orientation.unlock&&screen.orientation.unlock()}catch(e){}try{document.fullscreenElement&&document.exitFullscreen().catch(()=>{})}catch(e){}}
  goFS();
  const inp={jx:0,jy:0,sprint:false,keys:{}};
  resize();window.addEventListener('resize',resize);setTimeout(resize,400);setTimeout(resize,1200);
  let paused=live;
  const crowd=document.createElement('canvas');crowd.width=crowd.height=96;{const c=crowd.getContext('2d');c.fillStyle='#161c2b';c.fillRect(0,0,96,96);
    const cols=[T[0].c1,T[0].c2,T[1].c1,'#e5e7eb','#94a3b8','#f59e0b',T[0].c1,'#64748b'];
    for(let y=2;y<96;y+=6)for(let x=2+(y%12?3:0);x<96;x+=6){c.fillStyle=cols[(Math.random()*cols.length)|0];c.globalAlpha=.55+Math.random()*.45;c.beginPath();c.arc(x+Math.random(),y+Math.random(),1.9,0,7);c.fill()}}
  let crowdP=null;try{crowdP=ctx.createPattern(crowd,'repeat');crowdP.setTransform&&crowdP.setTransform(new DOMMatrix().scale(1/9))}catch(e){}


  // ---- Commentateur (voix) ----
  const SS=window.speechSynthesis;
  function coVoices(){try{return SS?SS.getVoices().filter(v=>/^fr/i.test(v.lang)):[]}catch(e){return[]}}
  function coScore(v){const n=v.name;let x=0;if(/natural|neural|online|premium|enhanced|amélior|siri/i.test(n))x+=6;if(/google/i.test(n))x+=3;if(/fr-FR/i.test(v.lang))x+=2;if(/thomas|henri|paul|remy|rémy|antoine|daniel|male|homme/i.test(n))x+=1;if(/espeak|robot|compact/i.test(n))x-=5;return x}
  function coVoice(){if(CO.v||!SS)return CO.v;const L=coVoices();let want='';try{want=localStorage.getItem('cm_voice')||''}catch(e){}
    CO.v=L.find(v=>v.name===want)||L.slice().sort((a,b)=>coScore(b)-coScore(a))[0]||null;return CO.v}
  try{SS&&SS.addEventListener&&SS.addEventListener('voiceschanged',()=>{CO.v=null;coVoice()})}catch(e){}
  const pick=a=>a[Math.floor(Math.random()*a.length)];
  const tn=t=>short(T[t].n);
  function scoreTxt(){const[a,b]=G.sc;return a===b?(a===0?'toujours zéro partout':'égalité, '+a+' partout'):a>b?tn(0)+' mène '+a+' à '+b:tn(1)+' mène '+b+' à '+a}
  const TONE={cry:[1.22,1.5,1],hype:[1.18,1.28,1],live:[1.1,1.12,1],calm:[.97,.96,.85],info:[1,1.02,.95]};
  function coSay(t,tone,first){const k=TONE[tone]||TONE.info,u=new SpeechSynthesisUtterance(t);u.lang='fr-FR';const v=coVoice();if(v)u.voice=v;
    u.rate=k[0]*(1+(Math.random()-.5)*.06);u.pitch=Math.min(2,k[1]*(1+(Math.random()-.5)*.08));u.volume=k[2];SS.speak(u)}
  function com(lines,prio,vars){if(!CO.on||!SS||G.sk||G.speed>2)return;const now=performance.now();
    if(prio<2&&(SS.speaking||now<CO.busyUntil))return;if(prio<1&&now-CO.last<6000)return;
    let t=pick(lines);for(const k in (vars||{}))t=t.split('{'+k+'}').join(vars[k]);
    try{if(prio>=2)SS.cancel();
      const parts=t.match(/[^!.?…]+[!.?…]*/g)||[t];
      parts.forEach((x,i)=>{x=x.trim();if(!x)return;const ex=/!$/.test(x);
        const tone=/^(but|goo+l|ouii+|incroyable|quelle? |oh)/i.test(x)&&prio>=2&&i===0?'cry':prio>=2?(ex?'hype':'info'):prio===1?'live':'calm';coSay(x,tone)});
      CO.last=now;CO.busyUntil=now+Math.min(6000,700+t.length*55)}catch(e){}}
  function coTick(dt){if(!CO.on||paused||G.ph!=='play')return;CO.quiet+=dt;if(CO.quiet<9+Math.random()*4)return;CO.quiet=0;const o=B.own;if(!o)return;
    const att=o.t===0?B.y<PL*.38:B.y>PL*.62;
    com(att?['{T} est aux abords de la surface !','{p} cherche la faille…','Attention, {T} s\'approche dangereusement !','Ça chauffe devant le but !']
      :['{T} fait tourner le ballon.','{p} remonte le terrain.','Belle séquence de passes pour {T}.','{p} prend le temps de construire.','Le ballon circule bien chez {T}.'],0,{T:tn(o.t),p:o.sn})}
  function say(txt,cls){const d=document.createElement('div');d.className='cm-e '+(cls||'');d.innerHTML='<em>'+minute()+'\'</em> '+txt;FD.prepend(d);while(FD.children.length>3)FD.lastChild.remove();setTimeout(()=>d.classList.add('old'),3500)}
  function flash(txt,cls,dur){FL.className='cm-flash on '+(cls||'');FL.innerHTML=txt;G.flashT=dur||1.6}
  function minute(){const base=G.half===1?0:HALF,lim=G.half===1?45:90,e=G.t-base-HALF;if(e>=0&&G.ex&&G.ex[G.half-1]!=null)return lim+'+'+Math.min(G.ex[G.half-1],1+Math.floor(e/HALF*45));return G.half===1?Math.min(45,Math.floor(G.t/HALF*45)):Math.min(90,45+Math.floor(Math.max(0,G.t-HALF)/HALF*45))}
  function exAnnounce(h){G.ex=G.ex||[null,null];if(G.ex[h]!=null)return;const k=1+Math.floor(rnd()*10);G.ex[h]=k;flash('⏱️ +'+k+' MIN<small>Temps additionnel</small>','post',2);say('⏱️ <b>'+k+' minute'+(k>1?'s':'')+'</b> de temps additionnel');com(['Le quatrième arbitre annonce {k} minute{s} de temps additionnel !','{k} minute{s} de temps additionnel !'],2,{k:k,s:k>1?'s':''})}
  function vib(p){try{navigator.vibrate&&navigator.vibrate(p)}catch(e){}try{G.gpRumble&&G.gpRumble(Array.isArray(p)?p[0]:p)}catch(e){}}

  /* ---------- placement ---------- */
  function kickoff(kt){G.kt=kt;B.own=null;B.x=CX;B.y=PL/2;B.z=B.vx=B.vy=B.vz=0;B.shot=false;B.tgt=null;B.net=0;
    REF.x=CX+9;REF.y=PL/2+3;REF.vx=REF.vy=0;G.cel=null;G.noRp=false;
    P.forEach(p=>{p.cel=p.sad=p.ks=p.head=p.spin=p.skill=p.kick=0});
    P.forEach(p=>{const f=(p.t===kt?KOA:KOD)[p.i],w=W2(p.t,f[0],f[1]);p.x=w[0];p.y=w[1];p.vx=p.vy=0;p.stun=p.slide=p.dive=0;p.dir=p.t===0?-Math.PI/2:Math.PI/2});
    const s=P.find(p=>p.t===kt&&p.i===9)||P.find(p=>p.t===kt&&p.i===10)||P.filter(p=>p.t===kt&&!p.gk).sort((a,b)=>b.i-a.i)[0];s.x=CX;s.y=PL/2+(kt===0?.6:-.6);B.own=s;B.lt=kt;
    G.ph='kick';G.phT=1.1;if(live)G.ctrl=kt===0?s:nearest(0,B.x,B.y,true);if(!(live&&paused))SN.whistle(1)}
  function nearest(t,x,y,noGK,ex){let b=null,bd=1e9;for(const p of P){if(p.t!==t||(noGK&&p.gk)||p===ex)continue;const d=hyp(p.x-x,p.y-y);if(d<bd){bd=d;b=p}}return b}
  function restart(p,x,y,msg){G.stats.out++;P.forEach(q=>{q.vx=q.vy=0;q.slide=0});p.x=x;p.y=y;B.own=p;B.x=x;B.y=y;B.z=B.vx=B.vy=B.vz=0;B.shot=false;B.tgt=null;B.lt=p.t;
    P.forEach(q=>{if(q.t!==p.t){const d=hyp(q.x-x,q.y-y);if(d<5){const a=Math.atan2(q.y-y,q.x-x);q.x=cl(x+Math.cos(a)*5,1,PW-1);q.y=cl(y+Math.sin(a)*5,1,PL-1)}}});
    p.dir=Math.atan2(PL/2-y,CX-x);G.ph='out';G.phT=.9;if(msg)say(msg);if(live){if(p.t===0)G.ctrl=p.gk?G.ctrl:p;else if(!G.ctrl)G.ctrl=nearest(0,x,y,true)}}

  /* ---------- actions ---------- */
  function lane(p,x,y){let pen=0;const dx=x-p.x,dy=y-p.y,L=hyp(dx,dy)||1;
    for(const o of P){if(o.t===p.t)continue;const u=((o.x-p.x)*dx+(o.y-p.y)*dy)/(L*L);if(u<0||u>1)continue;const d=hyp(p.x+dx*u-o.x,p.y+dy*u-o.y);if(d<2.2)pen+=(2.2-d)/2.2*(o.gk?.6:1)}
    return pen}
  function openness(q){let m=99;for(const o of P)if(o.t!==q.t)m=Math.min(m,hyp(o.x-q.x,o.y-q.y));return Math.min(m,7)}
  function bestPass(p,dx,dy){let best=null,bs=-1e9;const dl=hyp(dx,dy);
    for(const q of P){if(q.t!==p.t||q===p)continue;const ex=q.x-p.x,ey=q.y-p.y,d=hyp(ex,ey);if(d<3.5||d>42)continue;
      let s;if(dl>.2){const cs=(ex*dx+ey*dy)/(d*dl);if(cs<.35)continue;s=cs*3-d/30-lane(p,q.x,q.y)*.6+openness(q)*.05}
      else{const prog=(YN(p.t,q.y)-YN(p.t,p.y))*PL;s=prog*.07+openness(q)*.22-lane(p,q.x,q.y)*1.4-d/45-(q.gk?3:0)+(q.role==='A'?.2:0)}
      if(s>bs){bs=s;best=q}}
    return best}
  function kick(p,tx,ty,spd,vz,err){B.curlT=0;if(spd>20&&G.ph==='play')turf(p.x,p.y,4,1.4);const a=Math.atan2(ty-p.y,tx-p.x)+gauss()*err;B.own=null;B.vx=Math.cos(a)*spd;B.vy=Math.sin(a)*spd;B.vz=vz;B.z=Math.max(B.z,.1);
    B.lock=p;B.lockT=.28;B.lt=p.t;B.kicker=p;B.shot=false;B.gkTry=false;p.kick=.25;p.dir=a;SN.kick(Math.min(1,spd/24))}
  function pass(p,q,lob){if(!q)return false;const d=hyp(q.x-p.x,q.y-p.y);
    let spd=lob?cl(9+d*.45,11,21):cl(9+d*.62,11,25);const tt=d/spd*(lob?1:1.15);
    const tx=q.x+q.vx*tt*.85+(lob?fwd(q.t)*0:0),ty=q.y+q.vy*tt*.85;const err=.012+(100-p.r)/100*.07+(lob?.02:0);
    const T2=hyp(tx-p.x,ty-p.y)/spd;kick(p,tx,ty,spd,lob?cl(9.8*T2*.5,3,13):0,err);B.tgt=q;B.tgtT=T2+2.5;G.stats.pa++;
    if(live&&p.t===0&&!q.gk){G.ctrl=q}
    return true}
  function shoot(p,pow,aim){const gy=goalY(p.t),d=hyp(CX-p.x,gy-p.y);
    const me=live&&p.t===0;let ax;
    if(me){const side=aim!=null&&Math.abs(aim)>.3?Math.sign(aim):(p.x<CX?1:-1)*(p.t===0?1:1);ax=CX+side*(GW/2-.85)+gauss()*.3}
    else{const side=p.x<CX?1:-1;ax=CX+side*(GW/2-1.05)*(rnd()<.7?1:-1)+gauss()*.5}
    const spd=16+pow*15,T2=d/spd,h=pow>.97?1.9+(pow-.97)*40:.3+rnd()*(me?1.1:1.3);
    const err=me?.016+(100-p.r)/100*.055+(d>24?.025:0)+(pressure(p)<1.6?.03:0):(live?.011+(100-p.r)/100*.06+(d>22?.015:0)+(pressure(p)<2?.025:0):.015+(100-p.r)/100*.075+(d>22?.02:0)+(pressure(p)<2?.035:0));
    kick(p,ax,gy,spd,cl((h+4.9*T2*T2)/T2,0,14),err);B.shot=true;B.shooter=p;B.lockT=.35;G.stats.sh[p.t]++;
    say((p.t===0?'🎯 ':'')+'Frappe de <b>'+esc(p.sn)+'</b> !');CO.quiet=0;com(['{p} tente sa chance !','Frappe de {p} !','{p} déclenche !','Et c\'est {p} qui frappe !','{p} arme sa frappe !'],1,{p:p.sn})}
  function pressure(p){let m=99;for(const o of P)if(o.t!==p.t&&!o.gk)m=Math.min(m,hyp(o.x-p.x,o.y-p.y));return m}
  function tackle(p){if(p.stun>0||p.slide>0)return;const c=B.own;p.cd=.45;
    if(c&&c.t!==p.t){const d=hyp(c.x-p.x,c.y-p.y);if(d<1.8){tryTk(p,c,.08);return}if(d<6)p.dir=Math.atan2(c.y+c.vy*.3-p.y,c.x+c.vx*.3-p.x)}
    p.slide=.42;p.tkDone=false;turf(p.x,p.y,8,2.2)}
  function tryTk(p,c,bonus){p.tkDone=true;p.slide=0;const ch=cl(.5+bonus+(p.r-c.r)/80,.3,.8)*(c.skill>0?.4:1);
    if(rnd()<(inp.sprint?.11:.06)){foul(p,c,inp.sprint);return false}
    if(rnd()<ch){G.stats.utk++;c.stun=.6;take(p);B.tgt=null;vib(30);say('🛡️ Tacle réussi de <b>'+esc(p.sn)+'</b> !');com(['Superbe tacle de {p} !','Quelle intervention de {p} !','{p} récupère le ballon !'],1,{p:p.sn});return true}
    p.stun=.55;if(rnd()<(inp.sprint?.38:.26)&&foul(p,c,inp.sprint))return false;return false}
  function switchP(){const c=G.ctrl;let b=null,bd=1e9;const tx=B.x+B.vx*.4,ty=B.y+B.vy*.4;
    for(const p of P){if(p.t!==0||p.gk||p===c)continue;const d=hyp(p.x-tx,p.y-ty);if(d<bd){bd=d;b=p}}if(b)G.ctrl=b}

  /* ---------- user input ---------- */
  function mode(){return B.own?B.own.t===0?'att':'def':(B.lt===0&&B.tgt&&B.tgt.t===0)?'att':'free'}
  function act(k,down){if(!live||paused||G.ph==='pkw')return;if(G.ph==='replay'){if(down)rpSkip();return}const c=G.ctrl;if(!c)return;
    if(G.ph==='pens'){if(k!=='b0')return;
      if(PK.turn===0&&PK.st==='aim'){if(down)G.charge=0;else if(G.charge>=0){const pw=cl(.3+G.charge*.8,.3,1.05);G.charge=-1;pkKick(PK.aim,pw)}}
      else if(PK.turn===1&&down&&PK.dive==null&&(PK.st!=='flight'||PK.t<.12)&&PK.st!=='result'){const j=joyW();PK.dive=Math.abs(j[0])<.35?0:Math.sign(j[0]);vib(20)}
      return}
    const m=mode();
    if(k==='spr'){inp.sprint=down;return}
    if(m==='def'||(m==='free'&&B.lt===1)){if(!down)return;if(k==='b0')tackle(c);else if(k==='b1')switchP();else if(k==='b2')G.press=!G.press;return}
    if(B.own===c){
      if(k==='b0'){if(down){G.charge=0}else if(G.charge>=0){const j=joyW();shoot(c,cl(.3+G.charge*.8,.3,1.05),hyp(j[0],j[1])>.25?j[0]:null);G.charge=-1}}
      else if(down&&(k==='b1'||k==='b2')){const j=joyW(),q=bestPass(c,j[0],j[1])||bestPass(c,Math.cos(c.dir),Math.sin(c.dir))||bestPass(c,0,0);pass(c,q,k==='b2')}
      else if(down&&k==='b3')skill(c,false)
    }else{ // ballon en l'air vers nous : action en une touche
      if(down&&k!=='b3'){G.buf=k;G.bufT=.45}}
  }
  if(live){
    const joy=ov.querySelector('#cmJoy'),kn=joy.querySelector('i');let jid=null,jx0=0,jy0=0;
    const jr=()=>Math.min(60,Math.min(W,H)*.16);
    const pt=e=>ov.classList.contains('crot')?[e.clientY,window.innerWidth-e.clientX]:[e.clientX,e.clientY];
    ov.addEventListener('pointerdown',e=>{if(e.target.closest('.cm-b,.cm-top,.cm-help,.mv-end'))return;const q=pt(e);if(q[0]>W*.55||jid!=null)return;jid=e.pointerId;jx0=q[0];jy0=q[1];
      joy.style.left=jx0+'px';joy.style.top=jy0+'px';joy.classList.add('on');kn.style.transform='translate(-50%,-50%)';e.preventDefault()});
    ov.addEventListener('pointermove',e=>{if(e.pointerId!==jid)return;const q=pt(e);let dx=q[0]-jx0,dy=q[1]-jy0;const d=hyp(dx,dy),R=jr();if(d>R){dx*=R/d;dy*=R/d}
      inp.jx=dx/R;inp.jy=dy/R;kn.style.transform='translate(calc(-50% + '+dx+'px),calc(-50% + '+dy+'px))';e.preventDefault()});
    const up=e=>{if(e.pointerId!==jid)return;jid=null;inp.jx=inp.jy=0;joy.classList.remove('on');kn.style.transform='translate(-50%,-50%)'};
    ov.addEventListener('pointerup',up);ov.addEventListener('pointercancel',up);
    ov.querySelectorAll('.cm-b').forEach(b=>{const k=b.dataset.k;
      b.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();b.classList.add('dn');try{b.setPointerCapture(e.pointerId)}catch(_){ }act(k,true)});
      const u=e=>{if(!b.classList.contains('dn'))return;b.classList.remove('dn');act(k,false)};b.addEventListener('pointerup',u);b.addEventListener('pointercancel',u)});
    const kd=e=>{const k=e.key.toLowerCase(),dn=e.type==='keydown';if(G.ph==='replay'&&dn&&!G.kcap&&!e.repeat){rpSkip();e.preventDefault();return}
      if(G.kcap){if(!dn)return;e.preventDefault();if(k!=='escape'){const old=KB[G.kcap];for(const a in KB)if(KB[a]===k&&a!==G.kcap)KB[a]=old;KB[G.kcap]=k;try{localStorage.setItem('cm_keys',JSON.stringify(KB))}catch(_){}}G.kcap=null;kFill();return}
      if(['arrowup','arrowdown','arrowleft','arrowright'].includes(k)){inp.keys[k]=dn;e.preventDefault()}
      for(const a of ['up','down','left','right'])if(KB[a]===k){inp.keys[a]=dn;e.preventDefault()}
      const KM={[KB.pass]:'b1',[KB.lob]:'b2',[KB.shoot]:'b0',[KB.sprint]:'spr',[KB.skill]:'b3',enter:'b0'};
      if(KM[k]&&!e.repeat){act(KM[k],dn);e.preventDefault()}};
    // ---- Manette de jeu ----
    const gprev={};let gMove=false;
    const gBtn=ev=>{const b=ov.querySelector('.cm-gp');if(b)b.hidden=!gPad();if(ev&&ev.type==='gamepadconnected'){flash('🎮 Manette connectée !<small>Touche 🎮 en haut pour choisir tes boutons</small>','',2.2)}gFill()};
    window.addEventListener('gamepadconnected',gBtn);window.addEventListener('gamepaddisconnected',gBtn);
    const gLoop=()=>{if(G.end||!ov.isConnected){window.removeEventListener('gamepadconnected',gBtn);window.removeEventListener('gamepaddisconnected',gBtn);return}
      const g=gPad();if(g){const pr=i=>!!(g.buttons[i]&&(g.buttons[i].pressed||g.buttons[i].value>.5));
        const gb=ov.querySelector('.cm-gp');if(gb&&gb.hidden)gb.hidden=false;
        if(G.gcap){for(let i=0;i<g.buttons.length;i++){if(pr(i)&&!gprev[i]&&i<12&&i!==9){const old=GB[G.gcap];for(const a in GB)if(GB[a]===i&&a!==G.gcap)GB[a]=old;GB[G.gcap]=i;try{localStorage.setItem('cm_pad',JSON.stringify(GB))}catch(_){}G.gcap=null;gFill();break}}}
        else{
          let ax=g.axes[0]||0,ay=g.axes[1]||0;if(pr(14))ax=-1;if(pr(15))ax=1;if(pr(12))ay=-1;if(pr(13))ay=1;
          const m=hyp(ax,ay);if(m>.22){inp.jx=ax/Math.max(1,m);inp.jy=ay/Math.max(1,m);gMove=true}else if(gMove){inp.jx=inp.jy=0;gMove=false}
          if(G.ph==='replay'){for(let i=0;i<g.buttons.length;i++)if(pr(i)&&!gprev[i]){rpSkip();break}}
          const AM={[GB.pass]:'b1',[GB.lob]:'b2',[GB.shoot]:'b0',[GB.sprint]:'spr',[GB.skill]:'b3'};
          for(const i in AM){const d=pr(+i);if(d!==!!gprev[i]){const help=ov.querySelector('#cmHelp');if(!(help&&d))act(AM[i],d)}}
          if(pr(9)&&!gprev[9]){const go=['gclose','kclose','resume','go'].map(x=>ov.querySelector('[data-cm="'+x+'"]')).find(Boolean);if(go)go.click()}
          if(pr(GB.pass)&&!gprev[GB.pass]){const go=ov.querySelector('#cmHelp [data-cm="go"]');if(go)go.click()}
        }
        for(let i=0;i<g.buttons.length;i++)gprev[i]=pr(i)}
      requestAnimationFrame(gLoop)};
    requestAnimationFrame(gLoop);G.gpRumble=ms=>{const g=gPad();try{g&&g.vibrationActuator&&g.vibrationActuator.playEffect('dual-rumble',{duration:Math.min(400,ms),strongMagnitude:.6,weakMagnitude:.4})}catch(_){}};
    window.addEventListener('keydown',kd);window.addEventListener('keyup',kd);G.offKeys=()=>{window.removeEventListener('keydown',kd);window.removeEventListener('keyup',kd)};
  }
  ov.addEventListener('touchmove',e=>e.preventDefault(),{passive:false});
  ov.addEventListener('pointerdown',e=>{if(G.ph==='replay'&&!e.target.closest('.cm-top,.cm-help'))rpSkip()});
  ov.addEventListener('click',e=>{const ck=e.target.closest('[data-ck]');if(ck){G.kcap=ck.dataset.ck;kFill();return}const gk=e.target.closest('[data-gk]');if(gk){G.gcap=gk.dataset.gk;gFill();return}const b=e.target.closest('[data-cm]');if(!b)return;const a=b.dataset.cm;
    if(a==='go'){ov.querySelector('#cmHelp').remove();paused=false;last=performance.now();SN.whistle(1);coIntro()}
    else if(a==='rpskip'){rpSkip()}
    else if(a==='snd'){b.textContent=SN.toggle()?'🔊':'🔇'}
    else if(a==='com'){coPanel()}
    else if(a==='coon'){CO.on=!CO.on;try{localStorage.setItem('cm_com',CO.on?'1':'0')}catch(_){}const cb=ov.querySelector('.cm-com');if(cb)cb.classList.toggle('off',!CO.on);if(!CO.on){try{SS&&SS.cancel()}catch(_){}}coFill()}
    else if(a==='cotest'){const was=CO.on;CO.on=true;CO.busyUntil=0;com(['But ! But ! But ! Quelle frappe magnifique ! Le stade est en feu !'],3);CO.on=was}
    else if(a==='coclose'){const P=ov.querySelector('#cmCom');if(P)P.remove();paused=!!ov.querySelector('.cm-help');if(!paused)last=performance.now()}
    else if(a.startsWith('cov:')){const n=a.slice(4);try{localStorage.setItem('cm_voice',n)}catch(_){}CO.v=null;coVoice();coFill();CO.busyUntil=0;const was=CO.on;CO.on=true;com(['Tir de Mbappé ! Quel arrêt du gardien !'],3);CO.on=was}
    else if(a==='keys'){kPanel()}
    else if(a==='pad'){gPanel()}
    else if(a==='greset'){GB=Object.assign({},GDEF);try{localStorage.removeItem('cm_pad')}catch(_){}G.gcap=null;gFill()}
    else if(a==='gclose'){G.gcap=null;const P=ov.querySelector('#cmPad');if(P)P.remove();paused=!!ov.querySelector('.cm-help');if(!paused)last=performance.now()}
    else if(a==='kreset'){KB=Object.assign({},KDEF);try{localStorage.removeItem('cm_keys')}catch(_){}G.kcap=null;kFill()}
    else if(a==='kclose'){G.kcap=null;const P=ov.querySelector('#cmKeys');if(P)P.remove();paused=!!ov.querySelector('.cm-help');if(!paused)last=performance.now()}
    else if(a==='quit'){if(G.end)return;paused=true;const q=document.createElement('div');q.className='cm-help';q.innerHTML='<b>Abandonner le match ?</b><p>Un abandon compte comme une <b>défaite 0-3</b>.</p><button data-cm="quitok">Abandonner</button><button data-cm="resume" class="alt">Continuer à jouer</button>';ov.appendChild(q)}
    else if(a==='resume'){b.closest('.cm-help').remove();paused=false;last=performance.now()}
    else if(a==='quitok'){b.closest('.cm-help').remove();G.sc=[0,Math.max(3,G.sc[1])];done(true)}
    else if(a.startsWith('sp')){G.speed=+a.slice(2);ov.querySelectorAll('.cm-spd button').forEach(x=>x.classList.toggle('on',x===b))}
    else if(a==='skip'){G.sk=1;try{SS&&SS.cancel()}catch(_){}let n=0;while(!G.end&&n++<20000)step(1/30,true);G.sk=0}});

  /* ---------- IA ---------- */
  function targetOf(p){const t=p.t,att=(B.own?B.own.t:B.lt)===t,bn=YN(t,B.y),bx=XN(t,B.x),f=FORM[p.i];let yn,xn;
    if(p.role==='D'){yn=cl(f[1]+(bn-.42)*.5+(att?.07:0),.06,.6)}
    else if(p.role==='M'){yn=cl(f[1]+(bn-.45)*.58+(att?.1:0),.14,.84)}
    else{yn=cl(f[1]+(bn-.5)*.45+(att?.18:-.02),.3,.95)}
    xn=f[0]+(bx-.5)*(att?.25:.42);if(att)xn+=(f[0]-.5)*.18;
    const w=W2(t,cl(xn,.04,.96),yn);w[0]+=Math.sin(G.t*.35+p.i*1.7)*1.4;w[1]+=Math.cos(G.t*.27+p.i)*1.2;return w}
  function steer(p,tx,ty,sp,dt){const dx=tx-p.x,dy=ty-p.y,d=hyp(dx,dy);let vx=0,vy=0;if(d>.25){const k=sp*Math.min(1,d/2.2);vx=dx/d*k;vy=dy/d*k}
    const a=Math.min(1,dt*(p.gk?7:5.5));p.vx+=(vx-p.vx)*a;p.vy+=(vy-p.vy)*a}
  function gkThink(p,dt){const t=p.t,gy=ownY(t),s=-fwd(t);// s : vers l'extérieur du but
    if(B.own===p){p.vx*=.8;p.vy*=.8;p.hold=(p.hold||0)+dt;if(p.hold>(p.t===0?.7:1.1)){p.hold=0;const q=bestPass(p,0,0);if(q)pass(p,q,hyp(q.x-p.x,q.y-p.y)>25);else kick(p,CX+gauss()*15,PL/2,22,9,.1)}return}
    p.hold=0;
    const toward=B.vy*s>0;const incoming=!B.own&&B.shot&&B.kicker&&B.kicker.t!==t&&toward;
    if(incoming){const ty=gy-s*.6,tt=(ty-B.y)/(B.vy||1e-3);const ix=cl(B.x+B.vx*Math.max(0,tt),CX-GW/2-.5,CX+GW/2+.5);steer(p,ix,ty,p.spd*1.5,dt);return}
    const inBox=Math.abs(B.x-CX)<20&&Math.abs(B.y-gy)<16.5;
    if(!B.own&&inBox&&hyp(B.x-p.x,B.y-p.y)<10&&hyp(B.vx,B.vy)<14){const me=hyp(B.x-p.x,B.y-p.y),o=nearest(1-t,B.x,B.y,true);if(!o||hyp(o.x-B.x,o.y-B.y)>me*.8){steer(p,B.x,B.y,p.spd*1.2,dt);return}}
    const a=Math.atan2(B.y-gy,B.x-CX),dd=cl(hyp(B.x-CX,B.y-gy)*.08,.8,3.2);steer(p,cl(CX+Math.cos(a)*dd,CX-GW/2+.4,CX+GW/2-.4),gy+Math.sin(a)*dd+s*0,p.spd,dt);
    if(Math.abs(p.y-gy)<.4)p.y=gy-s*.4}
  function carrierAI(p,dt){const t=p.t,gy=goalY(t),dG=hyp(CX-p.x,gy-p.y),pr=pressure(p);
    p.dc-=dt;if(p.dc<=0){p.dc=live&&t===1?.14+rnd()*.12:.22+rnd()*.18;
      const ang=Math.abs(p.x-CX)/Math.max(1,Math.abs(gy-p.y));
      if(Math.abs(p.x-CX)>12&&YN(t,p.y)>.76&&rnd()<.55){let q=null,bs=-1e9;for(const m of P){if(m.t!==t||m.gk||m===p)continue;const dg=hyp(CX-m.x,gy-m.y);if(dg<17&&Math.abs(m.x-CX)<11){const sc=openness(m)-dg*.1;if(sc>bs){bs=sc;q=m}}}if(q){pass(p,q,true);if(rnd()<.5)say('Centre de <b>'+esc(p.sn)+'</b>');return}}
      if(dG<32&&ang<1.5&&(dG<18||rnd()<(32-dG)/32*.8)){if(dG>13&&dG<26&&ang<1.1&&rnd()<.28)curlShot(p);else shoot(p,.55+rnd()*.38,null);return}
      if(pr<1.9&&!(p.skcd>0)&&rnd()<(live&&t===1?.16:.1)){skill(p,true);return}
      if((pr<2.4&&rnd()<.45)||rnd()<.05){const q=bestPass(p,0,0);if(q&&(pr<2.6||YN(t,q.y)>YN(t,p.y)-.02)){pass(p,q,hyp(q.x-p.x,q.y-p.y)>24&&rnd()<.5);return}}
      let dx=(CX-p.x)*.35,dy=(gy-p.y);const L=hyp(dx,dy)||1;dx/=L;dy/=L;
      let o=null,od=6;for(const q of P)if(q.t!==t){const d=hyp(q.x-p.x,q.y-p.y);if(d<od&&((q.y-p.y)*dy+(q.x-p.x)*dx)>-.5){od=d;o=q}}
      if(o){const sx=-(o.y-p.y),sy=o.x-p.x,sl=hyp(sx,sy)||1,side=((CX-p.x)*sx/sl+0)>0?1:-1;const k=(6-od)/6*1.3;dx+=sx/sl*side*k;dy+=sy/sl*side*k;const l2=hyp(dx,dy);dx/=l2;dy/=l2}
      p.mv=[dx,dy]}
    const sp=p.spd*(pr<4?1.02:.92)*(live&&t===1?1.07:1);steer(p,p.x+p.mv[0]*4,p.y+p.mv[1]*4,sp,dt)}
  function offBall(p,dt){const t=p.t,att=(B.own?B.own.t:B.lt)===t;
    if(B.tgt===p&&!B.own){const lead=.35;steer(p,B.x+B.vx*lead,B.y+B.vy*lead,p.spd*1.1,dt);return}
    if(!B.own){const n=chaser[t];if(n===p){steer(p,B.x+B.vx*.35,B.y+B.vy*.35,p.spd*(live&&t===1?1.24:1.12),dt);return}}
    else if(!att){const c=B.own;if(presser[t]===p){const dd=hyp(c.x-p.x,c.y-p.y),stop=t===0&&!G.press?1.6:.4;
        if(dd>stop)steer(p,c.x+c.vx*.25,c.y+c.vy*.25,p.spd*(t===1?(live?1.24:1.1):G.press?1.1:1),dt);else{p.vx*=.85;p.vy*=.85}
        autoTk(p,c,dt);return}
      if(cover[t]===p){const gy=ownY(t),k=(live&&t===1?2.6:4.5)/Math.max(4.5,hyp(CX-c.x,gy-c.y));steer(p,c.x+(CX-c.x)*k,c.y+(gy-c.y)*k,p.spd*(live&&t===1?1.12:1),dt);autoTk(p,c,dt);return}}
    const w=targetOf(p);steer(p,w[0],w[1],p.spd*(att&&p.role==='A'?1:.9)*(live&&t===1?1.08:1),dt);if(B.own&&B.own.t!==t)autoTk(p,B.own,dt)}
  function autoTk(p,c,dt){if(p.cd>0||p.stun>0)return;const d=hyp(c.x-p.x,c.y-p.y);if(d>1.35)return;p.cd=.55;
    const base=live?(p.t===1?.46:.2):.28,ch=cl(base*Math.pow(p.r/c.r,2)*(c===G.ctrl&&inp.sprint?.85:1),.08,live&&p.t===1?.72:.6)*(c.skill>0?.3:1);
    if(rnd()<.045){foul(p,c,false);return}if(rnd()<ch){G.stats.tk++;B.own=p;B.lt=p.t;B.shot=false;B.tgt=null;c.stun=.45;p.cd=.4;if(live&&p.t===1&&c===G.ctrl)vib(25);if(rnd()<.35){say('Ballon récupéré par <b>'+esc(p.sn)+'</b>');com(['Ballon récupéré par {p}.','{p} intercepte !','Bien vu de {p} qui récupère.'],0,{p:p.sn})}if(live&&p.t===0)G.ctrl=p}}
  let chaser=[null,null],presser=[null,null],cover=[null,null];
  function roles(){for(let t=0;t<2;t++){chaser[t]=presser[t]=cover[t]=null;const ex=live&&t===0?G.ctrl:null;
    if(!B.own){let bd=1e9;const tx=B.x+B.vx*.4,ty=B.y+B.vy*.4;for(const p of P)if(p.t===t&&!p.gk&&p!==ex&&p.stun<=0){const d=hyp(p.x-tx,p.y-ty);if(d<bd){bd=d;chaser[t]=p}}
      if(ex&&chaser[t]&&hyp(ex.x-B.x,ex.y-B.y)<bd*.8&&!G.press)chaser[t]=null}
    else if(B.own.t!==t){const c=B.own,L=P.filter(p=>p.t===t&&!p.gk&&p!==ex).sort((a,b)=>hyp(a.x-c.x,a.y-c.y)-hyp(b.x-c.x,b.y-c.y));
      presser[t]=L[0]||null;cover[t]=L[1]||null;if(ex&&hyp(ex.x-c.x,ex.y-c.y)<4&&!G.press){cover[t]=presser[t];presser[t]=null}}}}

  /* ---------- simulation ---------- */
  function refStep(dt){if(REF.cardT>0)REF.cardT-=dt;if(G.ph==='pens')return;const side=B.x<CX?1:-1,tx=cl(B.x+side*7,2,PW-2),ty=cl(B.y+(B.lt===0?5:-5),3,PL-3),dx=tx-REF.x,dy=ty-REF.y,d=hyp(dx,dy);
    const sp=d>2.5?Math.min(6.6,d*1.3):0,a=Math.min(1,dt*4);REF.vx+=((d?dx/d:0)*sp-REF.vx)*a;REF.vy+=((d?dy/d:0)*sp-REF.vy)*a;REF.x+=REF.vx*dt;REF.y+=REF.vy*dt;
    REF.dir=hyp(REF.vx,REF.vy)>.4?Math.atan2(REF.vy,REF.vx):Math.atan2(B.y-REF.y,B.x-REF.x);REF.ph+=hyp(REF.vx,REF.vy)*dt*2.4}
  G.cards=[0,0];
  function sendOff(p){const i=P.indexOf(p);if(i<0)return;P.splice(i,1);if(G.ctrl===p)G.ctrl=null;if(B.own===p)B.own=null;for(let t=0;t<2;t++){if(chaser[t]===p)chaser[t]=null;if(presser[t]===p)presser[t]=null;if(cover[t]===p)cover[t]=null}}
  function foul(off,vic,hard){if(G.ph!=='play'||!vic||!off||off.t===vic.t||!P.includes(vic))return false;
    const behind=hyp(vic.vx,vic.vy)>1&&((off.x-vic.x)*vic.vx+(off.y-vic.y)*vic.vy)<0;
    const sev=rnd()+(behind?.25:0)+(hard?.15:0);let card=null;
    if(!off.gk&&sev>1.12)card='r';else if(sev>.72)card='y';
    if(card==='y'){off.yc=(off.yc||0)+1;if(off.yc>=2&&!off.gk)card='r2'}
    const gy=ownY(off.t),inBox=Math.abs(vic.x-CX)<20.2&&Math.abs(vic.y-gy)<16.5;
    G.nf=(G.nf||0)+1;turf(vic.x,vic.y,8,2);if(rnd()<.6)SN.sifflets();SN.whistle(1);vib(40);REF.card=card?(card==='y'?'y':'r'):null;REF.cardT=card?2.4:0;
    const nm=esc(off.sn),vn=esc(vic.sn),tv=vic.t;
    if(card){G.cards[off.t]++;}
    if(card==='y'){flash('🟨 CARTON JAUNE<small>'+nm+' ('+esc(short(T[off.t].n))+')</small>','post',1.8);say('🟨 Carton jaune pour <b>'+nm+'</b>');com(['Faute de {p} ! Carton jaune !','L\'arbitre sort le carton jaune pour {p} !','Avertissement pour {p}, c\'était trop appuyé !'],3,{p:off.sn})}
    else if(card){flash('🟥 CARTON ROUGE<small>'+nm+(card==='r2'?' · 2e jaune':'')+' · expulsé !</small>','goalA',2.2);say('🟥 Carton rouge pour <b>'+nm+'</b>'+(card==='r2'?' (deuxième jaune)':'')+' !');
      com(card==='r2'?['Deuxième carton jaune pour {p} ! C\'est le rouge ! {T} va finir à dix !','{p} prend un deuxième jaune ! Expulsé !']:['Carton rouge ! {p} est expulsé ! Quel tacle dangereux !','Rouge direct pour {p} ! L\'arbitre ne pardonne pas !'],3,{p:off.sn,T:short(T[off.t].n)})}
    else{say('🟡 Faute de <b>'+nm+'</b> sur '+vn);com(['Faute de {p}.','Coup de sifflet, faute de {p} sur {v}.','L\'arbitre siffle la faute.'],1,{p:off.sn,v:vic.sn})}
    if(card==='r'||card==='r2')sendOff(off);
    vic.stun=0;off.stun=.8;
    if(inBox){const taker=team(tv).filter(q=>!q.gk).sort((a,b)=>b.r-a.r)[0]||vic;P.forEach(q=>{q.vx=q.vy=0;q.slide=0});
      say('⚠️ <b>PENALTY</b> pour '+esc(T[tv].n)+' !');G.ph='pkw';G.phT=card?2.4:1.4;G.pkw={sh:taker,t:tv};setTimeout(()=>{if(G.ph==='pkw'||G.ph==='pens')flash('PENALTY !','goal',1.4)},card?1900:0);com(['Penalty ! L\'arbitre désigne le point de penalty !','Et c\'est penalty !'],3)}
    else{restart(vic,cl(vic.x,2,PW-2),cl(vic.y,2,PL-2),'Coup franc pour '+esc(short(T[tv].n)));G.phT=card?2:1.3}
    return true}

  /* ---------- ralenti des buts ---------- */
  const RB=[];let rbN=0,rbT=0;
  function rbPush(){const pl=[];for(const p of P)pl.push([p,p.x,p.y,p.dir,p.ph,p.vx,p.vy,p.slide,p.stun,p.kick,p.dive,p.diveS,p.head||0,p.spin||0,p.cel||0,p.ks||0,p.spinS||1,p.sad||0]);
    RB.push([B.x,B.y,B.z,B.rot,B.net,B.vx,B.vy,B.own,pl,REF.x,REF.y,REF.dir,REF.ph]);rbN++;if(RB.length>220)RB.shift()}
  function rbTick(dt,fast){if(fast||G.sk)return;rbT+=dt;if(rbT>=1/30){rbT-=1/30;rbPush()}}
  const la=(a,b,u)=>{let d=b-a;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;return a+d*u};
  function rpApply(A,Z,u){const L=i=>A[i]+(Z[i]-A[i])*u;B.x=L(0);B.y=L(1);B.z=L(2);B.rot=L(3);B.net=A[4];B.vx=L(5);B.vy=L(6);B.own=A[7];
    const pb=new Map();for(const e of Z[8])pb.set(e[0],e);
    for(const e of A[8]){const p=e[0],f=pb.get(p)||e;p.x=e[1]+(f[1]-e[1])*u;p.y=e[2]+(f[2]-e[2])*u;p.dir=la(e[3],f[3],u);p.ph=e[4]+(f[4]-e[4])*u;p.vx=e[5];p.vy=e[6];p.slide=e[7];p.stun=e[8];p.kick=e[9];p.dive=e[10];p.diveS=e[11];p.head=e[12];p.spin=e[13];p.cel=e[14];p.ks=e[15];p.spinS=e[16];p.sad=e[17]}
    REF.x=L(9);REF.y=L(10);REF.dir=la(A[11],Z[11],u);REF.ph=L(12)}
  function rpStart(){if(G.noRp)return false;const back=rbN-G.rpMark,gi=RB.length-1-back;if(gi<24)return false;
    const s=Math.max(0,gi-74),e=Math.min(RB.length-1,gi+22);G.rp={fr:RB.slice(s,e+1),f:0};G.ph='replay';BT.length=0;ov.classList.add('rpm');
    com(['Revoyons ce but au ralenti.','Regardez-moi ça au ralenti !','On le revoit, quel but !'],1);return true}
  function rpStep(dt){const R=G.rp;R.f+=dt*30*.55;const n=R.fr.length;
    if(R.skip||R.f>=n-1){ov.classList.remove('rpm');G.rp=null;kickoff(G.next);return}
    const i=Math.floor(R.f);rpApply(R.fr[i],R.fr[Math.min(n-1,i+1)],R.f-i)}
  function rpSkip(){if(G.ph==='replay'&&G.rp)G.rp.skip=true}
  /* ---------- célébrations ---------- */
  function celStep(dt){const C=G.cel;if(!C)return;const s=C.sc;
    for(const p of P){if(p.ks>0){p.ks-=dt;p.vx*=.965;p.vy*=.965}
      else if(p.t===C.t&&!p.gk){
        if(p===s){const d=hyp(C.tx-p.x,C.ty-p.y);if(d>3.2&&!C.slid)steer(p,C.tx,C.ty,p.spd*1.2,dt);
          else{if(!C.slid){C.slid=1;if(C.kneel){p.ks=.85;const a=Math.atan2(C.ty-p.y,C.tx-p.x);p.dir=a;p.vx=Math.cos(a)*6.5;p.vy=Math.sin(a)*6.5;turf(p.x,p.y,10,2)}}else{p.vx*=.9;p.vy*=.9}}p.cel=1}
        else if(s&&G.phT<3.3&&hyp(s.x-p.x,s.y-p.y)<40){const k=p.i,ox=((k%3)-1)*1.25,oy=(((k/3)|0)%3-1)*1.25;steer(p,s.x+ox,s.y+oy,p.spd*1.1,dt);if(hyp(s.x-p.x,s.y-p.y)<4.5)p.cel=1}
        else{p.vx*=.95;p.vy*=.95}}
      else{p.vx*=.92;p.vy*=.92;if(p.t!==C.t)p.sad=1}
      p.x+=p.vx*dt;p.y+=p.vy*dt;const v=hyp(p.vx,p.vy);if(v>.4&&!(p.ks>0))p.dir=la(p.dir,Math.atan2(p.vy,p.vx),Math.min(1,dt*10));p.ph+=v*dt*2.4;
      if(p.head>0)p.head-=dt;if(p.spin>0)p.spin-=dt}}
  /* ---------- gestes techniques ---------- */
  function nearGoal(p){const gy=goalY(p.t),dG=hyp(CX-p.x,gy-p.y),ang=Math.abs(p.x-CX)/Math.max(1,Math.abs(gy-p.y));return dG<27&&ang<1.3}
  function skill(p,ai){if(B.own!==p||p.skcd>0||G.ph!=='play')return;p.skcd=1.1;const t=p.t,gy=goalY(t);
    if(nearGoal(p)&&!(ai&&rnd()<.6)){curlShot(p);return}
    let jx,jy;if(ai){const s=rnd()<.5?1:-1,a=Math.atan2(gy-p.y,(CX-p.x)*.3)+s*.9;jx=Math.cos(a);jy=Math.sin(a)}
    else{[jx,jy]=joyW();if(hyp(jx,jy)<.3){const s=rnd()<.5?1:-1;jx=Math.cos(p.dir+s*1.2);jy=Math.sin(p.dir+s*1.2)}}
    G.stats.sk=(G.stats.sk||0)+1;const l=hyp(jx,jy)||1;jx/=l;jy/=l;p.vx=jx*p.spd*1.5;p.vy=jy*p.spd*1.5;p.dir=Math.atan2(jy,jx);p.spin=.36;p.spinS=rnd()<.5?1:-1;p.skill=.55;
    let beat=0;for(const o of P){if(o.t===t||o.gk)continue;const d=hyp(o.x-p.x,o.y-p.y);if(d<2.6&&rnd()<cl(.58+(p.r-o.r)/80,.3,.88)){o.stun=Math.max(o.stun,.6);o.cd=.7;beat++}}
    say('✨ Geste technique de <b>'+esc(p.sn)+'</b>'+(beat?' : adversaire éliminé !':''));
    if(beat){SN.applause(1.3,.13);com(['Quel crochet de {p} !','Roulette de {p} ! Magnifique !','{p} efface son adversaire !','Petit pont de {p} ! Le public adore !','Passement de jambes de {p} !'],1,{p:p.sn})}
    turf(p.x,p.y,6,2)}
  function curlShot(p){const t=p.t,gy=goalY(t),far=p.x<CX?1:-1,tx=CX+far*(GW/2-.5),d=hyp(tx-p.x,gy-p.y),spd=23+p.r/22,T2=d/spd,off=far*cl(d*.1,1.2,3.4);
    const me=live&&t===0,err=(me?.006:.009)+(100-p.r)/100*(me?.03:.04)+(pressure(p)<1.6?.015:0);
    kick(p,tx+off,gy,spd,cl((1.1+4.9*T2*T2)/T2,0,9),err);B.curl=-2*off/(T2*T2);B.curlT=T2+.4;G.stats.cu=(G.stats.cu||0)+1;B.shot=true;B.shooter=p;B.lockT=.35;G.stats.sh[t]++;
    say((t===0?'🎯 ':'')+'Frappe enroulée de <b>'+esc(p.sn)+'</b> !');CO.quiet=0;com(['Frappe enroulée de {p} !','{p} enroule sa frappe !','Quelle courbe ! {p} vise la lucarne !'],1,{p:p.sn})}
  /* ---------- jeu de tête ---------- */
  function header(p){const t=p.t,gy=goalY(t),dG=hyp(CX-p.x,gy-p.y),me=live&&t===0;p.head=.42;B.own=null;B.lock=p;B.lockT=.3;B.lt=t;B.tgt=null;B.kicker=p;B.gkTry=false;B.curlT=0;
    const good=me&&G.buf==='b0'&&G.bufT>0;if(good)G.buf=null;
    if(dG<21&&Math.abs(p.x-CX)<17){const side=rnd()<.5?-1:1,ax=CX+side*(GW/2-.5)*(.4+rnd()*.6),spd=13+p.r/22+rnd()*3,a=Math.atan2(gy-p.y,ax-p.x)+gauss()*(good?.04:me?.07:.08),T2=dG/spd;
      B.vx=Math.cos(a)*spd;B.vy=Math.sin(a)*spd;B.vz=cl((.4+rnd()*1.4-B.z+4.9*T2*T2)/T2,-4,7);B.shot=true;B.shooter=p;G.stats.sh[t]++;G.stats.hd=(G.stats.hd||0)+1;SN.kick(.55);
      say((t===0?'🎯 ':'')+'Tête de <b>'+esc(p.sn)+'</b> !');CO.quiet=0;com(['Tête de {p} !','{p} s\'élève plus haut que tout le monde !','Coup de tête de {p} !'],2,{p:p.sn})}
    else if(YN(t,p.y)<.4){const a=Math.atan2(fwd(t),(p.x<CX?-.6:.6))+gauss()*.35,spd=14+rnd()*4;B.vx=Math.cos(a)*spd;B.vy=Math.sin(a)*spd;B.vz=5+rnd()*2;B.shot=false;SN.kick(.45);if(rnd()<.4)say('Dégagement de la tête de <b>'+esc(p.sn)+'</b>')}
    else{const q=bestPass(p,Math.cos(p.dir),Math.sin(p.dir))||bestPass(p,0,0);
      if(q){const d=hyp(q.x-p.x,q.y-p.y),spd=cl(8+d*.5,9,16),T2=d/spd,a=Math.atan2(q.y-p.y,q.x-p.x)+gauss()*.08;B.vx=Math.cos(a)*spd;B.vy=Math.sin(a)*spd;B.vz=cl((4.9*T2*T2-B.z)/T2,0,6);B.tgt=q;B.tgtT=T2+1.5;if(live&&t===0&&!q.gk)G.ctrl=q}
      else{const a=Math.atan2(fwd(t),0);B.vx=Math.cos(a)*11;B.vy=Math.sin(a)*11;B.vz=3}B.shot=false;SN.kick(.4)}
    p.dir=Math.atan2(B.vy,B.vx);p.kick=.25;if(me&&!p.gk&&!B.tgt)G.ctrl=p}

  function step(dt,fast){if(G.ph!=='replay')refStep(dt);
    if(G.end)return;
    G.flashT-=dt;if(G.flashT<=0&&FL.classList.contains('on')&&!fast)FL.classList.remove('on');
    if(G.ph==='replay'){rpStep(dt);return}
    if(G.ph==='pens'){pkStep(dt);return}
    if(G.ph!=='play'){G.phT-=dt;
      if(G.ph==='goal'){ballPhys(dt);celStep(dt);rbTick(dt,fast)}
      if(G.phT<=0){if(G.ph==='goal'&&!fast&&!G.sk&&G.speed<4&&rpStart())return;if(G.ph==='goal'||G.ph==='half')kickoff(G.ph==='half'?1:G.next);else if(G.ph==='full'){done(false);return}else if(G.ph==='pre'){pkStart();return}else if(G.ph==='pkw'){const w=G.pkw;G.pkw=null;if(w&&P.includes(w.sh)){pkSingle(w.sh,w.t);return}G.ph='play'}else G.ph='play'}
      if(G.ph==='kick'||G.ph==='out'){P.forEach(p=>{p.vx=p.vy=0})}
      if(G.ph!=='play')return}
    if(G.ph==='play'){G.t+=dt;G.stats.pos[B.own?B.own.t:B.lt]+=dt;
      if(G.t>=HALF&&G.half===1)exAnnounce(0);if(G.t>=HALF*2&&G.half===2)exAnnounce(1);
      if(G.half===1&&G.t>=HALF+G.ex[0]*HALF/45){G.t=HALF;G.half=2;G.ph='half';G.phT=2.4;SN.whistle(2);flash('MI-TEMPS','half',2.2);SN.applause(2.5,.2);com(['C\'est la mi-temps ! {s}.','L\'arbitre siffle la pause. {s}.'],3,{s:scoreTxt()});say('⏸️ Mi-temps : '+G.sc[0]+' - '+G.sc[1]);return}
      if(G.half===2&&G.t>=HALF*2+G.ex[1]*HALF/45){if(G.sc[0]===G.sc[1]){G.ph='pre';G.phT=2.2;SN.whistle(3);flash('MATCH NUL<small>Place aux tirs au but !</small>','half',2.1);com(['Match nul ! On va aux tirs au but ! Le suspense est total !','Égalité à la fin du temps réglementaire ! Place à la séance de tirs au but !'],3);vib([60,40,60]);return}G.ph='full';G.phT=1.6;SN.whistle(3);flash('FIN DU MATCH','half',1.6);com(['C\'est terminé ! Victoire de {W} ! Score final {a} à {b} !','Coup de sifflet final ! {W} l\'emporte {a} à {b} !'],3,{W:tn(G.sc[0]>G.sc[1]?0:1),a:Math.max(...G.sc),b:Math.min(...G.sc)});vib([60,40,60]);return}}
    if(G.bufT>0)G.bufT-=dt;
    if(G.charge>=0){if(live&&B.own!==G.ctrl)G.charge=-1;else G.charge=Math.min(1.2,G.charge+dt*1.1)}
    roles();
    // joueurs
    if(!fast&&!G.sk){G.chT=(G.chT==null?18:G.chT)-dt;if(G.chT<=0){G.chT=26+rnd()*18;SN.chant(false)}}
    for(const p of P){if(p.cd>0)p.cd-=dt;if(p.kick>0)p.kick-=dt;if(p.dive>0)p.dive-=dt;if(p.skcd>0)p.skcd-=dt;if(p.skill>0)p.skill-=dt;if(p.spin>0)p.spin-=dt;if(p.head>0)p.head-=dt;
      if(p.stun>0){p.stun-=dt;if(p.slide>0){p.slide-=dt;const v=hyp(p.vx,p.vy)||1;const s=Math.max(v,7.5);p.vx=Math.cos(p.dir)*s*Math.max(0,p.slide/.38);p.vy=Math.sin(p.dir)*s*Math.max(0,p.slide/.38)}else{p.vx*=.86;p.vy*=.86}}
      else if(p.slide>0){p.slide-=dt;p.vx=Math.cos(p.dir)*8.5;p.vy=Math.sin(p.dir)*8.5;
        const c=B.own;if(c&&c.t!==p.t&&!p.tkDone&&hyp(c.x-p.x,c.y-p.y)<1.5)tryTk(p,c,0);else if(!B.own&&!p.tkDone&&hyp(B.x-p.x,B.y-p.y)<1.2&&B.z<1){p.tkDone=true;p.slide=0;take(p)}
        else if(p.slide<=0&&!p.tkDone)p.stun=.4}
      else if(live&&p===G.ctrl){let [jx,jy]=joyW();const jl=hyp(jx,jy);
        if(B.tgt===p&&!B.own){steer(p,B.x+B.vx*.3,B.y+B.vy*.3,p.spd*1.15,dt)}
        else if(jl<.15&&!B.own&&hyp(B.x-p.x,B.y-p.y)<6&&B.z<1.5){steer(p,B.x,B.y,p.spd,dt)}
        else{const sp=p.spd*(inp.sprint?1.3:1)*(B.own===p?(inp.sprint?.9:.88):1)*(p.skill>0?1.25:1);const a=Math.min(1,dt*7);p.vx+=(jx*sp-p.vx)*a;p.vy+=(jy*sp-p.vy)*a}}
      else if(p.gk)gkThink(p,dt);
      else if(B.own===p)carrierAI(p,dt);
      else offBall(p,dt);
      p.x+=p.vx*dt;p.y+=p.vy*dt;p.x=cl(p.x,-2,PW+2);p.y=cl(p.y,-1.5,PL+1.5);
      const v=hyp(p.vx,p.vy);if(v>.4&&p.slide<=0&&!(p.stun>0)){const a=Math.atan2(p.vy,p.vx);let d=a-p.dir;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;p.dir+=d*Math.min(1,dt*10)}
      else if(v<=.4&&p.stun<=0&&p.slide<=0){const a=Math.atan2(B.y-p.y,B.x-p.x);let d=a-p.dir;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;p.dir+=d*Math.min(1,dt*4)}
      p.ph+=v*dt*2.4}
    // séparation légère
    for(let i=0;i<P.length;i++)for(let j=i+1;j<P.length;j++){const a=P[i],b=P[j],dx=b.x-a.x,dy=b.y-a.y,d=hyp(dx,dy);if(d>0&&d<.85){const k=(.85-d)/2/d;a.x-=dx*k;a.y-=dy*k;b.x+=dx*k;b.y+=dy*k}}
    ballPhys(dt);rbTick(dt,fast);
    G.tt=(G.tt||0)+dt;if(G.tt>.5){G.tt=0;const d=Math.min(hyp(B.x-CX,B.y),hyp(B.x-CX,B.y-PL));SN.tension(cl(1-d/35,0,1))}
    if(live&&G.ctrl&&B.own&&B.own.t===1&&hyp(G.ctrl.x-B.x,G.ctrl.y-B.y)>14&&!G.lockSw){const n=nearest(0,B.x,B.y,true);if(n&&hyp(n.x-B.x,n.y-B.y)<hyp(G.ctrl.x-B.x,G.ctrl.y-B.y)-4)G.ctrl=n}
  }
  function ballPhys(dt){
    if(B.own){const p=B.own,run=hyp(p.vx,p.vy);const off=.62+Math.min(.25,run*.03);B.x=p.x+Math.cos(p.dir)*off;B.y=p.y+Math.sin(p.dir)*off;B.z=0;B.vx=p.vx;B.vy=p.vy;B.vz=0;B.rot+=run*dt*3;
      if(G.ph==='play')outCheck();return}
    if(B.lockT>0)B.lockT-=dt;if(B.tgtT>0){B.tgtT-=dt;if(B.tgtT<=0)B.tgt=null}
    const px=B.x,py=B.y;
    if(B.curlT>0){B.curlT-=dt;B.vx+=B.curl*dt}
    B.vz-=9.8*dt;B.z+=B.vz*dt;if(B.z<=0){B.z=0;if(B.vz<-1.5)B.vz=-B.vz*.45;else B.vz=0}
    const fr=B.z<.05?Math.exp(-1.05*dt):Math.exp(-.12*dt);B.vx*=fr;B.vy*=fr;B.x+=B.vx*dt;B.y+=B.vy*dt;B.rot+=hyp(B.vx,B.vy)*dt*3;
    if(G.ph==='goal'){if(B.y<-1.8){B.y=-1.8;B.vy*=-.2;B.vx*=.5}if(B.y>PL+1.8){B.y=PL+1.8;B.vy*=-.2;B.vx*=.5}B.net=Math.max(0,B.net-dt);return}
    if(G.ph!=='play')return;
    // poteaux / transversale / but
    for(const gy of [0,PL]){if((py-gy)*(B.y-gy)<=0&&py!==B.y){const u=(gy-py)/(B.y-py),cx=px+(B.x-px)*u,dx=Math.abs(cx-CX);
      if(Math.abs(dx-GW/2)<.22&&B.z<GH+.1){B.y=gy+(py>gy?.3:-.3);B.vy=-B.vy*.55;B.vx+=(cx>CX?1:-1)*(dx>GW/2?2:-2);B.shot=false;B.curlT=0;flash('POTEAU !','post',1.1);SN.ooh();say('🥅 Sur le poteau !');com(['Sur le poteau ! Quelle occasion !','Le poteau ! C\'est passé tout près !','Oh le poteau ! Le gardien était battu !'],2);vib(40);return}
      if(dx<GW/2&&Math.abs(B.z-GH)<.18){B.y=gy+(py>gy?.3:-.3);B.vy=-B.vy*.45;B.vz=-Math.abs(B.vz)*.3+1;B.shot=false;B.curlT=0;flash('TRANSVERSALE !','post',1.1);SN.ooh();say('🥅 Sur la barre !');com(['La transversale ! Incroyable !','Sur la barre ! Ça passe tout près !'],2);vib(40);return}
      if(dx<GW/2&&B.z<GH){goal(gy===0?0:1);return}}}
    // gardien
    if(B.shot&&!B.gkTry){const dt2=1-B.kicker.t,g=P.find(p=>p.t===dt2&&p.gk),reach=1.05+(g.r-50)/45*1.25+(B.z>1.2?.2:0),d=hyp(g.x-B.x,g.y-B.y);
      if(d<reach+.45&&B.z<GH+.4){B.gkTry=true;const v=hyp(B.vx,B.vy),sh=B.shooter||B.kicker;
        const ps=cl((live&&sh.t===0?.37:live?.36:.42)+(g.r-sh.r)/55-(v-24)/26-(d>reach*.75?.12:0),.12,.93);g.dive=.55;g.diveS=Math.sign((B.x-g.x)*(dt2===0?1:-1))||1;
        if(rnd()<ps){SN.ooh();B.curlT=0;SN.applause(1.6,.15);G.stats.sv++;if(sh.t===0)G.stats.usv++;if(v<21&&rnd()<.6){B.own=g;B.lt=g.t;B.shot=false;B.tgt=null;say('🧤 <b>'+esc(g.sn)+'</b> capte le ballon');com(['{p} capte le ballon.','Tranquille pour le gardien {p}.','{p} s\'empare du ballon.'],1,{p:g.sn});}
          else{B.vy=(dt2===0?-1:1)*(5+rnd()*5);B.vx=(rnd()<.5?-1:1)*(4+rnd()*8);B.vz=2+rnd()*3;B.shot=false;B.lt=g.t;B.lock=g;B.lockT=.4;say('🧤 Parade de <b>'+esc(g.sn)+'</b> !');com(['Quelle parade de {p} !','Arrêt décisif de {p} !','{p} sort le grand jeu !','Le gardien {p} est impérial !'],2,{p:g.sn})}
          if(live)flash(dt2===0?'ARRÊT !':'ARRÊT DU GARDIEN','save',1);vib(25);return}}}
    // jeu de tête
    if(B.z>1.05&&B.z<2.7&&B.vz<3){let hb=null,hd=1e9;for(const p of P){if(p.gk||p.stun>0||p.slide>0||(B.lockT>0&&B.lock===p))continue;const d=hyp(p.x-B.x,p.y-B.y);if(d<1.05&&d<hd){hd=d;hb=p}}
      if(hb&&(B.z>1.3||hyp(CX-hb.x,goalY(hb.t)-hb.y)<21)&&!P.some(q=>q.gk&&q.t!==hb.t&&B.z<2.5&&hyp(q.x-B.x,q.y-B.y)<1.6)){header(hb);return}}
    // contrôle
    if(B.z<1.7){let best=null,bd=1e9;for(const p of P){if(p.stun>0||(B.lockT>0&&B.lock===p))continue;const reach=p.gk&&inOwnBox(p)?1.5:1.0,d=hyp(p.x-B.x,p.y-B.y);if(d<reach&&d<bd&&(B.z<(p.gk?2.5:1.25))){bd=d;best=p}}
      if(best){const v=hyp(B.vx,B.vy);if(B.shot&&B.kicker&&B.kicker.t===0&&best.t===1&&!best.gk)G.stats.ublk++;if(v>19&&!best.gk&&best!==B.tgt&&rnd()<.55){B.vx*=-.25+rnd()*.3;B.vy*=-.25;B.lock=best;B.lockT=.3;B.lt=best.t;B.shot=false;return}
        take(best)}}
    outCheck()}
  function inOwnBox(p){const gy=ownY(p.t);return Math.abs(p.x-CX)<20.2&&Math.abs(p.y-gy)<16.5}
  function take(p){B.curlT=0;const prev=B.lt;B.own=p;B.lt=p.t;B.shot=false;B.tgt=null;B.tgtT=0;B.vz=0;B.z=0;p.dc=.15+rnd()*.2;
    if(live&&p.t===0&&!p.gk){G.ctrl=p;if(G.buf&&G.bufT>0){const k=G.buf;G.buf=null;const j=joyW();if(k==='b0'){shoot(p,.85,hyp(j[0],j[1])>.25?j[0]:null)}else{const q=bestPass(p,j[0],j[1])||bestPass(p,0,0);pass(p,q,k==='b2')}}}
    if(live&&p.t===1&&prev===0){if(!G.ctrl||hyp(G.ctrl.x-p.x,G.ctrl.y-p.y)>9)G.ctrl=nearest(0,p.x,p.y,true)}}
  function outCheck(){const x=B.x,y=B.y;if(B.shot&&B.kicker&&B.kicker.t===0&&(y<-.15||y>PL+.15||x<-.15||x>PW+.15)&&!(Math.abs(x-CX)<GW/2&&B.z<GH))G.stats.umiss++;if(B.shot&&(y<-.15||y>PL+.15)&&!(Math.abs(x-CX)<GW/2&&B.z<GH))SN.ooh();
    if((y<0||y>PL)&&Math.abs(x-CX)<GW/2&&B.z<GH){if(B.own){B.kicker=B.own;B.own=null}goal(y<0?0:1);return}
    if(x<-.15||x>PW+.15){const t=1-B.lt,p=nearest(t,x,y,true);restart(p,cl(x,.4,PW-.4),cl(y,1,PL-1),'Touche pour '+esc(T[t].n));return}
    if(y<-.15||y>PL+.15){const gl=y<0?0:PL,def=gl===0?1:0,att=1-def;
      if(B.lt===att){const g=P.find(p=>p.t===def&&p.gk);restart(g,CX+(x<CX?-6:6),gl===0?5.5:PL-5.5,'Sortie de but');}
      else{const p=nearest(att,x,gl,true),cx=x<CX?.5:PW-.5;restart(p,cx,gl===0?.5:PL-.5,'🚩 Corner pour '+esc(T[att].n));
        P.filter(q=>q.t===att&&!q.gk&&q!==p&&q.role!=='D').forEach((q,k)=>{q.x=CX+(k-2.5)*3+gauss();q.y=gl===0?6+rnd()*8:PL-6-rnd()*8});
        P.filter(q=>q.t===def&&!q.gk).forEach((q,k)=>{if(q.role!=='A'){q.x=CX+(k-3.5)*2.6;q.y=gl===0?4+rnd()*9:PL-4-rnd()*9}})}}}
  function goal(t){SN.goal(t===0||!live);const k=B.kicker,sc=k&&k.t===t?k:null;G.sc[t]++;G.ph='goal';G.phT=3.6;G.rpMark=rbN;
    {const cs=sc||nearest(t,B.x,B.y,true);G.cel={t,sc:cs,tx:sc?(cs.x<CX?1.6:PW-1.6):cs.x,ty:sc?(goalY(t)===0?1.6:PL-1.6):cs.y,kneel:!!sc&&rnd()<.55,slid:!sc}}
    if(!G.sk){SN.applause(4,.26);setTimeout(()=>{if(!G.end)SN.chant(true)},1600)}G.next=1-t;B.net=1.2;B.shot=false;G.shake=.7;
    G.scorers.push({t,n:sc?sc.n:'csc',m:minute()});ov.querySelector('#cmS').textContent=G.sc[0]+' - '+G.sc[1];
    const who=sc?esc(sc.sn):'contre son camp';flash('BUUUT !<small>'+T[t].e+' '+who+'</small>',t===0?'goal':'goalA',3);
    say('<b>⚽ BUT ! '+(sc?esc(sc.n):'Contre son camp')+'</b> ('+G.sc[0]+'-'+G.sc[1]+')','g'+t);CO.quiet=0;com(sc?['But ! But ! But ! {p} ! Quel but pour {T} ! {s} !','Ouiii ! Et c\'est le but ! {p} trompe le gardien ! {s} !','Quelle frappe ! But de {p} ! {s} !','Goool ! {p} fait trembler les filets ! {s} !','Incroyable ! {p} marque ! {s} !']:['Contre son camp ! Quelle malchance ! {s} !'],3,{p:sc?sc.sn:'',T:tn(t),s:scoreTxt()});vib(t===0?[90,50,90,50,200]:80);
    ov.classList.add('scored');setTimeout(()=>ov.classList.remove('scored'),900);
    if(t===0&&!live)return;if(t===0)confetti()}
  function confetti(){for(let i=0;i<46;i++){const d=document.createElement('i');d.className='cm-cf';d.style.left=(Math.random()*100)+'%';d.style.background=[T[0].c1,T[0].c2,'#facc15','#fff'][i%4];d.style.animationDelay=(Math.random()*.4)+'s';d.style.animationDuration=(1.6+Math.random())+'s';ov.appendChild(d);setTimeout(()=>d.remove(),3200)}}

  /* ---------- tirs au but ---------- */
  const PK={};const PKel=document.createElement('div');PKel.className='cm-pk';
  function pkSingle(sh,t){G.stats.pk=(G.stats.pk||0)+1;G.ph='pens';G.charge=-1;Object.assign(PK,{single:true,gy:goalY(t),turn:t,sh0:sh});pkPrep()}
  function pkStart(){G.ph='pens';G.charge=-1;PK.single=false;PK.gy=0;ov.querySelector('.cm-top').appendChild(PKel);
    Object.assign(PK,{g:[0,0],n:[0,0],res:[[],[]],turn:0,ord:[0,1].map(t=>team(t).filter(p=>!p.gk).sort((a,b)=>b.r-a.r))});
    say('🥅 Match nul : place aux <b>tirs au but</b> !');pkPrep();pkHud()}
  function pkHud(){PKel.innerHTML=[0,1].map(t=>{const n=Math.max(5,PK.n[0],PK.n[1]);let h='<div class="pk-r"><i>'+T[t].e+'</i>';for(let k=0;k<n;k++){const r=PK.res[t][k];h+='<b class="'+(r==null?'':r?'ok':'ko')+'">'+(r==null?'':r?'✓':'✗')+'</b>'}return h+'<em>'+PK.g[t]+'</em></div>'}).join('')}
  function pkPrep(){const t=PK.turn,sh=PK.single?PK.sh0:PK.ord[t][PK.n[t]%PK.ord[t].length],gk=P.find(p=>p.t!==t&&p.gk),Y=y=>PK.gy?PL-y:y,D=PK.gy?-1:1;Object.assign(PK,{sh,gk,st:'prep',t:PK.single?-.6:0,aim:CX,dive:null,dv:0,out:''});
    let k=[0,0];for(const p of P){p.vx=p.vy=0;p.stun=p.slide=p.dive=p.kick=0;p.cel=p.sad=p.ks=p.head=p.spin=0;if(p===sh||p===gk)continue;
      if(PK.single){if(p.gk){p.x=CX;p.y=PL-PK.gy+(PK.gy?.45:-.45);p.dir=D>0?-Math.PI/2:Math.PI/2;continue}const i=k[0]+k[1];p.x=CX-15+i*1.62+(i%2)*.4;p.y=Y(19.5+(i%3)*1.6);k[p.t]++;p.dir=D>0?-Math.PI/2:Math.PI/2}
      else{p.x=CX-15+k[p.t]*3.1+(p.t?1.5:0);p.y=PL/2+(p.t?2:-2);k[p.t]++;p.dir=-Math.PI/2}}
    if(PK.single){REF.x=CX+9;REF.y=Y(15);REF.vx=REF.vy=0}
    sh.x=CX;sh.y=Y(13.6);sh.dir=D>0?-Math.PI/2:Math.PI/2;gk.x=CX;gk.y=Y(.45);gk.dir=D>0?Math.PI/2:-Math.PI/2;
    Object.assign(B,{x:CX,y:Y(11),z:0,vx:0,vy:0,vz:0,own:null,shot:false,tgt:null,net:0});
    G.ctrl=live?(t===0?sh:gk):null;
    const side=rnd()<.42?-1:rnd()<.72?1:0;PK.aiA=CX+side*(side?1.5+rnd()*1.9:rnd()*.8-.4);PK.aiP=.55+rnd()*.37;
    if(PK.single&&!live)return;flash(live?(t===0?'À TOI DE TIRER !<small>'+(PC?'Vise avec les flèches, reste appuyé sur K':'Vise avec le joystick, reste appuyé sur TIR')+'</small>':'ARRÊTE-LE !<small>'+(PC?'Flèche à gauche ou à droite + K pour plonger':'Joystick à gauche ou à droite + PLONGER')+'</small>'):esc(sh.sn),t===0?'post':'save',1.6)}
  function pkKick(ax,pow){if(PK.st!=='aim')return;PK.st='run';PK.t=0;PK.ax=ax;PK.pow=pow}
  function pkStep(dt){PK.t+=dt;const sh=PK.sh,gk=PK.gk,Y=y=>PK.gy?PL-y:y,D=PK.gy?-1:1;if(G.charge>=0)G.charge=Math.min(1.2,G.charge+dt*1.1);if(B.net>0)B.net=Math.max(0,B.net-dt);
    if(PK.st==='prep'){if(PK.t>1.3){PK.st='aim';PK.t=0}return}
    if(PK.st==='aim'){if(live&&PK.turn===0){const j=joyW();PK.aim=CX+cl(j[0],-1,1)*(GW/2+.3)+Math.sin(PK.t*3.2)*.4;if(PK.t>12)pkKick(PK.aim,.6)}
      else if(PK.t>(live?1.5:.9))pkKick(PK.aiA,PK.aiP);return}
    if(PK.st==='run'){const u=Math.min(1,PK.t/.4);sh.y=Y(13.6-2*u);sh.ph+=dt*14;
      if(u>=1){sh.kick=.25;SN.kick(.9);const pow=PK.pow,err=.25+(100-sh.r)/100*.6+Math.max(0,pow-.8)*1.6;let bx=PK.ax+gauss()*err*.8;
        const over=pow>.99||(pow>.95&&rnd()<(pow-.95)*8);
        let dv;if(live&&PK.turn===1)dv=PK.dive==null?0:PK.dive;else{const bs=Math.abs(bx-CX)<1.1?0:Math.sign(bx-CX),pc=cl(.36+(gk.r-sh.r)/150,.2,.55);
          if(rnd()<pc)dv=bs;else{const o=[-1,0,1].filter(x=>x!==bs);dv=o[(rnd()*2)|0]}}
        const dX=CX+dv*2.7,reach=(dv===0?.95:1.3+(gk.r-60)/100)-Math.max(0,pow-.7)*1;const ad=Math.abs(bx-CX);
        PK.out=over?'over':Math.abs(ad-GW/2)<.2?'post':ad>GW/2?'wide':Math.abs(bx-dX)<reach?'save':'goal';
        Object.assign(PK,{st:'flight',t:0,bx,dv,dX,T:11/(17+pow*13),h:over?3.4:.3+rnd()*1.6})}return}
    if(PK.st==='flight'){const u=Math.min(1,PK.t/PK.T);B.x=CX+(PK.bx-CX)*u;B.y=Y(11-11*u);B.z=PK.h*Math.sin(u*Math.PI/2);B.rot+=dt*20;
      gk.x=CX+(PK.dX-CX)*Math.min(1,u*1.5);if(PK.dv){gk.dive=Math.max(.02,.55-u*.6);gk.diveS=PK.dv*(gk.t===0?-1:1)*D}
      if(u>=1){const t=PK.turn,ok=PK.out==='goal';
        if(PK.single&&ok){PK.single=false;B.kicker=sh;B.vx=(PK.bx-CX)*.5;B.vy=-9*D;B.vz=0;G.noRp=true;goal(t);return}
        if(!PK.single){PK.res[t].push(ok);PK.n[t]++;if(ok)PK.g[t]++}PK.st='result';PK.t=0;
        if(ok)SN.goal(t===0||!live);else SN.ooh();
        if(ok){B.vx=(PK.bx-CX)*.5;B.vy=-9*D;B.vz=0;B.net=1.2;flash(t===0?'BUUUT !':'BUT…','goal'+(t===0?'':'A'),1.4);vib(t===0?[80,40,120]:60);if(t===0&&live)confetti()}
        else if(PK.out==='save'){B.vx=(rnd()-.5)*12;B.vy=8*D;B.vz=2;flash(t===1?'ARRÊT !!':'ARRÊT DU GARDIEN','save',1.4);vib(t===1?[60,30,90]:40);if(t===1&&live)confetti()}
        else if(PK.out==='post'){B.vx=(B.x>CX?1:-1)*3;B.vy=7*D;B.vz=1;flash('POTEAU !','post',1.4)}
        else{B.vx=(B.x-CX)*.6;B.vy=-10*D;B.vz=PK.out==='over'?2:0;flash(PK.out==='over'?'AU-DESSUS !':'À CÔTÉ !','post',1.4)}
        say((ok?'✅ ':'❌ ')+'<b>'+esc(sh.sn)+'</b> ('+esc(T[t].n)+')');com(ok?['{p} transforme !','Dans le filet ! {p} ne tremble pas !','{p} marque, imparable !']:PK.out==='save'?['Arrêté ! Quelle parade du gardien !','Le gardien devine et arrête le tir de {p} !']:['Raté ! {p} manque le cadre !','Oh non ! {p} rate son tir au but !'],3,{p:sh.sn});if(!PK.single){pkHud();
        ov.querySelector('#cmS').textContent=G.sc[0]+' - '+G.sc[1]+' ('+PK.g[0]+'-'+PK.g[1]+')'}}return}
    if(PK.st==='result'){const f=Math.exp(-2*dt);B.vx*=f;B.vy*=f;B.x+=B.vx*dt;B.y+=B.vy*dt;B.vz-=9.8*dt;B.z=Math.max(0,B.z+B.vz*dt);if(D>0&&B.y<-1.7){B.y=-1.7;B.vy=0}if(D<0&&B.y>PL+1.7){B.y=PL+1.7;B.vy=0}
      if(PK.t>1.7){if(PK.single){PK.single=false;const g=gk;B.z=0;restart(g,CX,PK.gy?PL-5.5:5.5,PK.out==='save'?'🧤 Penalty arrêté par <b>'+esc(g.sn)+'</b> !':'Penalty manqué !');G.phT=1.2;return}const[a,b]=PK.g,[na,nb]=PK.n;let end=false;
        if(na<=5&&nb<=5){if(a+(5-na)<b||b+(5-nb)<a)end=true}
        if(na>=5&&na===nb&&a!==b)end=true;
        if(end){G.pens=[a,b];G.ph='full';G.phT=2.6;const w=a>b?0:1;setTimeout(()=>com(['{W} remporte la séance de tirs au but, {a} à {b} ! Quel suspense !'],3,{W:tn(w),a:Math.max(a,b),b:Math.min(a,b)}),1300);flash((w===0?'VICTOIRE':'DÉFAITE')+'<small>Tirs au but '+a+' - '+b+'</small>',w===0?'goal':'goalA',2.5);vib(w===0?[90,50,90,50,200]:80);if(w===0&&live)confetti();return}
        PK.turn=1-PK.turn;pkPrep()}}}

  /* ---------- rendu ---------- */
  function draw(dt){
    const pk=G.ph==='pens',rp=G.ph==='replay',Z=S*(pk||rp?1.3:1);
    const cs=G.ph==='goal'&&G.cel&&G.phT<3.1?G.cel.sc:null,lookY=(B.own&&!rp&&!cs?fwd(B.own.t)*5:0),tx=pk?CX:cs?cl(cs.x,0,PW):cl(B.x,0,PW),ty=pk?(PK.gy?PL-(ROT?8:10):(ROT?8:10)):cs?cs.y:B.y+lookY;
    cam.x+=(tx-cam.x)*Math.min(1,dt*(rp?6:3.2));cam.y+=(ty-cam.y)*Math.min(1,dt*(rp?6:3.2));
    const hw=(ROT?H:W)/2/Z,hh=(ROT?W:H)/2/Z;cam.x=PW+26<hw*2?CX:cl(cam.x,hw-13,PW+13-hw);if(!pk)cam.y=cl(cam.y,hh-14,PL+14-hh);
    let sx=0,sy=0;if(G.shake>0){G.shake-=dt;sx=(rnd()-.5)*G.shake*.8;sy=(rnd()-.5)*G.shake*.8}
    ctx.setTransform(DPR,0,0,DPR,0,0);ctx.fillStyle='#0d1322';ctx.fillRect(0,0,W,H);
    const cx=cam.x+sx,cy=cam.y+sy;VW.x0=cx-hw-2;VW.x1=cx+hw+2;VW.y0=cy-hh-2;VW.y1=cy+hh+2;
    if(ROT)ctx.setTransform(0,DPR*Z,-DPR*Z,0,DPR*(W/2+cy*Z),DPR*(H/2-cx*Z));else ctx.setTransform(DPR*Z,0,0,DPR*Z,DPR*(W/2-cx*Z),DPR*(H/2-cy*Z));
    drawStadium(dt);
    drawGoal(0,true);drawGoal(PL,true);
    if(pk&&live&&PK.turn===0&&(PK.st==='aim'||PK.st==='prep')){const ay=PK.gy?PL+.15:-.15,a=PK.aim,pz=.5+Math.sin(performance.now()/120)*.06;ctx.strokeStyle='#facc15';ctx.lineWidth=.12;ctx.beginPath();ctx.arc(a,ay,pz,0,7);ctx.moveTo(a-pz-.3,ay);ctx.lineTo(a+pz+.3,ay);ctx.moveTo(a,ay-pz-.3);ctx.lineTo(a,ay+pz+.3);ctx.stroke()}
    if(pk&&live&&PK.turn===1&&PK.dive!=null&&PK.st!=='result'){ctx.fillStyle='rgba(250,204,21,.35)';ctx.beginPath();ctx.arc(CX+PK.dive*2.7,PK.gy?PL-.4:.4,1.1,0,7);ctx.fill()}
    // ombres + joueurs
    const list=(G.ph==='pens'&&!PK.single?P.slice():P.concat([REF])).filter(p=>vis(p.x,p.y,2.5)).sort((a,b)=>a.y-b.y);
    const ctrl=live&&!rp?G.ctrl:null,jw=joyW(),mdx=hyp(jw[0],jw[1])>.2?jw:null;
    let tgt=null;if(ctrl&&B.own===ctrl)tgt=bestPass(ctrl,mdx?mdx[0]:Math.cos(ctrl.dir),mdx?mdx[1]:Math.sin(ctrl.dir));
    if(tgt){ctx.strokeStyle='rgba(255,255,255,.75)';ctx.lineWidth=.12;ctx.setLineDash([.4,.3]);ctx.beginPath();ctx.arc(tgt.x,tgt.y,1,0,7);ctx.stroke();ctx.setLineDash([])}
    if(ctrl){const g=.85+Math.sin(performance.now()/160)*.08;ctx.fillStyle='rgba(250,204,21,.22)';ctx.beginPath();ctx.ellipse(ctrl.x,ctrl.y+.1,1.15*g,.95*g,0,0,7);ctx.fill();ctx.strokeStyle='#facc15';ctx.lineWidth=.16;ctx.beginPath();ctx.ellipse(ctrl.x,ctrl.y+.1,1.15*g,.95*g,0,0,7);ctx.stroke();
      const a=ctrl.dir;ctx.fillStyle='#facc15';ctx.beginPath();ctx.moveTo(ctrl.x+Math.cos(a)*1.9,ctrl.y+Math.sin(a)*1.9);ctx.lineTo(ctrl.x+Math.cos(a+.35)*1.35,ctrl.y+Math.sin(a+.35)*1.35);ctx.lineTo(ctrl.x+Math.cos(a-.35)*1.35,ctrl.y+Math.sin(a-.35)*1.35);ctx.fill()}
    drawShadows(list);drawParticles(dt,true);
    // ombre du ballon
    ctx.fillStyle='rgba(0,0,0,'+(.32-Math.min(.2,B.z*.04))+')';ctx.beginPath();ctx.ellipse(B.x+.12+B.z*.25,B.y+.15+B.z*.2,.24+B.z*.03,.17+B.z*.02,0,0,7);ctx.fill();
    let ballDrawn=false;
    for(const p of list){if(!ballDrawn&&p.y>B.y){drawBall();ballDrawn=true}drawPlayer(p)}
    if(!ballDrawn)drawBall();
    if(REF.cardT>0&&G.ph!=='pens'){const w=ROT?1.3:.9,h=ROT?.9:1.3,cx=REF.x+(ROT?-2.4:0),cy=REF.y+(ROT?0:-2.4);ctx.fillStyle=REF.card==='r'?'#dc2626':'#facc15';ctx.strokeStyle='#000';ctx.lineWidth=.08;ctx.fillRect(cx-w/2,cy-h/2,w,h);ctx.strokeRect(cx-w/2,cy-h/2,w,h)}
    drawGoal(0,false);drawGoal(PL,false);
    // étiquettes (écran)
    ctx.setTransform(DPR,0,0,DPR,0,0);
    const scr=(x,y)=>ROT?[W/2-(y-cam.y)*Z,H/2+(x-cam.x)*Z]:[W/2+(x-cam.x)*Z,H/2+(y-cam.y)*Z];
    ctx.textAlign='center';ctx.textBaseline='middle';
    const label=(p,col,big)=>{const q=ROT?scr(p.x-1.75,p.y):scr(p.x,p.y-1.75);const s=(big?'':'')+p.sn+' '+p.r;ctx.font=(big?'800 12px':'700 10.5px')+' system-ui,sans-serif';const w=ctx.measureText(s).width+12;
      ctx.fillStyle='rgba(2,6,23,.72)';rr(q[0]-w/2,q[1]-9,w,18,9);ctx.fill();ctx.fillStyle=col;ctx.fillText(s,q[0],q[1]+.5)};
    if(B.own&&B.own!==ctrl)label(B.own,B.own.t===0?'#fff':'#fecaca',false);
    if(ctrl)label(ctrl,'#facc15',true);
    if(ctrl&&G.charge>=0){const q=ROT?scr(ctrl.x+1.6,ctrl.y):scr(ctrl.x,ctrl.y+1.6),v=Math.min(1,G.charge*.8+.3),w=46;ctx.fillStyle='rgba(2,6,23,.75)';rr(q[0]-w/2-2,q[1]-5,w+4,10,5);ctx.fill();
      ctx.fillStyle=v>.96?'#ef4444':v>.75?'#f97316':'#4ade80';rr(q[0]-w/2,q[1]-3,w*Math.min(1,v),6,3);ctx.fill()}
    // vignette
    const vg=ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*.35,W/2,H/2,Math.max(W,H)*.75);vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,.35)');ctx.fillStyle=vg;ctx.fillRect(0,0,W,H);
    drawMini()}
  function rr(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}
  function drawGoal(gy,back){const s=gy===0?-1:1,dep=2.2,x0=CX-GW/2,x1=CX+GW/2,hz=GH*.45,bulge=(B.net>0&&Math.abs(B.y-gy)<3)?Math.sin(B.net*9)*.35*B.net:0;
    if(back){ctx.fillStyle='rgba(255,255,255,.08)';ctx.fillRect(x0,gy,GW,dep*s);ctx.strokeStyle='rgba(255,255,255,.32)';ctx.lineWidth=.05;ctx.beginPath();
      for(let x=x0;x<=x1+.01;x+=.45){ctx.moveTo(x,gy);ctx.lineTo(x+(x-CX)*.04,gy+s*(dep+bulge))}for(let d=0;d<=dep+.01;d+=.45){ctx.moveTo(x0,gy+s*d);ctx.lineTo(x1,gy+s*d)}ctx.stroke();
      ctx.strokeStyle='rgba(255,255,255,.6)';ctx.lineWidth=.08;ctx.beginPath();ctx.moveTo(x0,gy);ctx.lineTo(x0,gy+s*dep);ctx.lineTo(x1,gy+s*dep);ctx.lineTo(x1,gy);ctx.stroke();return}
    if(ROT){ctx.strokeStyle='#f8fafc';ctx.lineWidth=.16;ctx.beginPath();ctx.moveTo(x0,gy);ctx.lineTo(x1,gy);ctx.stroke();ctx.fillStyle='#fff';[x0,x1].forEach(x=>{ctx.beginPath();ctx.arc(x,gy,.17,0,7);ctx.fill()});return}
    // montants + barre (hauteur projetée vers le haut de l'écran)
    ctx.strokeStyle='#f8fafc';ctx.lineWidth=.2;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x0,gy);ctx.lineTo(x0,gy-hz);ctx.lineTo(x1,gy-hz);ctx.lineTo(x1,gy);ctx.stroke();
    ctx.strokeStyle='rgba(255,255,255,.35)';ctx.lineWidth=.05;ctx.beginPath();ctx.moveTo(x0,gy-hz);ctx.lineTo(x0,gy+s*dep);ctx.moveTo(x1,gy-hz);ctx.lineTo(x1,gy+s*dep);ctx.stroke();ctx.lineCap='butt'}
  /* ---------- rendu : stade, pelouse, joueurs (textures pré-calculées) ---------- */
  const GFX={st:{}},PT=[],BT=[],VW={x0:-99,x1:999,y0:-99,y1:999};
  const vis=(x,y,m)=>x>VW.x0-m&&x<VW.x1+m&&y>VW.y0-m&&y<VW.y1+m;
  function blit(img,X0,Y0,WW,WH,r){const kx=img.width/WW,ky=img.height/WH;let x0=Math.max(X0,VW.x0),y0=Math.max(Y0,VW.y0),x1=Math.min(X0+WW,VW.x1),y1=Math.min(Y0+WH,VW.y1);if(r){x0=Math.max(x0,r[0]);y0=Math.max(y0,r[1]);x1=Math.min(x1,r[2]);y1=Math.min(y1,r[3])}if(x1<=x0||y1<=y0)return;
    ctx.drawImage(img,(x0-X0)*kx,(y0-Y0)*ky,(x1-x0)*kx,(y1-y0)*ky,x0,y0,x1-x0,y1-y0)}
  function mkCv(w,h){const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));return c}
  function rng(seed){let s=(seed>>>0)||1;return()=>{s^=s<<13;s>>>=0;s^=s>>17;s^=s<<5;s>>>=0;return s/4294967296}}
  const PX0=-6.5,PY0=-6.5,PWW=PW+13,PWH=PL+13;
  function buildPitch(){const M=Math.min(14,Math.max(9,Math.round(2200/PWH))),c=mkCv(PWW*M,PWH*M),g=c.getContext('2d');
    g.setTransform(M,0,0,M,-PX0*M,-PY0*M);
    g.fillStyle='#2b7a34';g.fillRect(PX0,PY0,PWW,PWH);
    const n=18,h=(PL+6)/n;
    for(let i=-1;i<=n;i++){const y=-3+i*h,gr=g.createLinearGradient(0,y,0,y+h);
      if(i%2){gr.addColorStop(0,'#348e3e');gr.addColorStop(.5,'#3b9a46');gr.addColorStop(1,'#348e3e')}else{gr.addColorStop(0,'#2a7b33');gr.addColorStop(.5,'#2f8439');gr.addColorStop(1,'#2a7b33')}
      g.fillStyle=gr;g.fillRect(PX0,y,PWW,h)}
    for(let i=0;i<12;i++){g.fillStyle=i%2?'rgba(255,255,255,.035)':'rgba(0,0,0,.035)';g.fillRect(-3+i*(PW+6)/12,PY0,(PW+6)/12,PWH)}
    const wear=(x,y,rx,ry,a)=>{g.save();g.translate(x,y);g.scale(rx,ry);const r=g.createRadialGradient(0,0,0,0,0,1);r.addColorStop(0,'rgba(150,128,72,'+a+')');r.addColorStop(1,'rgba(150,128,72,0)');g.fillStyle=r;g.beginPath();g.arc(0,0,1,0,7);g.fill();g.restore()};
    wear(CX,1.5,7,3.5,.4);wear(CX,PL-1.5,7,3.5,.4);wear(CX,PL/2,5,5,.12);wear(CX,11,1.6,1.6,.3);wear(CX,PL-11,1.6,1.6,.3);wear(CX,6,9,5,.12);wear(CX,PL-6,9,5,.12);
    // piste autour (béton) derrière les panneaux
    g.fillStyle='#3b4252';g.fillRect(PX0,PY0,PWW,1.8);g.fillRect(PX0,PL+4.7,PWW,1.8);g.fillRect(PX0,PY0,1.8,PWH);g.fillRect(PW+4.7,PY0,1.8,PWH);
    // grain de l'herbe
    try{const id=g.getImageData(0,0,c.width,c.height),d=id.data,R=rng(11);for(let i=0;i<d.length;i+=4){const k=(R()-.5)*20;d[i]+=k*.55;d[i+1]+=k;d[i+2]+=k*.45}g.putImageData(id,0,0)}catch(e){}
    g.setTransform(M,0,0,M,-PX0*M,-PY0*M);
    // éclairage des projecteurs
    [[-6,-6],[PW+6,-6],[-6,PL+6],[PW+6,PL+6]].forEach(q=>{const r=g.createRadialGradient(q[0],q[1],0,q[0],q[1],70);r.addColorStop(0,'rgba(255,250,220,.13)');r.addColorStop(1,'rgba(255,250,220,0)');g.fillStyle=r;g.fillRect(PX0,PY0,PWW,PWH)});
    const v=g.createRadialGradient(CX,PL/2,PL*.25,CX,PL/2,PL*.72);v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(0,0,0,.22)');g.fillStyle=v;g.fillRect(PX0,PY0,PWW,PWH);
    // bancs de touche
    for(const k of [0,1]){const y0=PL/2+(k?4:-14),tm=T[k];
      g.setLineDash([.5,.4]);g.strokeStyle='rgba(255,255,255,.55)';g.lineWidth=.09;g.strokeRect(-1.7,y0-1,1.4,12);g.setLineDash([]);
      g.fillStyle='#0f172a';g.fillRect(-3.45,y0,1.4,10);
      const R2=rng(5+k);for(let i=0;i<9;i++){const yy=y0+.6+i*1.08;g.fillStyle=tm.c1;g.beginPath();g.ellipse(-2.8,yy,.34,.3,0,0,7);g.fill();g.fillStyle=SKIN[(R2()*SKIN.length)|0];g.beginPath();g.arc(-2.7,yy,.17,0,7);g.fill()}
      g.fillStyle='rgba(190,225,255,.28)';g.strokeStyle='rgba(255,255,255,.6)';g.lineWidth=.07;g.beginPath();g.moveTo(-3.5,y0-.2);g.lineTo(-2.1,y0-.2);g.quadraticCurveTo(-1.8,y0+5,-2.1,y0+10.2);g.lineTo(-3.5,y0+10.2);g.closePath();g.fill();g.stroke()}
    return c}
  // tribunes : 0 = normal, 1/2 = les supporters de l'équipe 0/1 sautent
  const SX0=-24,SY0=-24,SWW=PW+48,SWH=PL+48;
  function buildStands(jump){const M=8,c=mkCv(SWW*M,SWH*M),g=c.getContext('2d');g.setTransform(M,0,0,M,-SX0*M,-SY0*M);
    g.fillStyle='#1b2130';g.fillRect(SX0,SY0,SWW,SWH);
    const R=rng(99),RJ=rng(7),NEU=['#e5e7eb','#94a3b8','#475569','#1e293b','#f59e0b','#dc2626','#2563eb','#0f766e','#f8fafc'];
    const fanT=(x,y)=>y>PL/2+18?0:y<PL/2-18?1:-1;
    const shirt=(t)=>{const r=R();if(t<0)return r<.3?T[0].c1:r<.5?T[1].c1:NEU[(R()*NEU.length)|0];const tm=T[t];return r<.62?tm.c1:r<.82?tm.c2:NEU[(R()*NEU.length)|0]};
    // rangées
    const IN=6.6,row=.85,seat=.56;
    const person=(x,y,ox,oy,t)=>{const j=jump&&t===jump-1&&RJ()<.85;const sx=x+ox*(j?.12:0),sy=y+oy*(j?.12:0);
      g.fillStyle=shirt(t);g.beginPath();g.ellipse(sx,sy,.25,.25,0,0,7);g.fill();
      g.fillStyle=SKIN[(R()*SKIN.length)|0];g.beginPath();g.arc(sx-ox*.05,sy-oy*.05,.12,0,7);g.fill();
      if(R()<.6){g.fillStyle=HAIR[(R()*HAIR.length)|0];g.beginPath();g.arc(sx+ox*.03,sy+oy*.03,.1,0,7);g.fill()}
      if(j){g.fillStyle=SKIN[(RJ()*SKIN.length)|0];const px=-oy,py=ox;g.beginPath();g.arc(sx+px*.3-ox*.15,sy+py*.3-oy*.15,.07,0,7);g.arc(sx-px*.3-ox*.15,sy-py*.3-oy*.15,.07,0,7);g.fill()}};
    for(let r=0;r<22;r++){const d=IN+.45+r*row;
      // marches / sièges
      g.fillStyle=r%2?'#252d3f':'#20283a';
      g.fillRect(-d-row/2,-d-row/2,PW+2*d+row,row);g.fillRect(-d-row/2,PL+d-row/2,PW+2*d+row,row);g.fillRect(-d-row/2,-d,row,PL+2*d);g.fillRect(PW+d-row/2,-d,row,PL+2*d);
      // haut / bas
      for(let x=-d;x<=PW+d;x+=seat){const ai=((x+400)%14)<1.3;if(ai||R()<.1)continue;
        person(x+(R()-.5)*.1,-d,0,-1,fanT(x,-d));person(x+(R()-.5)*.1,PL+d,0,1,fanT(x,PL+d))}
      for(let y=-d+seat;y<=PL+d-seat;y+=seat){const ai=((y+400)%14)<1.3;if(ai||R()<.1)continue;
        person(-d,y+(R()-.5)*.1,-1,0,fanT(-d,y));person(PW+d,y+(R()-.5)*.1,1,0,fanT(PW+d,y))}}
    // allées
    g.fillStyle='rgba(148,163,184,.18)';
    for(let x=-400;x<400;x+=14){if(x+1.3<-IN||x>PW+IN)continue;g.fillRect(x,SY0,1.3,-IN-SY0);g.fillRect(x,PL+IN,1.3,SY0+SWH-PL-IN)}
    for(let y=-400;y<400;y+=14){if(y+1.3<-IN||y>PL+IN)continue;g.fillRect(SX0,y,-IN-SX0,1.3);g.fillRect(PW+IN,y,SX0+SWW-PW-IN,1.3)}
    // muret
    g.fillStyle='#0b0f19';g.fillRect(-IN,-IN,PW+2*IN,.35);g.fillRect(-IN,PL+IN-.35,PW+2*IN,.35);g.fillRect(-IN,-IN,.35,PL+2*IN);g.fillRect(PW+IN-.35,-IN,.35,PL+2*IN);
    // banderoles
    const ban=(x,y,w,h,tm,txt,rot)=>{g.save();g.translate(x,y);g.rotate(rot);g.fillStyle=tm.c1;g.fillRect(-w/2,-h/2,w,h);g.fillStyle=tm.c2;g.fillRect(-w/2,-h/2,w,h*.18);g.fillRect(-w/2,h/2-h*.18,w,h*.18);
      g.fillStyle=tm.c2==='#ffffff'||tm.c2==='#fff'?'#fff':tm.c2;g.font='900 1px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';g.save();g.scale(h*.5,h*.5);g.fillStyle='#fff';g.strokeStyle='rgba(0,0,0,.5)';g.lineWidth=.12;g.strokeText(txt,0,.05);g.fillText(txt,0,.05);g.restore();g.restore()};
    const up=s=>String(s).toUpperCase().slice(0,16);
    const br=ROT?Math.PI:0;ban(CX-13,PL+IN+1.6,17,2.2,T[0],'ALLEZ '+up(T[0].n),br);ban(CX+13,PL+IN+1.6,15,2.2,T[0],up(T[0].n)+' !',br);
    ban(CX,-IN-1.6,17,2.2,T[1],'ALLEZ '+up(T[1].n),br);
    // ombre du toit
    const sh=(x0,y0,x1,y1)=>{const gr=g.createLinearGradient(x0,y0,x1,y1);gr.addColorStop(0,'rgba(0,0,0,0)');gr.addColorStop(1,'rgba(0,0,0,.45)');return gr};
    g.fillStyle=sh(0,-IN-6,0,SY0);g.fillRect(SX0,SY0,SWW,-IN-6-SY0);g.fillStyle=sh(0,PL+IN+6,0,SY0+SWH);g.fillRect(SX0,PL+IN+6,SWW,SY0+SWH-PL-IN-6);
    g.fillStyle=sh(-IN-6,0,SX0,0);g.fillRect(SX0,SY0,-IN-6-SX0,SWH);g.fillStyle=sh(PW+IN+6,0,SX0+SWW,0);g.fillRect(PW+IN+6,SY0,SX0+SWW-PW-IN-6,SWH);
    return c}
  function stands(f){const k=(ROT?'r':'p')+f;if(!GFX.st[k])GFX.st[k]=buildStands(f);return GFX.st[k]}
  // drapeaux qui flottent dans les tribunes
  const FLAGS=(()=>{const R=rng(3),L=[];for(let i=0;i<14;i++){const s=i%4,t=s===1?1:s===3?(R()<.5?0:1):0;let x,y;const d=7.4+R()*4;
      if(s===0){x=4+R()*(PW-8);y=PL+d}else if(s===1){x=4+R()*(PW-8);y=-d}else if(s===2){x=-d;y=8+R()*(PL-16)}else{x=PW+d;y=8+R()*(PL-16)}L.push({x,y,t,ph:R()*6,w:1.6+R()*.8})}return L})();
  function drawFlags(now){for(const f of FLAGS){if(!vis(f.x,f.y,3))continue;const tm=T[f.t],n=6,w=f.w,h=w*.62,a=now/260+f.ph;ctx.fillStyle='#d1d5db';ctx.fillRect(f.x-.04,f.y-.04,.08,.08);
      ctx.beginPath();for(let i=0;i<=n;i++){const u=i/n;ctx.lineTo(f.x+u*w,f.y+Math.sin(a+u*3)*.25*u)}for(let i=n;i>=0;i--){const u=i/n;ctx.lineTo(f.x+u*w,f.y+h+Math.sin(a+u*3)*.25*u)}ctx.closePath();ctx.fillStyle=tm.c1;ctx.fill();
      ctx.beginPath();for(let i=0;i<=n;i++){const u=i/n;ctx.lineTo(f.x+u*w,f.y+h*.4+Math.sin(a+u*3)*.25*u)}for(let i=n;i>=0;i--){const u=i/n;ctx.lineTo(f.x+u*w,f.y+h*.6+Math.sin(a+u*3)*.25*u)}ctx.closePath();ctx.fillStyle=tm.c2;ctx.fill()}}
  function drawTowers(){[[-9.5,-9.5],[PW+9.5,-9.5],[-9.5,PL+9.5],[PW+9.5,PL+9.5]].forEach(q=>{if(!vis(q[0],q[1],6))return;ctx.fillStyle='#64748b';ctx.fillRect(q[0]-.5,q[1]-.5,1,1);
      const g=ctx.createRadialGradient(q[0],q[1],0,q[0],q[1],5);g.addColorStop(0,'rgba(255,253,230,.9)');g.addColorStop(.25,'rgba(255,250,210,.35)');g.addColorStop(1,'rgba(255,250,210,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(q[0],q[1],5,0,7);ctx.fill();
      ctx.fillStyle='#334155';ctx.fillRect(q[0]-1.6,q[1]-1,3.2,2);ctx.fillStyle='#fffbe6';for(let i=0;i<4;i++)for(let j=0;j<2;j++)ctx.fillRect(q[0]-1.45+i*.75,q[1]-.85+j*.9,.6,.7)})}
  function drawBoards(now){const cel=G.ph==='goal'&&G.cel,blink=Math.floor(now/180)%2;
    const ads=['PRONO-CLUB.FR','⚽ MON CLUB','PRONOS GRATUITS','PRONO-CLUB.FR'];
    const board=(x,y,w,h,k,rot,idx)=>{if(x+w<VW.x0||x>VW.x1||y+h<VW.y0||y>VW.y1)return;ctx.fillStyle='#05070d';ctx.fillRect(x,y,w,h);let bg,tx,fg;
      if(cel){const tm=T[G.cel.t];bg=blink?tm.c1:'#05070d';fg=blink?(tm.c2.toLowerCase()===tm.c1.toLowerCase()?'#fff':tm.c2):tm.c1;tx='BUUUT !'}
      else{const ph=Math.floor(now/4000+idx*.37)%3;bg=ph===0?(k%2?'#c2185b':'#0b5bd3'):ph===1?'#0f172a':'#15803d';fg='#fff';tx=ads[(k+Math.floor(now/4000))%ads.length]}
      ctx.fillStyle=bg;ctx.fillRect(x+.06,y+.06,w-.12,h-.12);
      ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.translate(x+w/2,y+h/2);ctx.rotate(ROT?(w>h?Math.PI:-Math.PI/2):rot);ctx.scale(.05,.05);ctx.fillStyle=fg;ctx.font='900 13px system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      const L=Math.max(w,h)*20,o=cel?0:((now/40+idx*90)%(L+260))-L/2-130;ctx.fillText(tx,cel?0:-o,1);ctx.restore()};
    let idx=0;for(let k=0;k<6;k++){board(-1+k*(PW+2)/6,-4.4,(PW+2)/6-.15,1,k,0,idx++);board(-1+k*(PW+2)/6,PL+3.4,(PW+2)/6-.15,1,k+1,0,idx++)}
    for(let k=0;k<9;k++){board(-4.6,-1+k*(PL+2)/9,1,(PL+2)/9-.15,k,-Math.PI/2,idx++);board(PW+3.6,-1+k*(PL+2)/9,1,(PL+2)/9-.15,k+1,Math.PI/2,idx++)}}
  function drawLines(){ctx.strokeStyle='rgba(255,255,255,.9)';ctx.lineWidth=.12;ctx.beginPath();ctx.rect(0,0,PW,PL);ctx.moveTo(0,PL/2);ctx.lineTo(PW,PL/2);ctx.stroke();
    ctx.beginPath();ctx.arc(CX,PL/2,9.15,0,7);ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,.92)';[[CX,PL/2],[CX,11],[CX,PL-11]].forEach(q=>{ctx.beginPath();ctx.arc(q[0],q[1],.22,0,7);ctx.fill()});
    for(const gy of [0,PL]){const s=gy===0?1:-1;ctx.beginPath();ctx.rect(CX-20.16,gy,40.32,16.5*s);ctx.rect(CX-9.16,gy,18.32,5.5*s);ctx.stroke();
      ctx.beginPath();const a0=Math.acos(5.5/9.15);if(s>0)ctx.arc(CX,11,9.15,a0,Math.PI-a0);else ctx.arc(CX,PL-11,9.15,Math.PI+a0,2*Math.PI-a0);ctx.stroke();
      [[0,gy],[PW,gy]].forEach(c=>{ctx.beginPath();const st=c[0]===0?(s>0?0:-Math.PI/2):(s>0?Math.PI/2:Math.PI);ctx.arc(c[0],c[1],1,st,st+Math.PI/2);ctx.stroke()})}
    const now=performance.now();[[0,0],[PW,0],[0,PL],[PW,PL]].forEach((c,i)=>{ctx.strokeStyle='#e5e7eb';ctx.lineWidth=.08;ctx.beginPath();ctx.moveTo(c[0],c[1]);ctx.lineTo(c[0],c[1]-1.1);ctx.stroke();const w=Math.sin(now/200+i)*.12;
      ctx.fillStyle=i<2?T[1].c1:T[0].c1;ctx.beginPath();ctx.moveTo(c[0],c[1]-1.1);ctx.quadraticCurveTo(c[0]+.4,c[1]-1.1+w,c[0]+.75,c[1]-.85+w);ctx.lineTo(c[0],c[1]-.55);ctx.fill()})}
  function drawStadium(dt){const now=performance.now();
    if(!GFX.pitch)GFX.pitch=buildPitch();
    let f=0;if(G.ph==='goal'&&G.cel&&Math.floor(now/170)%2)f=G.cel.t+1;
    {const im=stands(f),a=PX0+.05,b=PY0+.05,c=PX0+PWW-.05,d=PY0+PWH-.05,X1=SX0+SWW,Y1=SY0+SWH;
      blit(im,SX0,SY0,SWW,SWH,[SX0,SY0,X1,b]);blit(im,SX0,SY0,SWW,SWH,[SX0,d,X1,Y1]);blit(im,SX0,SY0,SWW,SWH,[SX0,b,a,d]);blit(im,SX0,SY0,SWW,SWH,[c,b,X1,d])}
    drawFlags(now);drawTowers();
    blit(GFX.pitch,PX0,PY0,PWW,PWH);
    drawBoards(now);drawLines();
    // flashs des photographes + fumigènes
    if(G.ph==='goal'&&G.cel){for(let i=0;i<3;i++){const s=(rnd()*4)|0,d=7+rnd()*12;let x,y;if(s<2){x=-8+rnd()*(PW+16);y=s?PL+d:-d}else{y=-8+rnd()*(PL+16);x=s===2?-d:PW+d}PT.push({k:'fl',x,y,l:.12,m:.12})}
      if(rnd()<.5){const t=G.cel.t,y=t===0?PL+8+rnd()*8:-8-rnd()*8,x=rnd()*PW;PT.push({k:'sm',x,y,vx:(rnd()-.5)*.6,vy:(t===0?1:-1)*.5,l:3.5,m:3.5,c:T[t].c1})}}
    drawParticles(dt,false)}
  function drawParticles(dt,ground){for(let i=PT.length-1;i>=0;i--){const q=PT[i];if((q.k==='gr')!==ground)continue;q.l-=dt;if(q.l<=0){PT.splice(i,1);continue}const u=q.l/q.m;
      if(q.k==='fl'){ctx.fillStyle='rgba(255,255,255,'+u+')';ctx.beginPath();ctx.arc(q.x,q.y,.35+(1-u)*.5,0,7);ctx.fill()}
      else if(q.k==='sm'){q.x+=q.vx*dt;q.y+=q.vy*dt;ctx.globalAlpha=u*.32;ctx.fillStyle=q.c;ctx.beginPath();ctx.arc(q.x,q.y,1+(1-u)*3.5,0,7);ctx.fill();ctx.globalAlpha=1}
      else{q.x+=q.vx*dt;q.y+=q.vy*dt;q.z=Math.max(0,q.z+q.vz*dt);q.vz-=9.8*dt;ctx.fillStyle=q.c;ctx.globalAlpha=Math.min(1,u*1.5);const px=ROT?q.x-q.z*.5:q.x,py=ROT?q.y:q.y-q.z*.5;ctx.fillRect(px-.06,py-.06,.12,.12);ctx.globalAlpha=1}}
    if(PT.length>400)PT.splice(0,PT.length-400)}
  function turf(x,y,n,sp){for(let i=0;i<n;i++){const a=rnd()*7,v=(.5+rnd())*sp;PT.push({k:'gr',x,y,z:0,vx:Math.cos(a)*v,vy:Math.sin(a)*v,vz:1.5+rnd()*2.5,l:.5+rnd()*.4,m:.9,c:rnd()<.7?'#3f9a48':'#6b5432'})}}
  function drawBall(){const x=ROT?B.x-B.z*.5:B.x,y=ROT?B.y:B.y-B.z*.5,r=.27*(1+B.z*.06),sp=hyp(B.vx,B.vy);
    if(!B.own&&sp>12&&G.ph!=='pens'){BT.push([x,y]);if(BT.length>10)BT.shift()}else BT.length=0;
    for(let i=1;i<BT.length;i++){const u=i/BT.length;ctx.strokeStyle='rgba(255,255,255,'+(u*.45)+')';ctx.lineWidth=r*1.6*u;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(BT[i-1][0],BT[i-1][1]);ctx.lineTo(BT[i][0],BT[i][1]);ctx.stroke()}ctx.lineCap='butt';
    ctx.save();ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.fillStyle='#f8fafc';ctx.fill();ctx.clip();
    const a0=B.rot,ox=Math.sin(a0)*r*.55,oy=Math.cos(a0*.8)*r*.4;ctx.fillStyle='#111827';
    const pent=(cx,cy,s,rot)=>{ctx.beginPath();for(let k=0;k<5;k++){const a=rot+k*1.2566;ctx.lineTo(cx+Math.cos(a)*s,cy+Math.sin(a)*s)}ctx.closePath();ctx.fill()};
    pent(x+ox,y+oy,r*.3,a0);for(let k=0;k<5;k++){const a=a0+k*1.2566;pent(x+ox+Math.cos(a)*r*.86,y+oy+Math.sin(a)*r*.86,r*.26,a+Math.PI)}
    const g=ctx.createRadialGradient(x-r*.4,y-r*.4,r*.05,x,y,r*1.05);g.addColorStop(0,'rgba(255,255,255,.7)');g.addColorStop(.45,'rgba(255,255,255,0)');g.addColorStop(1,'rgba(0,0,0,.45)');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,2*r,2*r);ctx.restore();
    ctx.strokeStyle='rgba(0,0,0,.55)';ctx.lineWidth=.03;ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.stroke()}
  function hairStyle(p){return p.hs!=null?p.hs:(p.hs=p.bald?-1:hash(p.n+'h')%4)}
  function drawPlayer(p){const tm=T[p.t]||T[0];let c1,c2,sh,sock;
    if(p.ref){c1='#151515';c2='#facc15';sh='#0b0b0b';sock='#0b0b0b'}else if(p.coach){c1='#1f2937';c2='#475569';sh='#111827';sock='#111827'}
    else if(p.gk){c1=gkCol(tm.c1);c2='#111827';sh='#111827';sock=c1}else{c1=tm.c1;c2=tm.c2;sh=shade(tm.c1,.42);sock=tm.c2}
    ctx.save();ctx.translate(p.x,p.y);let K=1.62;if(p.head>0){const u=cl(1-p.head/.42,0,1);K*=1+Math.sin(Math.PI*u)*.3}ctx.scale(K,K);
    let rot=p.dir;if(p.spin>0)rot+=(1-p.spin/.36)*Math.PI*2*(p.spinS||1);ctx.rotate(rot);
    const down=p.stun>0&&p.slide<=0&&p.stun>.2,sliding=p.slide>0||p.ks>0,diving=p.dive>0,cel=p.cel>0,sad=p.sad>0;
    if(diving)ctx.rotate(p.diveS*Math.PI/2*Math.min(1,(.55-p.dive)*6));
    const ph=p.ph,v=hyp(p.vx,p.vy),sw=Math.min(1,v/3)*.4;
    if(sliding||down){ctx.fillStyle=sh;ctx.beginPath();ctx.ellipse(.18,0,.3,.27,0,0,7);ctx.fill();
      ctx.fillStyle=sock;[[.72,-.15],[.72,.15]].forEach(q=>{ctx.beginPath();ctx.ellipse(q[0],q[1],.34,.1,0,0,7);ctx.fill()});
      ctx.fillStyle='#0b0b0b';[[1.08,-.15],[1.08,.15]].forEach(q=>{ctx.beginPath();ctx.ellipse(q[0],q[1],.12,.09,0,0,7);ctx.fill()});ctx.translate(-.3,0)}
    else{const l=Math.sin(ph)*sw,kk=p.kick>0?(.25-p.kick)*2.6:0;
      for(const s of [-1,1]){const ll=(s<0?l+(kk>0?kk*.6:0):-l);ctx.fillStyle=sock;ctx.beginPath();ctx.ellipse(ll*.9,s*.16,.24,.1,0,0,7);ctx.fill();
        ctx.fillStyle='#0b0b0b';ctx.beginPath();ctx.ellipse(ll+.18,s*.16,.11,.085,0,0,7);ctx.fill();ctx.fillStyle='rgba(255,255,255,.55)';ctx.fillRect(ll+.15,s*.16-.015,.08,.03)}
      ctx.fillStyle=sh;ctx.beginPath();ctx.ellipse(-.02,0,.23,.31,0,0,7);ctx.fill()}
    // bras
    if(cel&&!down){for(const s of [-1,1]){ctx.fillStyle=c1;ctx.beginPath();ctx.ellipse(.2,s*.55,.32,.1,s*.5,0,7);ctx.fill();ctx.fillStyle=p.skin;ctx.beginPath();ctx.arc(.48,s*.72,.09,0,7);ctx.fill()}}
    else if(sad&&!down){for(const s of [-1,1]){ctx.fillStyle=c1;ctx.beginPath();ctx.ellipse(.05,s*.38,.2,.1,-s*.9,0,7);ctx.fill();ctx.fillStyle=p.skin;ctx.beginPath();ctx.arc(.13,s*.18,.08,0,7);ctx.fill()}}
    else{const a=sliding||down?0:Math.sin(ph)*sw*.7;
      ctx.fillStyle=c1;ctx.beginPath();ctx.ellipse(-a,-.47,.18,.12,0,0,7);ctx.fill();ctx.beginPath();ctx.ellipse(a,.47,.18,.12,0,0,7);ctx.fill();
      ctx.fillStyle=c2;ctx.beginPath();ctx.ellipse(-a-.02,-.52,.06,.1,0,0,7);ctx.fill();ctx.beginPath();ctx.ellipse(a-.02,.52,.06,.1,0,0,7);ctx.fill();
      ctx.fillStyle=p.gk?'#e5e7eb':p.skin;ctx.beginPath();ctx.arc(-a*1.6+.05,-.54,.085,0,7);ctx.fill();ctx.beginPath();ctx.arc(a*1.6+.05,.54,.085,0,7);ctx.fill()}
    // torse + reflets
    ctx.fillStyle=c1;ctx.beginPath();ctx.ellipse(0,0,.29,.48,0,0,7);ctx.fill();
    if(!p.ref&&!p.coach&&!p.gk){ctx.fillStyle=c2;ctx.globalAlpha=.9;ctx.beginPath();ctx.ellipse(-.03,0,.29,.08,0,0,7);ctx.fill();ctx.globalAlpha=1}
    if(p.ref){ctx.fillStyle=c2;ctx.beginPath();ctx.ellipse(0,-.44,.12,.07,0,0,7);ctx.fill();ctx.beginPath();ctx.ellipse(0,.44,.12,.07,0,0,7);ctx.fill()}
    ctx.fillStyle='rgba(255,255,255,.16)';ctx.beginPath();ctx.ellipse(.07,-.12,.15,.26,0,0,7);ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,.4)';ctx.lineWidth=.045;ctx.beginPath();ctx.ellipse(0,0,.29,.48,0,0,7);ctx.stroke();
    ctx.strokeStyle=c2;ctx.lineWidth=.045;ctx.beginPath();ctx.arc(.06,0,.2,-.9,.9);ctx.stroke();
    // tête
    const hx=sad?.08:.04;ctx.fillStyle=p.skin;ctx.beginPath();ctx.arc(hx,0,.19,0,7);ctx.fill();
    const hs=hairStyle(p);ctx.fillStyle=p.hair;
    if(hs===0){ctx.beginPath();ctx.arc(hx-.03,0,.195,Math.PI*.5,Math.PI*1.5);ctx.arc(hx,0,.12,Math.PI*1.5,Math.PI*.5,true);ctx.fill()}
    else if(hs===1){ctx.beginPath();ctx.arc(hx-.02,0,.18,0,7);ctx.fill();ctx.fillStyle=p.skin;ctx.beginPath();ctx.ellipse(hx+.1,0,.08,.13,0,0,7);ctx.fill()}
    else if(hs===2){ctx.beginPath();ctx.arc(hx-.04,0,.25,Math.PI*.35,Math.PI*1.65);ctx.fill();ctx.fillStyle=p.skin;ctx.beginPath();ctx.arc(hx+.06,0,.13,0,7);ctx.fill()}
    else if(hs===3){ctx.beginPath();ctx.arc(hx-.02,0,.18,Math.PI*.45,Math.PI*1.55);ctx.fill();ctx.beginPath();ctx.arc(hx-.24,0,.08,0,7);ctx.fill()}
    ctx.fillStyle='rgba(255,255,255,.2)';ctx.beginPath();ctx.arc(hx+.06,-.06,.07,0,7);ctx.fill();
    ctx.restore()}
  function drawShadows(list){const o=[[.5,.45],[-.5,-.45]];
    for(const p of list){const k=p.head>0?1.3:1;ctx.fillStyle='rgba(0,0,0,.22)';ctx.beginPath();ctx.ellipse(p.x+.22*k,p.y+.28*k,.7,.48,0,0,7);ctx.fill();
      ctx.fillStyle='rgba(0,0,0,.09)';for(const q of o){ctx.beginPath();ctx.ellipse(p.x+q[0]*1.6*k,p.y+q[1]*1.6*k,.75,.5,Math.atan2(q[1],q[0]),0,7);ctx.fill()}}}
  function drawMini(){const k=1.4*DPR,w=mini.width,h=mini.height;mc.setTransform(1,0,0,1,0,0);mc.clearRect(0,0,w,h);mc.fillStyle='rgba(22,101,52,.82)';mc.fillRect(0,0,w,h);
    if(ROT)mc.setTransform(0,k,-k,0,w,0);else mc.setTransform(k,0,0,k,0,0);const L=1/k;
    mc.strokeStyle='rgba(255,255,255,.55)';mc.lineWidth=DPR*L;mc.strokeRect(.5,.5,PW-1,PL-1);mc.beginPath();mc.moveTo(0,PL/2);mc.lineTo(PW,PL/2);mc.stroke();mc.strokeRect(CX-20.16,0,40.32,16.5);mc.strokeRect(CX-20.16,PL-16.5,40.32,16.5);
    for(const p of P){mc.fillStyle=p===G.ctrl?'#facc15':p.t===0?T[0].c1:T[1].c1;if(p.t===1&&T[1].c1.toLowerCase()===T[0].c1.toLowerCase())mc.fillStyle='#fff';mc.beginPath();mc.arc(p.x,p.y,(p===G.ctrl?3.2:2.3)*DPR*L,0,7);mc.fill();if(p.t===1){mc.strokeStyle='rgba(0,0,0,.6)';mc.lineWidth=DPR*.8*L;mc.stroke()}}
    mc.fillStyle='#fff';mc.beginPath();mc.arc(B.x,B.y,2*DPR*L,0,7);mc.fill()}

  /* ---------- boucle ---------- */
  const L0=ov.querySelector('#cmL0'),L1=ov.querySelector('#cmL1'),L2=ov.querySelector('#cmL2'),PW0=ov.querySelector('#cmPow');let lm='';
  function hud(){ov.querySelector('#cmM').textContent=minute()+'\'';
    if(!live)return;const m=mode();let dm=(m==='def'||(m==='free'&&B.lt===1))?'def':'att';if(G.ph==='pens')dm=PK.turn===0?'pkt':'pkg';
    if(dm!==lm){lm=dm;ov.classList.toggle('defm',dm==='def'||dm==='pkg');ov.classList.toggle('pkm',dm[0]==='p');
      if(dm[0]==='p'){L0.textContent=dm==='pkt'?'TIR':'PLONGER'}else
      L0.textContent=dm==='def'?'TACLE':'TIR';L1.textContent=dm==='def'?'CHANGER':'PASSE';L2.textContent=dm==='def'?'PRESSING':'LOB'}
    ov.querySelector('.b-2').classList.toggle('lit',dm==='def'&&!!G.press);
    {const L3=ov.querySelector('#cmL3'),c=G.ctrl;const lb=c&&B.own===c&&nearGoal(c)?'ENROULÉ':'GESTE';if(L3&&L3.textContent!==lb)L3.textContent=lb}
    PW0.style.width=G.charge>=0?Math.min(100,(G.charge*.8+.3)*100)+'%':'0'}
  let last=performance.now(),acc=0;
  function loop(now){if(G.end)return;const dt=Math.min(.05,(now-last)/1000);last=now;
    if(!paused){coTick(dt);acc+=dt*G.speed;let n=0;while(acc>=1/60&&n<8){step(1/60);acc-=1/60;n++}if(n>=8)acc=0}
    if(G.end)return;draw(dt);hud();requestAnimationFrame(loop)}
  function done(abandon){if(G.end)return;G.end=true;if(abandon)try{SS&&SS.cancel()}catch(_){}setTimeout(()=>SN.stop(),2500);window.removeEventListener('resize',resize);G.offKeys&&G.offKeys();
    exitFS();const res={pens:G.pens||null,sh:G.sc[0],sa:G.sc[1],scorers:G.scorers,abandon:!!abandon,live,shots:G.stats.sh,st:G.stats,poss:Math.round(G.stats.pos[0]/Math.max(1,G.stats.pos[0]+G.stats.pos[1])*100)};
    ov.querySelectorAll('.cm-joy,.cm-pad,.cm-spd,.cm-feed,.cm-flash,.cm-mini').forEach(x=>x.remove());
    setTimeout(()=>cfg.onEnd&&cfg.onEnd(ov,res),abandon?0:300)}
  function coIntro(){com(['Bonsoir à tous et bienvenue pour ce match entre {A} et {B} ! L\'arbitre siffle le coup d\'envoi !','Coup d\'envoi de cette rencontre entre {A} et {B} ! C\'est parti !','Les deux équipes sont prêtes, {A} contre {B}, place au jeu !'],3,{A:tn(0),B:tn(1)})}
  kickoff(0);if(!live)setTimeout(coIntro,300);
  setTimeout(()=>{try{stands(1)}catch(e){}},1800);setTimeout(()=>{try{stands(2)}catch(e){}},3200);
  if(!live){/* regarder : rien à attendre */}
  requestAnimationFrame(t=>{last=t;loop(t)});
  return{ov,G,P,B,step,act,inp,pk:pkSingle}
}


/* ---------- styles ---------- */
const css=`
.cm-ov{padding:0!important;display:block!important;touch-action:none;user-select:none;-webkit-user-select:none;overflow:hidden}
.cm-cv{position:absolute;inset:0;display:block}
.cm-top{position:absolute;left:0;right:0;top:0;padding:calc(8px + env(safe-area-inset-top)) 10px 0;display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none;z-index:3}
.cm-top>*{pointer-events:auto}
.cm-x{position:absolute;left:10px;top:calc(10px + env(safe-area-inset-top));width:36px;height:36px;border-radius:12px;border:0;background:rgba(2,6,23,.6);color:#fff;font-size:16px;font-weight:900}
.cm-snd{left:54px!important;font-size:15px!important}
.cm-b .kh{display:none;position:absolute;bottom:9px;left:0;right:0;font-size:9.5px;font-weight:800;opacity:.85;pointer-events:none}
.cm-ov.pc .cm-b .kh{display:block}.cm-ov.pc .cm-b span{transform:translateY(-5px)}
.cm-ov.pc .cm-pad{transform:scale(.72);transform-origin:right bottom;opacity:.8}
.cm-ov.pc .cm-joy{display:none}.cm-ov.pc .cm-joy.on{display:block}
.cm-com{left:98px!important;font-size:15px!important}.cm-com.off{opacity:.45;text-decoration:line-through}.cm-kb{left:142px!important;font-size:15px!important}.cm-gp{left:186px!important;font-size:15px!important}.cm-gp.m{left:142px!important}.cm-gp[hidden]{display:none!important}.cm-ov:has(#cmPad) #cmHelp,.cm-ov:has(#cmCom) #cmHelp{visibility:hidden}.cm-kp .ck-l{max-height:46vh;overflow:auto}.cm-ov:has(#cmKeys) #cmHelp{visibility:hidden}.cm-kp{background:rgba(2,6,23,.98)!important}.cm-kp{z-index:8}.ck-l{display:grid;gap:6px;margin:8px 0}
.ck-r{display:flex!important;justify-content:space-between;align-items:center;margin:0!important;padding:10px 12px!important;font-size:14px!important;font-weight:700!important;background:rgba(255,255,255,.08)!important;color:#fff!important;border-radius:12px!important}
.ck-r b{display:inline!important;margin:0!important;font-size:14px!important;background:rgba(255,255,255,.15);border-radius:8px;padding:3px 10px;min-width:40px;text-align:center}.ck-r.cap b{background:#facc15;color:#111}
.cm-keys{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);z-index:3;background:rgba(2,6,23,.66);border-radius:999px;padding:6px 14px;font-size:12px;white-space:nowrap;pointer-events:none}
.cm-ov.pc.land .cm-mini{bottom:46px}
.cm-sb{display:flex;align-items:stretch;background:rgba(2,6,23,.82);border-radius:14px;overflow:hidden;box-shadow:0 6px 20px rgba(0,0,0,.4);max-width:calc(100% - 100px)}
.cm-tm{display:flex;align-items:center;gap:6px;padding:6px 9px;font-size:12px;font-weight:800;min-width:0;border-left:4px solid var(--a)}
.cm-tm.r{border-left:0;border-right:4px solid var(--a)}.cm-tm b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:22vw}.cm-tm i{font-style:normal;font-size:16px}
.cm-sc{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:3px 12px;background:#fff;color:#0b1220}
.cm-sc b{font-size:19px;font-weight:900;line-height:1;white-space:nowrap}.cm-sc small{font-size:10px;font-weight:800;color:#16a34a}
.cm-ov.scored .cm-sc b{animation:mvPop .8s ease}
.cm-spd{display:flex;gap:6px}.cm-spd button{border:0;border-radius:10px;padding:6px 12px;font-weight:800;background:rgba(2,6,23,.65);color:#fff}.cm-spd button.on{background:#facc15;color:#111}
.cm-mini{position:absolute;right:8px;top:calc(56px + env(safe-area-inset-top));width:68px;height:105px;border-radius:6px;opacity:.92;z-index:2;box-shadow:0 4px 14px rgba(0,0,0,.35)}
.cm-ov.watch .cm-mini{top:calc(92px + env(safe-area-inset-top))}
.cm-feed{position:absolute;left:8px;top:calc(56px + env(safe-area-inset-top));width:min(58vw,280px);display:flex;flex-direction:column;gap:4px;z-index:2;pointer-events:none}
.cm-ov.watch .cm-feed{top:calc(92px + env(safe-area-inset-top))}
.cm-e{background:rgba(2,6,23,.7);border-radius:10px;padding:5px 9px;font-size:12px;line-height:1.3;transition:opacity .6s;animation:mvIn .3s ease}.cm-e.old{opacity:.45}.cm-e em{font-style:normal;color:#facc15;font-weight:800}
.cm-e.g0{background:linear-gradient(90deg,rgba(22,163,74,.9),rgba(2,6,23,.7))}.cm-e.g1{background:linear-gradient(90deg,rgba(220,38,38,.85),rgba(2,6,23,.7))}
.cm-flash{position:absolute;left:0;right:0;top:34%;text-align:center;font-size:46px;font-weight:900;letter-spacing:.03em;opacity:0;transform:scale(.6);transition:opacity .25s,transform .35s cubic-bezier(.2,1.6,.4,1);pointer-events:none;z-index:4;text-shadow:0 4px 0 rgba(0,0,0,.35),0 0 30px rgba(0,0,0,.5)}
.cm-flash.on{opacity:1;transform:scale(1)}.cm-flash small{display:block;font-size:18px;margin-top:4px}
.cm-flash.goal{color:#facc15;font-size:58px}.cm-flash.goalA{color:#f87171;font-size:50px}.cm-flash.save{color:#7dd3fc;font-size:34px}.cm-flash.post{color:#fff;font-size:32px}.cm-flash.half{color:#fff;font-size:36px}
.cm-joy{position:absolute;width:120px;height:120px;margin:-60px 0 0 -60px;left:22%;top:78%;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.1),rgba(255,255,255,.04));border:2px solid rgba(255,255,255,.28);z-index:3;pointer-events:none;opacity:.55;transition:opacity .2s}
.cm-joy.on{opacity:1}.cm-joy i{position:absolute;left:50%;top:50%;width:52px;height:52px;border-radius:50%;transform:translate(-50%,-50%);background:radial-gradient(circle at 35% 35%,#fff,#cbd5e1);box-shadow:0 4px 12px rgba(0,0,0,.4)}
.cm-pad{position:absolute;right:10px;bottom:calc(14px + env(safe-area-inset-bottom));width:190px;height:190px;z-index:3}
.cm-b{position:absolute;border:0;border-radius:50%;color:#fff;font-weight:900;font-size:12px;letter-spacing:.03em;display:grid;place-items:center;box-shadow:0 6px 16px rgba(0,0,0,.4),inset 0 -4px 0 rgba(0,0,0,.25);touch-action:none;overflow:hidden;transition:transform .08s}
.cm-b.dn{transform:scale(.9);filter:brightness(1.25)}
.cm-b span{position:relative;z-index:1;pointer-events:none}
.b-0{right:0;bottom:0;width:92px;height:92px;font-size:15px;background:radial-gradient(circle at 35% 30%,#f87171,#b91c1c)}
.b-1{right:96px;bottom:4px;width:70px;height:70px;background:radial-gradient(circle at 35% 30%,#4ade80,#15803d)}
.b-2{right:16px;bottom:100px;width:66px;height:66px;font-size:10px;background:radial-gradient(circle at 35% 30%,#60a5fa,#1d4ed8)}
.b-spr{right:100px;bottom:92px;width:56px;height:56px;font-size:10px;background:radial-gradient(circle at 35% 30%,#fde047,#ca8a04);color:#111}
.cm-ov.defm .b-0{background:radial-gradient(circle at 35% 30%,#fb923c,#c2410c)}.cm-ov.defm .b-1{background:radial-gradient(circle at 35% 30%,#a78bfa,#6d28d9)}.cm-ov.defm .b-2{background:radial-gradient(circle at 35% 30%,#94a3b8,#334155)}.cm-ov.defm .b-2.lit{background:radial-gradient(circle at 35% 30%,#f472b6,#be185d)}
.b-3{right:172px;bottom:16px;width:58px;height:58px;font-size:9.5px;background:radial-gradient(circle at 35% 30%,#c084fc,#7e22ce)}.cm-ov.defm .b-3,.cm-ov.pkm .b-3{display:none}
.cm-rp{display:none;position:absolute;left:50%;top:calc(70px + env(safe-area-inset-top));transform:translateX(-50%);z-index:6;align-items:center;gap:10px;background:rgba(2,6,23,.8);color:#fff;font-weight:900;letter-spacing:.2em;font-size:13px;padding:6px 7px 6px 14px;border-radius:999px;box-shadow:0 4px 14px rgba(0,0,0,.4)}
.cm-rp i{width:10px;height:10px;border-radius:50%;background:#ef4444;animation:cmBl 1s infinite}@keyframes cmBl{50%{opacity:.2}}
.cm-rp button{border:0;border-radius:999px;background:#facc15;color:#111;font-weight:900;padding:6px 12px;letter-spacing:0;font-size:12px;cursor:pointer}
.cm-ov.rpm .cm-rp{display:flex}.cm-ov.rpm::before,.cm-ov.rpm::after{content:'';position:absolute;left:0;right:0;height:8%;background:#000;z-index:2;pointer-events:none}.cm-ov.rpm::before{top:0}.cm-ov.rpm::after{bottom:0}
.cm-ov.rpm .cm-spd{visibility:hidden}.cm-ov.rpm .cm-pad,.cm-ov.rpm .cm-joy,.cm-ov.rpm .cm-mini,.cm-ov.rpm .cm-keys{opacity:0;pointer-events:none}
.b-0 em{position:absolute;left:0;bottom:0;height:100%;width:0;background:rgba(250,204,21,.55);pointer-events:none}
.cm-help{position:absolute;inset:auto 14px 50% 14px;transform:translateY(50%);z-index:6;background:rgba(2,6,23,.94);border-radius:20px;padding:18px;box-shadow:0 20px 50px rgba(0,0,0,.5);max-width:420px;margin:0 auto}
.cm-help b{font-size:18px;display:block;margin-bottom:8px}.cm-help .rot{font-size:15px;color:#facc15;font-weight:800}.cm-help p{margin:6px 0;font-size:14px;line-height:1.4}.cm-help p b{display:inline;font-size:inherit}
.cm-help button{display:block;width:100%;margin-top:12px;border:0;border-radius:14px;padding:13px;font-size:16px;font-weight:900;background:linear-gradient(90deg,#4ade80,#facc15);color:#06281a}
.cm-help button.alt{background:rgba(255,255,255,.12);color:#fff}
.cm-ov.crot{position:fixed;inset:auto;top:0;right:auto;bottom:auto;transform:rotate(90deg);transform-origin:0 0}
.cm-ov.pkm .b-1,.cm-ov.pkm .b-2,.cm-ov.pkm .b-spr{display:none}
.cm-ov.pkm .cm-mini{display:none}.cm-ov.pkm .cm-flash{top:20%;font-size:34px}.cm-ov.pkm .cm-flash small{font-size:14px}
.cm-pk{background:rgba(2,6,23,.82);border-radius:12px;padding:5px 9px;display:flex;flex-direction:column;gap:3px}
.pk-r{display:flex;align-items:center;gap:4px}.pk-r i{font-style:normal;font-size:13px;width:18px}.pk-r b{width:16px;height:16px;border-radius:50%;background:rgba(255,255,255,.18);font-size:10px;display:grid;place-items:center}
.pk-r b.ok{background:#16a34a}.pk-r b.ko{background:#dc2626}.pk-r em{font-style:normal;font-weight:900;margin-left:4px;color:#facc15}
.cm-ov.land .cm-mini{top:auto;bottom:10px;left:50%;right:auto;transform:translateX(-50%)}
.cm-ov.land .cm-flash{top:30%}.cm-ov.land .cm-help{max-height:92%;overflow:auto;top:50%;bottom:auto;transform:translateY(-50%)}
.cm-ov.land .mv-end{padding:8px;overflow:auto}.cm-ov.land .mv-fs{font-size:38px}.cm-ov.land .mv-res{font-size:24px}.cm-ov.land .mv-end p{margin:4px 0}.cm-ov.land .mv-btns{display:flex;gap:8px;max-width:520px}.cm-ov.land .mv-btns .cl-go{margin-top:6px;padding:12px}
.cm-cf{position:absolute;top:-10px;width:8px;height:14px;border-radius:2px;z-index:5;animation:cmFall 2s linear forwards;pointer-events:none}
@keyframes cmFall{to{transform:translateY(105vh) rotate(720deg)}}
@media (orientation:landscape){.cm-pad{transform:scale(.9);transform-origin:right bottom}.cm-feed{width:min(36vw,280px)}}
`;
const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
window.ClMatch={start};
})();
