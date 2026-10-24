// Usage : node scripts/merge-variants.js [fichier de config] — cumule dans variants.json.
// Fusionne les doublons en « variantes » (une seule fiche, plusieurs versions). À lancer une seule fois : le résultat est
// dans scripts/variants.json (+ alias) ; les anciennes recettes sont retirées de web/app.html et des fichiers d'étapes.
const fs=require('fs'),path=require('path'),cp=require('child_process');
const root=path.join(__dirname,'..');cp.execFileSync(process.execPath,[path.join(__dirname,'extract-logic.js')]);
const L=require(path.join(root,'test','.logic.cjs'));
const cfg=JSON.parse(fs.readFileSync(process.argv[2]||path.join(__dirname,'merge.json'),'utf8'));
const src=JSON.parse(fs.readFileSync(path.join(__dirname,'sources.json'),'utf8'));
const byId=Object.fromEntries(L.R.map(r=>[r.id,r]));
const vf=path.join(__dirname,'variants.json');
const prev=fs.existsSync(vf)?JSON.parse(fs.readFileSync(vf,'utf8')):{vars:{},alias:{}};
const vars=prev.vars,alias=prev.alias,remove=new Set();
const use=id=>{if(!byId[id])throw new Error('inconnu '+id);if(remove.has(id))throw new Error('déjà fusionné '+id);};
for(const [b,lab,list] of cfg.groups){
  use(b);const out=[];
  for(const [id,l] of list){use(id);const r=byId[id];
    out.push({k:id,n:r.n,l,min:r.min,lvl:r.lvl,mat:r.mat,ing:r.ing,steps:r.steps,af:r.af?1:undefined,u:src[id]&&src[id].u,t:src[id]&&src[id].t});
    alias[id]=b+'~'+id;remove.add(id);delete src[id];}
  vars[b]={b:lab,v:(vars[b]?vars[b].v:[]).concat(out)};
}
for(const [id,keep] of cfg.drops){use(id);if(!byId[keep])throw new Error('garde inconnu '+keep);alias[id]=keep;remove.add(id);delete src[id];}
// retrait des anciennes recettes
let app=fs.readFileSync(path.join(root,'web','app.html'),'utf8');
const before=app.split('\n').length;
app=app.split('\n').filter(l=>{for(const id of remove){if(l.startsWith("'"+id+"|")||l.startsWith("r('"+id+"',"))return false;}return true;}).join('\n');
// liste « af »
app=app.replace(/(\/\/ Recettes du four qui passent aussi à l’air fryer[^\n]*\n\[)([^\]]*)(\])/,(m,a,list,c)=>a+list.split(',').filter(x=>!remove.has(x.replace(/'/g,'').trim())).join(',')+c);
fs.writeFileSync(path.join(root,'web','app.html'),app);
for(const f of fs.readdirSync(path.join(root,'scripts','steps'))){const p=path.join(root,'scripts','steps',f);
  fs.writeFileSync(p,fs.readFileSync(p,'utf8').split('\n').filter(l=>![...remove].some(id=>l.startsWith(id+'|'))).join('\n'));}
const p11=path.join(root,'scripts','new','recipes11.txt');
fs.writeFileSync(p11,fs.readFileSync(p11,'utf8').split('\n').filter(l=>![...remove].some(id=>l.startsWith(id+'|'))).join('\n'));
fs.writeFileSync(path.join(__dirname,'variants.json'),JSON.stringify({vars,alias}));
fs.writeFileSync(path.join(__dirname,'sources.json'),JSON.stringify(src,null,1));
console.log('retirées',remove.size,'bases avec variantes',Object.keys(vars).length,'lignes',before,'→',app.split('\n').length);
