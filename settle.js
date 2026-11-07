// 운영 결산 탭: 대시보드와 같은 자료(이 브라우저 화면에만 있는 결과)를 연도별로 세어서 팀별 · 팀원별 달성도를 본다.
// 총괄자가 적은 값(문의 성격 · 귀책 · 목표값 등)은 이 브라우저(localStorage)에만 저장하고 서버로 보내지 않는다.
(function () {

/* ---------- 고른 해의 자료 (운영 현황 자료에서 세요) ---------- */
var MONTHS = {}, CATS = {}, OWNERS = [], ITEMS = [], YD = null, YEAR = 0, DASH = null;
var UNASSIGNED = "담당자 미지정";
var KINDS = ["확인 전", "단순 문의", "업무 오류", "응대 문제", "제도·시스템·외부", "현업 팀장·팀원"];
var KMAP = {"단순 문의":0, "업무 오류":1, "응대 문제":2, "제도·시스템·외부":3, "확인 전":4, "현업 팀장·팀원":5};
var FAULT_KINDS = {"업무 오류":1, "응대 문제":1};

/* 점수 규칙: 구간마다 배점에 곱하는 비율 */
var IND = [
  {k:"rate", area:"처리 성과", name:"처리율", how:"처리 완료 ÷ 접수", w:15, scored:true, bands:"90% 이상 ×1 · 80% 이상 ×0.8 · 70% 이상 ×0.6 · 그 미만 ×0.4", f:function (v) { return v >= 90 ? 1 : v >= 80 ? 0.8 : v >= 70 ? 0.6 : 0.4; }},
  {k:"days", area:"", name:"처리까지 평균 일수", how:"완료일 − 접수일", w:15, scored:true, bands:"6일 이하 ×1 · 8일 이하 ×0.8 · 10일 이하 ×0.5 · 그 초과 ×0.25", f:function (v) { return v <= 6 ? 1 : v <= 8 ? 0.8 : v <= 10 ? 0.5 : 0.25; }},
  {k:"over", area:"", name:"기한 넘김", how:"긴급 높음 중 3일 넘게 미처리 (귀책 아님으로 뺀 건수 반영)", w:10, scored:true, bands:"0건 ×1 · 1건 ×0.7 · 2건 ×0.4 · 3건 이상 ×0", f:function (v) { return v === 0 ? 1 : v === 1 ? 0.7 : v === 2 ? 0.4 : 0; }},
  {k:"mist", area:"응대 품질", name:"귀책 확정 문의 (업무 오류 · 응대 문제)", how:"확정된 귀책 건수(중대성 가중) ÷ max(접수, 20)", w:25, scored:true, bands:"0% ×1 · 3% 이하 ×0.8 · 6% 이하 ×0.56 · 10% 이하 ×0.32 · 그 초과 ×0", f:function (v) { return v === 0 ? 1 : v <= 3 ? 0.8 : v <= 6 ? 0.56 : v <= 10 ? 0.32 : 0; }},
  {k:"re", area:"", name:"같은 건 재문의율", how:"같은 건으로 다시 접수된 비율", w:15, scored:false, bands:"3% 이하 ×1 · 6% 이하 ×0.75 · 10% 이하 ×0.5 · 그 초과 ×0.2", f:null},
  {k:"memo", area:"협업 · 기록", name:"처리 메모 작성률", how:"처리 완료 건 중 메모가 있는 비율", w:10, scored:false, bands:"90% 이상 ×1 · 70% 이상 ×0.7 · 그 미만 ×0.3", f:null},
  {k:"idea", area:"", name:"반복 이슈 개선 제안", how:"연중 제안한 건수", w:10, scored:false, bands:"3건 이상 ×1 · 2건 ×0.7 · 1건 ×0.4 · 없음 ×0", f:null}
];
/* 운영 점검 지표: 실적 (고정) + 목표 (수기) */
var TGT = [
  {k:"t1", name:"처리율 (처리 완료 ÷ 접수)", actual:null, unit:"%", def:90, higher:true, near:10},
  {k:"t2", name:"긴급 높음 처리율", actual:null, unit:"%", def:90, higher:true, near:10},
  {k:"t3", name:"처리까지 평균 일수", actual:null, unit:"일", def:5, higher:false, nearRatio:1.2},
  {k:"t4", name:"기한 넘김 (긴급 높음)", actual:null, unit:"건", def:0, higher:false, nearAdd:1}
];
/* 내년에 볼 것 · 보고서 문구는 숫자에서 뽑아 만든 글이에요 (직접 고칠 수 있어요) */
function josa(w, a, b) { var c = w.charCodeAt(w.length - 1); return (c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 !== 0) ? a : b; }
function nextDef() {
  var out = [], top = null;
  Object.keys(CATS).forEach(function (k) { if (CATS[k][1] > 0 && (!top || CATS[k][1] > CATS[top][1])) top = k; });
  if (top) { out.push({ long: top + " 칸의 긴급 높음이 " + CATS[top][1] + "건으로 가장 많아요. 원인과 미리 막을 방법을 먼저 살펴보세요.", short: top + " 긴급 높음 점검" }); }
  var ov = Object.keys(CATS).filter(function (k) { return CATS[k][3] > 0; }).map(function (k) { return k + " " + CATS[k][3] + "건"; });
  if (YD.over > 0) { out.push({ long: "기한을 넘겨 처리되지 않은 긴급 높음이 " + YD.over + "건이에요(" + ov.join(", ") + "). 접수에서 담당자 배정까지 걸리는 시간을 점검하세요.", short: "기한 넘김 점검" }); }
  else { out.push({ long: "기한을 넘긴 긴급 높음 건이 없어요. 지금의 처리 흐름을 유지하세요.", short: "처리 흐름 유지" }); }
  var o = YD.open;
  if (o[0] + o[1] + o[2] > 0) { out.push({ long: "처리되지 않은 의견이 " + (o[0] + o[1] + o[2]) + "건이에요(접수 " + o[0] + " · 담당자 배정 " + o[1] + " · 처리 중 " + o[2] + "). 배정 뒤에 멈춘 건을 정기적으로 확인하세요.", short: "배정 뒤 멈춘 건 확인" }); }
  else { out.push({ long: "처리되지 않은 의견이 없어요.", short: "미처리 없음" }); }
  return out;
}
function reportDef() {
  var L = [], y = YD, pr = y.total ? pct(y.done, y.total) : 0, cats = Object.keys(CATS).sort(function (a, b) { return CATS[b][0] - CATS[a][0]; });
  L.push("[" + YEAR + "년 사내 의견함 결산 (" + y.m1 + "~" + y.m2 + "월)]");
  L.push("- 접수 " + y.total + "건, 처리 완료 " + y.done + "건(" + pr + "%)." + (y.avg === null ? "" : " 처리까지 평균 " + y.avg.toFixed(1) + "일이 걸렸어요."));
  L.push("- 긴급 높음 " + y.hi + "건 중 " + y.hiDone + "건(" + (y.hi ? pct(y.hiDone, y.hi) : 0) + "%)을 처리했고, 접수 후 " + y.od + "일을 넘겨 처리되지 않은 건이 " + y.over + "건 남아 있어요.");
  if (y.h1 + y.h2 > 0 && y.h1 > 0 && y.h2 > 0) {
    var w1 = y.h2 > y.h1 ? "늘었어요" : y.h2 < y.h1 ? "줄었어요" : "같아요", w2 = y.hi2 > y.hi1 ? "늘었어요" : y.hi2 < y.hi1 ? "줄었어요" : "같아요";
    L.push("- 상반기 " + y.h1 + "건, 하반기 " + y.h2 + "건이에요(" + w1 + "). 긴급 높음은 " + y.hi1 + "건에서 " + y.hi2 + "건으로 " + w2 + ".");
  }
  if (cats.length) {
    L.push("- 칸별로는 " + cats.slice(0, 3).map(function (k) { return k + " " + CATS[k][0] + "건"; }).join(", ") + " 순이에요.");
    var t = null; cats.forEach(function (k) { if (CATS[k][1] > 0 && (!t || CATS[k][1] > CATS[t][1])) t = k; });
    if (t) { L[L.length - 1] += " " + t + josa(t, "은", "는") + " " + CATS[t][0] + "건 중 " + CATS[t][1] + "건이 긴급 높음이에요."; }
  }
  var o = y.open, u = o[0] + o[1] + o[2];
  L.push("- 처리되지 않은 의견은 " + u + "건(접수 " + o[0] + " · 담당자 배정 " + o[1] + " · 처리 중 " + o[2] + ")이에요.");
  L.push("- 내년에 볼 것: " + nextDef().map(function (x) { return x.short; }).join(", "));
  L.push("※ 분류는 AI의 추정이며, 사람이 확인한 뒤 보고에 사용해 주세요.");
  return L.join("\n");
}

/* ---------- 입력 상태 (이 브라우저에만 저장, 서버로 보내지 않아요) ---------- */
var KEY = "settle-v1";
function defaults() {
  var w = {}; IND.forEach(function (i) { w[i.k] = i.w; });
  var t = {}; TGT.forEach(function (x) { t[x.k] = x.def; });
  return { chief: "", items: {}, targets: t, weights: w, cut: [90, 75, 60], sevw: { "상": 2, "중": 1, "하": 0.5 }, adj: {}, nextBy: {}, reportBy: {} };
}
var ST = defaults();
(function () {
  try {
    var s = JSON.parse(localStorage.getItem(KEY) || "null");
    if (s && typeof s === "object") { Object.keys(ST).forEach(function (k) { if (s[k] !== undefined) ST[k] = s[k]; }); }
  } catch (e) { /* 저장된 값이 없어도 동작해요 */ }
})();
function save() { try { localStorage.setItem(KEY, JSON.stringify(ST)); } catch (e) { /* 저장이 막혀도 동작해요 */ } }
function adjKey(n) { return YEAR + "|" + n; }

function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function $(id) { return document.getElementById("s-" + id); }
function pct(a, b) { return Math.round(a / b * 100); }
function num(v, d) { var n = parseFloat(v); return isNaN(n) ? d : n; }
function today() { var n = new Date(); return n.getFullYear() + "-" + ("0" + (n.getMonth() + 1)).slice(-2) + "-" + ("0" + n.getDate()).slice(-2); }
function gradeOf(s) { var c = ST.cut; return s >= c[0] ? ["우수", "g1"] : s >= c[1] ? ["양호", "g2"] : s >= c[2] ? ["보통", "g3"] : ["면담 필요", "g4"]; }

/* ---------- 파생 값 계산: 확정한 문의가 담당자별 값에 더해져요 ---------- */
function kindOf(it) { var c = ST.items[it.id]; return c ? c.kind : it.base; }
function faultOf(it) { var c = ST.items[it.id]; if (c) { return c.fault || ""; } return FAULT_KINDS[it.base] ? it.owner : ""; }
var SEVS = ["상", "중", "하"];
function sevOf(it) {
  var c = ST.items[it.id]; if (c && c.sev) return c.sev;
  return /입금|지급|끊|정산|수당|성과급|식대|인센티브/.test(it.text) ? "상" : "중";
}
var DONES = ["완전 해결", "일부 해결", "미해결"];
function doneOf(it) {
  var c = ST.items[it.id]; if (c && c.done) return c.done;
  return /답이 없|입금되지 않/.test(it.text) ? "미해결" : /처리 중|한 달째/.test(it.text) ? "일부 해결" : "완전 해결";
}
function incOf(it) { var c = ST.items[it.id]; return !(c && c.exc); }
function editItem(it, fn) {
  var c = ST.items[it.id];
  if (!c) { c = { kind: kindOf(it), fault: faultOf(it), memo: "", by: "", at: today() }; ST.items[it.id] = c; }
  fn(c); save(); refreshAll();
}
function compute() {
  var rows = OWNERS.map(function (o) {
    return { n: o.n, cats: o.cats, total: o.total, done: o.done, avg: o.avg, overRaw: o.over, mix: [0, 0, 0, 0, 0, 0], fault: 0, faultN: 0, excl: 0, sev: { "상": 0, "중": 0, "하": 0 } };
  });
  var by = {}; rows.forEach(function (r) { by[r.n] = r; });
  var confirmed = 0;
  ITEMS.forEach(function (it) {
    var k = kindOf(it), r = by[it.owner]; if (!r) return; r.mix[KMAP[k]]++;
    if (k !== "확인 전") confirmed++;
    if (FAULT_KINDS[k]) { var f = by[faultOf(it)] || r, sv = sevOf(it); if (incOf(it)) { f.fault += num(ST.sevw[sv], 1); f.faultN++; f.sev[sv]++; } else { f.excl++; } }
  });
  rows.forEach(function (r) {
    var adj = ST.adj[adjKey(r.n)] || { ex: 0, memo: "" };
    r.ex = Math.min(r.overRaw, Math.max(0, num(adj.ex, 0)));
    r.over = r.overRaw - r.ex; r.memo = adj.memo || "";
    r.rate = pct(r.done, r.total); r.ratio = r.fault / Math.max(r.total, 20) * 100;
    r.pts = {
      rate: Math.round(ST.weights.rate * IND[0].f(r.rate)), days: r.avg === null ? 0 : Math.round(ST.weights.days * IND[1].f(r.avg)),
      over: Math.round(ST.weights.over * IND[2].f(r.over)), mist: Math.round(ST.weights.mist * IND[3].f(r.ratio))
    };
    r.sum = r.pts.rate + r.pts.days + r.pts.over + r.pts.mist;
    r.scoredW = ST.weights.rate + (r.avg === null ? 0 : ST.weights.days) + ST.weights.over + ST.weights.mist;
    r.conv = r.scoredW ? Math.round(r.sum / r.scoredW * 100) : 0;
    r.hold = r.total < 10;
  });
  return { rows: rows, confirmed: confirmed };
}

/* ---------- 그리기 ---------- */
function tile(big, small, label, hot) {
  var t = el("div", "tile" + (hot ? " hot" : "")), b = el("b", "", big); if (small) { b.appendChild(el("small", "", small)); }
  t.appendChild(b); t.appendChild(el("span", "", label)); return t;
}
function drawStatic() {
  var y = YD;
  $("sumsub").textContent = YEAR + "년 " + y.m1 + "월 ~ " + y.m2 + "월";
  var tl = $("sumtiles"); tl.textContent = "";
  tl.appendChild(tile(String(y.total), "", "접수"));
  tl.appendChild(tile(String(y.done), " / " + y.total, "처리 완료 (" + (y.total ? pct(y.done, y.total) : 0) + "%)"));
  tl.appendChild(tile(String(y.hi), "", "긴급 높음 (처리 완료 " + y.hiDone + " · " + (y.hi ? pct(y.hiDone, y.hi) : 0) + "%)", true));
  tl.appendChild(tile(String(y.over), "", "기한 넘김", true));
  tl.appendChild(tile(y.avg === null ? "-" : y.avg.toFixed(1), y.avg === null ? "" : "일", "처리까지 평균"));
  $("sumline").textContent = (y.h1 > 0 && y.h2 > 0)
    ? "상반기 " + y.h1 + "건에서 하반기 " + y.h2 + "건으로 " + (y.h2 > y.h1 ? "늘었고" : y.h2 < y.h1 ? "줄었고" : "같고") + ", 긴급 높음은 " + y.hi1 + "건에서 " + y.hi2 + "건으로 " + (y.hi2 > y.hi1 ? "늘었어요." : y.hi2 < y.hi1 ? "줄었어요." : "같아요.")
    : "한쪽 반기에만 자료가 있어서 상반기 · 하반기 비교는 하지 않아요.";
  var box = $("trend"), max = 0, peak = 0; box.textContent = "";
  for (var m = 1; m <= 12; m++) { var t = MONTHS[m][0] + MONTHS[m][1] + MONTHS[m][2]; if (t > max) { max = t; peak = m; } }
  $("monsub").textContent = max ? "가장 많은 달 " + peak + "월 " + max + "건" : "접수 없음";
  for (var m2 = 1; m2 <= 12; m2++) {
    var v = MONTHS[m2], tot = v[0] + v[1] + v[2], col = el("div", "tcol" + (m2 === peak && max ? " peak" : ""));
    col.appendChild(el("span", "tnum", tot ? String(tot) : ""));
    var bar = el("span", "tbar"); bar.style.height = (tot ? Math.max(6, tot / max * 120) : 3) + "px";
    [["h", v[0]], ["m", v[1]], ["l", v[2]]].forEach(function (p) { if (!p[1]) return; var i = el("i", p[0]); i.style.height = (p[1] / tot * 100) + "%"; bar.appendChild(i); });
    col.appendChild(bar); col.appendChild(el("span", "tmo", m2 + "월")); box.appendChild(col);
  }
  var cb = $("cats"); cb.textContent = "";
  var maxHi = 1; Object.keys(CATS).forEach(function (k) { if (CATS[k][1] > maxHi) maxHi = CATS[k][1]; });
  Object.keys(CATS).sort(function (a, b) { return CATS[b][1] - CATS[a][1] || CATS[b][0] - CATS[a][0]; }).forEach(function (k) {
    var c = CATS[k], tr = el("tr");
    tr.appendChild(el("td", "nm", k)); tr.appendChild(el("td", "n", String(c[0])));
    var td = el("td"), mini = el("div", "mini"), bar2 = el("div", "bar"), f = el("i"); f.style.width = (c[1] / maxHi * 100) + "%"; bar2.appendChild(f);
    mini.appendChild(bar2); mini.appendChild(el("span", "", String(c[1]))); td.appendChild(mini); tr.appendChild(td);
    tr.appendChild(el("td", "n", c[0] ? pct(c[2], c[0]) + "%" : "-")); tr.appendChild(el("td", "n", c[3] ? c[3] + "건" : "-"));
    cb.appendChild(tr);
  });
}

/* 운영 점검표: 목표 입력 칸은 한 번만 만들고, 판정만 바꿔요 */
var judgeCells = {};
function judge(x) {
  var tg = num(ST.targets[x.k], x.def), a = x.actual, ok, near;
  if (a === null) { return ["자료 없음", "na"]; }
  if (x.higher) { ok = a >= tg; near = a >= tg - x.near; }
  else if (x.nearRatio) { ok = a <= tg; near = a <= tg * x.nearRatio; }
  else { ok = a <= tg; near = a <= tg + x.nearAdd; }
  return ok ? ["달성", "ok"] : near ? ["주의", "warn"] : ["미달", "bad"];
}
function buildTargets() {
  var b = $("targets"); b.textContent = ""; judgeCells = {};
  TGT.forEach(function (x) {
    var tr = el("tr"); tr.appendChild(el("td", "", x.name)); tr.appendChild(el("td", "n", x.actual === null ? "-" : x.actual + x.unit));
    var td = el("td", "n"), inp = el("input", "in num"); inp.type = "number"; inp.step = "any"; inp.value = ST.targets[x.k];
    inp.setAttribute("aria-label", x.name + " 목표");
    inp.addEventListener("input", function () { ST.targets[x.k] = inp.value === "" ? x.def : num(inp.value, x.def); save(); refreshJudge(); });
    td.appendChild(inp); td.appendChild(document.createTextNode(" " + x.unit)); tr.appendChild(td);
    var jc = el("td"); tr.appendChild(jc); judgeCells[x.k] = jc; b.appendChild(tr);
  });
  var tr2 = el("tr"); tr2.appendChild(el("td", "", "사람이 고친 AI 분류")); tr2.appendChild(el("td", "n", YD.edited ? YD.edited + "건" : "아직 없음")); tr2.appendChild(el("td", "n", "-"));
  var c2 = el("td"); c2.appendChild(el("span", "chip na", "참고")); tr2.appendChild(c2); b.appendChild(tr2);
  refreshJudge();
}
function refreshJudge() {
  TGT.forEach(function (x) { var j = judge(x), c = judgeCells[x.k]; c.textContent = ""; c.appendChild(el("span", "chip " + j[1], j[0])); });
}

/* 문의 성격: 탭 → (확인 전은 담당자별 표 → 확정 · 수정 탭) */
var TAB = "", PICK = "", SUB = "확정";
var KCLS = {"단순 문의": "s", "업무 오류": "e", "응대 문제": "r", "제도·시스템·외부": "y", "현업 팀장·팀원": "f", "확인 전": "u"};
var KDEF = {"확인 전": "아직 정하지 않은 건. 평가에 쓰지 않아요.", "단순 문의": "제도 · 절차를 몰라서 묻거나 요청한 건. 귀책이 없어요.",
  "업무 오류": "인사 담당자의 실수로 생긴 문의. 급여 오지급 · 누락, 계정 · 사원증 미발급, 계산 기준 오류, 잘못 보낸 안내 같은 것이에요. 누가 그 업무를 했는지 정해요.",
  "응대 문제": "답이 늦거나 없음, 잘못된 안내로 다시 묻게 된 건.",
  "제도·시스템·외부": "규정 · 사내 시설 · 전산 · 외부 기관처럼 사람의 실수가 아닌 요인. 담당자 점수에서 빼요.",
  "현업 팀장·팀원": "현업 팀장 · 팀원의 행동이나 실수에서 생긴 문의(괴롭힘 · 면담 안 함 · 승인 지연 같은 것). 인사 담당자 점수에서 빼고, 해당 부서에 전달해요."};
function showErr(err, msg) { err.textContent = msg; err.hidden = false; }

/* 문의 한 건 카드. open이면 입력 칸이 바로 열려 있고, 아니면 «수정»을 눌러 열어요 */
function card(it, open) {
  var kind = kindOf(it), c = ST.items[it.id];
  var li = el("li", "it" + (kind !== "확인 전" ? " done" : "")), t = el("div", "t");
  t.appendChild(el("span", "chip warn", it.cat)); t.appendChild(el("span", "chip na", "칸 담당 " + it.owner));
  if (kind === "확인 전" && it.cand) t.appendChild(el("span", "chip blue", it.cand));
  t.appendChild(el("span", kind === "확인 전" ? "chip na" : "chip ok", kind === "확인 전" ? "확인 전" : "확정 · " + kind));
  li.appendChild(t); li.appendChild(el("p", "s", it.d + " · " + it.text));
  if (kind !== "확인 전") {
    var who = c && c.by ? c.by + " 총괄자가 " + c.at + "에 " + (c.edited ? "수정" : "확정") + "했어요." : "처음 값(예시)이에요.";
    var f0 = faultOf(it); li.appendChild(el("p", "okline", who + (f0 ? " 귀책: " + f0 + " · 중대성: " + sevOf(it) : "") + (c && c.memo ? " · 메모: " + c.memo : "")));
  }
  var frm = el("div", "frm"); frm.hidden = !open;
  var l1 = el("label", "", "문의 성격"), sk = el("select", "in"); KINDS.forEach(function (k) { var o = el("option", "", k); o.value = k; sk.appendChild(o); }); sk.value = kind; l1.appendChild(sk);
  var l2 = el("label", "", "귀책 담당자 (업무 오류 · 응대 문제)"), sf = el("select", "in");
  var o0 = el("option", "", "선택"); o0.value = ""; sf.appendChild(o0);
  OWNERS.forEach(function (o) { var op = el("option", "", o.n); op.value = o.n; sf.appendChild(op); }); sf.value = faultOf(it); l2.appendChild(sf);
  var l3 = el("label", "memo", "근거 메모 (무엇을 보고 정했는지)"), mi = el("input", "in"); mi.type = "text"; mi.maxLength = 120; mi.value = c ? c.memo || "" : ""; mi.placeholder = "예: 급여 대장을 확인했고 계산 입력 실수로 확인됨"; l3.appendChild(mi);
  var l2b = el("label", "", "귀책 중대성 (상 · 중 · 하)"), ss = el("select", "in");
  SEVS.forEach(function (v) { var op = el("option", "", v); op.value = v; ss.appendChild(op); }); ss.value = sevOf(it); l2b.appendChild(ss);
  frm.appendChild(l1); frm.appendChild(l2); frm.appendChild(l2b); frm.appendChild(l3); li.appendChild(frm);
  var err = el("p", "err"); err.hidden = true; li.appendChild(err);
  var btns = el("div", "btns"), cf = el("button", "btn sm fill", kind === "확인 전" ? "확정" : "수정 저장"), rv = el("button", "btn sm", "확인 전으로 되돌리기"), ed = el("button", "btn sm", "수정");
  cf.type = "button"; rv.type = "button"; ed.type = "button"; cf.hidden = !open; rv.hidden = !open || kind === "확인 전"; ed.hidden = open;
  btns.appendChild(ed); btns.appendChild(cf); btns.appendChild(rv); li.appendChild(btns);
  function syncFault() { var need = !!FAULT_KINDS[sk.value]; sf.disabled = !need; ss.disabled = !need; if (need && !sf.value) sf.value = it.owner; if (!need) sf.value = ""; }
  syncFault();
  sk.addEventListener("change", function () { syncFault(); err.hidden = true; });
  ed.addEventListener("click", function () { frm.hidden = false; cf.hidden = false; rv.hidden = kind === "확인 전"; ed.hidden = true; });
  cf.addEventListener("click", function () {
    var k = sk.value, fault = sf.value, memo = mi.value.trim();
    if (k === "확인 전") { return showErr(err, "문의 성격을 골라 주세요. 되돌리려면 «확인 전으로 되돌리기»를 눌러요."); }
    if (!ST.chief.trim()) { return showErr(err, "«확정하는 사람(총괄자)» 이름을 먼저 입력해 주세요. 확정한 사람으로 기록돼요."); }
    if (FAULT_KINDS[k]) {
      if (!fault) { return showErr(err, "귀책 담당자를 골라 주세요."); }
      if (!memo) { return showErr(err, "업무 오류 · 응대 문제는 근거 메모를 적어야 저장할 수 있어요."); }
    }
    ST.items[it.id] = { kind: k, fault: fault, sev: FAULT_KINDS[k] ? ss.value : "", memo: memo, by: ST.chief.trim(), at: today(), edited: kind !== "확인 전" }; save(); refreshAll();
  });
  rv.addEventListener("click", function () {
    if (it.base === "확인 전") { delete ST.items[it.id]; } else { ST.items[it.id] = { kind: "확인 전", fault: "", memo: "", by: ST.chief.trim(), at: today() }; }
    save(); refreshAll();
  });
  return li;
}

function renderItems() {
  var cnt = {}; KINDS.forEach(function (k) { cnt[k] = 0; }); ITEMS.forEach(function (it) { cnt[kindOf(it)]++; });
  $("it-sub").textContent = "확인 전 " + cnt["확인 전"] + "건 · 확정 " + (ITEMS.length - cnt["확인 전"]) + "건";
  var kt = $("ktabs"); kt.textContent = "";
  KINDS.forEach(function (k) {
    var b = el("button", "", k + " " + cnt[k]); b.type = "button"; b.setAttribute("aria-pressed", String(TAB === k));
    var dot = el("i", "dot k-" + KCLS[k]); b.insertBefore(dot, b.firstChild);
    b.addEventListener("click", function () { TAB = TAB === k ? "" : k; PICK = ""; renderItems(); });
    kt.appendChild(b);
  });
  $("kbody").hidden = !TAB;
  if (!TAB) return;
  $("kdef").textContent = TAB + ": " + KDEF[TAB];
  var isPend = TAB === "확인 전";
  $("kpend").hidden = !isPend; $("klist").hidden = isPend;
  if (isPend) { $("ct").textContent = "「확인 전」인 건: " + cnt["확인 전"] + "건"; renderPending(); renderOwnerPanel(); }
  else {
    var ul = $("kitems"); ul.textContent = "";
    var list = ITEMS.filter(function (it) { return kindOf(it) === TAB; });
    if (!list.length) { ul.appendChild(el("li", "note", "해당하는 문의가 없어요.")); }
    list.forEach(function (it) { ul.appendChild(card(it, false)); });
  }
}
/* 확인 전 요약표: 담당자마다 남은 건을 한 줄로 */
function renderPending() {
  var body = $("pend"); body.textContent = "";
  OWNERS.forEach(function (o) {
    var list = ITEMS.filter(function (it) { return it.owner === o.n && kindOf(it) === "확인 전"; });
    var tr = el("tr"); tr.appendChild(el("td", "nm", o.n)); tr.appendChild(el("td", "n", String(list.length)));
    var td = el("td");
    if (!list.length) { td.appendChild(el("span", "chip ok", "모두 확정")); }
    else {
      if (list.length > 4) {
        var cc = {}, order = []; list.forEach(function (i) { var c = i.cand || "후보 없음"; if (!cc[c]) { cc[c] = 0; order.push(c); } cc[c]++; });
        order.forEach(function (c, q) { if (q) { td.appendChild(document.createTextNode(" · ")); } if (c === "후보 없음") { td.appendChild(document.createTextNode(c + " " + cc[c])); } else { td.appendChild(el("b", "", c + " " + cc[c])); } });
        list = [];
      }
      var same = list.length >= 2 && list[0].cand !== "후보 없음" && list.every(function (i) { return i.cand === list[0].cand; });
      if (same) {
        td.appendChild(el("b", "", list.map(function (i) { return i.sum; }).join(", ") + " (" + (list.length === 2 ? "둘 다 " : "모두 ") + list[0].cand + ")"));
      } else {
        list.forEach(function (i, k) {
          if (k) { td.appendChild(document.createTextNode(", ")); }
          if (i.cand === "후보 없음") { td.appendChild(document.createTextNode(i.sum)); }
          else { td.appendChild(el("b", "", i.sum + "(" + (i.tag || i.cand) + ")")); }
        });
      }
    }
    tr.appendChild(td);
    var act = el("td"), btn = el("button", "btn sm" + (PICK === o.n ? " fill" : ""), PICK === o.n ? "닫기" : "확정하기"); btn.type = "button";
    btn.addEventListener("click", function () { PICK = PICK === o.n ? "" : o.n; SUB = list.length ? "확정" : "수정"; renderItems(); });
    act.appendChild(btn); tr.appendChild(act); body.appendChild(tr);
  });
}
/* «확정하기»를 누른 담당자: 확정 탭(확인 전 건) · 수정 탭(이미 정해진 건) */
function renderOwnerPanel() {
  $("opanel").hidden = !PICK; if (!PICK) return;
  var mine = ITEMS.filter(function (it) { return it.owner === PICK; });
  var pend = mine.filter(function (it) { return kindOf(it) === "확인 전"; }), done = mine.filter(function (it) { return kindOf(it) !== "확인 전"; });
  $("pick-h").textContent = PICK + " 님의 문의 " + mine.length + "건";
  var st = $("subtabs"); st.textContent = "";
  [["확정", pend.length], ["수정", done.length]].forEach(function (p) {
    var b = el("button", "", p[0] + " " + p[1]); b.type = "button"; b.setAttribute("aria-pressed", String(SUB === p[0]));
    b.addEventListener("click", function () { SUB = p[0]; renderItems(); });
    st.appendChild(b);
  });
  $("subnote").textContent = SUB === "확정" ? "확인 전인 문장이에요. 성격을 골라 확정해요." : "이미 정해진 문장이에요(처음 값 포함). «수정»을 눌러 성격 · 귀책 · 메모를 고쳐요.";
  var ul = $("oitems"); ul.textContent = "";
  var list = SUB === "확정" ? pend : done;
  if (!list.length) { ul.appendChild(el("li", "note", SUB === "확정" ? "확인 전인 건을 모두 확정했어요." : "정해진 건이 없어요.")); }
  list.forEach(function (it) { ul.appendChild(card(it, SUB === "확정")); });
}

/* 담당자별 현황 + 귀책 여부 확정 + 점수 */
function buildAdj() {
  var b = $("adj"); b.textContent = "";
  OWNERS.forEach(function (o) {
    var a = ST.adj[adjKey(o.n)] || (ST.adj[adjKey(o.n)] = { ex: 0, memo: "" });
    var tr = el("tr"); tr.appendChild(el("td", "nm", o.n));
    var td = el("td"), n = el("input", "in num"); n.type = "number"; n.min = "0"; n.max = String(o.over); n.value = a.ex; n.setAttribute("aria-label", o.n + " 기한 넘김 중 귀책 아님 건수");
    n.addEventListener("input", function () { a.ex = num(n.value, 0); save(); refreshAll(); });
    td.appendChild(n); td.appendChild(document.createTextNode(" 건 (기한 넘김 " + o.over + "건 중)")); tr.appendChild(td);
    var tm = el("td"), m = el("input", "in wide"); m.type = "text"; m.maxLength = 100; m.value = a.memo || ""; m.placeholder = "예: 평가 시스템 오류라서 귀책 아님";
    m.setAttribute("aria-label", o.n + " 귀책 판단 근거");
    m.addEventListener("input", function () { a.memo = m.value; save(); refreshScores(); });
    tm.appendChild(m); tr.appendChild(tm); b.appendChild(tr);
  });
}
function refreshOwners(data) {
  var b = $("owners"); b.textContent = "";
  data.rows.forEach(function (r) {
    var tr = el("tr");
    tr.appendChild(el("td", "nm", r.n)); tr.appendChild(el("td", "sm", r.cats)); tr.appendChild(el("td", "n", String(r.total)));
    tr.appendChild(el("td", "n", r.rate + "%")); tr.appendChild(el("td", "n", r.avg === null ? "-" : r.avg + "일")); tr.appendChild(el("td", "n", r.over ? r.over + "건" : "-"));
    var td = el("td"), mix = el("div", "mix");
    [["s", r.mix[0]], ["e", r.mix[1]], ["r", r.mix[2]], ["y", r.mix[3]], ["f", r.mix[5]], ["u", r.mix[4]]].forEach(function (p) { if (!p[1]) return; var i = el("i", p[0]); i.style.width = (p[1] / r.total * 100) + "%"; mix.appendChild(i); });
    td.appendChild(mix); td.appendChild(el("div", "mixn", "단순 " + r.mix[0] + " · 업무 오류 " + r.mix[1] + " · 응대 " + r.mix[2] + " · 제도·외부 " + r.mix[3] + " · 현업 " + r.mix[5] + " · 확인 전 " + r.mix[4]));
    tr.appendChild(td); var tf = el("td", "n", r.faultN + "건" + (r.excl ? " (제외 " + r.excl + ")" : "")); tf.title = "상 " + r.sev["상"] + " · 중 " + r.sev["중"] + " · 하 " + r.sev["하"]; tr.appendChild(tf); tr.appendChild(el("td", "n", (Math.round(r.ratio * 10) / 10) + "%"));
    b.appendChild(tr);
  });
}
function refreshScores(data) {
  data = data || compute();
  var b = $("scores"); b.textContent = "";
  var sw = ST.weights.rate + ST.weights.days + ST.weights.over + ST.weights.mist;
  $("scnote").textContent = "자료가 있는 항목(배점 합계 " + sw + "점)을 100점으로 환산했어요. 등급: " + ST.cut[0] + "점 이상 우수 · " + ST.cut[1] + "점 이상 양호 · " + ST.cut[2] + "점 이상 보통 · 그 미만 면담 필요. 접수가 10건 미만이면 «보류»예요.";
  data.rows.forEach(function (r) {
    var s = el("tr"); s.appendChild(el("td", "nm", r.n));
    [r.pts.rate, r.pts.days, r.pts.over, r.pts.mist, r.sum, r.conv].forEach(function (v) { s.appendChild(el("td", "n", String(v))); });
    var g = r.hold ? ["보류", "g3"] : gradeOf(r.conv), tg = el("td"); tg.appendChild(el("span", "band " + g[1], g[0])); s.appendChild(tg);
    s.appendChild(el("td", "sm", r.memo || "-")); b.appendChild(s);
  });
}
function refreshSev() {
  var b = $("sevrows"); b.textContent = "";
  var list = ITEMS.filter(function (it) { return FAULT_KINDS[kindOf(it)]; });
  if (!list.length) { var tr0 = el("tr"), td0 = el("td", "sm", "귀책이 확정된 건이 없어요."); td0.colSpan = 6; tr0.appendChild(td0); b.appendChild(tr0); return; }
  list.forEach(function (it) {
    var inc = incOf(it), tr = el("tr", inc ? "" : "off"); tr.appendChild(el("td", "nm", faultOf(it) || it.owner));
    tr.appendChild(el("td", "", it.text));
    var tk = el("td"); tk.appendChild(el("span", "chip blue", kindOf(it))); tr.appendChild(tk);
    var ts = el("td"), sel = el("select", "in"); sel.setAttribute("aria-label", it.text.slice(0, 12) + " 귀책 중대성");
    SEVS.forEach(function (v) { var op = el("option", "", v); op.value = v; sel.appendChild(op); }); sel.value = sevOf(it);
    sel.addEventListener("change", function () { editItem(it, function (c) { c.sev = sel.value; }); });
    ts.appendChild(sel); tr.appendChild(ts);
    var td2 = el("td"), dn = el("select", "in"); dn.setAttribute("aria-label", it.text.slice(0, 12) + " 처리 완성도");
    DONES.forEach(function (v) { var op = el("option", "", v); op.value = v; dn.appendChild(op); }); dn.value = doneOf(it);
    dn.addEventListener("change", function () { editItem(it, function (c) { c.done = dn.value; }); });
    td2.appendChild(dn); tr.appendChild(td2);
    var tg = el("td"), seg = el("div", "seg"); seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "평가 반영");
    [["반영", true], ["제외", false]].forEach(function (p) {
      var bt = el("button", "", p[0]); bt.type = "button"; bt.setAttribute("aria-pressed", String(inc === p[1]));
      bt.addEventListener("click", function () { editItem(it, function (c) { if (p[1]) { delete c.exc; } else { c.exc = true; } }); });
      seg.appendChild(bt);
    });
    tg.appendChild(seg); tr.appendChild(tg); b.appendChild(tr);
  });
}
function refreshAll() { var d = compute(); refreshOwners(d); refreshScores(d); refreshSev(); renderItems(); }

/* 기준표: 배점 입력 */
function buildRubric() {
  var b = $("rub"); b.textContent = ""; var areaRows = { "처리 성과": 3, "응대 품질": 2, "협업 · 기록": 2 }, bandCells = {};
  IND.forEach(function (i) {
    var tr = el("tr");
    if (i.area) { var a = el("td", "nm", i.area); a.rowSpan = areaRows[i.area]; tr.appendChild(a); }
    tr.appendChild(el("td", "", i.name)); tr.appendChild(el("td", "sm", i.how));
    var tw = el("td", "n"), w = el("input", "in num"); w.type = "number"; w.min = "0"; w.max = "100"; w.value = ST.weights[i.k]; w.setAttribute("aria-label", i.name + " 배점");
    w.addEventListener("input", function () { ST.weights[i.k] = Math.max(0, num(w.value, 0)); save(); paintBands(); refreshScores(); });
    tw.appendChild(w); tr.appendChild(tw);
    var bc = el("td", "sm"); tr.appendChild(bc); bandCells[i.k] = bc;
    var st = el("td"); st.appendChild(el("span", "chip " + (i.scored ? (i.k === "mist" ? "warn" : "ok") : "na"), i.scored ? (i.k === "mist" ? "확정한 건만" : "있음") : "기록 전")); tr.appendChild(st);
    b.appendChild(tr);
  });
  function paintBands() {
    IND.forEach(function (i) {
      var w = ST.weights[i.k];
      bandCells[i.k].textContent = i.bands.replace(/×([0-9.]+)/g, function (m, f) { return Math.round(w * parseFloat(f)) + "점"; });
    });
    var total = IND.reduce(function (s, i) { return s + ST.weights[i.k]; }, 0), ws = $("wsum");
    ws.textContent = ""; ws.appendChild(document.createTextNode("배점 합계 "));
    var tt = el("b", total === 100 ? "" : "bad-sum", total + "점"); ws.appendChild(tt);
    ws.appendChild(document.createTextNode(total === 100 ? " (100점이에요)" : " (100점이 아니에요. 합계를 100점으로 맞추면 읽기 쉬워요)"));
  }
  paintBands(); buildRubric.paint = paintBands;
}

/* 내년에 볼 것 · 보고서 문구 (해마다 따로 고쳐서 저장해요) */
function nextList() { return ST.nextBy[YEAR] || nextDef().map(function (x) { return x.long; }); }
function buildNext() {
  var ol = $("next"); ol.textContent = "";
  nextList().forEach(function (t, i) {
    var li = el("li", "", t); li.contentEditable = "true"; li.setAttribute("role", "textbox"); li.setAttribute("aria-label", "내년에 볼 것 " + (i + 1));
    li.addEventListener("input", function () { var arr = ST.nextBy[YEAR] || nextDef().map(function (x) { return x.long; }); arr[i] = li.textContent; ST.nextBy[YEAR] = arr; save(); });
    ol.appendChild(li);
  });
}
function reportText() { var r = ST.reportBy[YEAR]; return r == null ? reportDef() : r; }

/* ---------- 운영 현황 자료에서 고른 해를 센다 ---------- */
var CAND_RULES = [
  ["단순 문의 후보", ["?", "궁금", "알려 주세요", "알려주세요", "방법", "공유받고", "신청하고 싶", "가입하려면"]],
  ["현업 후보", ["팀장", "본부장", "팀원", "직원을", "단톡방", "회식", "멘토", "회의", "다른 부서", "소문"]],
  ["업무 오류 후보", ["입금", "지급", "끊", "누락", "못 받", "계산", "정산", "발급", "수당", "잘못", "안 나", "보안 카드", "사원증", "계정", "링크", "열리지", "신청 페이지", "제출이 안", "재생", "식대"]],
  ["제도·시스템 후보", ["인터넷", "알림", "조명", "전기포트", "에어컨", "정수기", "복도", "창고", "주차장", "병원", "품목", "기준표", "소화기", "시스템"]]
];
function ruleCand(t) {
  for (var i = 0; i < CAND_RULES.length; i++) { if (CAND_RULES[i][1].some(function (w) { return t.indexOf(w) !== -1; })) { return CAND_RULES[i][0]; } }
  return "후보 없음";
}
function hashId(s) { var h = 5381; for (var i = 0; i < s.length; i++) { h = ((h << 5) + h + s.charCodeAt(i)) | 0; } return "r" + (h >>> 0).toString(36); }
function loadYear(y) {
  var D = DASH, rows = D.rows.filter(function (r) { return r.y === y && r.cat && r.urg; }), URG = ["높음", "보통", "낮음"];
  MONTHS = {}; for (var m = 1; m <= 12; m++) { MONTHS[m] = [0, 0, 0]; }
  CATS = {}; D.cats.forEach(function (c) { CATS[c] = [0, 0, 0, 0]; });
  var grp = {}, order = [], sumD = 0, nD = 0, hi = 0, hiDone = 0, over = 0, done = 0, h1 = 0, h2 = 0, hi1 = 0, hi2 = 0, open = [0, 0, 0], edited = 0, m1 = 12, m2 = 1;
  rows.forEach(function (r) {
    MONTHS[r.m][URG.indexOf(r.urg)]++;
    if (r.m < m1) m1 = r.m; if (r.m > m2) m2 = r.m;
    var c = CATS[r.cat]; c[0]++; if (r.urg === "높음") c[1]++; if (r.step === 3) c[2]++;
    var od = D.isOverdue(r); if (od) c[3]++;
    if (r.urg === "높음") { hi++; if (r.step === 3) hiDone++; }
    if (r.step === 3) done++; else open[r.step]++;
    if (od) over++;
    if (r.edited) edited++;
    if (r.m <= 6) { h1++; if (r.urg === "높음") hi1++; } else { h2++; if (r.urg === "높음") hi2++; }
    var d = D.stepDays(r); if (d !== null) { sumD += d; nD++; }
    var n = D.nameOf(r.cat) || UNASSIGNED, g = grp[n];
    if (!g) { g = grp[n] = { n: n, cl: {}, total: 0, done: 0, over: 0, sd: 0, nd: 0 }; order.push(n); }
    g.cl[r.cat] = 1; g.total++; if (r.step === 3) g.done++; if (od) g.over++; if (d !== null) { g.sd += d; g.nd++; }
  });
  OWNERS = order.map(function (n) { var g = grp[n]; return { n: n, cats: Object.keys(g.cl).join(" · "), total: g.total, done: g.done, avg: g.nd ? Math.round(g.sd / g.nd * 10) / 10 : null, over: g.over }; })
    .sort(function (a, b) { return b.total - a.total || (a.n < b.n ? -1 : 1); });
  YD = { total: rows.length, done: done, hi: hi, hiDone: hiDone, over: over, avg: nD ? Math.round(sumD / nD * 10) / 10 : null, h1: h1, h2: h2, hi1: hi1, hi2: hi2, open: open,
    edited: edited, m1: rows.length ? m1 : 1, m2: rows.length ? m2 : 1, od: D.overdue };
  TGT[0].actual = rows.length ? pct(done, rows.length) : null;
  TGT[1].actual = hi ? pct(hiDone, hi) : null;
  TGT[2].actual = YD.avg;
  TGT[3].actual = over; TGT[3].name = "기한 넘김 (긴급 높음, " + D.overdue + "일 초과)";
  var seen = {};
  ITEMS = rows.map(function (r, i) { return { r: r, i: i }; }).sort(function (a, b) { return (a.r.date || "") < (b.r.date || "") ? -1 : (a.r.date || "") > (b.r.date || "") ? 1 : a.i - b.i; })
    .map(function (o) {
      var r = o.r, id = hashId((r.date || r.y + "-" + r.m) + "|" + r.text); if (seen[id]) { seen[id]++; id += "_" + seen[id]; } else { seen[id] = 1; }
      var dd = r.date ? parseInt(r.date.slice(8, 10), 10) : 0, p = r.preset;
      var it = { id: id, d: r.m + "월" + (dd ? " " + dd + "일" : ""), cat: r.cat, owner: D.nameOf(r.cat) || UNASSIGNED, text: r.text, base: p ? p.kind : "확인 전" };
      it.cand = p && p.cand ? p.cand : ruleCand(r.text);
      it.sum = p && p.sum ? p.sum : (r.text.length > 16 ? r.text.slice(0, 16) + "…" : r.text);
      if (p && p.tag) { it.tag = p.tag; }
      return it;
    });
}

/* ---------- 시작 ---------- */
function buildYears(ys) {
  var b = $("years"); b.textContent = "";
  ys.forEach(function (y) {
    var x = el("button", "", y + "년"); x.type = "button"; x.setAttribute("aria-pressed", String(y === YEAR));
    x.addEventListener("click", function () { YEAR = y; showYear(ys); });
    b.appendChild(x);
  });
}
function showYear(ys) {
  buildYears(ys); $("noyear").hidden = true; $("ybody").hidden = false; $("adjwrap").hidden = false;
  $("adjyear").textContent = "문의 성격 · 귀책 확정 (" + YEAR + "년 기준, 운영 결산 탭에서 고른 해와 같아요). 여기서 적은 값은 운영 결산의 평가 점수(예시)에 바로 반영돼요.";
  loadYear(YEAR); PICK = ""; TAB = "";
  drawStatic(); buildTargets(); buildAdj(); buildRubric(); buildNext();
  var un = OWNERS.some(function (o) { return o.n === UNASSIGNED; });
  $("ownsrc").textContent = "출처: 처리 단계 · 날짜, 문의 성격(위에서 확정한 값). 확정할 때마다 바로 바뀌어요." + (un ? " 담당자 이름은 «담당자별» 탭에서 칸마다 적어요." : "");
  $("chief").value = ST.chief; $("sw1").value = ST.sevw["상"]; $("sw2").value = ST.sevw["중"]; $("sw3").value = ST.sevw["하"]; $("c1").value = ST.cut[0]; $("c2").value = ST.cut[1]; $("c3").value = ST.cut[2];
  $("rep").value = reportText(); refreshAll();
}
function render() {
  DASH = window.Dash.data();
  var ys = DASH.years.slice().sort(function (a, b) { return a - b; });
  if (!ys.length) { $("adjwrap").hidden = true; $("ybody").hidden = true; $("noyear").hidden = false; $("years").textContent = ""; return; }
  if (ys.indexOf(YEAR) === -1) { YEAR = ys[ys.length - 1]; }
  showYear(ys);
}
$("chief").addEventListener("input", function () { ST.chief = this.value; save(); });
["sw1", "sw2", "sw3"].forEach(function (id, i) {
  $(id).addEventListener("input", function () { ST.sevw[SEVS[i]] = Math.max(0, num(this.value, 0)); save(); refreshAll(); });
});
["c1", "c2", "c3"].forEach(function (id, i) {
  $(id).addEventListener("input", function () { ST.cut[i] = num(this.value, ST.cut[i]); save(); refreshScores(); });
});
$("rep").addEventListener("input", function () { ST.reportBy[YEAR] = this.value; save(); });
$("auto").addEventListener("click", function () { delete ST.reportBy[YEAR]; save(); $("rep").value = reportDef(); });
$("copy").addEventListener("click", function () {
  var b = this, fin = function (ok) { b.textContent = ok ? "복사됨" : "아래 글을 직접 복사해 주세요"; setTimeout(function () { b.textContent = "보고서 문구 복사"; }, 1800); };
  try { navigator.clipboard.writeText($("rep").value).then(function () { fin(true); }, function () { fin(false); }); } catch (e) { fin(false); }
});
window.Settle = { render: render };

})();
