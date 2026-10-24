#!/usr/bin/env python3
"""Ajoute les recettes de scripts/new/recipes11.txt (id|nom|famille|min|niveau|matériel|ing|n° dans le catalogue HelloFresh)
dans web/app.html et leur lien dans scripts/sources.json. Les étapes viennent de scripts/steps/s11.txt."""
import json,re,sys,glob
app=open('web/app.html',encoding='utf-8').read()
pool=[l.rstrip('\n').split('\t') for f in sorted(glob.glob('scripts/sources/pool*.tsv')) for l in open(f,encoding='utf-8') if l.strip()]
steps={l.split('|')[0]:l.strip() for f in sorted(glob.glob('scripts/steps/*.txt')) for l in open(f,encoding='utf-8') if l.strip()}
src=json.load(open('scripts/sources.json'))
lines=[];ok=True
for l in open(sys.argv[1] if len(sys.argv)>1 else 'scripts/new/recipes11.txt',encoding='utf-8'):
    l=l.strip()
    if not l: continue
    id_,n,g,mi,lv,mat,ing,pn=l.split('|')
    if "'"+id_+"|" in app: continue
    keys=[p.split(':')[0] for p in ing.split()]
    st=steps.get(id_)
    if not st: print('pas d’étapes',id_); ok=False; continue
    toks=set(re.findall(r'\{(\w+)\}',st))
    if not toks<=set(keys): print('jeton inconnu',id_,toks-set(keys)); ok=False
    unused=set(keys)-toks
    if unused: print('non cité',id_,unused)
    if pn.strip():
        slug,title=pool[int(pn)-1]
        src[id_]={'u':'https://www.hellofresh.fr/recipes/'+slug,'t':title}
    lines.append("'"+'|'.join([id_,n,g,mi,lv,mat,ing,'-'])+"',")
if not ok: sys.exit(1)
app=app.replace("].forEach(rt);\n// Lien vers","\n".join(lines)+"\n].forEach(rt);\n// Lien vers",1)
open('web/app.html','w',encoding='utf-8').write(app)
json.dump(src,open('scripts/sources.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
print(len(lines),'recettes ajoutées')
