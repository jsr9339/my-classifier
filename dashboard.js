// 대시보드 탭: 의견 여러 줄을 묶어서 분류하고 연 · 월별로 보여 준다.
// 결과는 이 브라우저 화면에만 있고 서버에 저장하지 않는다. (담당자 이름만 이 브라우저에 기억한다)
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var STEPS = ["접수", "담당자 배정", "처리 중", "처리 완료"];
  var URGS = ["높음", "보통", "낮음"];
  var MAX_ROWS = 200, BATCH = 10, GAP = 5200; // 무료 구간 분당 15회를 넘지 않게 5.2초에 한 번
  var ROWS = [], SEL = { y: 0, m: 0, filter: "전체", all: false }, NAMES = {}, busy = false;

  try { NAMES = JSON.parse(localStorage.getItem("dash-names") || "{}"); } catch (e) { NAMES = {}; }
  function saveNames() { try { localStorage.setItem("dash-names", JSON.stringify(NAMES)); } catch (e) { /* 저장이 막혀도 동작은 한다 */ } }

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) { e.className = cls; } if (text != null) { e.textContent = text; } return e; }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function cats() { return window.App.cats(); }

  // ---------- 입력 읽기 ----------
  function splitLine(line) {
    var out = [], cur = "", q = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (q) {
        if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else { q = false; } } else { cur += ch; }
      } else if (ch === '"') { q = true; }
      else if (ch === "," || ch === "\t") { out.push(cur); cur = ""; }
      else { cur += ch; }
    }
    out.push(cur);
    return out;
  }
  var DATE_RE = /^\s*(\d{4})\s*[-./년]\s*(\d{1,2})(?:\s*[-./월]\s*(\d{1,2})\s*일?)?\s*$/;
  function parseDate(s) {
    var m = DATE_RE.exec(String(s || ""));
    if (!m) { return null; }
    var y = +m[1], mo = +m[2];
    if (mo < 1 || mo > 12) { return null; }
    return { y: y, m: mo, s: y + "-" + pad(mo) + (m[3] ? "-" + pad(+m[3]) : "") };
  }
  function makeRow(raw, dateStr, cat, urg, reason, chk, step) {
    var dt = parseDate(dateStr), now = new Date();
    var r = { text: Mask.maskText(raw), y: dt ? dt.y : now.getFullYear(), m: dt ? dt.m : now.getMonth() + 1, date: dt ? dt.s : "", step: 0, reason: "" };
    cat = (cat || "").trim(); urg = (urg || "").trim();
    if (cats().indexOf(cat) !== -1 && URGS.indexOf(urg) !== -1) {
      r.cat = cat; r.urg = urg; r.reason = (reason || "").trim();
      r.chk = /^(예|y|yes|true|1|o)$/i.test((chk || "").trim()); r.src = "파일";
    }
    var st = (step || "").trim(), si = STEPS.indexOf(st);
    if (si === -1 && /^[0-3]$/.test(st)) { si = +st; }
    if (si !== -1) { r.step = si; }
    return r;
  }
  function parseText(text) {
    var lines = text.replace(/^﻿/, "").split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    if (!lines.length) { return []; }
    var head = splitLine(lines[0]).map(function (h) { return h.trim(); }), col = {};
    head.forEach(function (h, i) { col[h] = i; });
    var rows = [];
    if (col["의견"] !== undefined || col["text"] !== undefined) {
      var ti = col["의견"] !== undefined ? col["의견"] : col["text"];
      var di = col["날짜"] !== undefined ? col["날짜"] : col["date"];
      lines.slice(1).forEach(function (l) {
        var c = splitLine(l), raw = (c[ti] || "").trim();
        if (!raw) { return; }
        rows.push(makeRow(raw, di !== undefined ? c[di] : "", c[col["칸"]], c[col["긴급도"]], c[col["이유"]], c[col["사람확인"]], c[col["단계"]]));
      });
    } else {
      lines.forEach(function (l) {
        var m = /^\s*(\d{4}\s*[-./년]\s*\d{1,2}(?:\s*[-./월]\s*\d{1,2}\s*일?)?)\s*[,\t]\s*(.+)$/.exec(l);
        rows.push(m ? makeRow(m[2].trim(), m[1]) : makeRow(l));
      });
    }
    return rows;
  }

  // ---------- 분류 (10개씩 묶어서) ----------
  function classifyRows(rows, onProgress) {
    var todo = rows.filter(function (r) { return !r.cat; }), done = 0, aborted = "", batches = [];
    for (var i = 0; i < todo.length; i += BATCH) { batches.push(todo.slice(i, i + BATCH)); }
    function callBatch(b, tries) {
      return fetch("api/classify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts: b.map(function (r) { return r.text; }) })
      }).then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) { var e = new Error(data["오류"] || "AI를 쓸 수 없어요"); e.kind = data["종류"] || ""; throw e; }
          return data;
        });
      }).catch(function (e) {
        if (e.kind === "분당" && tries < 4) { return sleep(8000).then(function () { return callBatch(b, tries + 1); }); }
        throw e;
      });
    }
    function byRules(r) {
      var res = window.App.rules(r.text).res;
      r.cat = res["칸"]; r.urg = res["긴급도"]; r.reason = res["이유"]; r.chk = true; r.src = "규칙"; // 규칙 결과는 사람이 확인하게 표시
    }
    function loop(k) {
      if (k >= batches.length) { return Promise.resolve(); }
      var b = batches[k], t0 = Date.now();
      if (aborted) { b.forEach(byRules); done += b.length; onProgress(done, todo.length); return loop(k + 1); }
      return callBatch(b, 0).then(function (data) {
        var out = data["결과"] || [];
        b.forEach(function (r, j) {
          var x = out[j];
          if (x) { r.cat = x["칸"]; r.urg = x["긴급도"]; r.reason = x["이유"]; r.chk = !!x["확인필요"]; r.src = "AI"; } else { byRules(r); }
        });
      }).catch(function (e) {
        aborted = (e && e.message) || "AI를 쓸 수 없어요"; b.forEach(byRules);
      }).then(function () {
        done += b.length; onProgress(done, todo.length);
        return k + 1 < batches.length ? sleep(Math.max(GAP - (Date.now() - t0), 0)) : null;
      }).then(function () { return loop(k + 1); });
    }
    return loop(0).then(function () {
      return { aborted: aborted, total: todo.length,
        ai: todo.filter(function (r) { return r.src === "AI"; }).length,
        rules: todo.filter(function (r) { return r.src === "규칙"; }).length };
    });
  }

  function showError(msg) { var n = $("d-note"); n.textContent = msg; n.hidden = !msg; }
  function setBusy(on) { busy = on; ["d-run", "d-demo", "d-file"].forEach(function (id) { $(id).disabled = on; }); $("d-text").disabled = on; }

  function start(rows) {
    if (busy) { return; }
    showError("");
    if (!rows.length) { showError("읽을 수 있는 의견이 없어요."); return; }
    var cut = Math.max(0, rows.length - MAX_ROWS);
    rows = rows.slice(0, MAX_ROWS);
    var prog = $("d-prog");
    setBusy(true);
    window.App.loaded.then(function () {
      var need = rows.filter(function (r) { return !r.cat; }).length;
      prog.hidden = need === 0;
      prog.textContent = "AI 분류 중... 0 / " + need;
      return classifyRows(rows, function (d, t) { prog.textContent = "AI 분류 중... " + d + " / " + t; });
    }).then(function (info) {
      prog.hidden = true; setBusy(false);
      ROWS = rows;
      var msgs = [];
      if (cut) { msgs.push("의견이 많아서 앞의 " + MAX_ROWS + "줄만 분류했어요 (" + cut + "줄 제외)."); }
      if (info.aborted) { msgs.push("AI를 쓸 수 없어(" + info.aborted + ") " + info.rules + "건은 규칙으로 분류했어요. 규칙 결과는 «사람 확인»으로 표시했어요."); }
      else if (info.total) { msgs.push("AI가 " + info.ai + "건을 분류했어요. 결과는 추정이에요."); }
      else { msgs.push("분류 결과가 들어 있는 파일이라 AI를 부르지 않았어요."); }
      openDashboard(msgs.join(" "));
    }).catch(function (e) { prog.hidden = true; setBusy(false); showError((e && e.message) || "분류하지 못했어요."); });
  }

  function openDashboard(info) {
    var last = ROWS.reduce(function (a, r) { return Math.max(a, r.y * 100 + r.m); }, 0);
    SEL.y = Math.floor(last / 100); SEL.m = last % 100; SEL.filter = "전체"; SEL.all = false;
    $("d-info").textContent = info || ""; $("d-info").hidden = !info;
    $("d-in").hidden = true; $("d-out").hidden = false;
    render();
  }

  // ---------- 화면 ----------
  function years() {
    var s = {}; ROWS.forEach(function (r) { s[r.y] = 1; });
    return Object.keys(s).map(Number).sort(function (a, b) { return b - a; });
  }
  function monthSet(y) { var s = {}; ROWS.forEach(function (r) { if (r.y === y) { s[r.m] = 1; } }); return s; }

  function viewOf() {
    var CN = cats(), rows = ROWS.filter(function (r) { return r.y === SEL.y && (!SEL.m || r.m === SEL.m); });
    var cc = CN.map(function (n) { return [n, 0, 0, 0]; }), by = {}, st = [0, 0, 0, 0], hi = 0, chk = 0;
    CN.forEach(function (n) { by[n] = [0, 0, 0, 0]; });
    rows.forEach(function (r) {
      cc[CN.indexOf(r.cat)][URGS.indexOf(r.urg) + 1]++; by[r.cat][r.step]++; st[r.step]++;
      if (r.urg === "높음") { hi++; } if (r.chk) { chk++; }
    });
    var items = rows.map(function (r, i) { return { r: r, i: i }; }).sort(function (a, b) {
      var sa = (a.r.urg === "높음" ? 0 : 2) + (a.r.chk ? 0 : 1), sb = (b.r.urg === "높음" ? 0 : 2) + (b.r.chk ? 0 : 1);
      return sa - sb || a.i - b.i;
    }).map(function (o) { return o.r; });
    return { label: SEL.m ? SEL.y + "년 " + SEL.m + "월" : SEL.y + "년 전체", cats: cc, by: by, st: st, tot: rows.length, hi: hi, chk: chk, items: items };
  }

  function renderPeriod() {
    var ys = $("d-year"); ys.textContent = "";
    years().forEach(function (y) { var o = el("option", "", y + "년"); o.value = y; ys.appendChild(o); });
    ys.value = String(SEL.y);
    ys.onchange = function () {
      SEL.y = Number(ys.value);
      var ms = monthSet(SEL.y), list = Object.keys(ms).map(Number).sort(function (a, b) { return a - b; });
      if (SEL.m && !ms[SEL.m]) { SEL.m = list[list.length - 1]; }
      SEL.filter = "전체"; SEL.all = false; render();
    };
    var have = monthSet(SEL.y), box = $("d-months"); box.textContent = "";
    for (var m = 0; m <= 12; m++) {
      (function (m) {
        var b = el("button", "", m === 0 ? "연 전체" : m + "월"); b.type = "button";
        b.setAttribute("aria-pressed", String(SEL.m === m)); b.disabled = m !== 0 && !have[m];
        b.addEventListener("click", function () { SEL.m = m; SEL.filter = "전체"; SEL.all = false; render(); });
        box.appendChild(b);
      })(m);
    }
    $("d-trend-h").textContent = SEL.y + "년 월별 접수 건수";
    var tr = $("d-trend"); tr.textContent = "";
    var rows = [], max = 1;
    for (var mm = 1; mm <= 12; mm++) {
      var list = ROWS.filter(function (r) { return r.y === SEL.y && r.m === mm; });
      var t = list.length;
      var h = list.filter(function (r) { return r.urg === "높음"; }).length, mid = list.filter(function (r) { return r.urg === "보통"; }).length;
      rows.push([mm, t, h, mid, t - h - mid]); if (t > max) { max = t; }
    }
    rows.forEach(function (r) {
      var b = el("button", "tcol"); b.type = "button";
      b.setAttribute("aria-pressed", String(SEL.m === r[0])); b.disabled = !r[1];
      b.setAttribute("aria-label", r[1] ? SEL.y + "년 " + r[0] + "월 " + r[1] + "건, 높음 " + r[2] + " 보통 " + r[3] + " 낮음 " + r[4] : r[0] + "월 자료 없음");
      b.appendChild(el("span", "tnum", r[1] ? String(r[1]) : ""));
      var bar = el("span", "tbar"); bar.style.height = r[1] ? Math.max(6, r[1] / max * 80) + "px" : "3px";
      if (r[1]) {
        [["h", r[2]], ["m", r[3]], ["l", r[4]]].forEach(function (p) {
          if (!p[1]) { return; }
          var seg = el("i", p[0]); seg.style.height = (p[1] / r[1] * 100) + "%"; bar.appendChild(seg);
        });
      } else { bar.classList.add("none"); }
      b.appendChild(bar); b.appendChild(el("span", "tmo", r[0] + "월"));
      b.addEventListener("click", function () { SEL.m = r[0]; SEL.filter = "전체"; SEL.all = false; render(); });
      tr.appendChild(b);
    });
  }

  function renderTiles(v) {
    $("d-sum-sub").textContent = v.label + " · 단계를 눌러 바꿔 볼 수 있어요";
    var box = $("d-tiles"); box.textContent = "";
    [["전체 의견", v.tot, "", ""], ["긴급 높음", v.hi, "hot", ""], ["사람 확인", v.chk, "", ""], ["처리 완료", v.st[3], "", " / " + v.tot]].forEach(function (r) {
      var t = el("div", "tile " + r[2]), b = el("b", "", String(r[1]));
      if (r[3]) { b.appendChild(el("small", "", r[3])); }
      t.appendChild(b); t.appendChild(el("span", "", r[0])); box.appendChild(t);
    });
    var st = $("d-stat"); st.textContent = "";
    var c = v.st, bar = el("div", "bar"); bar.setAttribute("role", "img");
    bar.setAttribute("aria-label", "처리 현황 처리 완료 " + c[3] + " 처리 중 " + c[2] + " 담당자 배정 " + c[1] + " 접수 " + c[0]);
    [["d", c[3]], ["p", c[2]], ["a", c[1]], ["u", c[0]]].forEach(function (p) { var i = el("i", p[0]); i.style.width = (v.tot ? p[1] / v.tot * 100 : 0) + "%"; bar.appendChild(i); });
    st.appendChild(bar);
    var lg = el("div", "lg");
    [["처리 완료", c[3], "d"], ["처리 중", c[2], "p"], ["담당자 배정", c[1], "a"], ["접수", c[0], "u"]].forEach(function (p) {
      var s = el("span"), i = el("i", p[2]); s.appendChild(i); s.appendChild(document.createTextNode(p[0] + " " + p[1])); lg.appendChild(s);
    });
    st.appendChild(lg);
  }

  function matches(r) {
    var f = SEL.filter;
    if (f === "전체") { return true; }
    if (f === "긴급 높음") { return r.urg === "높음"; }
    if (f === "사람 확인") { return r.chk; }
    return STEPS[r.step] === f;
  }
  function renderFilters(v) {
    var box = $("d-filters"); box.textContent = "";
    var it = v.items, cnt = {
      "전체": it.length,
      "긴급 높음": it.filter(function (r) { return r.urg === "높음"; }).length,
      "사람 확인": it.filter(function (r) { return r.chk; }).length
    };
    STEPS.forEach(function (n, k) { cnt[n] = it.filter(function (r) { return r.step === k; }).length; });
    [["보기", ["전체", "긴급 높음", "사람 확인"]], ["처리 단계", STEPS]].forEach(function (g) {
      var row = el("div", "frow"), chips = el("div", "fchips" + (g[0] === "처리 단계" ? " one" : ""));
      row.appendChild(el("span", "flab", g[0]));
      g[1].forEach(function (k) {
        var b = el("button", "", k + " " + cnt[k]); b.type = "button";
        b.setAttribute("aria-pressed", String(SEL.filter === k));
        b.addEventListener("click", function () { SEL.filter = k; SEL.all = false; render(); });
        chips.appendChild(b);
      });
      row.appendChild(chips); box.appendChild(row);
    });
  }
  function stepper(r) {
    var s = el("div", "step"); s.setAttribute("role", "group"); s.setAttribute("aria-label", "처리 단계");
    s.style.setProperty("--p", String(r.step / (STEPS.length - 1)));
    STEPS.forEach(function (name, k) {
      var b = el("button", (r.step >= k ? "on" : "") + (r.step === k ? " cur" : "")); b.type = "button";
      if (r.step === k) { b.setAttribute("aria-current", "step"); }
      b.setAttribute("aria-label", "단계를 " + name + "(으)로 바꾸기");
      b.appendChild(el("span", "dot")); b.appendChild(el("span", "lab", name));
      if (k === 1 && r.step >= 1 && NAMES[r.cat]) { b.appendChild(el("span", "sub", NAMES[r.cat])); }
      b.addEventListener("click", function () { r.step = k; render(); });
      s.appendChild(b);
    });
    return s;
  }
  function renderItems(v) {
    var ul = $("d-items"), more = $("d-more"); ul.textContent = ""; more.hidden = true;
    var rows = v.items.filter(matches);
    if (!rows.length) { ul.appendChild(el("li", "empty", "이 조건에 맞는 문장이 없어요.")); return; }
    var LIMIT = 10, shown = SEL.all ? rows : rows.slice(0, LIMIT);
    shown.forEach(function (r) {
      var li = el("li", r.step === 3 ? "done" : ""), t = el("div", "t");
      t.appendChild(el("span", "chip", r.cat));
      t.appendChild(el("span", "chip" + (r.urg === "높음" ? " hi" : ""), r.urg));
      if (r.chk) { t.appendChild(el("span", "chip chk", "사람 확인")); }
      if (r.src === "규칙") { t.appendChild(el("span", "chip src", "규칙으로 분류")); }
      li.appendChild(t); li.appendChild(el("p", "", r.text));
      if (r.reason) { li.appendChild(el("p", "why", r.reason)); }
      li.appendChild(stepper(r)); ul.appendChild(li);
    });
    if (rows.length > LIMIT) {
      more.hidden = false;
      more.textContent = SEL.all ? "접기" : "나머지 " + (rows.length - LIMIT) + "건 더 보기";
    }
  }
  function renderBars(v) {
    var box = $("d-bars"); box.textContent = "";
    var rows = v.cats.map(function (c) { return { n: c[0], h: c[1], m: c[2], l: c[3], t: c[1] + c[2] + c[3] }; })
      .sort(function (a, b) { return b.t - a.t; });
    var max = Math.max(1, rows[0].t);
    rows.forEach(function (r) {
      var row = el("div", "brow"); row.appendChild(el("span", "nm", r.n));
      var track = el("div", "track"), seg = el("div", "seg"); seg.style.width = (r.t / max * 100) + "%";
      [["h", r.h], ["m", r.m], ["l", r.l]].forEach(function (p) {
        if (!p[1]) { return; } var i = el("i", p[0], String(p[1])); i.style.flex = p[1] + " 1 0"; seg.appendChild(i);
      });
      track.appendChild(seg); row.appendChild(track); row.appendChild(el("span", "tot", String(r.t))); box.appendChild(row);
    });
  }
  function renderAssign(v) {
    var box = $("d-assign"); box.textContent = "";
    v.cats.forEach(function (c) {
      var total = c[1] + c[2] + c[3], b4 = v.by[c[0]], asg = b4[1], doing = b4[2], done = b4[3];
      var row = el("div", "arow");
      row.appendChild(el("span", "nm", c[0]));
      var who = el("span", "who"), inp = el("input", "who-in");
      inp.type = "text"; inp.placeholder = "담당자 이름"; inp.maxLength = 20; inp.value = NAMES[c[0]] || "";
      inp.setAttribute("aria-label", c[0] + " 담당자 이름");
      inp.addEventListener("input", function () { NAMES[c[0]] = inp.value.trim(); saveNames(); });
      who.appendChild(inp); who.appendChild(document.createTextNode(" " + total + "건" + (c[1] ? " (높음 " + c[1] + ")" : "")));
      row.appendChild(who);
      var b = el("button", "", "복사"); b.type = "button";
      b.disabled = !total;
      b.addEventListener("click", function () {
        var name = NAMES[c[0]];
        var text = (name ? name + " 님, " : "담당자님, ") + v.label + " 설문에서 [" + c[0] + "] 의견 " + total + "건이 접수됐어요. 처리 완료 " + done + "건, 처리 중 " + doing + "건, 담당자 배정 " + asg + "건이에요." + (c[1] ? " 긴급 높음 " + c[1] + "건을 먼저 확인해 주세요." : "");
        var fin = function (ok) { b.textContent = ok ? "복사됨" : "복사 안 됨"; setTimeout(function () { b.textContent = "복사"; }, 1400); };
        try { navigator.clipboard.writeText(text).then(function () { fin(true); }, function () { fin(false); }); } catch (e) { fin(false); }
      });
      row.appendChild(b);
      var prg = el("div", "prg"), bar = el("div", "b");
      [["d", done], ["p", doing], ["a", asg]].forEach(function (p) { var i = el("i", p[0]); i.style.width = (total ? p[1] / total * 100 : 0) + "%"; bar.appendChild(i); });
      prg.appendChild(el("span", "", "진행")); prg.appendChild(bar); prg.appendChild(el("span", "", "완료 " + done + " / " + total));
      row.appendChild(prg); box.appendChild(row);
    });
  }
  function render() {
    var v = viewOf();
    renderPeriod(); renderTiles(v); renderFilters(v); renderItems(v); renderBars(v); renderAssign(v);
  }

  // ---------- 내려받기 · 처음으로 · 예시 ----------
  function csvCell(v) {
    v = String(v == null ? "" : v).replace(/[\r\n]+/g, " ");
    return /[",\t]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function download() {
    var lines = [["날짜", "의견", "칸", "긴급도", "이유", "사람확인", "단계"].join(",")].concat(ROWS.map(function (r) {
      return [r.date || (r.y + "-" + pad(r.m)), r.text, r.cat, r.urg, r.reason || "", r.chk ? "예" : "", STEPS[r.step]].map(csvCell).join(",");
    }));
    var blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "의견함_분류결과.csv";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function reset() {
    ROWS = []; $("d-out").hidden = true; $("d-in").hidden = false; $("d-text").value = ""; showError("");
  }
  function readFile(file) {
    return file.arrayBuffer().then(function (buf) {
      try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
      catch (e) { return new TextDecoder("euc-kr").decode(buf); } // 엑셀이 저장한 한글 CSV
    });
  }
  function demo() {
    if (busy) { return; }
    showError("");
    window.App.loaded.then(function () {
      return fetch("sample.json", { cache: "no-store" });
    }).then(function (r) {
      if (!r.ok) { throw new Error("예시 데이터를 열 수 없어요."); }
      return r.json();
    }).then(function (d) {
      ROWS = d.rows.map(function (x) {
        var dt = parseDate(x.d);
        return { text: Mask.maskText(x.t), y: dt.y, m: dt.m, date: dt.s, cat: x.c, urg: x.u, reason: "", chk: !!x.k, step: x.s, src: "예시" };
      });
      openDashboard("예시 데이터예요. 지어낸 문장 60개이고, 날짜와 처리 단계도 임의의 값이에요.");
    }).catch(function (e) { showError(e.message); });
  }

  $("d-run").addEventListener("click", function () {
    var t = $("d-text").value;
    if (!t.trim()) { showError("의견을 붙여넣거나 파일을 올려 주세요."); return; }
    window.App.loaded.then(function () { start(parseText(t)); });
  });
  $("d-file").addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) { return; }
    if (f.size > 1024 * 1024) { showError("파일이 너무 커요 (1MB 이하)."); return; }
    window.App.loaded.then(function () { return readFile(f); }).then(function (text) { start(parseText(text)); })
      .catch(function () { showError("파일을 읽지 못했어요."); });
  });
  $("d-demo").addEventListener("click", demo);
  $("d-down").addEventListener("click", download);
  $("d-reset").addEventListener("click", reset);
  $("d-more").addEventListener("click", function () { SEL.all = !SEL.all; render(); });
})();
