"""화면 연기 시험: 예시 데이터로 탭을 눌러 보고 핵심 동작을 확인한다.
쓰는 법:  python tests/smoke.py   (Windows + Edge 필요, 8000번 포트를 잠깐 쓴다)
확인하는 것: 오류 없음 / 문장 100건 / 자동응답 건수(2·20·10) / 보내기 뒤 건수 증가 /
             성격을 바꾼 뒤 되돌리기 / 결산 네모 줄바꿈 / 안내 접힘과 모든 탭에서 보임 / 되돌리기 확인 단계
"""
import http.server, json, os, re, subprocess, sys, tempfile, threading, functools

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
PROBE = """<script>var OUT={errors:[]};window.addEventListener("error",function(e){OUT.errors.push(String(e.message));});
var q=function(x){return [].slice.call(document.querySelectorAll(x));};var $=function(i){return document.getElementById(i);};
function cnt(){return $("a-count").textContent;}
function pick(w){q("#a-stat-f button").filter(function(b){return b.textContent.indexOf(w)===0;})[0].click();}
function sendFirst(){pick("답변 필요");var li=q("#a-done > li")[0];[].slice.call(li.querySelectorAll(".atabs button"))[0].click();li=q("#a-done > li")[0];
 var ck=li.querySelector(".chk2 input");ck.checked=true;ck.dispatchEvent(new Event("change"));li.querySelector(".apane .alink").click();}
function wait(ms,f){setTimeout(function(){try{f();}catch(e){OUT.errors.push("h:"+e.message);done();}},ms);}
function done(){document.body.setAttribute("data-out",JSON.stringify(OUT));}
wait(1800,function(){
 OUT.guideOpen=$("guide").open;
 $("btn-auto").click();
 wait(1500,function(){
  OUT.guideAllTabs=["btn-classify","btn-auto","btn-owner","btn-dash","btn-settle"].every(function(i){$(i).click();return !$("guide").hidden;});
  $("btn-auto").click();
  OUT.rows=window.Dash.data().rows.length; OUT.c0=cnt(); OUT.total0=q("#a-stat-f button")[0].textContent;
  sendFirst(); OUT.c1=cnt();
  // 문의 성격을 바꾸고 되돌리기
  pick("답변 필요");var li=q("#a-done > li")[0];[].slice.call(li.querySelectorAll(".atabs button"))[2].click();li=q("#a-done > li")[0];
  [].slice.call(li.querySelectorAll(".akind2 button")).filter(function(b){return b.textContent==="업무 오류";})[0].click();
  OUT.c2=cnt();
  $("btn-dash").click();
  wait(800,function(){
   var b=$("d-reset"); b.click(); OUT.armed=b.textContent; OUT.rowsStill=window.Dash.data().rows.filter(function(r){return r.auto;}).length;
   b.click();
   wait(1800,function(){
    OUT.topMsg=$("status").textContent.slice(0,13);
    $("btn-auto").click();
    wait(800,function(){
     OUT.c3=cnt(); OUT.total3=q("#a-stat-f button")[0].textContent;
     var rr=window.Dash.data().rows.filter(function(r){return r.auto;})[0]; rr.auto=""; window.Auto.render(); OUT.c4=cnt(); // 직접 처리 완료로 바뀐 건도 사라지지 않는다
     $("btn-settle").click();
     wait(1200,function(){
      var t=q("#s-sumtiles .tile.hot span")[0]; OUT.hotBr=!!(t&&t.querySelector("br"));
      done();
     });
    });
   });
  });
 });
});</script>"""

EXPECT = {
    "guideOpen": False, "guideAllTabs": True, "rows": 100,
    "c0": "답변 필요 2건 / 자동응답 20건 / 문의 성격 변경 10건", "total0": "전체 32건",
    "c1": "답변 필요 1건 / 자동응답 21건 / 문의 성격 변경 10건",
    "c2": "답변 필요 0건 / 자동응답 21건 / 문의 성격 변경 11건",
    "armed": "정말 되돌릴까요? 한 번 더 누르세요", "rowsStill": 21,
    "topMsg": "예시 데이터로 되돌렸어요",
    "c3": "답변 필요 2건 / 자동응답 20건 / 문의 성격 변경 10건", "total3": "전체 32건",
    "hotBr": True,
    "c4": "답변 필요 2건 / 자동응답 19건 / 문의 성격 변경 10건 / 직접 처리 1건",
}


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
              "--virtual-time-budget=30000 --dump-dom http://127.0.0.1:8000/%s | Out-String" % (EDGE, prof, name))
        out = subprocess.run(["powershell", "-NoProfile", "-Command", ps], capture_output=True, text=True, encoding="utf-8").stdout
    finally:
        srv.shutdown(); os.remove(path)
    m = re.search(r'data-out="([^"]*)"', out)
    if not m:
        print("실패: 화면이 결과를 내지 않았어요"); return 1
    res = json.loads(m.group(1).replace("&quot;", '"'))
    bad = ["오류: %s" % res["errors"]] if res["errors"] else []
    if "SMOKE_DEBUG" in os.environ: print(res)
    for k, want in EXPECT.items():
        if res.get(k) != want:
            bad.append("%s: 기대 %r / 실제 %r" % (k, want, res.get(k)))
    for b in bad:
        print("실패 -", b)
    print("통과 (%d개 확인)" % len(EXPECT) if not bad else "실패")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
