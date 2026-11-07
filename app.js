// 화면 동작. 정답 · 낱말 · 칸 이름은 코드에 적지 않고 JSON 파일에서 읽는다.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var criteria = null, keywords = null;

  function setStatus(msg) { $("status").textContent = msg || ""; }

  function getJSON(path) {
    return fetch(path, { cache: "no-store" }).then(function (r) {
      if (!r.ok) { throw new Error(path + " 를 열 수 없어요 (" + r.status + ")"); }
      return r.json();
    });
  }

  function showTab(name) {
    var isClassify = name === "classify";
    $("tab-classify").hidden = !isClassify;
    $("tab-grade").hidden = isClassify;
    $("btn-classify").setAttribute("aria-selected", String(isClassify));
    $("btn-grade").setAttribute("aria-selected", String(!isClassify));
  }

  function classifyRaw(raw) {
    var masked = Mask.maskText(raw);
    var res = Rules.classify(masked, criteria, keywords);
    return { masked: masked, res: res };
  }

  function showResult(masked, res, how) {
    $("masked").textContent = masked;
    $("r-cat").textContent = res["칸"];
    $("r-urg").textContent = res["긴급도"];
    $("r-why").textContent = res["이유"];
    $("r-how").textContent = how;
    $("r-warn").hidden = !res["확인필요"];
    $("result").hidden = false;
  }

  // AI(Gemini)로 분류한다. 서버로는 이름 · 전화번호 · 사번을 가린 문장만 보낸다.
  // 실패하면(한도 · 오류) 규칙으로 가르고, 그 사실을 화면에 적는다.
  function runClassify() {
    var raw = $("input").value.trim();
    if (!raw) { setStatus("문장을 먼저 넣어 주세요."); return; }
    setStatus("");
    var btn = $("run");
    btn.disabled = true; btn.textContent = "분류 중...";
    var masked = Mask.maskText(raw);

    fetch("api/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: masked })
    }).then(function (r) {
      return r.json().then(function (data) { return { ok: r.ok, data: data }; });
    }).then(function (r) {
      if (r.ok) {
        showResult(r.data["가린문장"] || masked, r.data, "AI(Gemini) 추정");
      } else {
        throw new Error(r.data["오류"] || "AI를 쓸 수 없어요");
      }
    }).catch(function (e) {
      var out = classifyRaw(raw);
      showResult(out.masked, out.res, "규칙(AI를 쓸 수 없어 대신 사용)");
      setStatus((e && e.message ? e.message : "AI를 쓸 수 없어요") + " — 규칙으로 대신 분류했어요.");
    }).then(function () {
      btn.disabled = false; btn.textContent = "분류하기";
    });
  }

  function loadSample() {
    getJSON("examples.json").then(function (list) {
      var pick = list[Math.floor(Math.random() * list.length)];
      $("input").value = pick.text;
      setStatus("");
    }).catch(function (e) { setStatus(e.message); });
  }

  function li(text, sub) {
    var el = document.createElement("li");
    el.appendChild(document.createTextNode(text));
    if (sub) {
      var s = document.createElement("span");
      s.className = "cmp";
      s.textContent = sub;
      el.appendChild(s);
    }
    return el;
  }

  function runGrade() {
    setStatus("");
    getJSON("data/answer.json").then(function (answers) {
      var okCat = 0, okUrg = 0, okBoth = 0;
      var wrongList = $("g-wrong"); wrongList.textContent = "";
      var worstRules = criteria["가장_나쁜_실수_규칙"] || [];
      var worstTotal = 0, worstBad = 0;
      var worstByRule = worstRules.map(function (r) { return { rule: r, total: 0, bad: 0 }; });

      answers.forEach(function (a) {
        var out = classifyRaw(a.text), res = out.res;
        var catOk = res["칸"] === a["칸"], urgOk = res["긴급도"] === a["긴급도"];
        if (catOk) okCat++;
        if (urgOk) okUrg++;
        if (catOk && urgOk) okBoth++;
        else {
          wrongList.appendChild(li(
            a.id + " " + a.text,
            "정답 " + a["칸"] + " / " + a["긴급도"] + "  →  규칙 " + res["칸"] + " / " + res["긴급도"]
          ));
        }
        worstByRule.forEach(function (w) {
          if (a["칸"] === w.rule["칸"] && a["긴급도"] === w.rule["긴급도"]) {
            w.total++; worstTotal++;
            // 다른 칸으로 갔거나, 긴급도가 정답(높음)보다 낮으면 가장 나쁜 실수
            if (res["칸"] !== a["칸"] || res["긴급도"] !== a["긴급도"]) { w.bad++; worstBad++; }
          }
        });
      });

      var n = answers.length;
      $("g-cat").textContent = okCat + " / " + n;
      $("g-urg").textContent = okUrg + " / " + n;
      $("g-both").textContent = okBoth + " / " + n;
      $("g-worst").textContent = worstBad + " / " + worstTotal;
      var wl = $("g-worst-list"); wl.textContent = "";
      worstByRule.forEach(function (w) {
        wl.appendChild(li(w.rule["칸"] + " · " + w.rule["긴급도"] + " 정답 " + w.total + "개 중 " + w.bad + "개 놓침"));
      });
      $("grade-result").hidden = false;
    }).catch(function (e) { setStatus(e.message); });
  }

  // 채점 탭은 정답 파일이 있는 내 컴퓨터에서만 보인다. 공개 링크에서는 숨긴다.
  var isLocal = ["localhost", "127.0.0.1"].indexOf(location.hostname) !== -1;
  if (!isLocal) { document.querySelector(".tabs").hidden = true; }

  $("btn-classify").addEventListener("click", function () { showTab("classify"); });
  $("btn-grade").addEventListener("click", function () { showTab("grade"); });
  $("run").addEventListener("click", runClassify);
  $("sample").addEventListener("click", loadSample);
  $("grade").addEventListener("click", runGrade);

  Promise.all([getJSON("criteria.json"), getJSON("keywords.json")]).then(function (r) {
    criteria = r[0]; keywords = r[1];
  }).catch(function (e) {
    setStatus(e.message + " — 파일로 직접 열지 말고 로컬 서버(localhost:8000)로 열어 주세요.");
  });
})();
