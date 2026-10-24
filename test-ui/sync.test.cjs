const {JSDOM,VirtualConsole}=require('jsdom');const fs=require('fs');
const frag=fs.readFileSync(require('path').join(__dirname,'..','web','app.html'),'utf8');
const html='<!doctype html><html><head><meta charset="utf-8"></head><body>'+frag+'</body></html>';
const errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(String(e.detail&&e.detail.stack||e.message)));
const store={doc:null,sets:[],listener:null};
const dom=new JSDOM(html,{runScripts:'dangerously',url:'https://example.test/',virtualConsole:vc,beforeParse(w){
  w.claude={use:async n=>{
    if(n==='user')return {id:async()=>'u_test'};
    if(n==='db')return {doc:p=>{store.path=p;return {set:async d=>{store.sets.push(JSON.parse(JSON.stringify(d)));store.doc=d;},onSnapshot:(next)=>{store.listener=next;setTimeout(()=>next({exists:!!store.remote,data:()=>store.remote,metadata:{hasPendingWrites:false}}),0);return()=>{};}};}};
    return null;}};
}});
const w=dom.window,d=w.document;const ok=(c,m)=>{console.log(c?'✓':'✗',m);if(!c)errors.push(m);};
setTimeout(()=>{
  ok(store.path==='data/users/u_test/state','chemin privé par utilisateur : '+store.path);
  d.querySelector('#onb-skip').click();d.querySelector('#onb-finish')||0;
  // aller au bout du questionnaire
  for(let i=0;i<3;i++)d.querySelector('#onb-next').click();
  d.querySelector('#onb-finish').click();
  setTimeout(()=>{
    ok(store.sets.length>=1,'écriture distante après modification ('+store.sets.length+')');
    ok(store.doc&&store.doc.onboarded===true&&store.doc.plan.meals.length===5,'document distant complet');
    // état distant plus récent venant d'un autre appareil
    const remote=JSON.parse(JSON.stringify(store.doc));remote.s.budget=123;remote.updatedAt=Date.now()+5000;
    store.listener({exists:true,data:()=>remote,metadata:{hasPendingWrites:false}});
    ok(JSON.parse(w.localStorage.getItem('ticketmenu.v2')).s.budget===123,'état plus récent d’un autre appareil adopté');
    console.log(errors.length?'ERREURS '+errors.join('\n'):'Synchro OK');process.exit(errors.length?1:0);
  },1200);
},400);
