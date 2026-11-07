// 대시보드 탭: 의견 여러 줄을 묶어서 분류하고 연 · 월별로 보여 준다.
// 채점 탭의 «내 데이터로 채점»도 같은 분류 코드를 쓴다.
// 결과는 이 브라우저 화면에만 있고 서버에 저장하지 않는다. (담당자 이름 · 기한 일수만 이 브라우저에 기억한다)
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var STEPS = ["접수", "담당자 배정", "처리 중", "처리 완료"];
  var URGS = ["높음", "보통", "낮음"];
  var MAX_ROWS = 200, BATCH = 10, GAP = 5200; // 무료 구간 분당 15회를 넘지 않게 5.2초에 한 번
  var DAY = 86400000;
  // 사람이 먼저 봐야 할 만한 말. 낱말이 있다는 것만 알려 주고, 분류를 바꾸지는 않는다.
  var SENS = ["괴롭힘", "폭언", "폭행", "성희롱", "성추행", "성폭력", "따돌", "모욕", "협박", "갑질", "차별", "자해", "극단적",
    "우울", "공황", "병가", "산재", "임신", "출산", "수술", "죽고", "죽을", "신고", "고발", "부당해고", "해고", "퇴사 강요", "불이익"];
  var STOP = ["그리고", "그래서", "하지만", "너무", "계속", "정말", "우리", "이번", "지금", "있는", "하는", "같은", "때문", "관련", "대해", "대한",
    "아직", "매우", "항상", "자꾸", "조금", "많이", "다시", "이미", "그냥", "어떻게", "어디", "언제", "있습니다", "없습니다", "합니다", "입니다",
    "있어요", "없어요", "해요", "했어요", "됩니다", "돼요", "같아요", "싶어요", "주세요", "않아요", "않았어요", "것이", "수가", "때가"];
  var ENDINGS = /(?:겠습니다|겠어요|습니다|었어요|았어요|했어요|이에요|예요|입니다|합니다|해요|돼요|되요|해서|하고|하면|인데|이라|으로|에서|에게|부터|까지|처럼|은|는|이|가|을|를|에|의|도|로|와|과|만)$/;

  var ROWS = [], SEL = { y: 0, m: 0, filter: "전체", all: false, term: "" }, NAMES = {}, OVERDUE = 3, busy = false, PENDING = null;
  try { NAMES = JSON.parse(localStorage.getItem("dash-names") || "{}"); } catch (e) { NAMES = {}; }
  try { OVERDUE = Number(localStorage.getItem("dash-overdue")) || 3; } catch (e) { OVERDUE = 3; }
  function saveNames() { try { localStorage.setItem("dash-names", JSON.stringify(NAMES)); } catch (e) { /* 저장이 막혀도 동작은 한다 */ } }
  function saveOverdue() { try { localStorage.setItem("dash-overdue", String(OVERDUE)); } catch (e) { /* 같음 */ } }

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) { e.className = cls; } if (text != null) { e.textContent = text; } return e; }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function cats() { return window.App.cats(); }
  function todayDate() { var n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
  function dstr(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function toDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || "") ? new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) : null; }

  // ---------- 입력 읽기 ----------
  function parseCSV(text) {
    text = text.replace(/^﻿/, "");
    var first = text.split(/\r?\n/, 1)[0];
    var delim = first.split("\t").length > first.split(",").length ? "\t" : (first.split(";").length > first.split(",").length ? ";" : ",");
    var rows = [], row = [], cur = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else { q = false; } } else { cur += ch; }
      } else if (ch === '"') { q = true; }
      else if (ch === delim) { row.push(cur); cur = ""; }
      else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
      else if (ch !== "\r") { cur += ch; }
    }
    if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return c.trim() !== ""; }); });
  }
  var DATE_RE = /^\s*(\d{4})\s*[-./년]\s*(\d{1,2})(?:\s*[-./월]\s*(\d{1,2}))?/;
  function parseDate(s) {
    var m = DATE_RE.exec(String(s || ""));
    if (!m) { return null; }
    var y = +m[1], mo = +m[2], d = m[3] ? +m[3] : 0;
    if (mo < 1 || mo > 12 || d > 31) { return null; }
    return { y: y, m: mo, d: d, s: y + "-" + pad(mo) + (d ? "-" + pad(d) : "") };
  }
  function isSens(t) { return SENS.some(function (w) { return t.indexOf(w) !== -1; }); }
  function validDate(s) { var d = parseDate(s); return d && d.d ? d.s : ""; }

  // x: 선택 항목(칸 · 긴급도 · 이유 · 사람확인 · 단계 · 배정일 · 처리시작일 · 완료일 · AI칸 · AI긴급도)
  function makeRow(raw, dateStr, x) {
    x = x || {};
    var dt = parseDate(dateStr), now = new Date();
    var r = { text: Mask.maskText(raw), y: dt ? dt.y : now.getFullYear(), m: dt ? dt.m : now.getMonth() + 1, date: dt ? dt.s : "",
      step: 0, reason: "", stamps: ["", "", "", ""], sens: false, edited: false, alt: null, editing: false };
    r.sens = isSens(r.text);
    var cat = (x.cat || "").trim(), urg = (x.urg || "").trim();
    if (cats().indexOf(cat) !== -1 && URGS.indexOf(urg) !== -1) {
      r.cat = cat; r.urg = urg; r.reason = (x.reason || "").trim();
      r.chk = /^(예|y|yes|true|1|o)$/i.test((x.chk || "").trim()); r.src = "파일";
      var ac = (x.aiCat || "").trim(), au = (x.aiUrg || "").trim();
      if (ac && au && (ac !== cat || au !== urg) && cats().indexOf(ac) !== -1 && URGS.indexOf(au) !== -1) { r.edited = true; r.aiCat = ac; r.aiUrg = au; }
    }
    var st = (x.step || "").trim(), si = STEPS.indexOf(st);
    if (si === -1 && /^[0-3]$/.test(st)) { si = +st; }
    if (si !== -1) { r.step = si; }
    r.stamps[1] = validDate(x.asg); r.stamps[2] = validDate(x.doing); r.stamps[3] = validDate(x.done);
    return r;
  }
  // 붙여넣은 글: 한 줄에 하나. 앞에 «날짜,» 가 있으면 날짜로 읽는다. (의견 안의 쉼표는 나누지 않는다)
  function parsePasted(text) {
    var lines = text.replace(/^﻿/, "").split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    return lines.map(function (l) {
      var m = /^\s*(\d{4}\s*[-./년]\s*\d{1,2}(?:\s*[-./월]\s*\d{1,2}\s*일?)?)\s*[,\t]\s*(.+)$/.exec(l);
      return m ? makeRow(m[2].trim(), m[1]) : makeRow(l);
    });
  }
  function colIndex(head, names) {
    for (var i = 0; i < head.length; i++) { if (names.indexOf(head[i].trim()) !== -1) { return i; } }
    return -1;
  }
  // 우리가 내려받은 형식(의견 열이 있음)이면 바로 읽는다
  function rowsFromTable(table) {
    var head = table[0], ti = colIndex(head, ["의견", "text"]);
    if (ti === -1) { return null; }
    var di = colIndex(head, ["날짜", "접수일", "date"]);
    var ix = { cat: colIndex(head, ["칸"]), urg: colIndex(head, ["긴급도"]), reason: colIndex(head, ["이유"]), chk: colIndex(head, ["사람확인"]),
      step: colIndex(head, ["단계"]), asg: colIndex(head, ["배정일"]), doing: colIndex(head, ["처리시작일"]), done: colIndex(head, ["완료일"]),
      aiCat: colIndex(head, ["AI칸"]), aiUrg: colIndex(head, ["AI긴급도"]) };
    var out = [];
    table.slice(1).forEach(function (c) {
      var raw = (c[ti] || "").trim();
      if (!raw) { return; }
      var x = {};
      Object.keys(ix).forEach(function (k) { x[k] = ix[k] === -1 ? "" : c[ix[k]]; });
      out.push(makeRow(raw, di === -1 ? "" : c[di], x));
    });
    return out;
  }
  function guess(head, words) {
    for (var i = 0; i < head.length; i++) { var h = head[i].toLowerCase(); if (words.some(function (w) { return h.indexOf(w) !== -1; })) { return i; } }
    return -1;
  }

  // ---------- 분류 (10개씩 묶어서) ----------
  function callBatch(texts, check, tries) {
    var body = { texts: texts };
    if (check) { body["확인"] = true; }
    return fetch("api/classify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) { var e = new Error(data["오류"] || "AI를 쓸 수 없어요"); e.kind = data["종류"] || ""; throw e; }
          return data;
        });
      }).catch(function (e) {
        if (e.kind === "분당" && tries < 4) { return sleep(8000).then(function () { return callBatch(texts, check, tries + 1); }); }
        throw e;
      });
  }
  function classifyRows(rows, onProgress, twice) {
    var todo = rows.filter(function (r) { return !r.cat; }), done = 0, aborted = "", batches = [], calls = twice ? 2 : 1;
    for (var i = 0; i < todo.length; i += BATCH) { batches.push(todo.slice(i, i + BATCH)); }
    function byRules(r) {
      var res = window.App.rules(r.text).res;
      r.cat = res["칸"]; r.urg = res["긴급도"]; r.reason = res["이유"]; r.chk = true; r.src = "규칙"; // 규칙 결과는 사람이 확인하게 표시
    }
    var lastReq = 0; // 요청 사이를 GAP만큼 띄운다
    function one(b, check) {
      return sleep(Math.max(0, GAP - (Date.now() - lastReq))).then(function () {
        lastReq = Date.now();
        return callBatch(b.map(function (r) { return r.text; }), check, 0);
      });
    }
    function loop(k) {
      if (k >= batches.length) { return Promise.resolve(); }
      var b = batches[k], second = null;
      if (aborted) { b.forEach(byRules); done += b.length; onProgress(done, todo.length); return loop(k + 1); }
      return one(b, false).then(function (data) {
        var out = data["결과"] || [];
        b.forEach(function (r, j) {
          var x = out[j];
          if (x) { r.cat = x["칸"]; r.urg = x["긴급도"]; r.reason = x["이유"]; r.chk = !!x["확인필요"]; r.src = "AI"; } else { byRules(r); }
        });
        if (!twice) { return null; }
        return one(b, true).then(function (d2) {
          second = d2["결과"] || [];
        }).catch(function () { second = null; }); // 두 번째가 실패해도 첫 결과는 쓴다
      }).then(function () {
        if (second) {
          b.forEach(function (r, j) {
            var y = second[j];
            if (y && r.src === "AI" && (y["칸"] !== r.cat || y["긴급도"] !== r.urg)) { r.chk = true; r.alt = { cat: y["칸"], urg: y["긴급도"] }; }
          });
        }
      }).catch(function (e) {
        aborted = (e && e.message) || "AI를 쓸 수 없어요"; b.forEach(byRules);
      }).then(function () {
        done += b.length; onProgress(done, todo.length);
      }).then(function () { return loop(k + 1); });
    }
    return loop(0).then(function () {
      return { aborted: aborted, total: todo.length, calls: calls,
        ai: todo.filter(function (r) { return r.src === "AI"; }).length,
        rules: todo.filter(function (r) { return r.src === "규칙"; }).length,
        differ: todo.filter(function (r) { return r.alt; }).length };
    });
  }

  function showError(msg) { var n = $("d-note"); n.textContent = msg; n.hidden = !msg; }
  function setBusy(on) { busy = on; ["d-run", "d-demo", "d-file", "d-text", "d-twice"].forEach(function (id) { $(id).disabled = on; }); }

  function start(rows) {
    if (busy) { return; }
    showError("");
    if (!rows.length) { showError("읽을 수 있는 의견이 없어요."); return; }
    var cut = Math.max(0, rows.length - MAX_ROWS);
    rows = rows.slice(0, MAX_ROWS);
    var prog = $("d-prog"), twice = $("d-twice").checked;
    setBusy(true);
    window.App.loaded.then(function () {
      var need = rows.filter(function (r) { return !r.cat; }).length;
      prog.hidden = need === 0;
      prog.textContent = "AI 분류 중... 0 / " + need;
      return classifyRows(rows, function (d, t) { prog.textContent = "AI 분류 중... " + d + " / " + t; }, twice);
    }).then(function (info) {
      prog.hidden = true; setBusy(false);
      ROWS = rows;
      var msgs = [];
      if (cut) { msgs.push("의견이 많아서 앞의 " + MAX_ROWS + "줄만 분류했어요 (" + cut + "줄 제외)."); }
      if (info.aborted) { msgs.push("AI를 쓸 수 없어(" + info.aborted + ") " + info.rules + "건은 규칙으로 분류했어요. 규칙 결과는 «사람 확인»으로 표시했어요."); }
      else if (info.total) {
        msgs.push("AI가 " + info.ai + "건을 분류했어요. 결과는 추정이에요." + (info.calls === 2 ? " 두 번 분류해서 결과가 다른 " + info.differ + "건은 «사람 확인»으로 표시했어요." : ""));
      } else { msgs.push("분류 결과가 들어 있는 파일이라 AI를 부르지 않았어요."); }
      openDashboard(msgs.join(" "));
    }).catch(function (e) { prog.hidden = true; setBusy(false); showError((e && e.message) || "분류하지 못했어요."); });
  }

  function openDashboard(info) {
    var last = ROWS.reduce(function (a, r) { return Math.max(a, r.y * 100 + r.m); }, 0);
    SEL.y = Math.floor(last / 100); SEL.m = last % 100; SEL.filter = "전체"; SEL.all = false; SEL.term = "";
    $("d-info").textContent = info || ""; $("d-info").hidden = !info;
    $("d-in").hidden = true; $("d-map").hidden = true; $("d-out").hidden = false;
    $("d-sumbox").hidden = true;
    render();
  }

  // ---------- 열 고르기 (파일 올리기) ----------
  function openMapping(table) {
    PENDING = table;
    var head = table[0].map(function (h, i) { return (h || "").trim() || "(" + (i + 1) + "번 열)"; });
    [["d-col-text", ["의견", "내용", "응답", "불편", "요청", "comment", "text"], false], ["d-col-date", ["날짜", "일시", "시간", "접수", "제출", "타임스탬프", "date", "time"], true]].forEach(function (c) {
      var s = $(c[0]); s.textContent = "";
      if (c[2]) { var o0 = el("option", "", "(없음 · 올린 달로 처리)"); o0.value = "-1"; s.appendChild(o0); }
      head.forEach(function (h, i) { var o = el("option", "", h); o.value = String(i); s.appendChild(o); });
      var g = guess(head, c[1]);
      if (g === -1 && !c[2]) {
        // 가장 긴 글이 든 열을 의견으로 본다
        var best = 0, bl = -1;
        head.forEach(function (h, i) { var len = table.slice(1, 11).reduce(function (a, r) { return a + (r[i] || "").length; }, 0); if (len > bl) { bl = len; best = i; } });
        g = best;
      }
      s.value = String(g === -1 ? (c[2] ? -1 : 0) : g);
    });
    $("d-hdr").checked = true;
    $("d-map-n").textContent = "(" + (table.length - 1) + "줄)";
    renderPreview();
    $("d-in").hidden = true; $("d-map").hidden = false;
  }
  function renderPreview() {
    var t = $("d-prev"); t.textContent = "";
    if (!PENDING) { return; }
    var ti = Number($("d-col-text").value), di = Number($("d-col-date").value), skip = $("d-hdr").checked ? 1 : 0;
    var thead = el("thead"), hr = el("tr");
    hr.appendChild(el("th", "", "날짜")); hr.appendChild(el("th", "", "의견")); thead.appendChild(hr); t.appendChild(thead);
    var tb = el("tbody");
    PENDING.slice(skip, skip + 3).forEach(function (c) {
      var tr = el("tr"), d = di >= 0 ? parseDate(c[di]) : null;
      tr.appendChild(el("td", "", d ? d.s : "(올린 달)"));
      tr.appendChild(el("td", "", (c[ti] || "").slice(0, 60)));
      tb.appendChild(tr);
    });
    t.appendChild(tb);
  }
  function mapGo() {
    if (!PENDING) { return; }
    var ti = Number($("d-col-text").value), di = Number($("d-col-date").value), skip = $("d-hdr").checked ? 1 : 0, rows = [];
    PENDING.slice(skip).forEach(function (c) {
      var raw = (c[ti] || "").trim();
      if (raw) { rows.push(makeRow(raw, di >= 0 ? c[di] : "")); }
    });
    PENDING = null;
    $("d-map").hidden = true; $("d-in").hidden = false;
    start(rows);
  }

  // ---------- 화면 ----------
  function years() {
    var s = {}; ROWS.forEach(function (r) { s[r.y] = 1; });
    return Object.keys(s).map(Number).sort(function (a, b) { return b - a; });
  }
  function monthSet(y) { var s = {}; ROWS.forEach(function (r) { if (r.y === y) { s[r.m] = 1; } }); return s; }
  function recvAge(r) { var d = toDate(r.date); return d ? Math.floor((todayDate() - d) / DAY) : null; }
  function isOverdue(r) { var a = recvAge(r); return r.urg === "높음" && r.step < 3 && a !== null && a >= OVERDUE; }
  function stepDays(r) {
    var a = toDate(r.date), b = toDate(r.stamps[3]);
    return a && b && r.step === 3 ? Math.max(0, Math.round((b - a) / DAY)) : null;
  }
  function inPeriod(r) { return r.y === SEL.y && (!SEL.m || r.m === SEL.m); }

  function topTerms(rows) {
    var df = {};
    rows.forEach(function (r) {
      var seen = {};
      r.text.replace(/\[[^\]]+\]/g, " ").split(/[^가-힣A-Za-z0-9]+/).forEach(function (w) {
        w = w.replace(ENDINGS, "");
        if (w.length < 2 || STOP.indexOf(w) !== -1 || /^[0-9]+$/.test(w)) { return; }
        seen[w] = 1;
      });
      Object.keys(seen).forEach(function (w) { df[w] = (df[w] || 0) + 1; });
    });
    return Object.keys(df).filter(function (w) { return df[w] >= 2; })
      .sort(function (a, b) { return df[b] - df[a] || (a < b ? -1 : 1); }).slice(0, 8).map(function (w) { return { t: w, n: df[w] }; });
  }

  function viewOf() {
    var CN = cats(), rows = ROWS.filter(inPeriod);
    var cc = CN.map(function (n) { return [n, 0, 0, 0]; }), by = {}, st = [0, 0, 0, 0], hi = 0, chk = 0, sens = 0, over = 0, sumD = 0, nD = 0;
    CN.forEach(function (n) { by[n] = [0, 0, 0, 0]; });
    rows.forEach(function (r) {
      cc[CN.indexOf(r.cat)][URGS.indexOf(r.urg) + 1]++; by[r.cat][r.step]++; st[r.step]++;
      if (r.urg === "높음") { hi++; } if (r.chk) { chk++; } if (r.sens) { sens++; } if (isOverdue(r)) { over++; }
      var d = stepDays(r); if (d !== null) { sumD += d; nD++; }
    });
    var items = rows.map(function (r, i) { return { r: r, i: i }; }).sort(function (a, b) {
      var sa = (isOverdue(a.r) ? 0 : 4) + (a.r.urg === "높음" ? 0 : 2) + (a.r.chk ? 0 : 1);
      var sb = (isOverdue(b.r) ? 0 : 4) + (b.r.urg === "높음" ? 0 : 2) + (b.r.chk ? 0 : 1);
      return sa - sb || a.i - b.i;
    }).map(function (o) { return o.r; });
    return { label: SEL.m ? SEL.y + "년 " + SEL.m + "월" : SEL.y + "년 전체", rows: rows, cats: cc, by: by, st: st, tot: rows.length, hi: hi, chk: chk,
      sens: sens, over: over, avgDays: nD ? sumD / nD : null, nDays: nD, items: items, terms: topTerms(rows) };
  }

  function renderPeriod() {
    var ys = $("d-year"); ys.textContent = "";
    years().forEach(function (y) { var o = el("option", "", y + "년"); o.value = y; ys.appendChild(o); });
    ys.value = String(SEL.y);
    ys.onchange = function () {
      SEL.y = Number(ys.value);
      var ms = monthSet(SEL.y), list = Object.keys(ms).map(Number).sort(function (a, b) { return a - b; });
      if (SEL.m && !ms[SEL.m]) { SEL.m = list[list.length - 1]; }
      SEL.filter = "전체"; SEL.all = false; SEL.term = ""; render();
    };
    var have = monthSet(SEL.y), box = $("d-months"); box.textContent = "";
    for (var m = 0; m <= 12; m++) {
      (function (m) {
        var b = el("button", "", m === 0 ? "연 전체" : m + "월"); b.type = "button";
        b.setAttribute("aria-pressed", String(SEL.m === m)); b.disabled = m !== 0 && !have[m];
        b.addEventListener("click", function () { SEL.m = m; SEL.filter = "전체"; SEL.all = false; SEL.term = ""; render(); });
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
      b.addEventListener("click", function () { SEL.m = r[0]; SEL.filter = "전체"; SEL.all = false; SEL.term = ""; render(); });
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

    var mt = $("d-metrics"); mt.textContent = "";
    var l1 = el("p", "m-line" + (v.over ? " bad" : ""));
    l1.appendChild(document.createTextNode("기한 넘김 " + v.over + "건 · 긴급 높음 중 접수 후 "));
    var sel = el("select"); sel.id = "d-overdue"; sel.setAttribute("aria-label", "기한 일수");
    [1, 2, 3, 5, 7, 14].forEach(function (n) { var o = el("option", "", n + "일"); o.value = n; sel.appendChild(o); });
    sel.value = String(OVERDUE);
    sel.addEventListener("change", function () { OVERDUE = Number(sel.value); saveOverdue(); render(); });
    l1.appendChild(sel); l1.appendChild(document.createTextNode(" 넘게 처리되지 않은 것 (접수일이 날짜까지 있는 문장만 셈)"));
    mt.appendChild(l1);
    mt.appendChild(el("p", "m-line", v.avgDays === null ? "처리 완료까지 걸린 시간: 접수일과 완료일이 있는 문장이 없어요" : "처리 완료까지 평균 " + (Math.round(v.avgDays * 10) / 10) + "일 (" + v.nDays + "건 기준)"));
  }

  function matches(r) {
    if (SEL.term && r.text.indexOf(SEL.term) === -1) { return false; }
    var f = SEL.filter;
    if (f === "전체") { return true; }
    if (f === "긴급 높음") { return r.urg === "높음"; }
    if (f === "사람 확인") { return r.chk; }
    if (f === "민감") { return r.sens; }
    if (f === "기한 넘김") { return isOverdue(r); }
    return STEPS[r.step] === f;
  }
  function renderTerms(v) {
    var box = $("d-terms"); box.textContent = "";
    if (!v.terms.length) { box.hidden = true; return; }
    box.hidden = false;
    box.appendChild(el("span", "flab", "자주 나온 말"));
    var chips = el("div", "fchips");
    v.terms.forEach(function (o) {
      var b = el("button", "", o.t + " " + o.n); b.type = "button";
      b.setAttribute("aria-pressed", String(SEL.term === o.t));
      b.addEventListener("click", function () { SEL.term = SEL.term === o.t ? "" : o.t; SEL.all = false; render(); });
      chips.appendChild(b);
    });
    box.appendChild(chips);
  }
  function renderFilters(v) {
    var box = $("d-filters"); box.textContent = "";
    var it = v.items.filter(function (r) { return !SEL.term || r.text.indexOf(SEL.term) !== -1; }), cnt = {
      "전체": it.length,
      "긴급 높음": it.filter(function (r) { return r.urg === "높음"; }).length,
      "사람 확인": it.filter(function (r) { return r.chk; }).length,
      "민감": it.filter(function (r) { return r.sens; }).length,
      "기한 넘김": it.filter(isOverdue).length
    };
    STEPS.forEach(function (n, k) { cnt[n] = it.filter(function (r) { return r.step === k; }).length; });
    [["보기", ["전체", "긴급 높음", "사람 확인", "민감", "기한 넘김"]], ["처리 단계", STEPS]].forEach(function (g) {
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
  function setStep(r, k) {
    var t = dstr(todayDate());
    for (var i = 1; i < 4; i++) { if (i <= k) { if (!r.stamps[i]) { r.stamps[i] = t; } } else { r.stamps[i] = ""; } }
    r.step = k;
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
      b.addEventListener("click", function () { setStep(r, k); render(); });
      s.appendChild(b);
    });
    return s;
  }
  function select(options, value, label) {
    var s = el("select"); s.setAttribute("aria-label", label);
    options.forEach(function (o) { var op = el("option", "", o); op.value = o; s.appendChild(op); });
    s.value = value; return s;
  }
  function editor(r) {
    var box = el("div", "edit");
    var sc = select(cats(), r.cat, "칸"), su = select(URGS, r.urg, "긴급도");
    function change() {
      if (!r.edited) { r.aiCat = r.cat; r.aiUrg = r.urg; }
      r.cat = sc.value; r.urg = su.value; r.edited = r.cat !== r.aiCat || r.urg !== r.aiUrg;
      r.chk = false; render();
    }
    sc.addEventListener("change", change); su.addEventListener("change", change);
    box.appendChild(el("span", "k", "칸")); box.appendChild(sc); box.appendChild(el("span", "k", "긴급도")); box.appendChild(su);
    if (r.chk) {
      var ok = el("button", "btn plain", "확인함"); ok.type = "button";
      ok.addEventListener("click", function () { r.chk = false; render(); });
      box.appendChild(ok);
    }
    var cl = el("button", "btn plain", "닫기"); cl.type = "button";
    cl.addEventListener("click", function () { r.editing = false; render(); });
    box.appendChild(cl);
    return box;
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
      if (r.sens) { t.appendChild(el("span", "chip sens", "민감")); }
      if (isOverdue(r)) { t.appendChild(el("span", "chip over", "접수 후 " + recvAge(r) + "일")); }
      if (r.edited) { t.appendChild(el("span", "chip src", "수정함")); }
      if (r.src === "규칙") { t.appendChild(el("span", "chip src", "규칙으로 분류")); }
      var ed = el("button", "edit-btn", r.editing ? "접기" : "고치기"); ed.type = "button";
      ed.addEventListener("click", function () { r.editing = !r.editing; render(); });
      t.appendChild(ed);
      li.appendChild(t); li.appendChild(el("p", "", r.text));
      if (r.reason) { li.appendChild(el("p", "why", r.reason)); }
      if (r.alt) { li.appendChild(el("p", "why alt", "두 번째 분류는 " + r.alt.cat + " / " + r.alt.urg + "였어요. 사람이 확인해 주세요.")); }
      if (r.edited) { li.appendChild(el("p", "why", "AI 분류: " + r.aiCat + " / " + r.aiUrg)); }
      if (r.editing) { li.appendChild(editor(r)); }
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
    renderPeriod(); renderTiles(v); renderTerms(v); renderFilters(v); renderItems(v); renderBars(v); renderAssign(v);
    $("d-down2").disabled = !ROWS.some(function (r) { return r.edited; });
  }

  // ---------- 월간 요약 문구 ----------
  function summaryText() {
    var v = viewOf(), prev, prevLabel;
    if (SEL.m) {
      var py = SEL.m === 1 ? SEL.y - 1 : SEL.y, pm = SEL.m === 1 ? 12 : SEL.m - 1;
      prev = ROWS.filter(function (r) { return r.y === py && r.m === pm; }).length; prevLabel = "전월";
    } else { prev = ROWS.filter(function (r) { return r.y === SEL.y - 1; }).length; prevLabel = "전년"; }
    var diff = prev ? " (" + prevLabel + " " + prev + "건, " + (v.tot - prev >= 0 ? "+" : "") + (v.tot - prev) + "건)" : " (" + prevLabel + " 자료 없음)";
    var topCats = v.cats.map(function (c) { return [c[0], c[1] + c[2] + c[3]]; }).filter(function (c) { return c[1]; })
      .sort(function (a, b) { return b[1] - a[1]; }).slice(0, 3).map(function (c) { return c[0] + " " + c[1] + "건"; });
    var lines = ["[" + v.label + " 설문 요약]",
      "- 접수 " + v.tot + "건" + diff,
      "- 긴급 높음 " + v.hi + "건, 사람 확인 " + v.chk + "건, 민감 표시 " + v.sens + "건",
      "- 처리 현황: 완료 " + v.st[3] + " · 처리 중 " + v.st[2] + " · 담당자 배정 " + v.st[1] + " · 접수 " + v.st[0],
      "- 긴급 높음 중 접수 후 " + OVERDUE + "일 넘게 처리되지 않은 것 " + v.over + "건"];
    if (v.avgDays !== null) { lines.push("- 처리 완료까지 평균 " + (Math.round(v.avgDays * 10) / 10) + "일 (" + v.nDays + "건 기준)"); }
    if (topCats.length) { lines.push("- 많이 나온 칸: " + topCats.join(", ")); }
    if (v.terms.length) { lines.push("- 자주 나온 말: " + v.terms.slice(0, 5).map(function (o) { return o.t + " " + o.n; }).join(", ")); }
    lines.push("※ AI가 분류한 추정 결과이며, 사람이 확인한 뒤 사용해 주세요.");
    return lines.join("\n");
  }
  function copySummary() {
    var text = summaryText(), box = $("d-sumbox"), btn = $("d-sum");
    box.value = text; box.hidden = false;
    var fin = function (ok) { btn.textContent = ok ? "복사됨" : "아래 글을 직접 복사해 주세요"; setTimeout(function () { btn.textContent = "요약 문구 복사"; }, 1800); };
    try { navigator.clipboard.writeText(text).then(function () { fin(true); }, function () { fin(false); }); } catch (e) { fin(false); }
  }

  // ---------- 내려받기 · 처음으로 · 예시 ----------
  function csvCell(v) {
    v = String(v == null ? "" : v).replace(/[\r\n]+/g, " ");
    return /[",\t]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function saveCSV(lines, name) {
    var blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function download() {
    var head = ["날짜", "의견", "칸", "긴급도", "이유", "사람확인", "민감", "단계", "배정일", "처리시작일", "완료일", "AI칸", "AI긴급도"];
    var lines = [head.join(",")].concat(ROWS.map(function (r) {
      return [r.date || (r.y + "-" + pad(r.m)), r.text, r.cat, r.urg, r.reason || "", r.chk ? "예" : "", r.sens ? "예" : "", STEPS[r.step],
        r.stamps[1], r.stamps[2], r.stamps[3], r.edited ? r.aiCat : "", r.edited ? r.aiUrg : ""].map(csvCell).join(",");
    }));
    saveCSV(lines, "의견함_분류결과.csv");
  }
  function downloadEdited() {
    var lines = [["의견", "AI칸", "AI긴급도", "고친칸", "고친긴급도"].join(",")].concat(ROWS.filter(function (r) { return r.edited; }).map(function (r) {
      return [r.text, r.aiCat, r.aiUrg, r.cat, r.urg].map(csvCell).join(",");
    }));
    saveCSV(lines, "의견함_고친사례.csv");
  }
  function reset() {
    ROWS = []; PENDING = null; $("d-out").hidden = true; $("d-map").hidden = true; $("d-in").hidden = false; $("d-text").value = ""; showError("");
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
      ROWS = d.rows.map(function (x, i) {
        var r = makeRow(x.t, x.d, { cat: x.c, urg: x.u, chk: x.k ? "예" : "", step: String(x.s) });
        r.src = "예시";
        // 예시의 단계별 날짜는 접수일에 며칠씩 더해 만든다
        var base = toDate(x.d);
        for (var k = 1; k <= x.s; k++) { r.stamps[k] = dstr(new Date(base.getTime() + (k * 2 + (i % 3)) * DAY)); }
        return r;
      });
      openDashboard("예시 데이터예요. 지어낸 문장 60개이고, 날짜와 처리 단계도 임의의 값이에요.");
    }).catch(function (e) { showError(e.message); });
  }

  $("d-run").addEventListener("click", function () {
    var t = $("d-text").value;
    if (!t.trim()) { showError("의견을 붙여넣거나 파일을 올려 주세요."); return; }
    window.App.loaded.then(function () { start(parsePasted(t)); });
  });
  $("d-file").addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) { return; }
    if (f.size > 1024 * 1024) { showError("파일이 너무 커요 (1MB 이하)."); return; }
    showError("");
    window.App.loaded.then(function () { return readFile(f); }).then(function (text) {
      var table = parseCSV(text);
      if (!table.length) { showError("읽을 수 있는 내용이 없어요."); return; }
      var rows = rowsFromTable(table);
      if (rows) { start(rows); return; }                 // 우리가 내려받은 형식
      if (table[0].length >= 2) { openMapping(table); return; } // 열이 여러 개면 열을 고르게 한다
      start(table.map(function (r) { return makeRow(r[0].trim()); }).filter(function (r) { return r.text; }));
    }).catch(function () { showError("파일을 읽지 못했어요."); });
  });
  ["d-col-text", "d-col-date", "d-hdr"].forEach(function (id) { $(id).addEventListener("change", renderPreview); });
  $("d-map-go").addEventListener("click", mapGo);
  $("d-map-cancel").addEventListener("click", function () { PENDING = null; $("d-map").hidden = true; $("d-in").hidden = false; });
  $("d-demo").addEventListener("click", demo);
  $("d-down").addEventListener("click", download);
  $("d-down2").addEventListener("click", downloadEdited);
  $("d-reset").addEventListener("click", reset);
  $("d-sum").addEventListener("click", copySummary);
  $("d-more").addEventListener("click", function () { SEL.all = !SEL.all; render(); });

  // ---------- 채점 탭: 내 데이터로 채점 ----------
  function myScore(table) {
    var head = table[0], ti = colIndex(head, ["의견", "text"]), ci = colIndex(head, ["칸"]), ui = colIndex(head, ["긴급도"]);
    var note = $("m-note"); note.hidden = false;
    if (ti === -1 || ci === -1 || ui === -1) { note.textContent = "첫 줄에 «의견», «칸», «긴급도» 열 이름이 있어야 해요."; return Promise.resolve(); }
    var CN = cats(), rows = [], skipped = 0;
    table.slice(1).forEach(function (c) {
      var raw = (c[ti] || "").trim(), tc = (c[ci] || "").trim(), tu = (c[ui] || "").trim();
      if (!raw) { return; }
      if (CN.indexOf(tc) === -1 || URGS.indexOf(tu) === -1) { skipped++; return; }
      var r = makeRow(raw); r.truthCat = tc; r.truthUrg = tu; rows.push(r);
    });
    var cut = Math.max(0, rows.length - 100); rows = rows.slice(0, 100);
    if (!rows.length) { note.textContent = "채점할 수 있는 줄이 없어요. 칸 이름은 " + CN.join(" · ") + " 중 하나여야 해요."; return Promise.resolve(); }
    note.textContent = (cut ? "앞의 100줄만 채점해요 (" + cut + "줄 제외). " : "") + (skipped ? "칸 · 긴급도 이름이 맞지 않는 " + skipped + "줄은 뺐어요." : "");
    note.hidden = !note.textContent;
    var prog = $("m-prog"); prog.hidden = false; prog.textContent = "AI 분류 중... 0 / " + rows.length;
    $("m-file").disabled = true;
    return classifyRows(rows, function (d, t) { prog.textContent = "AI 분류 중... " + d + " / " + t; }, false).then(function (info) {
      prog.hidden = true; $("m-file").disabled = false;
      var n = rows.length, okC = 0, okU = 0, okB = 0, wrong = [], worstBad = 0, worstTotal = 0;
      var worst = (window.App.criteria() || {})["가장_나쁜_실수_규칙"] || [];
      rows.forEach(function (r) {
        var c = r.cat === r.truthCat, u = r.urg === r.truthUrg;
        if (c) { okC++; } if (u) { okU++; } if (c && u) { okB++; } else { wrong.push(r); }
        worst.forEach(function (w) { if (r.truthCat === w["칸"] && r.truthUrg === w["긴급도"]) { worstTotal++; if (!(c && u)) { worstBad++; } } });
      });
      var pct = function (k) { return k + " / " + n + " (" + Math.round(k / n * 100) + "%)"; };
      $("m-cat").textContent = pct(okC); $("m-urg").textContent = pct(okU); $("m-both").textContent = pct(okB);
      $("m-worst").textContent = worstTotal ? worstBad + " / " + worstTotal : "해당 문장 없음";
      $("m-cond").textContent = "조건: " + (info.aborted ? "AI를 쓸 수 없어 규칙으로 분류한 줄이 있어요(" + info.aborted + ") · " : "") + "AI 호출 " + Math.ceil(info.total / BATCH) + "회 사용 · 1회 채점";
      var ul = $("m-wrong"); ul.textContent = "";
      wrong.forEach(function (r) {
        var li = el("li", "", r.text); li.appendChild(el("span", "cmp-sub", "정답 " + r.truthCat + " / " + r.truthUrg + "  →  " + r.src + " " + r.cat + " / " + r.urg)); ul.appendChild(li);
      });
      $("m-out").hidden = false;
    }).catch(function (e) { prog.hidden = true; $("m-file").disabled = false; note.hidden = false; note.textContent = (e && e.message) || "채점하지 못했어요."; });
  }
  $("m-file").addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) { return; }
    if (f.size > 1024 * 1024) { $("m-note").hidden = false; $("m-note").textContent = "파일이 너무 커요 (1MB 이하)."; return; }
    $("m-out").hidden = true;
    window.App.loaded.then(function () { return readFile(f); }).then(function (text) {
      var table = parseCSV(text);
      return myScore(table);
    }).catch(function () { $("m-note").hidden = false; $("m-note").textContent = "파일을 읽지 못했어요."; });
  });
})();
