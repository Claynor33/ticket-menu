const {JSDOM,VirtualConsole}=require('jsdom');
const {createApp}=require('../server/src/server');
const errors=[];const ok=(c,m)=>{console.log(c?'✓':'✗',m);if(!c)errors.push(m);};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const app=createApp({dbPath:':memory:'});
function device(base){
  const vc=new VirtualConsole();vc.on('jsdomError',e=>{const m=String(e.detail&&e.detail.stack||e.message);if(!/Could not load link|ENOTFOUND fonts/.test(m))errors.push(m);});
  const jar={c:''};
  return JSDOM.fromURL(base+'/',{runScripts:'dangerously',resources:'usable',virtualConsole:vc,pretendToBeVisual:true,beforeParse(w){
    w.fetch=async(u,o={})=>{const r=await fetch(new URL(u,base),{...o,headers:{...(o.headers||{}),cookie:jar.c}});const sc=r.headers.get('set-cookie');if(sc)jar.c=sc.split(';')[0];return r;};
    w.scrollTo=()=>{};
  }}).then(async dom=>{await sleep(500);return dom;});
}
(async()=>{
  await new Promise(r=>app.server.listen(0,r));const base='http://127.0.0.1:'+app.server.address().port;
  const A=await device(base),a=A.window,ad=a.document;
  const click=(d,w,s)=>{const el=d.querySelector(s);if(!el)throw new Error('introuvable '+s);el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));};
  ok(!!ad.querySelector('meta[name="tm-server"]'),'page servie avec le marqueur serveur');
  click(ad,a,'#onb-skip');for(let i=0;i<3;i++)click(ad,a,'#onb-next');click(ad,a,'#onb-finish');
  click(ad,a,'#nav-settings');
  ok(!!ad.querySelector('#acc-email'),'formulaire de compte affiché');
  ad.querySelector('#acc-email').value='michael@exemple.fr';ad.querySelector('#acc-pass').value='motdepasse1';
  click(ad,a,'#register');await sleep(1500);
  ok(/michael@exemple.fr/.test(ad.querySelector('#view').textContent),'compte créé et connecté');
  const row=app.db.prepare('SELECT json FROM states').get();
  ok(!!row&&JSON.parse(row.json).plan.meals.length===5,'état poussé sur le serveur');
  const planA=JSON.parse(row.json).plan.meals.map(m=>m.rid).join(',');
  // correction de prix signalée au serveur
  click(ad,a,'#nav-list');const pr=ad.querySelector('.pr');click(ad,a,'.pr');
  const pin=ad.querySelector('.pin');pin.value='1.20';pin.dispatchEvent(new a.Event('focusout',{bubbles:true}));await sleep(500);
  ok(app.db.prepare('SELECT COUNT(*) n FROM price_reports').get().n===1,'correction de prix signalée au serveur');
  // second appareil
  const B=await device(base),b=B.window,bd=B.window.document;
  bd.querySelector('#acc-email').value='michael@exemple.fr';bd.querySelector('#acc-pass').value='motdepasse1';
  click(bd,b,'#login');await sleep(1500);
  const stB=JSON.parse(b.localStorage.getItem('ticketmenu.v2'));
  ok(stB.plan.meals.length===5&&stB.plan.meals.map(m=>m.rid).join(',')===planA,'le second appareil récupère le même menu depuis le serveur');
  const row2=JSON.parse(app.db.prepare('SELECT json FROM states').get().json);
  ok(row2.updatedAt>0,'état serveur à jour');
  await sleep(300);
  console.log(errors.length?'ERREURS\n'+errors.join('\n'):'E2E OK');
  A.window.close();B.window.close();app.close();process.exit(errors.length?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
