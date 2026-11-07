"""화면 파일(js · css)의 내용이 바뀌면 index.html 의 ?v=... 번호를 새로 매긴다.
브라우저가 예전 파일과 새 파일을 섞어 쓰지 않도록, 같은 index.html 은 항상 같은 번호의 파일만 부른다.
커밋하기 전에 돌린다: python bump_version.py
"""
import hashlib
import re

FILES = ["mask.js", "rules.js", "app.js", "dashboard.js", "auto.js", "settle.js", "style.css", "settle.css"]
h = hashlib.sha1()
for f in FILES:
    h.update(open(f, "rb").read().replace(b"\r\n", b"\n"))
v = h.hexdigest()[:8]
s = open("index.html", encoding="utf-8").read()
pat = re.compile(r'((?:href|src)=")(' + "|".join(re.escape(f) for f in FILES) + r')(\?v=[0-9a-f]+)?(")')
new, n = pat.subn(lambda m: m.group(1) + m.group(2) + "?v=" + v + m.group(4), s)
if new != s:
    open("index.html", "w", encoding="utf-8", newline="\n").write(new)
print("version", v, "files", n)
