// 자동응답 탭: 문의 성격이 «단순 문의»인 의견에 미리 적어 둔 답변을 붙여 자동으로 처리한다.
// 답변 목록 · 켜고 끄기는 이 브라우저(localStorage)에만 저장하고 서버로 보내지 않는다.
// 처음 들어 있는 답변은 예시 문구다. 회사의 실제 안내에 맞게 고쳐 쓴다.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var KEY = "auto-v1", COMMON = "공통";
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
  var ST = { on: true, list: fresh(), seq: DEFAULTS.length };
  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (saved && typeof saved === "object" && Array.isArray(saved.list)) {
      ST = saved; ST.seq = ST.seq || ST.list.length;
      var byName = {}; DEFAULTS.forEach(function (a) { byName[a.name] = a.cat; });
      ST.list.forEach(function (a) { if (!a.cat) { a.cat = byName[a.name] || COMMON; } }); // 카테고리가 없던 예전 답변
    }
  } catch (e) { /* 저장된 값이 없어도 동작해요 */ }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(ST)); } catch (e) { /* 저장이 막혀도 동작해요 */ } }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) { e.className = cls; } if (text != null) { e.textContent = text; } return e; }
  function norm(s) { return String(s || "").replace(/\s+/g, ""); }
  function keysOf(a) { return String(a.keys || "").split(/[,，、]/).map(function (k) { return norm(k); }).filter(Boolean); }
  function cats() { return (window.App && window.App.cats && window.App.cats()) || ["급여", "복지", "온보딩", "조직문화", "리더십", "평가", "안전보건", "기타"]; }

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
  function addAnswer(cat) {
    ST.seq = (ST.seq || ST.list.length) + 1;
    ST.list.push({ id: "a" + ST.seq, cat: cat || COMMON, name: "새 답변", keys: "", text: "" }); save(); render();
  }

  function render() {
    var sw = $("a-on"); if (!sw) { return; }
    sw.checked = !!ST.on;
    var rows = window.Dash && window.Dash.data ? window.Dash.data().rows : [];
    var cnt = {}; rows.forEach(function (r) { if (r.auto) { cnt[r.auto] = (cnt[r.auto] || 0) + 1; } });
    var total = Object.keys(cnt).reduce(function (s, k) { return s + cnt[k]; }, 0);
    $("a-sum").textContent = "지금까지 자동응답으로 처리한 문의 " + total + "건";
    // 먼저: 자동응답으로 처리한 문의 (최근 것부터)
    var done = rows.filter(function (r) { return r.auto; }).sort(function (x, y) { return (y.stamps[3] || "") < (x.stamps[3] || "") ? -1 : 1; }).slice(0, 12);
    var ul = $("a-done"); ul.textContent = "";
    if (!done.length) { ul.appendChild(el("li", "empty", "아직 자동응답으로 처리한 문의가 없어요. 문의 성격이 «단순 문의»이고 아래 답변의 낱말과 맞는 문의가 생기면 여기에 쌓여요.")); }
    done.forEach(function (r) {
      var li = el("li"), t = el("div", "t");
      t.appendChild(el("span", "chip", r.cat)); t.appendChild(el("span", "chip src", "자동응답 · " + r.auto));
      if (r.stamps[3]) { t.appendChild(el("span", "chip", "처리 " + r.stamps[3].slice(5))); }
      li.appendChild(t); li.appendChild(el("p", "", r.text)); li.appendChild(el("p", "why", r.note || "")); ul.appendChild(li);
    });
    // 답변 목록: 카테고리별로 묶어서
    var box = $("a-list"); box.textContent = "";
    cats().concat([COMMON]).forEach(function (c) {
      var mine = ST.list.filter(function (a) { return (a.cat || COMMON) === c; });
      var grp = el("div", "agrp"), head = el("div", "agh");
      head.appendChild(el("b", "", c)); head.appendChild(el("span", "agn", mine.length + "개"));
      var add = el("button", "alink add", "+ 답변 추가"); add.type = "button"; add.addEventListener("click", function () { addAnswer(c); });
      head.appendChild(add); grp.appendChild(head);
      if (!mine.length) { grp.appendChild(el("p", "fine", "등록된 답변이 없어요.")); }
      mine.forEach(function (a) { grp.appendChild(card(a, cnt)); });
      box.appendChild(grp);
    });
  }

  $("a-on").addEventListener("change", function () { ST.on = this.checked; changed(); });
  $("a-add").addEventListener("click", function () { addAnswer(COMMON); });
  $("a-reset").addEventListener("click", function () {
    var b = this;
    if (b.dataset.ask !== "1") { b.dataset.ask = "1"; b.textContent = "한 번 더 누르면 처음 답변으로 돌아가요"; setTimeout(function () { b.dataset.ask = ""; b.textContent = "처음 답변으로 되돌리기"; }, 2500); return; }
    b.dataset.ask = ""; b.textContent = "처음 답변으로 되돌리기";
    ST.list = fresh(); ST.seq = DEFAULTS.length; changed();
  });
  window.Auto = { on: function () { return !!ST.on; }, match: match, render: render };
})();
