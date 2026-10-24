const {JSDOM,VirtualConsole}=require('jsdom');
const fs=require('fs');
const frag=fs.readFileSync(require('path').join(__dirname,'..','web','app.html'),'utf8');
const html='<!doctype html><html lang="fr"><head><meta charset="utf-8"></head><body>'+frag+'</body></html>';
const errors=[];
const vc=new VirtualConsole();
vc.on('jsdomError',e=>errors.push('jsdomError: '+(e.detail&&e.detail.stack||e.message)));
vc.on('error',e=>errors.push('console.error: '+e));
const dom=new JSDOM(html,{runScripts:'dangerously',url:'https://example.test/',virtualConsole:vc,pretendToBeVisual:true});
const w=dom.window,d=w.document;
w.scrollTo=()=>{};
const $=s=>d.querySelector(s);
const click=s=>{const el=typeof s==='string'?$(s):s;if(!el)throw new Error('introuvable '+s);el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));};
const chk=(s,v)=>{const el=typeof s==='string'?$(s):s;if(!el)throw new Error('introuvable '+s);el.checked=v;el.dispatchEvent(new w.Event('change',{bubbles:true}));};
const ok=(c,m)=>{if(!c){errors.push('ECHEC: '+m);console.log('✗',m);}else console.log('✓',m);};
const txt=s=>($(s)||{}).textContent||'';
setTimeout(()=>{
 try{
  ok(!$('#onb').hidden&&$('#shell').hidden,'questionnaire affiché au premier lancement');
  click('#ob-leclerc');ok($('#ob-leclerc').getAttribute('aria-pressed')==='true','enseigne choisie');
  click('#onb-next');
  const r=$('#ob-budget');r.value='80';r.dispatchEvent(new w.Event('input',{bubbles:true}));r.dispatchEvent(new w.Event('change',{bubbles:true}));
  ok(/80/.test(txt('#ob-bval')),'budget 80 affiché');
  click('#onb-next');click('#kids-inc');click('#kids-inc');ok(txt('#kids-val')==='2','2 enfants');
  click('#onb-next');click('#seg-diet-nopork');click('#chip-allergens-oeuf');click('#chip-dislikes-champi');
  click('#onb-next');click('#seg-maxMin-30');click('#chip-days-5');
  click('#onb-finish');
  ok($('#onb').hidden&&!$('#shell').hidden,'appli affichée après le questionnaire');
  const meals=d.querySelectorAll('.meal');
  ok(meals.length===6,'6 dîners (5 jours + samedi) : '+meals.length);
  const st=JSON.parse(w.localStorage.getItem('ticketmenu.v2'));
  ok(st.s.store==='leclerc'&&st.s.budget===80&&st.s.kids===2&&st.s.diet==='nopork','réglages enregistrés');
  ok(st.plan.meals.every(m=>m.rid),'menu complet');
  const RR=w.eval('R');
  ok(st.plan.meals.every(m=>!RR.find(x=>x.id===m.rid).pork),'sans porc respecté');
  ok(/Total estimé/.test(txt('.hero')),'résumé du budget');
  // changer / garder / recette
  const before=st.plan.meals[0].rid;
  click('#swap-0');
  let s2=JSON.parse(w.localStorage.getItem('ticketmenu.v2'));ok(s2.plan.meals[0].rid!==before,'Changer remplace le dîner');
  click('#undo-btn');s2=JSON.parse(w.localStorage.getItem('ticketmenu.v2'));ok(s2.plan.meals[0].rid===before,'Annuler restaure le dîner');
  click('#lock-1');ok($('#lock-1').getAttribute('aria-pressed')==='true'&&$('#swap-1').disabled,'Garder verrouille le dîner');
  click('#open-2');ok(d.querySelector('#sheet').innerHTML.includes('Matériel')&&/Étapes/.test(d.querySelector('#sheet').innerHTML),'fiche recette avec matériel et étapes');
  click('#cook');ok(/Étape 1 sur/.test(d.querySelector('#sheet').textContent),'mode cuisine');
  click('#cnext');ok(/Étape 2 sur/.test(d.querySelector('#sheet').textContent),'étape suivante');
  click('#close');
  click('#open-3');click('#pick');ok(d.querySelectorAll('.opt').length>=5,'liste de remplacement');
  click(d.querySelector('.opt'));
  chk('#done-0',true);ok(JSON.parse(w.localStorage.getItem('ticketmenu.v2')).plan.meals[0].done===true,'dîner marqué cuisiné');
  // courses
  click('#nav-list');ok(d.querySelectorAll('.ln').length>5,'liste de courses : '+d.querySelectorAll('.ln').length+' articles');
  const first=d.querySelector('.ln input[type=checkbox]');chk(first,true);ok(Object.values(JSON.parse(w.localStorage.getItem('ticketmenu.v2')).plan.checked).includes(true),'article coché');
  const pr=d.querySelector('.pr');const pid=pr.dataset.id;click(pr);
  const pin=$('#pe-'+pid);ok(!!pin,'édition du prix');pin.value='9.99';pin.dispatchEvent(new w.Event('focusout',{bubbles:true}));
  ok(JSON.parse(w.localStorage.getItem('ticketmenu.v2')).ov.leclerc[pid]===9.99,'prix corrigé enregistré');
  const haveBtn=d.querySelector('[data-act=have]');const hid=haveBtn.dataset.id;click(haveBtn);
  ok(!!JSON.parse(w.localStorage.getItem('ticketmenu.v2')).pantry[hid],'Déjà chez moi ajoute au placard');
  ok(/Déjà chez toi/.test(txt('#view')),'section déjà chez toi');
  click('#copy');
  click('#done');ok(!!$('#done-yes'),'confirmation des courses');click('#done-yes');
  ok(JSON.parse(w.localStorage.getItem('ticketmenu.v2')).hist.length===1,'courses enregistrées au bilan');
  click('#nav-week');ok(!!$('#newweek'),'bouton nouvelle semaine après les courses');const pantryBefore=Object.keys(JSON.parse(w.localStorage.getItem('ticketmenu.v2')).pantry).length;click('#newweek');
  const sN=JSON.parse(w.localStorage.getItem('ticketmenu.v2'));ok(sN.plan.shopped===null&&sN.plan.meals.length===6&&sN.recent.length>=6,'nouvelle semaine composée, restes mémorisés ('+Object.keys(sN.pantry).length+' articles au placard)');
  // placard
  click('#nav-pantry');const pan=JSON.parse(w.localStorage.getItem('ticketmenu.v2')).pantry;const cand=['colin','pesto','frites','epinards','hv','thon','mozza','chevre'].find(x=>!pan[x]);const qn={colin:'colin',pesto:'pesto',frites:'frites',epinards:'pinards',hv:'haricots verts',thon:'thon',mozza:'mozzarella',chevre:'chèvre'}[cand];
  const q=$('#pq');q.value=qn;q.dispatchEvent(new w.Event('input',{bubbles:true}));
  ok(!!$('#padd-'+cand),'recherche placard ('+cand+')');click('#padd-'+cand);ok(!!JSON.parse(w.localStorage.getItem('ticketmenu.v2')).pantry[cand],'ingrédient ajouté au placard');
  click('#pp-'+cand);click('#pm-'+cand);click('#prm-'+cand);ok(!JSON.parse(w.localStorage.getItem('ticketmenu.v2')).pantry[cand],'ingrédient retiré du placard');
  // bilan
  click('#nav-settings');click('#open-stats');ok(!!$('svg.chart')&&/Dépensé/.test(txt('#view')),'bilan avec graphique');
  // réglages
  click('#nav-settings');
  chk('#st-lidl',true);click('#main-leclerc');
  ok(JSON.parse(w.localStorage.getItem('ticketmenu.v2')).s.stores.length===2,'deux enseignes');
  click('#nav-list');ok(!!$('#split'),'bouton meilleur prix par enseigne');click('#split');ok(/PLUSIEURS ENSEIGNES/.test(txt('.rc-head')),'mode plusieurs enseignes');
  click('#nav-settings');click('#chip-days-6');
  ok(JSON.parse(w.localStorage.getItem('ticketmenu.v2')).plan.meals.length===7,'7 dîners après ajout d’un jour');
  click('#seg-diet-veg');click('#nav-week');ok(!!$('#regen2'),'bandeau recomposer après changement de réglages');click('#regen2');
  const st3=JSON.parse(w.localStorage.getItem('ticketmenu.v2'));
  ok(st3.plan.meals.every(m=>m.locked||RR.find(x=>x.id===m.rid).veg),'menu végétarien après recomposition');
  // ---- Recettes : parcourir, favoris, ajouter par texte collé, modifier, supprimer
  click('#nav-settings');click('#seg-diet-tout');click('#nav-recipes');
  const nCards=d.querySelectorAll('.rcard').length;ok(nCards>=30,'catalogue de recettes affiché ('+nCards+')');
  ok(d.querySelectorAll('.rcard .cover').length===nCards,'chaque recette a une image');
  click('#rf-quick');ok(d.querySelectorAll('.rcard').length>5&&d.querySelectorAll('.rcard').length<nCards,'filtre rapides');click('#rf-all');
  const rq=$('#rq');rq.value='saumon';rq.dispatchEvent(new w.Event('input',{bubbles:true}));
  ok(d.querySelectorAll('.rcard').length>=2&&d.querySelectorAll('.rcard').length<20,'recherche par ingrédient ('+d.querySelectorAll('.rcard').length+')');
  rq.value='';rq.dispatchEvent(new w.Event('input',{bubbles:true}));
  const hb=d.querySelector('.rcard .heart');const fid=hb.dataset.id;click(hb);
  ok(JSON.parse(w.localStorage.getItem('ticketmenu.v2')).fav.includes(fid),'favori enregistré');
  click('#rf-fav');ok(d.querySelectorAll('.rcard').length===1,'filtre favoris');click('#rf-all');
  click('#r-'+fid);ok(/Étapes/.test(d.querySelector('#sheet').textContent)&&!!$('#addweek'),'fiche d’une recette du catalogue');
  click('#addweek');click('#day-1');
  const stW=JSON.parse(w.localStorage.getItem('ticketmenu.v2'));ok(stW.plan.meals[1].rid===fid&&stW.plan.meals[1].locked,'recette ajoutée à un soir de la semaine');
  // import par texte
  click('#addr');ok(!!$('#imp'),'fenêtre d’import');
  $('#imp').value='Gratin dauphinois\nPréparation : 20 min Cuisson : 1 h\nPour 4 personnes\nIngrédients\n800 g de pommes de terre\n30 cl de crème liquide\n20 cl de lait\n2 gousses d’ail\n1 pincée de muscade\n250 g de burrata\nSel, poivre\nPréparation\n1. Couper les pommes de terre en rondelles.\n2. Verser le lait et la crème, enfourner 1 h à 160 °C.';
  click('#imp-go');ok(!!$('#d-name')&&$('#d-name').value==='Gratin dauphinois','brouillon : nom reconnu');
  ok(d.querySelectorAll('.drow').length===6,'brouillon : 6 ingrédients ('+d.querySelectorAll('.drow').length+')');
  ok(/nouveau/.test(txt('#dsum')),'brouillon : ingrédient inconnu signalé');
  const q0=d.querySelector('.drow input[type=number]');ok(q0.value==='800','brouillon : quantité 800 g');
  click('#dsave');
  let stC=JSON.parse(w.localStorage.getItem('ticketmenu.v2'));
  ok(stC.custom.recipes.length===1&&stC.custom.recipes[0].n==='Gratin dauphinois','recette enregistrée dans l’état');
  ok(Object.keys(stC.custom.ings).length===1,'ingrédient inconnu créé');
  ok(d.querySelectorAll('.rcard').length===1&&!!d.querySelector('.ownb'),'recette perso visible dans « Les miennes »');
  const cid=stC.custom.recipes[0].id;
  // la recette perso entre dans les menus et la liste de courses
  click('#r-'+cid);click('#addweek');click('#day-0');
  click('#nav-list');ok(/burrata/i.test(txt('#view')),'ingrédient créé présent dans la liste de courses');
  // modifier puis supprimer
  click('#nav-recipes');click('#r-'+cid);click('#redit');ok(!!$('#d-name'),'édition d’une recette perso');
  $('#d-name').value='Gratin du dimanche';$('#d-name').dispatchEvent(new w.Event('input',{bubbles:true}));click('#dsave');
  ok(JSON.parse(w.localStorage.getItem('ticketmenu.v2')).custom.recipes[0].n==='Gratin du dimanche','recette modifiée');
  click('#r-'+cid);click('#rdel');click('#rdel-yes');
  stC=JSON.parse(w.localStorage.getItem('ticketmenu.v2'));
  ok(stC.custom.recipes.length===0&&Object.keys(stC.custom.ings).length===0&&stC.plan.meals.every(m=>m.rid!==cid),'suppression : recette, ingrédient et menu nettoyés');
  // lot de recettes
  click('#addr');$('#imp').value=JSON.stringify({recipes:[{n:'Pâtes tomate',serves:2,min:15,ing:['200 g de pâtes','1 boîte de tomates concassées'],steps:['Cuire','Servir']},{n:'Omelette',serves:2,ing:['4 œufs','1 noix de beurre'],steps:['Battre','Cuire']}]});
  click('#imp-go');ok(JSON.parse(w.localStorage.getItem('ticketmenu.v2')).custom.recipes.length===2,'lot de 2 recettes importé');
 }catch(e){errors.push('EXCEPTION: '+e.stack);}
 console.log(errors.length?'\nERREURS:\n'+errors.join('\n'):'\nTout est passé.');
 process.exit(errors.length?1:0);
},300);
