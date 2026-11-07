// 화면 동작. 정답 · 낱말 · 칸 이름은 코드에 적지 않고 JSON 파일에서 읽는다.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var criteria = null, keywords = null;
  var ANSWER_PATH = "eval/answer.json"; // 채점 단추를 누를 때만 연다
  var lastRule = null, lastAI = null;

  function setStatus(msg) { $("status").textContent = msg || ""; }

  function getJSON(path) {
    return fetch(path, { cache: "no-store" }).then(function (r) {
      if (!r.ok) { throw new Error(path + " 를 열 수 없어요 (" + r.status + ")"); }
      return r.json();
    });
  }

  var HERO = {
    classify: ["직원 의견 한 줄, 담당자에게 바로", '<span class="b">사내 의견함</span><br>정리 도우미'],
    dash: ["의견함 한눈에 보기", '<span class="b">사내 의견함</span><br>응대 현황'],
    owner: ["담당자별로 확인하기", '<span class="b">담당자별</span><br>응대 현황'],
    settle: ["팀별/팀원별 KPI 달성도 확인", '<span class="b">사내 의견함</span><br>운영 결산']
  };
  function showTab(name) {
    ["classify", "dash", "owner", "settle"].forEach(function (n) {
      $("tab-" + n).hidden = n !== name;
      $("btn-" + n).setAttribute("aria-selected", String(n === name));
    });
    $("tab-grade").hidden = name !== "classify"; // 채점은 분류 탭 아래에 이어서 보인다
    $("hero-kicker").textContent = HERO[name][0];
    $("hero-title").innerHTML = HERO[name][1]; // 고정 문구라서 안전하다
    if ((name === "dash" || name === "owner") && window.Dash) { window.Dash.ensure(); } // 자료가 없으면 예시 데이터로 바로 보여 준다
    if ((name === "settle" || name === "owner") && window.Dash) { window.Dash.ensure().then(function () { if (window.Settle) { window.Settle.render({ follow: name === "owner" }); } }); }
  }

  function classifyRaw(raw) {
    var masked = Mask.maskText(raw);
    var res = Rules.classify(masked, criteria, keywords);
    return { masked: masked, res: res };
  }

  // ---------- 분류 탭 (대화) ----------
  var busy = false, samples = [];
  var chat = $("chat"), input = $("input");

  function node(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text != null) { e.textContent = text; }
    return e;
  }

  // AI(Gemini) 호출. 서버로는 이름 · 전화번호 · 사번을 가린 문장만 보낸다.
  function callAI(text) {
    return fetch("api/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: Mask.maskText(text) })
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) {
          var err = new Error(data["오류"] || "AI를 쓸 수 없어요");
          err.kind = data["종류"] || "";
          throw err;
        }
        return data;
      });
    });
  }

  // 대화 한 칸을 더하고 말풍선 본문(.msg)을 돌려준다. 의견은 왼쪽, 답변은 오른쪽.
  function addTurn(who, label) {
    var t = node("div", "turn " + who);
    t.appendChild(node("div", "who", label));
    var m = node("div", "msg");
    t.appendChild(m);
    chat.appendChild(t);
    var turns = chat.querySelectorAll(".turn");
    if (turns.length > 24) { turns[0].remove(); turns[1].remove(); } // 오래된 대화는 12쌍까지만 남긴다
    t.scrollIntoView({ block: "nearest", behavior: "smooth" });
    return m;
  }

  function fillAnswer(msg, res, how, raw, masked) {
    msg.textContent = "";
    var line = node("div", "line");
    line.appendChild(node("span", "chip", res["칸"]));
    line.appendChild(node("span", "chip" + (res["긴급도"] === "높음" ? " hi" : ""), res["긴급도"]));
    msg.appendChild(line);
    msg.appendChild(node("p", "", res["이유"]));
    msg.appendChild(node("p", "src", how));
    if (masked && masked !== raw) { msg.appendChild(node("p", "src", "가려서 보낸 문장: " + masked)); }
    if (res["확인필요"]) { msg.appendChild(node("span", "check", "사람이 확인하세요")); }
  }

  function autoGrow() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  }

  // 실패하면(한도 · 오류) 규칙으로 가르고, 그 사실을 화면에 적는다.
  function runClassify() {
    var raw = input.value.trim();
    if (busy) { return; }
    if (!raw) { setStatus("문장을 먼저 넣어 주세요."); return; }
    setStatus("");
    busy = true; $("run").disabled = true;
    input.value = ""; autoGrow();
    addTurn("me", "의견").textContent = raw;
    var answer = addTurn("ai", "답변");
    answer.textContent = "분류 중...";
    callAI(raw).then(function (data) {
      fillAnswer(answer, data, "AI(Gemini) 추정", raw, data["가린문장"]);
    }).catch(function (e) {
      var out = classifyRaw(raw);
      fillAnswer(answer, out.res, "규칙(AI를 쓸 수 없어 대신 사용)", raw, out.masked);
      setStatus((e && e.message ? e.message : "AI를 쓸 수 없어요") + " — 규칙으로 대신 분류했어요.");
    }).then(function () {
      busy = false; $("run").disabled = false;
    });
  }

  function renderTry() {
    var box = $("try"); box.textContent = "";
    if (!samples.length) { return; }
    var pool = samples.slice().sort(function () { return Math.random() - 0.5; }).slice(0, 2);
    pool.forEach(function (s) {
      var b = node("button", "", s.text); b.type = "button";
      b.addEventListener("click", function () { input.value = s.text; autoGrow(); input.focus(); });
      box.appendChild(b);
    });
    var more = node("button", "more", "다른 예시"); more.type = "button";
    more.addEventListener("click", renderTry);
    box.appendChild(more);
  }

  // ---------- 채점 탭 ----------
  function li(text, sub) {
    var el = document.createElement("li");
    el.appendChild(document.createTextNode(text));
    if (sub) {
      var s = document.createElement("span");
      s.className = "cmp-sub";
      s.textContent = sub;
      el.appendChild(s);
    }
    return el;
  }

  // results[i] = { 칸, 긴급도, 확인필요, 이유 } 또는 null(호출 실패)
  function computeStats(answers, results, label) {
    var rules = criteria["가장_나쁜_실수_규칙"] || [];
    var st = { n: answers.length, okCat: 0, okUrg: 0, okBoth: 0, worstBad: 0, worstTotal: 0, low: 0, failed: 0, wrong: [], worstByRule: [] };
    st.worstByRule = rules.map(function (r) { return { rule: r, total: 0, bad: 0 }; });
    answers.forEach(function (a, i) {
      var res = results[i];
      if (!res) { st.failed++; res = { "칸": "(실패)", "긴급도": "(실패)", "확인필요": false }; }
      var catOk = res["칸"] === a["칸"], urgOk = res["긴급도"] === a["긴급도"];
      if (catOk) st.okCat++;
      if (urgOk) st.okUrg++;
      if (res["확인필요"]) st.low++;
      if (catOk && urgOk) st.okBoth++;
      else st.wrong.push({ id: a.id, text: a.text, answer: a["칸"] + " / " + a["긴급도"], got: res["칸"] + " / " + res["긴급도"], label: label });
      st.worstByRule.forEach(function (w) {
        if (a["칸"] === w.rule["칸"] && a["긴급도"] === w.rule["긴급도"]) {
          w.total++; st.worstTotal++;
          if (!(catOk && urgOk)) { w.bad++; st.worstBad++; }
        }
      });
    });
    return st;
  }

  function renderWrong(listEl, st) {
    listEl.textContent = "";
    st.wrong.forEach(function (w) {
      listEl.appendChild(li(w.id + " " + w.text, "정답 " + w.answer + "  →  " + w.label + " " + w.got));
    });
  }

  function renderRuleCard(st) {
    $("g-cat").textContent = st.okCat + " / " + st.n;
    $("g-urg").textContent = st.okUrg + " / " + st.n;
    $("g-both").textContent = st.okBoth + " / " + st.n;
    $("g-worst").textContent = st.worstBad + " / " + st.worstTotal;
    var wl = $("g-worst-list"); wl.textContent = "";
    st.worstByRule.forEach(function (w) {
      wl.appendChild(li(w.rule["칸"] + " · " + w.rule["긴급도"] + " 정답 " + w.total + "개 중 " + w.bad + "개 놓침"));
    });
    renderWrong($("g-wrong"), st);
    $("grade-result").hidden = false;
  }

  function runRuleGrade() {
    setStatus("");
    return getJSON(ANSWER_PATH).then(function (answers) {
      var results = answers.map(function (a) { return classifyRaw(a.text).res; });
      lastRule = computeStats(answers, results, "규칙");
      renderRuleCard(lastRule);
      return { answers: answers, stats: lastRule };
    }).catch(function (e) { setStatus(e.message); });
  }

  function addRow(tbody, label, a, b) {
    var tr = document.createElement("tr");
    [label, a, b].forEach(function (t, i) {
      var c = document.createElement(i === 0 ? "th" : "td");
      if (i === 0) c.setAttribute("scope", "row");
      c.textContent = t;
      tr.appendChild(c);
    });
    tbody.appendChild(tr);
  }

  function renderCompare(rule, ai, cond) {
    var body = $("cmp-body"); body.textContent = "";
    var n = rule.n;
    addRow(body, "칸 맞은 수", rule.okCat + " / " + n, ai.okCat + " / " + n);
    addRow(body, "긴급도 맞은 수", rule.okUrg + " / " + n, ai.okUrg + " / " + n);
    addRow(body, "둘 다 맞은 수", rule.okBoth + " / " + n, ai.okBoth + " / " + n);
    addRow(body, "가장 나쁜 실수 놓침", rule.worstBad + " / " + rule.worstTotal, ai.worstBad + " / " + ai.worstTotal);
    addRow(body, "«사람이 확인» 표시", rule.low + "개", ai.low + "개");
    $("ai-cond").textContent = cond;
    renderWrong($("ai-wrong"), ai);
    $("ai-out").hidden = false;
  }

  function runAIGrade() {
    getJSON(ANSWER_PATH).then(function (answers) {
      var n = answers.length;
      var btn = $("btn-ai"), prog = $("ai-progress");
      btn.disabled = true; $("btn-score").disabled = true;
      prog.hidden = false; prog.textContent = "AI 채점 중... 0 / " + n;
      setStatus("");

      // 10개씩 묶어서 보낸다. 무료 구간은 분당 15회까지라서 5.2초에 한 번씩만 부른다.
      var GAP = 5200, BATCH = 10;
      var results = new Array(n), done = 0, abort = "";
      function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
      function callBatch(texts) {
        return fetch("api/classify", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texts: texts.map(function (t) { return Mask.maskText(t); }) })
        }).then(function (r) {
          return r.json().then(function (data) {
            if (!r.ok) { var err = new Error(data["오류"] || "AI를 쓸 수 없어요"); err.kind = data["종류"] || ""; throw err; }
            return data;
          });
        });
      }
      function one(k, tries) {
        var start = k * BATCH, chunk = answers.slice(start, start + BATCH);
        return callBatch(chunk.map(function (a) { return a.text; })).then(function (data) {
          var out = data["결과"] || [];
          chunk.forEach(function (a, j) { results[start + j] = out[j] || null; });
        }).catch(function (e) {
          if (e.kind === "분당" && tries < 4) { return sleep(8000).then(function () { return one(k, tries + 1); }); }
          if (e.kind === "한도" || e.kind === "분당" || e.kind === "한도장치미설정" || e.kind === "한도장치오류") { abort = e.message; }
          else { chunk.forEach(function (a, j) { results[start + j] = null; }); }
        });
      }
      function loop(k) {
        if (abort || k * BATCH >= n) { return Promise.resolve(); }
        var started = Date.now();
        return one(k, 0).then(function () {
          done = Math.min(n, (k + 1) * BATCH); prog.textContent = "AI 채점 중... " + done + " / " + n;
          return sleep(Math.max(GAP - (Date.now() - started), 0));
        }).then(function () { return loop(k + 1); });
      }
      return loop(0).then(function () {
        btn.disabled = false; $("btn-score").disabled = false;
        if (abort) {
          prog.textContent = "중간에 멈췄어요: " + abort + " (채점이 끝나지 않아 결과는 보여 주지 않아요)";
          return;
        }
        prog.hidden = true;
        var rulePart = lastRule ? Promise.resolve(lastRule) : runRuleGrade().then(function (r) { return r && r.stats; });
        return rulePart.then(function (rule) {
          var ai = computeStats(answers, results, "AI");
          var used = results.filter(Boolean).length, models = {}, prompts = {};
          results.forEach(function (r) { if (r) { models[r["모델"]] = (models[r["모델"]] || 0) + 1; prompts[r["지시문"] || "?"] = true; } });
          var cond = "조건: 모델 " + Object.keys(models).map(function (m) { return m + " " + models[m] + "문장"; }).join(", ")
            + " · 지시문 " + Object.keys(prompts).join(",")
            + " · 기준 criteria.json version " + criteria["version"]
            + " · 1회 채점 · 10개씩 묶어 AI " + Math.ceil(n / BATCH) + "회 호출" + (ai.failed ? " · 호출 실패 " + ai.failed + "개(틀린 것으로 셈)" : "");
          lastAI = { cond: cond, rule: rule, ai: ai, date: new Date().toISOString() };
          renderCompare(rule, ai, cond);
        });
      });
    }).catch(function (e) {
      $("btn-ai").disabled = false; $("btn-score").disabled = false;
      setStatus(e.message);
    });
  }

  function downloadAI() {
    if (!lastAI) { return; }
    var blob = new Blob([JSON.stringify({
      날짜: lastAI.date, 조건: lastAI.cond,
      규칙: { 칸: lastAI.rule.okCat, 긴급도: lastAI.rule.okUrg, 둘다: lastAI.rule.okBoth, 가장나쁜실수: [lastAI.rule.worstBad, lastAI.rule.worstTotal] },
      AI: { 칸: lastAI.ai.okCat, 긴급도: lastAI.ai.okUrg, 둘다: lastAI.ai.okBoth, 가장나쁜실수: [lastAI.ai.worstBad, lastAI.ai.worstTotal], 사람확인표시: lastAI.ai.low },
      AI가틀린문장: lastAI.ai.wrong
    }, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ai_채점_결과.json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  $("btn-classify").addEventListener("click", function () { showTab("classify"); });
  $("btn-dash").addEventListener("click", function () { showTab("dash"); });
  $("btn-owner").addEventListener("click", function () { showTab("owner"); });
  $("btn-settle").addEventListener("click", function () { showTab("settle"); });
  $("run").addEventListener("click", runClassify);
  input.addEventListener("input", autoGrow);
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); runClassify(); }
  });
  getJSON("examples.json").then(function (list) { samples = list; renderTry(); }).catch(function () {});
  $("btn-score").addEventListener("click", runRuleGrade);
  $("btn-ai").addEventListener("click", runAIGrade);
  $("btn-download").addEventListener("click", downloadAI);

  var loaded = Promise.all([getJSON("criteria.json"), getJSON("keywords.json")]).then(function (r) {
    criteria = r[0]; keywords = r[1];
  }).catch(function (e) {
    setStatus(e.message + " — 파일로 직접 열지 말고 로컬 서버(localhost:8000)로 열어 주세요.");
  });
  // 대시보드(dashboard.js)가 쓴다
  window.App = {
    loaded: loaded,
    rules: function (raw) { return classifyRaw(raw); },
    cats: function () { return criteria ? criteria["칸"].slice().sort(function (a, b) { return a["순서"] - b["순서"]; }).map(function (c) { return c["이름"]; }) : []; },
    criteria: function () { return criteria; },
    setStatus: setStatus
  };
})();
