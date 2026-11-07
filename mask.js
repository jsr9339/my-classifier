// 이름 · 전화번호 · 사번을 [이름] [전화번호] [사번]으로 가린다.
// 분류는 가린 문장으로 한다. (AI에 보낼 때도 같은 함수를 쓴다)
(function (g) {
  var SURNAME = "김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허유남심노하곽성차주우구나민진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥인맹제모탁";
  var TITLES = "본부장|팀장|부장|차장|과장|대리|사원|주임|선임|책임|이사|대표|매니저|님";
  // 성처럼 보이지만 흔한 낱말은 이름으로 보지 않는다.
  var NOT_NAME = "우리|이번|지난|저희|이미|이제|이런|그런|한번|오늘|서로|전체|전부|주로|주요|매번|다른|모든|오전|오후|정말|하나|조금";

  var phoneRe = /(?<![0-9])0[0-9]{1,2}[-\s.]?[0-9]{3,4}[-\s.]?[0-9xX*]{4}(?![0-9])/g;
  var empNoLabelRe = /(사번|사원번호)\s*[:：]?\s*[A-Za-z]{0,3}[0-9]{4,10}/g;
  var empNoCodeRe = /(?<![A-Za-z0-9])[A-Z]{1,3}[0-9]{5,8}(?![A-Za-z0-9])/g;
  var nameRe = new RegExp(
    "(?<![가-힣])(?!(?:" + NOT_NAME + "))[" + SURNAME + "][가-힣]{1,2}(?=\\s?(?:" + TITLES + "))",
    "g"
  );

  function maskText(text) {
    return String(text)
      .replace(phoneRe, "[전화번호]")
      .replace(empNoLabelRe, "$1 [사번]")
      .replace(empNoCodeRe, "[사번]")
      .replace(nameRe, "[이름]");
  }

  g.Mask = { maskText: maskText };
})(window);
