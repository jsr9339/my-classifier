// AI 없이 낱말 규칙만으로 칸 · 긴급도를 가른다. (기준선)
// 낱말은 keywords.json, 칸의 순서는 criteria.json에서 읽는다. 코드에는 낱말을 적지 않는다.
(function (g) {
  function found(text, words) {
    return (words || []).filter(function (w) { return text.indexOf(w) !== -1; });
  }

  function classify(text, criteria, keywords) {
    var t = String(text).replace(/\s+/g, " ");
    var order = criteria["칸"].slice().sort(function (a, b) { return a["순서"] - b["순서"]; })
      .map(function (c) { return c["이름"]; });

    // 칸: 낱말이 가장 많이 든 칸. 같으면 criteria.json 순서에서 앞 칸.
    var bestName = null, bestWords = [];
    order.forEach(function (name) {
      var entry = keywords["칸"][name];
      var hit = found(t, entry && entry["낱말"]);
      if (hit.length > bestWords.length) { bestName = name; bestWords = hit; }
    });
    var 칸 = bestName || "기타";

    // 긴급도: 높음 낱말이 있으면 높음, 없고 낮음 낱말이 있으면 낮음, 둘 다 없으면 보통.
    var hi = found(t, keywords["긴급도"]["높음"]["낱말"]);
    var lo = found(t, keywords["긴급도"]["낮음"]["낱말"]);
    var 긴급도 = hi.length ? "높음" : (lo.length ? "낮음" : "보통");
    var 긴급낱말 = hi.length ? hi : lo;

    var 칸이유 = bestName
      ? "«" + bestWords.slice(0, 3).join("», «") + "» 낱말이 있어 " + 칸
      : "맞는 낱말이 없어 기타";
    var 긴급이유 = 긴급낱말.length
      ? "«" + 긴급낱말.slice(0, 3).join("», «") + "» 낱말이 있어 " + 긴급도
      : "높음 · 낮음 낱말이 없어 보통";

    return {
      "칸": 칸,
      "긴급도": 긴급도,
      "이유": 칸이유 + " / " + 긴급이유,
      "확인필요": !bestName
    };
  }

  g.Rules = { classify: classify };
})(window);
