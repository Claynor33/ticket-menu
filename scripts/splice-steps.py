#!/usr/bin/env python3
"""Injecte scripts/steps/*.txt (une recette par ligne : id|étape // étape) dans web/app.html entre les marqueurs STEPS_START/END."""
import glob,re,sys
lines=[]
for f in sorted(glob.glob('scripts/steps/*.txt')):
    for l in open(f,encoding='utf-8'):
        l=l.strip()
        if l: lines.append(l)
seen={}
for l in lines: seen[l.split('|')[0]]=l   # le dernier gagne
js=",\n".join("'"+l.replace("\\","\\\\").replace("'","\\'")+"'" for l in seen.values())
a=open('web/app.html',encoding='utf-8').read()
a=re.sub(r"/\*STEPS_START\*/.*?/\*STEPS_END\*/","/*STEPS_START*/\n["+js+"\n].forEach(st);\n/*STEPS_END*/",a,flags=re.S)
open('web/app.html','w',encoding='utf-8').write(a)
print(len(seen),'recettes détaillées')
