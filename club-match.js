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

function start(cfg){
  const live=cfg.mode==='live',T=[cfg.home,cfg.away];
  const P=[];
  T.forEach((tm,t)=>tm.pl.forEach((q,i)=>{const h=hash((q.n||'')+i+t);
    P.push({t,i,role:ROLE[i],gk:i===0,n:q.n||'?',sn:q.sn||(q.n||'?').split(' ').slice(-1)[0],num:[1,2,4,5,3,8,6,10,7,9,11][i],r:cl(q.r||60,35,99),
      x:0,y:0,vx:0,vy:0,dir:t===0?-Math.PI/2:Math.PI/2,ph:0,cd:0,stun:0,slide:0,kick:0,dive:0,diveS:0,dc:0,mv:[0,0],
      skin:SKIN[h%SKIN.length],hair:HAIR[(h>>3)%HAIR.length],bald:(h>>6)%9===0})}));
  P.forEach(p=>{p.spd=(5.5+(p.r-60)*.045)*(p.gk?.92:1)});
  const team=t=>P.filter(p=>p.t===t);
  const B={x:CX,y:PL/2,z:0,vx:0,vy:0,vz:0,own:null,lt:0,lock:null,lockT:0,shot:false,shooter:null,gkTry:false,tgt:null,kicker:null,rot:0,net:0};
  const G={t:0,half:1,sc:[0,0],ph:'kick',phT:1.2,kt:0,ctrl:null,end:false,speed:1,msg:'',msgT:0,flash:'',flashT:0,shake:0,feed:[],scorers:[],charge:-1,buf:null,bufT:0,stats:{sh:[0,0],pos:[0,0],tk:0,pa:0,sv:0,out:0}};
  const cam={x:CX,y:PL/2};

  /* ---------- DOM ---------- */
  const ov=document.createElement('div');ov.className='cl-mov cm-ov'+(live?'':' watch');
  const short=s=>{s=String(s||'');return s.length>12?s.slice(0,11)+'…':s};
  ov.innerHTML='<canvas class="cm-cv"></canvas>'+
   '<div class="cm-top"><button class="cm-x" data-cm="quit">✕</button><div class="cm-sb"><span class="cm-tm" style="--a:'+T[0].c1+';--b:'+T[0].c2+'"><i>'+T[0].e+'</i><b>'+esc(short(T[0].n))+'</b></span><span class="cm-sc"><b id="cmS">0 - 0</b><small id="cmM">0\'</small></span><span class="cm-tm r" style="--a:'+T[1].c1+';--b:'+T[1].c2+'"><b>'+esc(short(T[1].n))+'</b><i>'+T[1].e+'</i></span></div>'+
   (live?'':'<div class="cm-spd"><button data-cm="sp1" class="on">×1</button><button data-cm="sp2">×2</button><button data-cm="sp4">×4</button><button data-cm="skip">Résultat</button></div>')+'</div>'+
   '<canvas class="cm-mini"></canvas><div class="cm-feed" id="cmFeed"></div><div class="cm-flash" id="cmFlash"></div>'+
   (live?'<div class="cm-joy" id="cmJoy"><i></i></div><div class="cm-pad">'+
     '<button class="cm-b b-spr" data-k="spr"><span>SPRINT</span></button>'+
     '<button class="cm-b b-2" data-k="b2"><span id="cmL2">LOB</span></button>'+
     '<button class="cm-b b-1" data-k="b1"><span id="cmL1">PASSE</span></button>'+
     '<button class="cm-b b-0" data-k="b0"><span id="cmL0">TIR</span><em id="cmPow"></em></button></div>'+
     '<div class="cm-help" id="cmHelp"><b>🎮 À toi de jouer !</b><p class="rot">📱↪️ Tourne ton téléphone sur le côté</p><p>🕹️ <b>Joystick</b> (gauche) : déplacer ton joueur</p><p>⚽ <b>PASSE</b> : passe dans la direction du joystick · <b>LOB</b> : passe en hauteur</p><p>🎯 <b>TIR</b> : reste appuyé pour la puissance, relâche pour frapper</p><p>🛡️ En défense : <b>TACLE</b> pour récupérer le ballon, <b>CHANGER</b> de joueur, <b>PRESSING</b> pour qu\'un coéquipier presse</p><button data-cm="go">C\'est parti !</button></div>':'');
  document.body.appendChild(ov);
  const cv=ov.querySelector('.cm-cv'),ctx=cv.getContext('2d'),mini=ov.querySelector('.cm-mini'),mc=mini.getContext('2d');
  const FD=ov.querySelector('#cmFeed'),FL=ov.querySelector('#cmFlash');
  let W=0,H=0,DPR=1,S=10;
  let ROT=false;
  function resize(){if(!ov.isConnected&&G.end){window.removeEventListener('resize',resize);return}
    DPR=Math.min(2.5,window.devicePixelRatio||1);const vw=window.innerWidth,vh=window.innerHeight,cr=vh>vw;ov.classList.toggle('crot',cr);
    if(cr){ov.style.width=vh+'px';ov.style.height=vw+'px';ov.style.left=vw+'px'}else{ov.style.width=ov.style.height=ov.style.left=''}
    W=ov.clientWidth;H=ov.clientHeight;ROT=W>H;ov.classList.toggle('land',ROT);cv.width=W*DPR;cv.height=H*DPR;cv.style.width=W+'px';cv.style.height=H+'px';
    S=ROT?Math.min(W/44,H/24):Math.min(W/22,H/36);const mw=ROT?105:68,mh=ROT?68:105;mini.width=mw*1.4*DPR;mini.height=mh*1.4*DPR;mini.style.width=mw+'px';mini.style.height=mh+'px'}
  function joyW(){let jx=inp.jx,jy=inp.jy;const K=inp.keys;if(K.arrowleft||K.a||K.q)jx=-1;if(K.arrowright||K.d)jx=1;if(K.arrowup||K.w||K.z)jy=-1;if(K.arrowdown||K.s)jy=1;const l=hyp(jx,jy);if(l>1){jx/=l;jy/=l}return ROT?[jy,-jx]:[jx,jy]}
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

  function say(txt,cls){const d=document.createElement('div');d.className='cm-e '+(cls||'');d.innerHTML='<em>'+minute()+'\'</em> '+txt;FD.prepend(d);while(FD.children.length>3)FD.lastChild.remove();setTimeout(()=>d.classList.add('old'),3500)}
  function flash(txt,cls,dur){FL.className='cm-flash on '+(cls||'');FL.innerHTML=txt;G.flashT=dur||1.6}
  function minute(){return G.half===1?Math.min(45,Math.floor(G.t/HALF*45)):Math.min(90,45+Math.floor(Math.max(0,G.t-HALF)/HALF*45))}
  function vib(p){try{navigator.vibrate&&navigator.vibrate(p)}catch(e){}}

  /* ---------- placement ---------- */
  function kickoff(kt){G.kt=kt;B.own=null;B.x=CX;B.y=PL/2;B.z=B.vx=B.vy=B.vz=0;B.shot=false;B.tgt=null;B.net=0;
    P.forEach(p=>{const f=(p.t===kt?KOA:KOD)[p.i],w=W2(p.t,f[0],f[1]);p.x=w[0];p.y=w[1];p.vx=p.vy=0;p.stun=p.slide=p.dive=0;p.dir=p.t===0?-Math.PI/2:Math.PI/2});
    const s=P.find(p=>p.t===kt&&p.i===9);s.x=CX;s.y=PL/2+(kt===0?.6:-.6);B.own=s;B.lt=kt;
    G.ph='kick';G.phT=1.1;if(live)G.ctrl=kt===0?s:nearest(0,B.x,B.y,true)}
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
  function kick(p,tx,ty,spd,vz,err){const a=Math.atan2(ty-p.y,tx-p.x)+gauss()*err;B.own=null;B.vx=Math.cos(a)*spd;B.vy=Math.sin(a)*spd;B.vz=vz;B.z=Math.max(B.z,.1);
    B.lock=p;B.lockT=.28;B.lt=p.t;B.kicker=p;B.shot=false;B.gkTry=false;p.kick=.25;p.dir=a}
  function pass(p,q,lob){if(!q)return false;const d=hyp(q.x-p.x,q.y-p.y);
    let spd=lob?cl(9+d*.45,11,21):cl(9+d*.62,11,25);const tt=d/spd*(lob?1:1.15);
    const tx=q.x+q.vx*tt*.85+(lob?fwd(q.t)*0:0),ty=q.y+q.vy*tt*.85;const err=.012+(100-p.r)/100*.07+(lob?.02:0);
    const T2=hyp(tx-p.x,ty-p.y)/spd;kick(p,tx,ty,spd,lob?cl(9.8*T2*.5,3,13):0,err);B.tgt=q;B.tgtT=T2+1;G.stats.pa++;
    if(live&&p.t===0&&!q.gk){G.ctrl=q}
    return true}
  function shoot(p,pow,aim){const gy=goalY(p.t),d=hyp(CX-p.x,gy-p.y);
    let ax;if(aim!=null)ax=CX+cl(aim,-1,1)*(GW/2-.35);else{const side=p.x<CX?1:-1;ax=CX+side*(GW/2-1.05)*(rnd()<.7?1:-1)+gauss()*.5}
    const spd=16+pow*15,T2=d/spd,h=pow>.93?1.6+(pow-.93)*30:.4+rnd()*1.3;
    const err=.015+(100-p.r)/100*.075+(d>22?.02:0)+(pressure(p)<2?.035:0);
    kick(p,ax,gy,spd,cl((h+4.9*T2*T2)/T2,0,14),err);B.shot=true;B.shooter=p;B.lockT=.35;G.stats.sh[p.t]++;
    say((p.t===0?'🎯 ':'')+'Frappe de <b>'+esc(p.sn)+'</b> !')}
  function pressure(p){let m=99;for(const o of P)if(o.t!==p.t&&!o.gk)m=Math.min(m,hyp(o.x-p.x,o.y-p.y));return m}
  function tackle(p){if(p.stun>0||p.slide>0)return;const c=B.own;p.slide=.38;p.cd=.6;
    if(c&&c.t!==p.t&&hyp(c.x-p.x,c.y-p.y)<2.4){const ch=cl(.52+(p.r-c.r)/70,.22,.85);
      if(rnd()<ch){B.own=null;const a=p.dir+gauss()*.5;B.vx=Math.cos(a)*5;B.vy=Math.sin(a)*5;B.vz=.5;B.lock=c;B.lockT=.5;B.lt=p.t;c.stun=.55;vib(30);say('🛡️ Tacle réussi de <b>'+esc(p.sn)+'</b> !');return}
    }
    p.stun=.75}
  function switchP(){const c=G.ctrl;let b=null,bd=1e9;const tx=B.x+B.vx*.4,ty=B.y+B.vy*.4;
    for(const p of P){if(p.t!==0||p.gk||p===c)continue;const d=hyp(p.x-tx,p.y-ty);if(d<bd){bd=d;b=p}}if(b)G.ctrl=b}

  /* ---------- user input ---------- */
  function mode(){return B.own?B.own.t===0?'att':'def':(B.lt===0&&B.tgt&&B.tgt.t===0)?'att':'free'}
  function act(k,down){if(!live||paused)return;const c=G.ctrl;if(!c)return;
    if(G.ph==='pens'){if(k!=='b0')return;
      if(PK.turn===0&&PK.st==='aim'){if(down)G.charge=0;else if(G.charge>=0){const pw=cl(.25+G.charge*.95,.25,1.1);G.charge=-1;pkKick(PK.aim,pw)}}
      else if(PK.turn===1&&down&&PK.dive==null&&(PK.st!=='flight'||PK.t<.12)&&PK.st!=='result'){const j=joyW();PK.dive=Math.abs(j[0])<.35?0:Math.sign(j[0]);vib(20)}
      return}
    const m=mode();
    if(k==='spr'){inp.sprint=down;return}
    if(m==='def'||(m==='free'&&B.lt===1)){if(!down)return;if(k==='b0')tackle(c);else if(k==='b1')switchP();else if(k==='b2')G.press=!G.press;return}
    if(B.own===c){
      if(k==='b0'){if(down){G.charge=0}else if(G.charge>=0){const j=joyW();shoot(c,cl(.25+G.charge*.95,.25,1.1),hyp(j[0],j[1])>.25?j[0]:null);G.charge=-1}}
      else if(down&&(k==='b1'||k==='b2')){const j=joyW(),q=bestPass(c,j[0],j[1])||bestPass(c,Math.cos(c.dir),Math.sin(c.dir))||bestPass(c,0,0);pass(c,q,k==='b2')}
    }else{ // ballon en l'air vers nous : action en une touche
      if(down){G.buf=k;G.bufT=.45}}
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
    const KM={' ':'b1',j:'b1',l:'b2',k:'b0',enter:'b0',shift:'spr',e:'b1'};
    const kd=e=>{const k=e.key.toLowerCase();if(['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d','z','q'].includes(k)){inp.keys[k]=e.type==='keydown';e.preventDefault()}
      if(KM[k]&&!e.repeat){act(KM[k],e.type==='keydown');e.preventDefault()}};
    window.addEventListener('keydown',kd);window.addEventListener('keyup',kd);G.offKeys=()=>{window.removeEventListener('keydown',kd);window.removeEventListener('keyup',kd)};
  }
  ov.addEventListener('touchmove',e=>e.preventDefault(),{passive:false});
  ov.addEventListener('click',e=>{const b=e.target.closest('[data-cm]');if(!b)return;const a=b.dataset.cm;
    if(a==='go'){ov.querySelector('#cmHelp').remove();paused=false;last=performance.now()}
    else if(a==='quit'){if(G.end)return;paused=true;const q=document.createElement('div');q.className='cm-help';q.innerHTML='<b>Abandonner le match ?</b><p>Un abandon compte comme une <b>défaite 0-3</b>.</p><button data-cm="quitok">Abandonner</button><button data-cm="resume" class="alt">Continuer à jouer</button>';ov.appendChild(q)}
    else if(a==='resume'){b.closest('.cm-help').remove();paused=false;last=performance.now()}
    else if(a==='quitok'){b.closest('.cm-help').remove();G.sc=[0,Math.max(3,G.sc[1])];done(true)}
    else if(a.startsWith('sp')){G.speed=+a.slice(2);ov.querySelectorAll('.cm-spd button').forEach(x=>x.classList.toggle('on',x===b))}
    else if(a==='skip'){let n=0;while(!G.end&&n++<20000)step(1/30,true)}});

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
    p.dc-=dt;if(p.dc<=0){p.dc=.22+rnd()*.18;
      const ang=Math.abs(p.x-CX)/Math.max(1,Math.abs(gy-p.y));
      if(dG<32&&ang<1.5&&(dG<18||rnd()<(32-dG)/32*.8)){shoot(p,.55+rnd()*.38,null);return}
      if((pr<2.4&&rnd()<.45)||rnd()<.05){const q=bestPass(p,0,0);if(q&&(pr<2.6||YN(t,q.y)>YN(t,p.y)-.02)){pass(p,q,hyp(q.x-p.x,q.y-p.y)>24&&rnd()<.5);return}}
      let dx=(CX-p.x)*.35,dy=(gy-p.y);const L=hyp(dx,dy)||1;dx/=L;dy/=L;
      let o=null,od=6;for(const q of P)if(q.t!==t){const d=hyp(q.x-p.x,q.y-p.y);if(d<od&&((q.y-p.y)*dy+(q.x-p.x)*dx)>-.5){od=d;o=q}}
      if(o){const sx=-(o.y-p.y),sy=o.x-p.x,sl=hyp(sx,sy)||1,side=((CX-p.x)*sx/sl+0)>0?1:-1;const k=(6-od)/6*1.3;dx+=sx/sl*side*k;dy+=sy/sl*side*k;const l2=hyp(dx,dy);dx/=l2;dy/=l2}
      p.mv=[dx,dy]}
    const sp=p.spd*(pr<4?1.02:.92);steer(p,p.x+p.mv[0]*4,p.y+p.mv[1]*4,sp,dt)}
  function offBall(p,dt){const t=p.t,att=(B.own?B.own.t:B.lt)===t;
    if(B.tgt===p&&!B.own){const lead=.35;steer(p,B.x+B.vx*lead,B.y+B.vy*lead,p.spd*1.1,dt);return}
    if(!B.own){const n=chaser[t];if(n===p){steer(p,B.x+B.vx*.35,B.y+B.vy*.35,p.spd*1.12,dt);return}}
    else if(!att){const c=B.own;if(presser[t]===p){const dd=hyp(c.x-p.x,c.y-p.y),stop=t===0&&!G.press?1.6:.4;
        if(dd>stop)steer(p,c.x+c.vx*.25,c.y+c.vy*.25,p.spd*(t===1||G.press?1.1:1),dt);else{p.vx*=.85;p.vy*=.85}
        autoTk(p,c,dt);return}
      if(cover[t]===p){const gy=ownY(t),k=4.5/Math.max(4.5,hyp(CX-c.x,gy-c.y));steer(p,c.x+(CX-c.x)*k,c.y+(gy-c.y)*k,p.spd,dt);autoTk(p,c,dt);return}}
    const w=targetOf(p);steer(p,w[0],w[1],p.spd*(att&&p.role==='A'?1:.9),dt);if(B.own&&B.own.t!==t)autoTk(p,B.own,dt)}
  function autoTk(p,c,dt){if(p.cd>0||p.stun>0)return;const d=hyp(c.x-p.x,c.y-p.y);if(d>1.35)return;p.cd=.55;
    const base=live?(p.t===1?.33:.24):.28,ch=cl(base*Math.pow(p.r/c.r,2)*(c===G.ctrl&&inp.sprint?.8:1),.08,.6);
    if(rnd()<ch){G.stats.tk++;B.own=p;B.lt=p.t;B.shot=false;B.tgt=null;c.stun=.45;p.cd=.4;if(live&&p.t===1&&c===G.ctrl)vib(25);if(rnd()<.35)say('Ballon récupéré par <b>'+esc(p.sn)+'</b>');if(live&&p.t===0)G.ctrl=p}}
  let chaser=[null,null],presser=[null,null],cover=[null,null];
  function roles(){for(let t=0;t<2;t++){chaser[t]=presser[t]=cover[t]=null;const ex=live&&t===0?G.ctrl:null;
    if(!B.own){let bd=1e9;const tx=B.x+B.vx*.4,ty=B.y+B.vy*.4;for(const p of P)if(p.t===t&&!p.gk&&p!==ex&&p.stun<=0){const d=hyp(p.x-tx,p.y-ty);if(d<bd){bd=d;chaser[t]=p}}
      if(ex&&chaser[t]&&hyp(ex.x-B.x,ex.y-B.y)<bd*.8&&!G.press)chaser[t]=null}
    else if(B.own.t!==t){const c=B.own,L=P.filter(p=>p.t===t&&!p.gk&&p!==ex).sort((a,b)=>hyp(a.x-c.x,a.y-c.y)-hyp(b.x-c.x,b.y-c.y));
      presser[t]=L[0]||null;cover[t]=L[1]||null;if(ex&&hyp(ex.x-c.x,ex.y-c.y)<4&&!G.press){cover[t]=presser[t];presser[t]=null}}}}

  /* ---------- simulation ---------- */
  function step(dt,fast){
    if(G.end)return;
    G.flashT-=dt;if(G.flashT<=0&&FL.classList.contains('on')&&!fast)FL.classList.remove('on');
    if(G.ph==='pens'){pkStep(dt);return}
    if(G.ph!=='play'){G.phT-=dt;
      if(G.ph==='goal'){ballPhys(dt);P.forEach(p=>{p.vx*=.95;p.vy*=.95;p.x+=p.vx*dt;p.y+=p.vy*dt;p.ph+=hyp(p.vx,p.vy)*dt*2.4})}
      if(G.phT<=0){if(G.ph==='goal'||G.ph==='half')kickoff(G.ph==='half'?1:G.next);else if(G.ph==='full'){done(false);return}else if(G.ph==='pre'){pkStart();return}else G.ph='play'}
      if(G.ph==='kick'||G.ph==='out'){P.forEach(p=>{p.vx=p.vy=0})}
      if(G.ph!=='play')return}
    if(G.ph==='play'){G.t+=dt;G.stats.pos[B.own?B.own.t:B.lt]+=dt;
      if(G.half===1&&G.t>=HALF){G.half=2;G.ph='half';G.phT=2.4;flash('MI-TEMPS','half',2.2);say('⏸️ Mi-temps : '+G.sc[0]+' - '+G.sc[1]);return}
      if(G.t>=HALF*2){if(G.sc[0]===G.sc[1]){G.ph='pre';G.phT=2.2;flash('MATCH NUL<small>Place aux tirs au but !</small>','half',2.1);vib([60,40,60]);return}G.ph='full';G.phT=1.6;flash('FIN DU MATCH','half',1.6);vib([60,40,60]);return}}
    if(G.bufT>0)G.bufT-=dt;
    if(G.charge>=0)G.charge=Math.min(1.2,G.charge+dt*1.1);
    roles();
    // joueurs
    for(const p of P){if(p.cd>0)p.cd-=dt;if(p.kick>0)p.kick-=dt;if(p.dive>0)p.dive-=dt;
      if(p.stun>0){p.stun-=dt;if(p.slide>0){p.slide-=dt;const v=hyp(p.vx,p.vy)||1;const s=Math.max(v,7.5);p.vx=Math.cos(p.dir)*s*Math.max(0,p.slide/.38);p.vy=Math.sin(p.dir)*s*Math.max(0,p.slide/.38)}else{p.vx*=.86;p.vy*=.86}}
      else if(p.slide>0){p.slide-=dt;p.vx=Math.cos(p.dir)*8.5;p.vy=Math.sin(p.dir)*8.5;
        const c=B.own;if(c&&c.t!==p.t&&hyp(c.x-p.x,c.y-p.y)<1.2){p.slide=0}}
      else if(live&&p===G.ctrl){let [jx,jy]=joyW();const jl=hyp(jx,jy);
        if(jl<.15&&B.tgt===p&&!B.own){steer(p,B.x+B.vx*.3,B.y+B.vy*.3,p.spd*1.1,dt)}
        else if(jl<.15&&!B.own&&hyp(B.x-p.x,B.y-p.y)<6&&B.z<1.5){steer(p,B.x,B.y,p.spd,dt)}
        else{const sp=p.spd*(inp.sprint?1.3:1)*(B.own===p?(inp.sprint?.9:.88):1);const a=Math.min(1,dt*7);p.vx+=(jx*sp-p.vx)*a;p.vy+=(jy*sp-p.vy)*a}}
      else if(p.gk)gkThink(p,dt);
      else if(B.own===p)carrierAI(p,dt);
      else offBall(p,dt);
      p.x+=p.vx*dt;p.y+=p.vy*dt;p.x=cl(p.x,-2,PW+2);p.y=cl(p.y,-1.5,PL+1.5);
      const v=hyp(p.vx,p.vy);if(v>.4&&p.slide<=0&&!(p.stun>0)){const a=Math.atan2(p.vy,p.vx);let d=a-p.dir;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;p.dir+=d*Math.min(1,dt*10)}
      else if(v<=.4&&p.stun<=0&&p.slide<=0){const a=Math.atan2(B.y-p.y,B.x-p.x);let d=a-p.dir;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;p.dir+=d*Math.min(1,dt*4)}
      p.ph+=v*dt*2.4}
    // séparation légère
    for(let i=0;i<P.length;i++)for(let j=i+1;j<P.length;j++){const a=P[i],b=P[j],dx=b.x-a.x,dy=b.y-a.y,d=hyp(dx,dy);if(d>0&&d<.85){const k=(.85-d)/2/d;a.x-=dx*k;a.y-=dy*k;b.x+=dx*k;b.y+=dy*k}}
    ballPhys(dt);
    if(live&&G.ctrl&&B.own&&B.own.t===1&&hyp(G.ctrl.x-B.x,G.ctrl.y-B.y)>14&&!G.lockSw){const n=nearest(0,B.x,B.y,true);if(n&&hyp(n.x-B.x,n.y-B.y)<hyp(G.ctrl.x-B.x,G.ctrl.y-B.y)-4)G.ctrl=n}
  }
  function ballPhys(dt){
    if(B.own){const p=B.own,run=hyp(p.vx,p.vy);const off=.62+Math.min(.25,run*.03);B.x=p.x+Math.cos(p.dir)*off;B.y=p.y+Math.sin(p.dir)*off;B.z=0;B.vx=p.vx;B.vy=p.vy;B.vz=0;B.rot+=run*dt*3;
      if(G.ph==='play')outCheck();return}
    if(B.lockT>0)B.lockT-=dt;if(B.tgtT>0){B.tgtT-=dt;if(B.tgtT<=0)B.tgt=null}
    const px=B.x,py=B.y;
    B.vz-=9.8*dt;B.z+=B.vz*dt;if(B.z<=0){B.z=0;if(B.vz<-1.5)B.vz=-B.vz*.45;else B.vz=0}
    const fr=B.z<.05?Math.exp(-1.05*dt):Math.exp(-.12*dt);B.vx*=fr;B.vy*=fr;B.x+=B.vx*dt;B.y+=B.vy*dt;B.rot+=hyp(B.vx,B.vy)*dt*3;
    if(G.ph==='goal'){if(B.y<-1.8){B.y=-1.8;B.vy*=-.2;B.vx*=.5}if(B.y>PL+1.8){B.y=PL+1.8;B.vy*=-.2;B.vx*=.5}B.net=Math.max(0,B.net-dt);return}
    if(G.ph!=='play')return;
    // poteaux / transversale / but
    for(const gy of [0,PL]){if((py-gy)*(B.y-gy)<=0&&py!==B.y){const u=(gy-py)/(B.y-py),cx=px+(B.x-px)*u,dx=Math.abs(cx-CX);
      if(Math.abs(dx-GW/2)<.22&&B.z<GH+.1){B.y=gy+(py>gy?.3:-.3);B.vy=-B.vy*.55;B.vx+=(cx>CX?1:-1)*(dx>GW/2?2:-2);B.shot=false;flash('POTEAU !','post',1.1);say('🥅 Sur le poteau !');vib(40);return}
      if(dx<GW/2&&Math.abs(B.z-GH)<.18){B.y=gy+(py>gy?.3:-.3);B.vy=-B.vy*.45;B.vz=-Math.abs(B.vz)*.3+1;B.shot=false;flash('TRANSVERSALE !','post',1.1);say('🥅 Sur la barre !');vib(40);return}
      if(dx<GW/2&&B.z<GH){goal(gy===0?0:1);return}}}
    // gardien
    if(B.shot&&!B.gkTry){const dt2=1-B.kicker.t,g=P.find(p=>p.t===dt2&&p.gk),reach=1.05+(g.r-50)/45*1.25+(B.z>1.2?.2:0),d=hyp(g.x-B.x,g.y-B.y);
      if(d<reach+.45&&B.z<GH+.4){B.gkTry=true;const v=hyp(B.vx,B.vy),sh=B.shooter||B.kicker;
        const ps=cl(.42+(g.r-sh.r)/55-(v-24)/26-(d>reach*.75?.12:0),.12,.93);g.dive=.55;g.diveS=Math.sign((B.x-g.x)*(dt2===0?1:-1))||1;
        if(rnd()<ps){G.stats.sv++;if(v<21&&rnd()<.6){B.own=g;B.lt=g.t;B.shot=false;B.tgt=null;say('🧤 <b>'+esc(g.sn)+'</b> capte le ballon');}
          else{B.vy=(dt2===0?-1:1)*(5+rnd()*5);B.vx=(rnd()<.5?-1:1)*(4+rnd()*8);B.vz=2+rnd()*3;B.shot=false;B.lt=g.t;B.lock=g;B.lockT=.4;say('🧤 Parade de <b>'+esc(g.sn)+'</b> !')}
          if(live)flash(dt2===0?'ARRÊT !':'ARRÊT DU GARDIEN','save',1);vib(25);return}}}
    // contrôle
    if(B.z<1.7){let best=null,bd=1e9;for(const p of P){if(p.stun>0||(B.lockT>0&&B.lock===p))continue;const reach=p.gk&&inOwnBox(p)?1.5:1.0,d=hyp(p.x-B.x,p.y-B.y);if(d<reach&&d<bd&&(B.z<(p.gk?2.5:1.25))){bd=d;best=p}}
      if(best){const v=hyp(B.vx,B.vy);if(v>19&&!best.gk&&best!==B.tgt&&rnd()<.55){B.vx*=-.25+rnd()*.3;B.vy*=-.25;B.lock=best;B.lockT=.3;B.lt=best.t;B.shot=false;return}
        take(best)}}
    outCheck()}
  function inOwnBox(p){const gy=ownY(p.t);return Math.abs(p.x-CX)<20.2&&Math.abs(p.y-gy)<16.5}
  function take(p){const prev=B.lt;B.own=p;B.lt=p.t;B.shot=false;B.tgt=null;B.tgtT=0;B.vz=0;B.z=0;p.dc=.15+rnd()*.2;
    if(live&&p.t===0&&!p.gk){G.ctrl=p;if(G.buf&&G.bufT>0){const k=G.buf;G.buf=null;const j=joyW();if(k==='b0'){shoot(p,.85,hyp(j[0],j[1])>.25?j[0]:null)}else{const q=bestPass(p,j[0],j[1])||bestPass(p,0,0);pass(p,q,k==='b2')}}}
    if(live&&p.t===1&&prev===0){if(!G.ctrl||hyp(G.ctrl.x-p.x,G.ctrl.y-p.y)>9)G.ctrl=nearest(0,p.x,p.y,true)}}
  function outCheck(){const x=B.x,y=B.y;
    if((y<0||y>PL)&&Math.abs(x-CX)<GW/2&&B.z<GH){if(B.own){B.kicker=B.own;B.own=null}goal(y<0?0:1);return}
    if(x<-.15||x>PW+.15){const t=1-B.lt,p=nearest(t,x,y,true);restart(p,cl(x,.4,PW-.4),cl(y,1,PL-1),'Touche pour '+esc(T[t].n));return}
    if(y<-.15||y>PL+.15){const gl=y<0?0:PL,def=gl===0?1:0,att=1-def;
      if(B.lt===att){const g=P.find(p=>p.t===def&&p.gk);restart(g,CX+(x<CX?-6:6),gl===0?5.5:PL-5.5,'Sortie de but');}
      else{const p=nearest(att,x,gl,true),cx=x<CX?.5:PW-.5;restart(p,cx,gl===0?.5:PL-.5,'🚩 Corner pour '+esc(T[att].n));
        P.filter(q=>q.t===att&&!q.gk&&q!==p&&q.role!=='D').forEach((q,k)=>{q.x=CX+(k-2.5)*3+gauss();q.y=gl===0?6+rnd()*8:PL-6-rnd()*8});
        P.filter(q=>q.t===def&&!q.gk).forEach((q,k)=>{if(q.role!=='A'){q.x=CX+(k-3.5)*2.6;q.y=gl===0?4+rnd()*9:PL-4-rnd()*9}})}}}
  function goal(t){const k=B.kicker,sc=k&&k.t===t?k:null;G.sc[t]++;G.ph='goal';G.phT=3.4;G.next=1-t;B.net=1.2;B.shot=false;G.shake=.7;
    G.scorers.push({t,n:sc?sc.n:'csc',m:minute()});ov.querySelector('#cmS').textContent=G.sc[0]+' - '+G.sc[1];
    const who=sc?esc(sc.sn):'contre son camp';flash('BUUUT !<small>'+T[t].e+' '+who+'</small>',t===0?'goal':'goalA',3);
    say('<b>⚽ BUT ! '+(sc?esc(sc.n):'Contre son camp')+'</b> ('+G.sc[0]+'-'+G.sc[1]+')','g'+t);vib(t===0?[90,50,90,50,200]:80);
    ov.classList.add('scored');setTimeout(()=>ov.classList.remove('scored'),900);
    if(t===0&&!live)return;if(t===0)confetti()}
  function confetti(){for(let i=0;i<46;i++){const d=document.createElement('i');d.className='cm-cf';d.style.left=(Math.random()*100)+'%';d.style.background=[T[0].c1,T[0].c2,'#facc15','#fff'][i%4];d.style.animationDelay=(Math.random()*.4)+'s';d.style.animationDuration=(1.6+Math.random())+'s';ov.appendChild(d);setTimeout(()=>d.remove(),3200)}}

  /* ---------- tirs au but ---------- */
  const PK={};const PKel=document.createElement('div');PKel.className='cm-pk';
  function pkStart(){G.ph='pens';G.charge=-1;ov.querySelector('.cm-top').appendChild(PKel);
    Object.assign(PK,{g:[0,0],n:[0,0],res:[[],[]],turn:0,ord:[0,1].map(t=>team(t).filter(p=>!p.gk).sort((a,b)=>b.r-a.r))});
    say('🥅 Match nul : place aux <b>tirs au but</b> !');pkPrep();pkHud()}
  function pkHud(){PKel.innerHTML=[0,1].map(t=>{const n=Math.max(5,PK.n[0],PK.n[1]);let h='<div class="pk-r"><i>'+T[t].e+'</i>';for(let k=0;k<n;k++){const r=PK.res[t][k];h+='<b class="'+(r==null?'':r?'ok':'ko')+'">'+(r==null?'':r?'✓':'✗')+'</b>'}return h+'<em>'+PK.g[t]+'</em></div>'}).join('')}
  function pkPrep(){const t=PK.turn,sh=PK.ord[t][PK.n[t]%PK.ord[t].length],gk=P.find(p=>p.t!==t&&p.gk);Object.assign(PK,{sh,gk,st:'prep',t:0,aim:CX,dive:null,dv:0,out:''});
    let k=[0,0];for(const p of P){p.vx=p.vy=0;p.stun=p.slide=p.dive=p.kick=0;if(p===sh||p===gk)continue;p.x=CX-15+k[p.t]*3.1+(p.t?1.5:0);p.y=PL/2+(p.t?2:-2);k[p.t]++;p.dir=-Math.PI/2}
    sh.x=CX;sh.y=13.6;sh.dir=-Math.PI/2;gk.x=CX;gk.y=.45;gk.dir=Math.PI/2;
    Object.assign(B,{x:CX,y:11,z:0,vx:0,vy:0,vz:0,own:null,shot:false,tgt:null,net:0});
    G.ctrl=live?(t===0?sh:gk):null;
    const side=rnd()<.42?-1:rnd()<.72?1:0;PK.aiA=CX+side*(side?1.5+rnd()*1.9:rnd()*.8-.4);PK.aiP=.55+rnd()*.37;
    flash(live?(t===0?'À TOI DE TIRER !<small>Vise avec le joystick, reste appuyé sur TIR</small>':'ARRÊTE-LE !<small>Joystick à gauche ou à droite + PLONGER</small>'):esc(sh.sn),t===0?'post':'save',1.6)}
  function pkKick(ax,pow){if(PK.st!=='aim')return;PK.st='run';PK.t=0;PK.ax=ax;PK.pow=pow}
  function pkStep(dt){PK.t+=dt;const sh=PK.sh,gk=PK.gk;if(G.charge>=0)G.charge=Math.min(1.2,G.charge+dt*1.1);if(B.net>0)B.net=Math.max(0,B.net-dt);
    if(PK.st==='prep'){if(PK.t>1.3){PK.st='aim';PK.t=0}return}
    if(PK.st==='aim'){if(live&&PK.turn===0){const j=joyW();PK.aim=CX+cl(j[0],-1,1)*(GW/2+.3)+Math.sin(PK.t*3.2)*.4;if(PK.t>12)pkKick(PK.aim,.6)}
      else if(PK.t>(live?1.5:.9))pkKick(PK.aiA,PK.aiP);return}
    if(PK.st==='run'){const u=Math.min(1,PK.t/.4);sh.y=13.6-2*u;sh.ph+=dt*14;
      if(u>=1){sh.kick=.25;const pow=PK.pow,err=.25+(100-sh.r)/100*.6+Math.max(0,pow-.8)*1.6;let bx=PK.ax+gauss()*err*.8;
        const over=pow>.98||(pow>.9&&rnd()<(pow-.9)*6);
        let dv;if(live&&PK.turn===1)dv=PK.dive==null?0:PK.dive;else{const bs=Math.abs(bx-CX)<1.1?0:Math.sign(bx-CX),pc=cl(.36+(gk.r-sh.r)/150,.2,.55);
          if(rnd()<pc)dv=bs;else{const o=[-1,0,1].filter(x=>x!==bs);dv=o[(rnd()*2)|0]}}
        const dX=CX+dv*2.7,reach=(dv===0?.95:1.3+(gk.r-60)/100)-Math.max(0,pow-.7)*1;const ad=Math.abs(bx-CX);
        PK.out=over?'over':Math.abs(ad-GW/2)<.2?'post':ad>GW/2?'wide':Math.abs(bx-dX)<reach?'save':'goal';
        Object.assign(PK,{st:'flight',t:0,bx,dv,dX,T:11/(17+pow*13),h:over?3.4:.3+rnd()*1.6})}return}
    if(PK.st==='flight'){const u=Math.min(1,PK.t/PK.T);B.x=CX+(PK.bx-CX)*u;B.y=11-11*u;B.z=PK.h*Math.sin(u*Math.PI/2);B.rot+=dt*20;
      gk.x=CX+(PK.dX-CX)*Math.min(1,u*1.5);if(PK.dv){gk.dive=Math.max(.02,.55-u*.6);gk.diveS=PK.dv*(gk.t===0?-1:1)}
      if(u>=1){const t=PK.turn,ok=PK.out==='goal';PK.res[t].push(ok);PK.n[t]++;if(ok)PK.g[t]++;PK.st='result';PK.t=0;
        if(ok){B.vx=(PK.bx-CX)*.5;B.vy=-9;B.vz=0;B.net=1.2;flash(t===0?'BUUUT !':'BUT…','goal'+(t===0?'':'A'),1.4);vib(t===0?[80,40,120]:60);if(t===0&&live)confetti()}
        else if(PK.out==='save'){B.vx=(rnd()-.5)*12;B.vy=8;B.vz=2;flash(t===1?'ARRÊT !!':'ARRÊT DU GARDIEN','save',1.4);vib(t===1?[60,30,90]:40);if(t===1&&live)confetti()}
        else if(PK.out==='post'){B.vx=(B.x>CX?1:-1)*3;B.vy=7;B.vz=1;flash('POTEAU !','post',1.4)}
        else{B.vx=(B.x-CX)*.6;B.vy=-10;B.vz=PK.out==='over'?2:0;flash(PK.out==='over'?'AU-DESSUS !':'À CÔTÉ !','post',1.4)}
        say((ok?'✅ ':'❌ ')+'<b>'+esc(sh.sn)+'</b> ('+esc(T[t].n)+')');pkHud();
        ov.querySelector('#cmS').textContent=G.sc[0]+' - '+G.sc[1]+' ('+PK.g[0]+'-'+PK.g[1]+')'}return}
    if(PK.st==='result'){const f=Math.exp(-2*dt);B.vx*=f;B.vy*=f;B.x+=B.vx*dt;B.y+=B.vy*dt;B.vz-=9.8*dt;B.z=Math.max(0,B.z+B.vz*dt);if(B.y<-1.7){B.y=-1.7;B.vy=0}
      if(PK.t>1.7){const[a,b]=PK.g,[na,nb]=PK.n;let end=false;
        if(na<=5&&nb<=5){if(a+(5-na)<b||b+(5-nb)<a)end=true}
        if(na>=5&&na===nb&&a!==b)end=true;
        if(end){G.pens=[a,b];G.ph='full';G.phT=2.6;const w=a>b?0:1;flash((w===0?'VICTOIRE':'DÉFAITE')+'<small>Tirs au but '+a+' - '+b+'</small>',w===0?'goal':'goalA',2.5);vib(w===0?[90,50,90,50,200]:80);if(w===0&&live)confetti();return}
        PK.turn=1-PK.turn;pkPrep()}}}

  /* ---------- rendu ---------- */
  function draw(dt){
    const pk=G.ph==='pens',Z=S*(pk?1.3:1);
    const lookY=(B.own?fwd(B.own.t)*5:0),tx=pk?CX:cl(B.x,0,PW),ty=pk?(ROT?8:10):B.y+lookY;
    cam.x+=(tx-cam.x)*Math.min(1,dt*3.2);cam.y+=(ty-cam.y)*Math.min(1,dt*3.2);
    const hw=(ROT?H:W)/2/Z,hh=(ROT?W:H)/2/Z;cam.x=PW+10<hw*2?CX:cl(cam.x,hw-8,PW+8-hw);if(!pk)cam.y=cl(cam.y,hh-9,PL+9-hh);
    let sx=0,sy=0;if(G.shake>0){G.shake-=dt;sx=(rnd()-.5)*G.shake*.8;sy=(rnd()-.5)*G.shake*.8}
    ctx.setTransform(DPR,0,0,DPR,0,0);ctx.fillStyle='#0d1322';ctx.fillRect(0,0,W,H);
    const cx=cam.x+sx,cy=cam.y+sy;
    if(ROT)ctx.setTransform(0,DPR*Z,-DPR*Z,0,DPR*(W/2+cy*Z),DPR*(H/2-cx*Z));else ctx.setTransform(DPR*Z,0,0,DPR*Z,DPR*(W/2-cx*Z),DPR*(H/2-cy*Z));
    // tribunes
    ctx.fillStyle=crowdP||'#161c2b';ctx.fillRect(-40,-40,PW+80,PL+80);
    ctx.fillStyle='#252c3d';ctx.fillRect(-7,-8,PW+14,PL+16);
    // panneaux pub
    const ads=['PRONO-CLUB.FR','PRONO-CLUB.FR','⚽ MON CLUB','PRONO-CLUB.FR'];
    ctx.save();
    const board=(x,y,w,h,k)=>{const g=ctx.createLinearGradient(x,y,x+w,y+h);g.addColorStop(0,k%2?'#e5126b':'#0b5bd3');g.addColorStop(1,k%2?'#a10b4b':'#083a8a');ctx.fillStyle=g;ctx.fillRect(x,y,w,h)};
    for(let k=0;k<6;k++){board(-1+k*(PW+2)/6,-4.4,(PW+2)/6-.15,1,k);board(-1+k*(PW+2)/6,PL+3.4,(PW+2)/6-.15,1,k+1)}
    for(let k=0;k<9;k++){board(-4.6,-1+k*(PL+2)/9,1,(PL+2)/9-.15,k);board(PW+3.6,-1+k*(PL+2)/9,1,(PL+2)/9-.15,k+1)}
    ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';
    const txt=(s,x,y,rot)=>{ctx.save();ctx.translate(x,y);ctx.rotate(ROT?-Math.PI/2:rot);ctx.scale(.05,.05);ctx.font='900 13px system-ui,sans-serif';ctx.fillText(s,0,1);ctx.restore()};
    for(let k=0;k<6;k++){txt(ads[k%4],-1+(k+.5)*(PW+2)/6,-3.9,0);txt(ads[(k+1)%4],-1+(k+.5)*(PW+2)/6,PL+3.9,0)}
    for(let k=0;k<9;k++){txt(ads[k%4],-4.1,-1+(k+.5)*(PL+2)/9,-Math.PI/2);txt(ads[(k+1)%4],PW+4.1,-1+(k+.5)*(PL+2)/9,Math.PI/2)}
    ctx.restore();
    // pelouse
    ctx.fillStyle='#2e8b3a';ctx.fillRect(-3,-3,PW+6,PL+6);
    for(let i=0;i<14;i++){ctx.fillStyle=i%2?'#319543':'#2a8337';ctx.fillRect(-3,-3+i*(PL+6)/14,PW+6,(PL+6)/14)}
    ctx.strokeStyle='rgba(255,255,255,.88)';ctx.lineWidth=.13;ctx.beginPath();ctx.rect(0,0,PW,PL);ctx.moveTo(0,PL/2);ctx.lineTo(PW,PL/2);ctx.stroke();
    ctx.beginPath();ctx.arc(CX,PL/2,9.15,0,7);ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,.9)';[[CX,PL/2],[CX,11],[CX,PL-11]].forEach(q=>{ctx.beginPath();ctx.arc(q[0],q[1],.22,0,7);ctx.fill()});
    for(const gy of [0,PL]){const s=gy===0?1:-1;ctx.beginPath();ctx.rect(CX-20.16,gy,40.32,16.5*s);ctx.rect(CX-9.16,gy,18.32,5.5*s);ctx.stroke();
      ctx.beginPath();const a0=Math.acos(5.5/9.15);if(s>0)ctx.arc(CX,11,9.15,a0,Math.PI-a0);else ctx.arc(CX,PL-11,9.15,Math.PI+a0,2*Math.PI-a0);ctx.stroke();
      [[0,gy],[PW,gy]].forEach(c=>{ctx.beginPath();const st=c[0]===0?(s>0?0:-Math.PI/2):(s>0?Math.PI/2:Math.PI);ctx.arc(c[0],c[1],1,st,st+Math.PI/2);ctx.stroke()})}
    // fanions
    [[0,0],[PW,0],[0,PL],[PW,PL]].forEach(c=>{ctx.strokeStyle='#ddd';ctx.lineWidth=.08;ctx.beginPath();ctx.moveTo(c[0],c[1]);ctx.lineTo(c[0],c[1]-1.1);ctx.stroke();ctx.fillStyle='#facc15';ctx.beginPath();ctx.moveTo(c[0],c[1]-1.1);ctx.lineTo(c[0]+.7,c[1]-.85);ctx.lineTo(c[0],c[1]-.6);ctx.fill()});
    drawGoal(0,true);drawGoal(PL,true);
    if(pk&&live&&PK.turn===0&&(PK.st==='aim'||PK.st==='prep')){const a=PK.aim,pz=.5+Math.sin(performance.now()/120)*.06;ctx.strokeStyle='#facc15';ctx.lineWidth=.12;ctx.beginPath();ctx.arc(a,-.15,pz,0,7);ctx.moveTo(a-pz-.3,-.15);ctx.lineTo(a+pz+.3,-.15);ctx.moveTo(a,-.15-pz-.3);ctx.lineTo(a,-.15+pz+.3);ctx.stroke()}
    if(pk&&live&&PK.turn===1&&PK.dive!=null&&PK.st!=='result'){ctx.fillStyle='rgba(250,204,21,.35)';ctx.beginPath();ctx.arc(CX+PK.dive*2.7,.4,1.1,0,7);ctx.fill()}
    // ombres + joueurs
    const list=P.slice().sort((a,b)=>a.y-b.y);
    const ctrl=live?G.ctrl:null,jw=joyW(),mdx=hyp(jw[0],jw[1])>.2?jw:null;
    let tgt=null;if(ctrl&&B.own===ctrl)tgt=bestPass(ctrl,mdx?mdx[0]:Math.cos(ctrl.dir),mdx?mdx[1]:Math.sin(ctrl.dir));
    if(tgt){ctx.strokeStyle='rgba(255,255,255,.75)';ctx.lineWidth=.12;ctx.setLineDash([.4,.3]);ctx.beginPath();ctx.arc(tgt.x,tgt.y,1,0,7);ctx.stroke();ctx.setLineDash([])}
    if(ctrl){const g=.85+Math.sin(performance.now()/160)*.08;ctx.fillStyle='rgba(250,204,21,.22)';ctx.beginPath();ctx.ellipse(ctrl.x,ctrl.y+.1,1.15*g,.95*g,0,0,7);ctx.fill();ctx.strokeStyle='#facc15';ctx.lineWidth=.16;ctx.beginPath();ctx.ellipse(ctrl.x,ctrl.y+.1,1.15*g,.95*g,0,0,7);ctx.stroke();
      const a=ctrl.dir;ctx.fillStyle='#facc15';ctx.beginPath();ctx.moveTo(ctrl.x+Math.cos(a)*1.9,ctrl.y+Math.sin(a)*1.9);ctx.lineTo(ctrl.x+Math.cos(a+.35)*1.35,ctrl.y+Math.sin(a+.35)*1.35);ctx.lineTo(ctrl.x+Math.cos(a-.35)*1.35,ctrl.y+Math.sin(a-.35)*1.35);ctx.fill()}
    for(const p of list){ctx.fillStyle='rgba(0,0,0,.28)';ctx.beginPath();ctx.ellipse(p.x+.28,p.y+.32,.62,.42,0,0,7);ctx.fill()}
    // ombre du ballon
    ctx.fillStyle='rgba(0,0,0,'+(.32-Math.min(.2,B.z*.04))+')';ctx.beginPath();ctx.ellipse(B.x+.12+B.z*.25,B.y+.15+B.z*.2,.24+B.z*.03,.17+B.z*.02,0,0,7);ctx.fill();
    let ballDrawn=false;
    for(const p of list){if(!ballDrawn&&p.y>B.y){drawBall();ballDrawn=true}drawPlayer(p)}
    if(!ballDrawn)drawBall();
    drawGoal(0,false);drawGoal(PL,false);
    // étiquettes (écran)
    ctx.setTransform(DPR,0,0,DPR,0,0);
    const scr=(x,y)=>ROT?[W/2-(y-cam.y)*Z,H/2+(x-cam.x)*Z]:[W/2+(x-cam.x)*Z,H/2+(y-cam.y)*Z];
    ctx.textAlign='center';ctx.textBaseline='middle';
    const label=(p,col,big)=>{const q=ROT?scr(p.x-1.75,p.y):scr(p.x,p.y-1.75);const s=(big?'':'')+p.sn+' '+p.r;ctx.font=(big?'800 12px':'700 10.5px')+' system-ui,sans-serif';const w=ctx.measureText(s).width+12;
      ctx.fillStyle='rgba(2,6,23,.72)';rr(q[0]-w/2,q[1]-9,w,18,9);ctx.fill();ctx.fillStyle=col;ctx.fillText(s,q[0],q[1]+.5)};
    if(B.own&&B.own!==ctrl)label(B.own,B.own.t===0?'#fff':'#fecaca',false);
    if(ctrl)label(ctrl,'#facc15',true);
    if(ctrl&&G.charge>=0){const q=ROT?scr(ctrl.x+1.6,ctrl.y):scr(ctrl.x,ctrl.y+1.6),v=Math.min(1,G.charge*.95+.25),w=46;ctx.fillStyle='rgba(2,6,23,.75)';rr(q[0]-w/2-2,q[1]-5,w+4,10,5);ctx.fill();
      ctx.fillStyle=v>.93?'#ef4444':v>.7?'#f97316':'#4ade80';rr(q[0]-w/2,q[1]-3,w*Math.min(1,v),6,3);ctx.fill()}
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
  function drawBall(){const x=ROT?B.x-B.z*.5:B.x,y=ROT?B.y:B.y-B.z*.5,r=.24*(1+B.z*.07);ctx.save();ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.fillStyle='#fff';ctx.fill();ctx.clip();
    ctx.fillStyle='#1f2937';for(let k=0;k<3;k++){const a=B.rot+k*2.1;ctx.beginPath();ctx.arc(x+Math.cos(a)*r*.62,y+Math.sin(a*.7)*r*.55,r*.3,0,7);ctx.fill()}
    const g=ctx.createRadialGradient(x-r*.35,y-r*.35,r*.1,x,y,r);g.addColorStop(0,'rgba(255,255,255,.5)');g.addColorStop(1,'rgba(0,0,0,.3)');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,2*r,2*r);ctx.restore();
    ctx.strokeStyle='rgba(0,0,0,.45)';ctx.lineWidth=.03;ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.stroke()}
  function drawPlayer(p){const tm=T[p.t],c1=p.gk?gkCol(tm.c1):tm.c1,c2=p.gk?'#111827':tm.c2,sh=p.gk?'#111827':shade(tm.c1,.45),sock=p.gk?c1:tm.c2;
    ctx.save();ctx.translate(p.x,p.y);const K=1.4;ctx.scale(K,K);ctx.rotate(p.dir);
    const down=p.stun>0&&p.slide<=0&&p.stun>.2;const sliding=p.slide>0,diving=p.dive>0;
    if(diving){ctx.rotate(p.diveS*Math.PI/2*Math.min(1,(.55-p.dive)*6))}
    const ph=p.ph,v=hyp(p.vx,p.vy),sw=Math.min(1,v/3)*.38;
    if(sliding||down){// au sol : jambes tendues
      ctx.fillStyle=sh;ctx.beginPath();ctx.ellipse(.15,0,.32,.28,0,0,7);ctx.fill();
      ctx.fillStyle=sock;[[.75,-.16],[.75,.16]].forEach(q=>{ctx.beginPath();ctx.ellipse(q[0],q[1],.34,.1,0,0,7);ctx.fill()});
      ctx.fillStyle='#111';[[1.1,-.16],[1.1,.16]].forEach(q=>{ctx.beginPath();ctx.ellipse(q[0],q[1],.11,.09,0,0,7);ctx.fill()});
      ctx.translate(-.35,0)}
    else{const l=Math.sin(ph)*sw,kk=p.kick>0?(.25-p.kick)*2.4:0;
      ctx.fillStyle=sock;ctx.beginPath();ctx.ellipse(l+(kk>0?kk*.6:0),-.17,.2,.1,0,0,7);ctx.fill();ctx.beginPath();ctx.ellipse(-l,.17,.2,.1,0,0,7);ctx.fill();
      ctx.fillStyle='#0b0b0b';ctx.beginPath();ctx.ellipse(l+.16+(kk>0?kk*.6:0),-.17,.1,.085,0,0,7);ctx.fill();ctx.beginPath();ctx.ellipse(-l+.16,.17,.1,.085,0,0,7);ctx.fill();
      ctx.fillStyle=sh;ctx.beginPath();ctx.ellipse(0,0,.25,.33,0,0,7);ctx.fill()}
    // bras
    const a=sliding||down?0:Math.sin(ph)*sw*.7;
    ctx.fillStyle=c1;ctx.beginPath();ctx.ellipse(-a,-.46,.17,.12,0,0,7);ctx.fill();ctx.beginPath();ctx.ellipse(a,.46,.17,.12,0,0,7);ctx.fill();
    ctx.fillStyle=p.gk?'#e5e7eb':p.skin;ctx.beginPath();ctx.arc(-a*1.6+.04,-.52,.085,0,7);ctx.fill();ctx.beginPath();ctx.arc(a*1.6+.04,.52,.085,0,7);ctx.fill();
    // torse
    ctx.fillStyle=c1;ctx.beginPath();ctx.ellipse(0,0,.27,.46,0,0,7);ctx.fill();
    ctx.fillStyle=c2;ctx.globalAlpha=.95;ctx.beginPath();ctx.ellipse(-.02,0,.27,.1,0,0,7);ctx.fill();ctx.globalAlpha=1;
    ctx.strokeStyle='rgba(0,0,0,.25)';ctx.lineWidth=.03;ctx.beginPath();ctx.ellipse(0,0,.27,.46,0,0,7);ctx.stroke();
    // tête
    ctx.fillStyle=p.skin;ctx.beginPath();ctx.arc(.03,0,.19,0,7);ctx.fill();
    if(!p.bald){ctx.fillStyle=p.hair;ctx.beginPath();ctx.arc(.0,0,.195,Math.PI*.5,Math.PI*1.5);ctx.arc(.03,0,.12,Math.PI*1.5,Math.PI*.5,true);ctx.fill()}
    ctx.restore();
  }
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
    PW0.style.width=G.charge>=0?Math.min(100,(G.charge*.95+.25)*100)+'%':'0'}
  let last=performance.now(),acc=0;
  function loop(now){if(G.end)return;const dt=Math.min(.05,(now-last)/1000);last=now;
    if(!paused){acc+=dt*G.speed;let n=0;while(acc>=1/60&&n<8){step(1/60);acc-=1/60;n++}if(n>=8)acc=0}
    if(G.end)return;draw(dt);hud();requestAnimationFrame(loop)}
  function done(abandon){if(G.end)return;G.end=true;window.removeEventListener('resize',resize);G.offKeys&&G.offKeys();
    exitFS();const res={pens:G.pens||null,sh:G.sc[0],sa:G.sc[1],scorers:G.scorers,abandon:!!abandon,live,shots:G.stats.sh,st:G.stats,poss:Math.round(G.stats.pos[0]/Math.max(1,G.stats.pos[0]+G.stats.pos[1])*100)};
    ov.querySelectorAll('.cm-joy,.cm-pad,.cm-spd,.cm-feed,.cm-flash,.cm-mini').forEach(x=>x.remove());
    setTimeout(()=>cfg.onEnd&&cfg.onEnd(ov,res),abandon?0:300)}
  kickoff(0);
  if(!live){/* regarder : rien à attendre */}
  requestAnimationFrame(t=>{last=t;loop(t)});
  return{ov,G,P,B,step,act}
}


/* ---------- styles ---------- */
const css=`
.cm-ov{padding:0!important;display:block!important;touch-action:none;user-select:none;-webkit-user-select:none;overflow:hidden}
.cm-cv{position:absolute;inset:0;display:block}
.cm-top{position:absolute;left:0;right:0;top:0;padding:calc(8px + env(safe-area-inset-top)) 10px 0;display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none;z-index:3}
.cm-top>*{pointer-events:auto}
.cm-x{position:absolute;left:10px;top:calc(10px + env(safe-area-inset-top));width:36px;height:36px;border-radius:12px;border:0;background:rgba(2,6,23,.6);color:#fff;font-size:16px;font-weight:900}
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
