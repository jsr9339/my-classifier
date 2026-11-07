// 자동응답 탭: 문의 성격이 «단순 문의»인 의견에 미리 적어 둔 답변을, 담당자가 «보내기»를 눌렀을 때만 보낸다. (자동으로 처리하지 않는다)
// 답변 목록은 이 브라우저(localStorage)에만 저장하고 서버로 보내지 않는다.
// 처음 들어 있는 답변은 예시 문구다. 회사의 실제 안내에 맞게 고쳐 쓴다.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var KEY = "auto-v1", COMMON = "공통", STEPS_LABEL = ["접수", "담당자 배정", "처리 중", "처리 완료"];
  var DEFAULTS = [
    { cat: "급여", name: "연말정산 서류", keys: "연말정산, 부양가족", text: "연말정산 부양가족 서류(부양가족 등록 신청서, 주민등록등본)는 매년 1월 중순까지 인사팀 연말정산 담당자에게 제출해 주세요. 기한이 지나면 공제를 받지 못할 수 있어요." },
    { cat: "급여", name: "급여 이체 계좌 변경", keys: "계좌, 이체", text: "급여 이체 계좌를 바꾸려면 통장 사본을 인사팀에 제출해 주세요. 다음 지급일부터 적용돼요." },
    { cat: "급여", name: "급여명세서 열람", keys: "급여명세서, 비밀번호", text: "급여명세서 비밀번호는 인사 시스템 로그인 화면의 «비밀번호 찾기»에서 사번과 등록된 이메일로 새로 정할 수 있어요. 그래도 열리지 않으면 인사팀에 알려 주세요." },
    { cat: "급여", name: "식대 신청", keys: "식대", text: "야근 식대는 근무 기록과 영수증 사진을 첨부해 인사 시스템의 «식대 신청»에서 신청해 주세요. 신청한 달의 급여일에 함께 지급돼요." },
    { cat: "복지", name: "건강검진 예약", keys: "건강검진 예약, 건강검진 방법", text: "건강검진은 복지 포털의 «건강검진 예약»에서 지정 병원과 날짜를 고르면 돼요. 예약하면 안내 메일이 오고, 검진 비용은 회사가 부담해요." },
    { cat: "복지", name: "복지 신청", keys: "상조, 도서 대여", text: "상조 지원과 도서 대여는 복지 포털의 «복지 신청»에서 항목을 골라 신청서를 내면 돼요. 승인 결과는 신청 후 3영업일 안에 메일로 알려 드려요." },
    { cat: "온보딩", name: "입사 서류 제출", keys: "입사 서류, 입사서류, 건강검진 결과서", text: "입사 서류(건강검진 결과서 포함)는 입사일부터 2주 안에 인사팀에 내 주세요. 어디까지 냈는지는 인사팀에 물어보시면 바로 알려 드려요." },
    { cat: "평가", name: "평가 일정", keys: "평가 일정, 평가 면담, 면담은", text: "상반기 평가는 7월, 하반기 평가는 1월에 진행돼요. 평가 면담은 평가가 끝난 뒤 2주 안에 팀장님과 하게 돼요." },
    { cat: "안전보건", name: "안전 · 소화기", keys: "소화기, 안전 교육", text: "소화기는 각 층 엘리베이터 옆과 비상구 앞에 있어요. 점검은 매달 첫째 주 월요일에 하고, 안전 교육은 분기마다 한 번 있어요." },
    { cat: "조직문화", name: "동호회 가입", keys: "동호회", text: "사내 동호회는 동호회 담당자에게 이름과 희망하는 동호회를 알려 주면 바로 가입돼요. 회비는 동호회마다 달라요." },
    { cat: "리더십", name: "임원 면담 신청", keys: "임원 면담", text: "임원 면담은 비서실에 희망 일자와 안건을 메일로 보내 주세요. 보통 일주일 안에 일정을 잡아 알려 드려요." },
    { cat: "리더십", name: "리더십 교육", keys: "리더십 교육", text: "팀장 리더십 교육은 상반기와 하반기에 한 번씩 열려요. 신청은 인사 시스템의 «교육 신청»에서 하세요." },
    { cat: "기타", name: "회사 주소 안내", keys: "회사 주소", text: "회사 주소가 바뀌면 전 직원에게 메일로 먼저 알려 드려요. 지금 주소는 인사 시스템의 «회사 정보»에서 볼 수 있어요." },
    { cat: "조직문화", name: "쉬는 시간", keys: "쉬는 시간", text: "점심시간 외에도 오후에 15분씩 쉬는 시간을 쓸 수 있어요. 팀장님께 미리 말씀드리면 돼요." },
    { cat: "기타", name: "설문 결과 공개", keys: "조사 결과", text: "조사 결과는 설문이 끝난 다음 달 첫째 주에 전 직원에게 메일로 알려 드려요." }
  ];
  function fresh() { return DEFAULTS.map(function (a, i) { return { id: "a" + (i + 1), cat: a.cat, name: a.name, keys: a.keys, text: a.text }; }); }
  var ST = { on: true, list: fresh(), seq: DEFAULTS.length, cats: [] }; // cats: 담당자가 더 만든 카테고리
  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (saved && typeof saved === "object" && Array.isArray(saved.list)) {
      ST = saved; ST.seq = ST.seq || ST.list.length;
      var byName = {}; DEFAULTS.forEach(function (a) { byName[a.name] = a.cat; });
      ST.list.forEach(function (a) { if (!a.cat) { a.cat = byName[a.name] || COMMON; } }); // 카테고리가 없던 예전 답변
      var OLD_TEXT = {"연말정산 서류": "연말정산 서류는 인사팀 연말정산 담당자에게 제출해 주세요. 제출 기한과 방법은 인사팀 공지를 확인해 주세요.", "급여 이체 계좌 변경": "급여 이체 계좌를 바꾸려면 통장 사본을 인사팀에 제출해 주세요. 다음 지급일부터 적용돼요.", "급여명세서 열람": "급여명세서 비밀번호는 인사 시스템의 비밀번호 찾기에서 다시 정하거나 인사팀에 문의해 주세요.", "식대 신청": "야근 식대는 근무 기록과 영수증을 첨부해 인사 시스템에서 신청해 주세요.", "건강검진 예약": "건강검진 예약 방법과 가능한 기간은 복지 안내 공지를 확인해 주세요.", "복지 신청": "복지 신청 절차와 이용 방법은 복지 안내 페이지를 확인해 주세요.", "입사 서류 제출": "입사 서류와 제출 기한은 입사 안내 메일을 확인해 주세요. 제출 현황은 인사팀에서 알려 드려요.", "평가 일정": "평가 일정과 면담 시기는 평가 공지 메일로 안내돼요. 공지 전에는 인사팀에서 일정을 확인해 드려요.", "안전 · 소화기": "소화기 위치와 점검일, 안전 교육 일정은 안전 담당 부서 공지를 확인해 주세요.", "동호회 가입": "사내 동호회 가입은 동호회 담당자에게 신청해 주세요.", "설문 결과 공개": "조사 결과는 집계가 끝나는 대로 사내 공지로 안내돼요."}, NEW_TEXT = {"연말정산 서류": "연말정산 부양가족 서류(부양가족 등록 신청서, 주민등록등본)는 매년 1월 중순까지 인사팀 연말정산 담당자에게 제출해 주세요. 기한이 지나면 공제를 받지 못할 수 있어요.", "급여 이체 계좌 변경": "급여 이체 계좌를 바꾸려면 통장 사본을 인사팀에 제출해 주세요. 다음 지급일부터 적용돼요.", "급여명세서 열람": "급여명세서 비밀번호는 인사 시스템 로그인 화면의 «비밀번호 찾기»에서 사번과 등록된 이메일로 새로 정할 수 있어요. 그래도 열리지 않으면 인사팀에 알려 주세요.", "식대 신청": "야근 식대는 근무 기록과 영수증 사진을 첨부해 인사 시스템의 «식대 신청»에서 신청해 주세요. 신청한 달의 급여일에 함께 지급돼요.", "건강검진 예약": "건강검진은 복지 포털의 «건강검진 예약»에서 지정 병원과 날짜를 고르면 돼요. 예약하면 안내 메일이 오고, 검진 비용은 회사가 부담해요.", "복지 신청": "상조 지원과 도서 대여는 복지 포털의 «복지 신청»에서 항목을 골라 신청서를 내면 돼요. 승인 결과는 신청 후 3영업일 안에 메일로 알려 드려요.", "입사 서류 제출": "입사 서류(건강검진 결과서 포함)는 입사일부터 2주 안에 인사팀에 내 주세요. 어디까지 냈는지는 인사팀에 물어보시면 바로 알려 드려요.", "평가 일정": "상반기 평가는 7월, 하반기 평가는 1월에 진행돼요. 평가 면담은 평가가 끝난 뒤 2주 안에 팀장님과 하게 돼요.", "안전 · 소화기": "소화기는 각 층 엘리베이터 옆과 비상구 앞에 있어요. 점검은 매달 첫째 주 월요일에 하고, 안전 교육은 분기마다 한 번 있어요.", "동호회 가입": "사내 동호회는 동호회 담당자에게 이름과 희망하는 동호회를 알려 주면 바로 가입돼요. 회비는 동호회마다 달라요.", "설문 결과 공개": "조사 결과는 설문이 끝난 다음 달 첫째 주에 전 직원에게 메일로 알려 드려요."};
      ST.list.forEach(function (a) { if (OLD_TEXT[a.name] && a.text === OLD_TEXT[a.name]) { a.text = NEW_TEXT[a.name]; } }); // 고치지 않은 예전 예시 문구는 새 예시 문구로
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
  var KIND_BTNS = ["확인 전", "업무 오류", "제도·시스템·외부", "현업 팀장·팀원"], KIND_BACK = "단순 문의";
  function item(r) {
    var li = el("li"), t = el("div", "t");
    t.appendChild(el("span", "chip", r.cat));
    if (r.auto) { t.appendChild(el("span", "chip src", "자동응답 · " + r.auto)); if (r.stamps[3]) { t.appendChild(el("span", "chip", "처리 " + r.stamps[3].slice(5))); } }
    else if (r.astat === "kc") { var inf0 = window.Settle.info(r); t.appendChild(el("span", "chip src", "문의 성격 변경 · " + (inf0 ? inf0.kind : ""))); t.appendChild(el("span", "chip", STEPS_LABEL[r.step])); }
    else { t.appendChild(el("span", "chip need", "답변 필요")); t.appendChild(el("span", "chip", STEPS_LABEL[r.step])); }
    li.appendChild(t); li.appendChild(el("p", "", r.text));
    if (r.auto) { li.appendChild(el("p", "why", r.note || "")); }
    var tabs = el("div", "atabs"); tabs.setAttribute("role", "tablist");
    (r.astat === "kc" ? [["kind", "문의 성격 바꾸기"]] : [["send", "자동응답 보내기"], ["write", "자동응답 쓰기"], ["kind", "문의 성격 바꾸기"]]).forEach(function (p) {
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
      (r.astat === "kc" ? [KIND_BACK].concat(KIND_BTNS) : KIND_BTNS).forEach(function (k) {
        var b = el("button", "", k === KIND_BACK ? "단순 문의로 되돌리기" : k); b.type = "button";
        if (r.astat === "kc") { var cur = window.Settle.info(r); b.setAttribute("aria-pressed", String(cur && cur.kind === k)); }
        b.addEventListener("click", function () {
          if (!window.Settle || !window.Settle.setKind) { return; }
          if (r.auto && window.Dash && window.Dash.autoUndo) { window.Dash.autoUndo(r); } // 자동응답으로 처리하기 어려운 문의는 처리를 되돌리고 담당자가 직접 다룬다
          window.Settle.setKind(r, k); r.kc = k !== KIND_BACK; r.atab = "";
          say("«" + r.text.slice(0, 16) + "…» 문의의 성격을 «" + k + "»로 바꿨어요. 담당자별 탭에서 이어서 다룰 수 있어요.");
          render();
        });
        kb.appendChild(b);
      });
      li.appendChild(kb);
    }
    return li;
  }
  // 상태 필터 (전체 / 답변 필요 / 자동응답 / 문의 성격 변경 중 하나)
  function statusBar(box, n, total) {
    box.textContent = "";
    [["all", "전체 " + total + "건"], ["need", "답변 필요 " + n.need + "건"], ["auto", "자동응답 " + n.auto + "건"], ["kc", "문의 성격 변경 " + n.kc + "건"]].forEach(function (p) {
      var b = el("button", "", p[1]); b.type = "button"; b.setAttribute("aria-pressed", String(FLT.status === p[0]));
      b.addEventListener("click", function () { FLT.status = p[0]; render(); }); box.appendChild(b);
    });
  }
  // 카테고리 필터: 칩을 눌러 체크 · 해제하고, 체크한 카테고리의 문의만 보여 준다 (null = 모두)
  var FLT = { list: null, status: "all" };
  var TABSEL = "전체"; // 답변 목록에서 보고 있는 카테고리 탭
  var EDIT_ID = null; // 고치는 중인 답변 (한 번에 하나)
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
    del.addEventListener("click", function () { ST.list = ST.list.filter(function (x) { return x !== a; }); if (EDIT_ID === a.id) { EDIT_ID = null; } changed(); });
    top.appendChild(del);
    var cl = el("button", "alink add", "닫기"); cl.type = "button"; cl.addEventListener("click", function () { EDIT_ID = null; render(); }); top.appendChild(cl);
    box.appendChild(top);
    var lk = el("label", "alab", "이런 낱말이 있으면 (쉼표로 나눠요)"), ki = el("input", "ain"); ki.type = "text"; ki.maxLength = 120; ki.value = a.keys; ki.placeholder = "예: 연말정산, 부양가족";
    ki.addEventListener("change", function () { a.keys = ki.value; changed(); }); lk.appendChild(ki); box.appendChild(lk);
    var lt = el("label", "alab", "이렇게 답해요"), ta = el("textarea", "ain"); ta.rows = 3; ta.maxLength = 400; ta.value = a.text; ta.placeholder = "문의자에게 보낼 답변 내용 (실제 이름 · 개인정보는 적지 마세요)";
    ta.addEventListener("change", function () { a.text = ta.value; changed(); }); lt.appendChild(ta); box.appendChild(lt);
    return box;
  }
  // 답변 한 문항: 이름 · 낱말 · 답변 글을 읽기 좋게 보여 주고, 문항마다 «고치기»로 그 문항만 연다
  function answerRow(a, cnt) {
    if (EDIT_ID === a.id) { return card(a, cnt); }
    var row = el("div", "asum"), top = el("div", "asum-top");
    top.appendChild(el("b", "", a.name)); top.appendChild(el("span", "acnt", (cnt[a.name] || 0) + "건 처리"));
    var ed = el("button", "alink add", "고치기"); ed.type = "button"; ed.addEventListener("click", function () { EDIT_ID = a.id; render(); });
    top.appendChild(ed); row.appendChild(top);
    row.appendChild(el("span", "ak", a.keys ? "낱말: " + a.keys : "낱말 없음"));
    row.appendChild(el("span", "at", a.text || "(답변 글이 비어 있어요)"));
    return row;
  }
  function addAnswer(cat, name) {
    ST.seq = (ST.seq || ST.list.length) + 1;
    var a = { id: "a" + ST.seq, cat: cat || COMMON, name: name || "새 답변", keys: "", text: "" };
    ST.list.push(a); TABSEL = a.cat; EDIT_ID = a.id; save(); render(); return a; // 새 답변은 바로 고칠 수 있게 열어 준다
  }
  function addCat(name) {
    name = String(name || "").trim().slice(0, 12);
    if (!name || name === COMMON || cats().indexOf(name) !== -1) { return false; }
    ST.cats.push(name); TABSEL = name; save(); render(); return true;
  }

  function render() {
    if (!$("a-list")) { return; }
    var rows = window.Dash && window.Dash.data ? window.Dash.data().rows : [];
    var cnt = {}; rows.forEach(function (r) { if (r.auto) { cnt[r.auto] = (cnt[r.auto] || 0) + 1; } });
    // 자동응답 문의: 답변 필요 / 자동응답(보낸 것) / 문의 성격 변경(단순 문의에서 다른 성격으로 바꾼 것)을 한 목록에 (카테고리 · 상태를 체크한 것만)
    var all = [];
    rows.forEach(function (r) {
      var inf = window.Settle && window.Settle.info ? window.Settle.info(r) : null;
      if (r.auto) { r.astat = "auto"; all.push(r); }
      else if (r.kc && inf && inf.kind !== "단순 문의") { r.astat = "kc"; all.push(r); }
      else if (inf && inf.kind === "단순 문의" && (r.step < 3 || !match(r.text, r.cat))) { r.astat = "need"; all.push(r); }
    });
    var ORDER = { need: 0, auto: 1, kc: 2 };
    all.sort(function (x, y) {
      if (x.astat !== y.astat) { return ORDER[x.astat] - ORDER[y.astat]; }
      if (x.astat === "need") { return (x.step === 3) - (y.step === 3); }
      return (y.stamps[3] || "") < (x.stamps[3] || "") ? -1 : 1;
    });
    var n = { need: 0, auto: 0, kc: 0 }; all.forEach(function (r) { n[r.astat]++; });
    $("a-count").textContent = "답변 필요 " + n.need + "건 / 자동응답 " + n.auto + "건 / 문의 성격 변경 " + n.kc + "건";
    statusBar($("a-stat-f"), n, all.length);
    var byStat = all.filter(function (r) { return FLT.status === "all" || FLT.status === r.astat; });
    filterBar($("a-done-f"), "list", byStat);
    var shown = byStat.filter(function (r) { return pass("list", r); });
    var ul = $("a-done"); ul.textContent = "";
    if (!all.length) { ul.appendChild(el("li", "empty", "아직 자동응답 문의가 없어요. 문의 성격이 «단순 문의»인 문의가 생기면 여기에 나와요.")); }
    else if (!shown.length) { ul.appendChild(el("li", "empty", "체크한 조건의 문의가 없어요.")); }
    shown.slice(0, 20).forEach(function (r) { ul.appendChild(item(r)); });
    if (shown.length > 20) { ul.appendChild(el("li", "empty", "나머지 " + (shown.length - 20) + "건은 위의 체크로 좁혀서 보세요.")); }
    // 답변 목록: 카테고리 탭을 누르면 그 카테고리에 어떤 자동응답 답변이 있는지 보여 준다
    var box = $("a-list"); box.textContent = "";
    var all = cats().concat([COMMON]);
    if (TABSEL !== "전체" && all.indexOf(TABSEL) === -1) { TABSEL = "전체"; } // 지운 카테고리를 보고 있었다면 전체로
    var bar = el("div", "afbar"); bar.setAttribute("role", "tablist");
    [["전체", ST.list.length]].concat(all.map(function (c) { return [c, ST.list.filter(function (a) { return (a.cat || COMMON) === c; }).length]; })).forEach(function (p) {
      var b = el("button", "", p[0] + " " + p[1]); b.type = "button"; b.setAttribute("role", "tab"); b.setAttribute("aria-pressed", String(TABSEL === p[0]));
      b.addEventListener("click", function () { TABSEL = p[0]; render(); }); bar.appendChild(b);
    });
    box.appendChild(bar);
    if (TABSEL === "전체") {
      // 한눈에: 카테고리마다 어떤 답변이 있는지 (고치려면 카테고리 탭을 눌러요)
      all.forEach(function (c) {
        var mine = ST.list.filter(function (a) { return (a.cat || COMMON) === c; });
        if (!mine.length) { return; }
        var grp = el("div", "agrp"), head = el("div", "agh");
        head.appendChild(el("b", "", c)); head.appendChild(el("span", "agn", mine.length + "개"));
        grp.appendChild(head);
        mine.forEach(function (a) { grp.appendChild(answerRow(a, cnt)); });
        box.appendChild(grp);
      });
      if (!ST.list.length) { box.appendChild(el("p", "fine", "등록된 답변이 없어요. 카테고리 탭에서 «+ 답변 추가»로 만들어 보세요.")); }
    } else {
      var c = TABSEL, mine2 = ST.list.filter(function (a) { return (a.cat || COMMON) === c; });
      var grp2 = el("div", "agrp"), head2 = el("div", "agh");
      head2.appendChild(el("b", "", c + " 자동응답 답변")); head2.appendChild(el("span", "agn", mine2.length + "개"));
      var add = el("button", "alink add", "+ 답변 추가"); add.type = "button"; add.addEventListener("click", function () { addAnswer(c); });
      head2.appendChild(add);
      if (siteCats().indexOf(c) === -1 && c !== COMMON) {
        var dc = el("button", "alink", "카테고리 지우기"); dc.type = "button"; dc.title = "이 카테고리의 답변은 «공통»으로 옮겨요";
        dc.addEventListener("click", function () { ST.cats = ST.cats.filter(function (x) { return x !== c; }); ST.list.forEach(function (x) { if (x.cat === c) { x.cat = COMMON; } }); changed(); });
        head2.appendChild(dc);
      }
      grp2.appendChild(head2);
      if (!mine2.length) { grp2.appendChild(el("p", "fine", "이 카테고리에는 등록된 답변이 없어요. «+ 답변 추가»로 만들어 보세요.")); }
      mine2.forEach(function (a) { grp2.appendChild(answerRow(a, cnt)); });
      box.appendChild(grp2);
    }
  }

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
  window.Auto = { match: match, render: render };
})();
