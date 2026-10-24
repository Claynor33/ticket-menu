#!/usr/bin/env python3
"""Injecte scripts/variants.json (variantes et anciens identifiants) dans web/app.html."""
import json,re,pathlib
root=pathlib.Path(__file__).resolve().parent.parent
app=root/'web'/'app.html'
d=json.load(open(root/'scripts'/'variants.json',encoding='utf-8'))
dump=lambda o:json.dumps(o,ensure_ascii=False,separators=(',',':'))
t=app.read_text(encoding='utf-8')
t=re.sub(r'/\*VARS_START\*/.*?/\*VARS_END\*/',lambda m:'/*VARS_START*/'+dump(d['vars'])+'/*VARS_END*/',t,flags=re.S)
t=re.sub(r'/\*ALIAS_START\*/.*?/\*ALIAS_END\*/',lambda m:'/*ALIAS_START*/'+dump(d['alias'])+'/*ALIAS_END*/',t,flags=re.S)
app.write_text(t,encoding='utf-8')
print(len(d['vars']),'fiches avec variantes,',len(d['alias']),'anciens identifiants')
