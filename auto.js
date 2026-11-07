// 자동응답 탭: 문의 성격이 «단순 문의»인 의견에 미리 적어 둔 답변을 붙여 자동으로 처리한다.
// 답변 목록 · 켜고 끄기는 이 브라우저(localStorage)에만 저장하고 서버로 보내지 않는다.
// 처음 들어 있는 답변은 예시 문구다. 회사의 실제 안내에 맞게 고쳐 쓴다.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var KEY = "auto-v1", COMMON = "공통", STEPS_LABEL = ["접수", "담당자 배정", "처리 중", "처리 완료"];
  var DEFAULTS = [
    { cat: "급여", name: "연말정산 서류", keys: "연말정산, 부양가족", text: "연말정산 서류는 인사팀 연말정산 담당자에게 제출해 주세요. 제출 기한과 방법은 인사팀 공지를 확인해 주세요." },
    { cat: "급여", name: "급여 이체 계좌 변경", keys: "계좌, 이체", text: "급여 이체 계좌를 바꾸려면 통장 사본을 인사팀에 제출해 주세요. 다음 지급일부터 적용돼요." },
    { cat: "급여", name: "급여명세서 열람", keys: "급여명세서, 비밀번호", text: "급여명세서 비밀번호는 인사 시스템의 비밀번호 찾기에서 다시 정하거나 인사팀에 문의해 주세요." },
    { cat: "급여", name: "식대 신청", keys: "식대", text: "야근 식대는 근무 기록과 영수증을 첨부해 인사 시스템에서 신청해 주세요." },
    { cat: "복지", name: "건강검진 예약", keys: "건강검진 예약, 건강검진 방법", text: "건강검진 예약 방법과 가능한 기간은 복지 안내 공지를 확인해 주세요." },
    { cat: "복지", name: "복지 신청", keys: "상조, 도서 대여", text: "복지 신청 절차와 이용 방법은 복지 안내 페이지를 확인해 주세요." },
    { cat: "온보딩", name: "입사 서류 제출", keys: "입사 서류, 입사서류, 건강검진 결과서", text: "입사 서류와 제출 기한은 입사 안내 메일을 확인해 주세요. 제출 현황은 인사팀에서 알려 드려요." },
    { cat: "평가", name: "평가 일정", keys: "평가 일정, 평가 면담, 면담은", text: "평가 일정과 면담 시기는 평가 공지 메일로 안내돼요. 공지 전에는 인사팀에서 일정을 확인해 드려요." },
    { cat: "안전보건", name: "안전 · 소화기", keys: "소화기, 안전 교육", text: "소화기 위치와 점검일, 안전 교육 일정은 안전 담당 부서 공지를 확인해 주세요." },
    { cat: "조직문화", name: "동호회 가입", keys: "동호회", text: "사내 동호회 가입은 동호회 담당자에게 신청해 주세요." },
    { cat: "기타", name: "설문 결과 공개", keys: "조사 결과", text: "조사 결과는 집계가 끝나는 대로 사내 공지로 안내돼요." }
  ];
  function fresh() { return DEFAULTS.map(function (a, i) { return { id: "a" + (i + 1), cat: a.cat, name: a.name, keys: a.keys, text: a.text }; }); }
  var ST = { on: true, list: fresh(), seq: DEFAULTS.length, cats: [] }; // cats: 담당자가 더 만든 카테고리
  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (saved && typeof saved === "object" && Array.isArray(saved.list)) {
      ST = saved; ST.seq = ST.seq || ST.list.length;
      var byName = {}; DEFAULTS.forEach(function (a) { byName[a.name] = a.cat; });
      ST.list.forEach(function (a) { if (!a.cat) { a.cat = byName[a.name] || COMMON; } }); // 카테고리가 없던 예전 답변
    }
  } catch (e) { /* 저장된 값이 없어도 동작해요 */ }
  ST.cats = Array.isArray(ST.cats) ? ST.cats : [];
  function save() { try { localStorage.setItem(KEY, JSON.stringify(ST)); } catch (e) { /* 저장이 막혀도 동작해요 */ } }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) { e.className = cls; } if (text != null) { e.textContent = text; } return e; }
  function norm(s) { return String(s || "").replace(/\s+/g, ""); }
  function keysOf(a) { return String(a.keys || "").split(/[,，、]/).map(function (k) { return norm(k); }).filter(Boolean); }
  function siteCats() { return (window.App && window.App.cats && window.App.cats()) || ["급여", "복지", "온보딩", "조직문화", "리더십", "평가", "안전보건", "기타"]; }
  function cats() { return siteCats().concat(ST.cats.filter(function (c) { return siteCats().indexOf(c) === -1; })); } // 사이트의 칸 + 담당자가 만든 카테고리

  // 의견 글에 가장 잘 맞는 답변 하나. 낱말이 길게 맞을수록 점수가 높고, 같은 카테고리(칸)의 답변을 먼저 쓴다. 없으면 null
  function match(text, cat) {
    var t = norm(text), best = null, bs = 0;
    ST.list.forEach(function (a) {
      if (!String(a.text || "").trim()) { return; }
      var s = 0; keysOf(a).forEach(function (k) { if (t.indexOf(k) !== -1) { s += k.length; } });
      if (!s) { return; }
      if (cat && a.cat === cat) { s += 1000; }
      if (s > bs) { bs = s; best = a; }
    });
    return best;
  }
  // 새 답변을 쓸 때 문의 글에서 낱말을 뽑아 답변의 «이런 낱말이 있으면»에 채운다 (목록에서 고칠 수 있다)
  var STOPW = ["알려", "주세요", "궁금", "있는지", "어떻게", "언제", "무엇", "어디", "하나요", "되나요", "싶어요", "싶습니다", "해주세요", "문의", "확인", "관련", "대한"];
  function autoKeys(t) {
    var words = String(t).replace(/[^가-힣A-Za-z0-9\s]/g, " ").split(/\s+/).map(function (w) {
      return w.replace(/(으로|에서|에게|부터|까지|처럼|은|는|이|가|을|를|에|의|도|로|와|과|만|요)$/, "");
    }).filter(function (w) { return w.length >= 2 && STOPW.indexOf(w) === -1; });
    var seen = {}, out = [];
    words.sort(function (x, y) { return y.length - x.length; }).forEach(function (w) { if (!seen[w] && out.length < 3) { seen[w] = 1; out.push(w); } });
    return out.join(", ");
  }
  function uniqueName(base) {
    var n = base, k = 2; while (ST.list.some(function (a) { return a.name === n; })) { n = base + " (" + k + ")"; k++; } return n;
  }
  function say(msg) { var m = $("a-msg"); if (m) { m.textContent = msg; } }
  function send(r, ans) {
    if (!window.Dash || !window.Dash.autoSend) { return; }
    window.Dash.autoSend(r, ans.name, ans.text);
    say("«" + r.text.slice(0, 16) + "…» 문의에 «" + ans.name + "» 답변을 보냈어요. 처리 완료로 바뀌었어요.");
    render();
  }
  function write(r, text) {
    text = String(text || "").trim(); if (!text) { say("답변 내용을 먼저 적어 주세요."); return; }
    ST.seq = (ST.seq || ST.list.length) + 1;
    var ans = { id: "a" + ST.seq, cat: r.cat, name: uniqueName(r.text.slice(0, 14).trim()), keys: autoKeys(r.text), text: text.slice(0, 400) };
    ST.list.push(ans); save(); // 쓴 답변은 답변 목록에 그대로 쌓인다
    window.Dash.autoSend(r, ans.name, ans.text);
    say("«" + r.text.slice(0, 16) + "…» 문의에 답변을 보냈고, 답변 목록(" + r.cat + ")에도 «" + ans.name + "»으로 쌓았어요. 낱말은 목록에서 고칠 수 있어요.");
    render();
  }
  var KIND_BTNS = ["확인 전", "업무 오류", "제도·시스템·외부", "현업 팀장·팀원"];
  function item(r) {
    var li = el("li"), t = el("div", "t");
    t.appendChild(el("span", "chip", r.cat));
    if (r.auto) { t.appendChild(el("span", "chip src", "자동응답 · " + r.auto)); if (r.stamps[3]) { t.appendChild(el("span", "chip", "처리 " + r.stamps[3].slice(5))); } }
    else { t.appendChild(el("span", "chip need", "답변 필요")); t.appendChild(el("span", "chip", STEPS_LABEL[r.step])); }
    li.appendChild(t); li.appendChild(el("p", "", r.text));
    if (r.auto) { li.appendChild(el("p", "why", r.note || "")); }
    var tabs = el("div", "atabs"); tabs.setAttribute("role", "tablist");
    [["send", "자동응답 보내기"], ["write", "자동응답 쓰기"], ["kind", "문의 성격 바꾸기"]].forEach(function (p) {
      var b = el("button", "", p[1]); b.type = "button"; b.setAttribute("role", "tab"); b.setAttribute("aria-pressed", String(r.atab === p[0]));
      b.addEventListener("click", function () { r.atab = r.atab === p[0] ? "" : p[0]; render(); });
      tabs.appendChild(b);
    });
    li.appendChild(tabs);
    if (r.atab === "send") {
      var box = el("div", "apane"), withText = ST.list.filter(function (a) { return String(a.text || "").trim(); });
      if (!withText.length) { box.appendChild(el("p", "fine", "보낼 수 있는 답변이 없어요. «자동응답 쓰기»로 새로 쓰거나 아래 답변 목록에 답변을 적어 주세요.")); }
      else {
        var sel = el("select", "acat"); sel.setAttribute("aria-label", "보낼 답변");
        var best = match(r.text, r.cat);
        withText.forEach(function (a) { var o = el("option", "", a.cat + " · " + a.name); o.value = a.id; sel.appendChild(o); });
        sel.value = (best || withText[0]).id;
        var prev = el("p", "why"); function upd() { var a = ST.list.filter(function (x) { return x.id === sel.value; })[0]; prev.textContent = a ? a.text : ""; } upd();
        sel.addEventListener("change", upd);
        var go = el("button", "alink add", r.auto ? "다시 보내기" : "보내기"); go.type = "button";
        go.addEventListener("click", function () { var a = ST.list.filter(function (x) { return x.id === sel.value; })[0]; if (a) { send(r, a); } });
        var row = el("div", "aact"); row.appendChild(sel); row.appendChild(go);
        box.appendChild(row); box.appendChild(prev);
        if (best) { box.appendChild(el("p", "fine", "낱말이 가장 잘 맞는 답변을 골라 두었어요.")); }
      }
      li.appendChild(box);
    } else if (r.atab === "write") {
      var wb = el("div", "apane"), ta = el("textarea", "ain"); ta.rows = 3; ta.maxLength = 400; ta.setAttribute("aria-label", "새 자동응답 답변");
      ta.placeholder = "이 문의에 보낼 답변을 적어요 (실제 이름 · 개인정보는 적지 마세요)";
      var wg = el("button", "alink add", "쓰고 보내기"); wg.type = "button"; wg.addEventListener("click", function () { write(r, ta.value); });
      wb.appendChild(ta); wb.appendChild(wg);
      wb.appendChild(el("p", "fine", "쓴 답변은 답변 목록(" + r.cat + ")에 자동으로 쌓여서, 다음에 비슷한 문의가 오면 자동응답이 써요."));
      li.appendChild(wb);
    } else if (r.atab === "kind") {
      var kb = el("div", "apane akind2"); kb.appendChild(el("span", "alab2", "이 문의는"));
      KIND_BTNS.forEach(function (k) {
        var b = el("button", "", k); b.type = "button";
        b.addEventListener("click", function () {
          if (!window.Settle || !window.Settle.setKind) { return; }
          if (r.auto && window.Dash && window.Dash.autoUndo) { window.Dash.autoUndo(r); } // 자동응답으로 처리하기 어려운 문의는 처리를 되돌리고 담당자가 직접 다룬다
          window.Settle.setKind(r, k); r.atab = "";
          say("«" + r.text.slice(0, 16) + "…» 문의의 성격을 «" + k + "»로 바꿨어요. 담당자별 탭에서 이어서 다룰 수 있어요.");
          render();
        });
        kb.appendChild(b);
      });
      li.appendChild(kb);
    }
    return li;
  }
  // 상태 필터 (전체 / 답변 필요 / 처리함 중 하나)
  function statusBar(box, needN, doneN) {
    box.textContent = "";
    [["all", "전체 " + (needN + doneN)], ["need", "답변 필요 " + needN], ["done", "처리함 " + doneN]].forEach(function (p) {
      var b = el("button", "", p[1]); b.type = "button"; b.setAttribute("aria-pressed", String(FLT.status === p[0]));
      b.addEventListener("click", function () { FLT.status = p[0]; render(); }); box.appendChild(b);
    });
  }
  // 카테고리 필터: 칩을 눌러 체크 · 해제하고, 체크한 카테고리의 문의만 보여 준다 (null = 모두)
  var FLT = { list: null, status: "all" };
  function pass(key, r) { return FLT[key] === null || FLT[key].indexOf(r.cat) !== -1; }
  function filterBar(box, key, list) {
    box.textContent = "";
    var count = {}; list.forEach(function (r) { count[r.cat] = (count[r.cat] || 0) + 1; });
    var present = siteCats().filter(function (c) { return count[c]; });
    box.hidden = !present.length; if (!present.length) { return; }
    var sel = FLT[key];
    function set(next) { FLT[key] = next && next.length === present.length ? null : next; render(); }
    var all = el("button", "", "전체 " + list.length); all.type = "button"; all.setAttribute("aria-pressed", String(sel === null));
    all.addEventListener("click", function () { set(sel === null ? [] : null); }); box.appendChild(all);
    present.forEach(function (c) {
      var on = sel === null || sel.indexOf(c) !== -1, b = el("button", "", c + " " + count[c]); b.type = "button"; b.setAttribute("aria-pressed", String(on));
      b.addEventListener("click", function () {
        var cur = sel === null ? present.slice() : sel.slice(), i = cur.indexOf(c);
        if (i === -1) { cur.push(c); } else { cur.splice(i, 1); }
        set(cur);
      });
      box.appendChild(b);
    });
  }
  function changed() { save(); if (window.Dash && window.Dash.refresh) { window.Dash.refresh(); } render(); }

  function card(a, cnt) {
    var box = el("div", "acard"), top = el("div", "atop");
    var nm = el("input", "ain aname"); nm.type = "text"; nm.maxLength = 30; nm.value = a.name; nm.setAttribute("aria-label", "답변 이름");
    nm.addEventListener("change", function () { a.name = nm.value.trim() || "이름 없는 답변"; save(); render(); });
    top.appendChild(nm);
    var cs = el("select", "acat"); cs.setAttribute("aria-label", "카테고리");
    cats().concat([COMMON]).forEach(function (c) { var o = el("option", "", c); o.value = c; cs.appendChild(o); }); cs.value = a.cat || COMMON;
    cs.addEventListener("change", function () { a.cat = cs.value; changed(); }); top.appendChild(cs);
    top.appendChild(el("span", "acnt", (cnt[a.name] || 0) + "건 처리"));
    var del = el("button", "alink", "지우기"); del.type = "button";
    del.addEventListener("click", function () { ST.list = ST.list.filter(function (x) { return x !== a; }); changed(); });
    top.appendChild(del); box.appendChild(top);
    var lk = el("label", "alab", "이런 낱말이 있으면 (쉼표로 나눠요)"), ki = el("input", "ain"); ki.type = "text"; ki.maxLength = 120; ki.value = a.keys; ki.placeholder = "예: 연말정산, 부양가족";
    ki.addEventListener("change", function () { a.keys = ki.value; changed(); }); lk.appendChild(ki); box.appendChild(lk);
    var lt = el("label", "alab", "이렇게 답해요"), ta = el("textarea", "ain"); ta.rows = 3; ta.maxLength = 400; ta.value = a.text; ta.placeholder = "문의자에게 보낼 답변 내용 (실제 이름 · 개인정보는 적지 마세요)";
    ta.addEventListener("change", function () { a.text = ta.value; changed(); }); lt.appendChild(ta); box.appendChild(lt);
    return box;
  }
  function addAnswer(cat, name) {
    ST.seq = (ST.seq || ST.list.length) + 1;
    var a = { id: "a" + ST.seq, cat: cat || COMMON, name: name || "새 답변", keys: "", text: "" };
    ST.list.push(a); save(); render(); return a;
  }
  function addCat(name) {
    name = String(name || "").trim().slice(0, 12);
    if (!name || name === COMMON || cats().indexOf(name) !== -1) { return false; }
    ST.cats.push(name); save(); render(); return true;
  }

  function render() {
    var sw = $("a-on"); if (!sw) { return; }
    sw.checked = !!ST.on;
    var rows = window.Dash && window.Dash.data ? window.Dash.data().rows : [];
    var cnt = {}; rows.forEach(function (r) { if (r.auto) { cnt[r.auto] = (cnt[r.auto] || 0) + 1; } });
    var total = Object.keys(cnt).reduce(function (s, k) { return s + cnt[k]; }, 0);
    $("a-sum").textContent = "지금까지 자동응답으로 처리한 문의 " + total + "건";
    // 자동응답 문의: 답변이 필요한 단순 문의와 자동응답으로 처리한 문의를 한 목록에 (카테고리 · 상태를 체크한 것만)
    var all = rows.filter(function (r) {
      if (r.auto) { return true; }
      var inf = window.Settle && window.Settle.info ? window.Settle.info(r) : null;
      return inf && inf.kind === "단순 문의" && (r.step < 3 || !match(r.text, r.cat));
    });
    all.sort(function (x, y) {
      if (!!x.auto !== !!y.auto) { return x.auto ? 1 : -1; } // 답변이 필요한 문의를 먼저
      if (!x.auto) { return (x.step === 3) - (y.step === 3); }
      return (y.stamps[3] || "") < (x.stamps[3] || "") ? -1 : 1;
    });
    var needN = all.filter(function (r) { return !r.auto; }).length;
    $("a-count").textContent = "답변 필요 " + needN + "건 · 처리함 " + (all.length - needN) + "건";
    statusBar($("a-stat-f"), needN, all.length - needN);
    filterBar($("a-done-f"), "list", all.filter(function (r) { return FLT.status === "all" || (FLT.status === "need") === !r.auto; }));
    var shown = all.filter(function (r) { return pass("list", r) && (FLT.status === "all" || (FLT.status === "need") === !r.auto); });
    var ul = $("a-done"); ul.textContent = "";
    if (!all.length) { ul.appendChild(el("li", "empty", "아직 자동응답 문의가 없어요. 문의 성격이 «단순 문의»인 문의가 생기면 여기에 나와요.")); }
    else if (!shown.length) { ul.appendChild(el("li", "empty", "체크한 조건의 문의가 없어요.")); }
    shown.slice(0, 20).forEach(function (r) { ul.appendChild(item(r)); });
    if (shown.length > 20) { ul.appendChild(el("li", "empty", "나머지 " + (shown.length - 20) + "건은 위의 체크로 좁혀서 보세요.")); }
    // 답변 목록: 카테고리별로 묶어서
    var box = $("a-list"); box.textContent = "";
    cats().concat([COMMON]).forEach(function (c) {
      var mine = ST.list.filter(function (a) { return (a.cat || COMMON) === c; });
      var grp = el("div", "agrp"), head = el("div", "agh");
      head.appendChild(el("b", "", c)); head.appendChild(el("span", "agn", mine.length + "개"));
      var add = el("button", "alink add", "+ 답변 추가"); add.type = "button"; add.addEventListener("click", function () { addAnswer(c); });
      head.appendChild(add);
      if (siteCats().indexOf(c) === -1 && c !== COMMON) {
        var dc = el("button", "alink", "카테고리 지우기"); dc.type = "button"; dc.title = "이 카테고리의 답변은 «공통»으로 옮겨요";
        dc.addEventListener("click", function () { ST.cats = ST.cats.filter(function (x) { return x !== c; }); ST.list.forEach(function (x) { if (x.cat === c) { x.cat = COMMON; } }); changed(); });
        head.appendChild(dc);
      }
      grp.appendChild(head);
      if (!mine.length) { grp.appendChild(el("p", "fine", "등록된 답변이 없어요.")); }
      mine.forEach(function (a) { grp.appendChild(card(a, cnt)); });
      box.appendChild(grp);
    });
  }

  $("a-on").addEventListener("change", function () { ST.on = this.checked; changed(); });
  $("a-add").addEventListener("click", function () { addAnswer(COMMON); });
  $("a-addcat").addEventListener("click", function () {
    var inp = $("a-newcat"), msg = $("a-catmsg");
    if (addCat(inp.value)) { inp.value = ""; msg.textContent = ""; } else { msg.textContent = "이름을 적어 주세요. 이미 있는 이름은 만들 수 없어요."; }
  });
  $("a-reset").addEventListener("click", function () {
    var b = this;
    if (b.dataset.ask !== "1") { b.dataset.ask = "1"; b.textContent = "한 번 더 누르면 처음 답변으로 돌아가요"; setTimeout(function () { b.dataset.ask = ""; b.textContent = "처음 답변으로 되돌리기"; }, 2500); return; }
    b.dataset.ask = ""; b.textContent = "처음 답변으로 되돌리기";
    ST.list = fresh(); ST.seq = DEFAULTS.length; changed();
  });
  window.Auto = { on: function () { return !!ST.on; }, match: match, render: render };
})();
