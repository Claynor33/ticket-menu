#!/usr/bin/env python3
"""Injecte scripts/sources.json dans web/app.html entre /*SRC_START*/ et /*SRC_END*/."""
import json,re,pathlib
root=pathlib.Path(__file__).resolve().parent.parent
app=root/'web'/'app.html'
src=json.load(open(root/'scripts'/'sources.json'))
js=json.dumps(src,ensure_ascii=False,separators=(',',':'))
t=app.read_text()
t=re.sub(r'/\*SRC_START\*/.*?/\*SRC_END\*/',lambda m:'/*SRC_START*/'+js+'/*SRC_END*/',t,flags=re.S)
app.write_text(t)
print(len(src),'sources injectées')
