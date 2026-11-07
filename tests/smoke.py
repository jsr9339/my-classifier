"""화면 연기 시험: 예시 데이터로 다섯 탭을 눌러 보고 오류와 핵심 숫자를 확인한다.
쓰는 법:  python tests/smoke.py   (Windows + Edge 필요, 8000번 포트를 잠깐 쓴다)
"""
import http.server, json, os, re, subprocess, sys, tempfile, threading, functools

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
PROBE = """<script>var OUT={errors:[]};window.addEventListener("error",function(e){OUT.errors.push(String(e.message));});
var $=function(i){return document.getElementById(i);};
setTimeout(function(){try{
 ["dash","owner","settle","auto","classify"].forEach(function(n){$("btn-"+n).click();});
 $("btn-auto").click();
 setTimeout(function(){
  OUT.status=[].slice.call(document.querySelectorAll("#a-stat-f button")).map(function(b){return b.textContent;});
  OUT.rows=window.Dash.data().rows.length;
  document.body.setAttribute("data-out",JSON.stringify(OUT));},1500);
}catch(e){OUT.errors.push(e.message);document.body.setAttribute("data-out",JSON.stringify(OUT));}},1800);</script>"""

def main():
    page = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read().replace("</body>", PROBE + "</body>")
    name = "_smoke_probe.html"; path = os.path.join(ROOT, name)
    open(path, "w", encoding="utf-8").write(page)
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    handler.log_message = lambda *a, **k: None
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8000), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        prof = tempfile.mkdtemp()
        # Edge는 파이프로 바로 받으면 빈 결과를 내서, PowerShell을 거쳐 받는다
        ps = ("[Console]::OutputEncoding=[Text.Encoding]::UTF8; & '%s' --headless --disable-gpu --user-data-dir='%s' "
              "--virtual-time-budget=12000 --dump-dom http://127.0.0.1:8000/%s | Out-String" % (EDGE, prof, name))
        out = subprocess.run(["powershell", "-NoProfile", "-Command", ps], capture_output=True, text=True, encoding="utf-8").stdout
    finally:
        srv.shutdown(); os.remove(path)
    if os.environ.get("SMOKE_DEBUG"): print(out[:300])
    m = re.search(r'data-out="([^"]*)"', out)
    if not m: print("실패: 화면이 결과를 내지 않았어요"); return 1
    res = json.loads(m.group(1).replace("&quot;", '"'))
    print(res)
    bad = res["errors"] or res["rows"] != 100 or len(res["status"]) < 4
    print("실패" if bad else "통과"); return 1 if bad else 0

if __name__ == "__main__":
    sys.exit(main())
