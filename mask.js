// 개인정보를 가린 문장으로만 분류한다. (AI에 보낼 때도 같은 함수를 쓴다. api/_core.py의 mask_text와 같은 규칙)
// 가리는 것: 주민등록번호 · 카드번호 · 이메일 · 전화번호 · 사번 · 계좌번호 · 주소 · 이름(직함이 붙은 것)
(function (g) {
  var SURNAME = "김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허유남심노하곽성차주우구나민진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥인맹제모탁";
  var TITLES = "본부장|팀장|부장|차장|과장|대리|사원|주임|선임|책임|이사|대표|매니저|님";
  // 성처럼 보이지만 흔한 낱말은 이름으로 보지 않는다.
  var NOT_NAME = "우리|이번|지난|저희|이미|이제|이런|그런|한번|오늘|서로|전체|전부|주로|주요|매번|다른|모든|오전|오후|정말|하나|조금";

  var rrnDash = /(?<![0-9])[0-9]{6}\s?-\s?[1-4][0-9]{6}(?![0-9])/g;
  var rrnPlain = /(?<![0-9])[0-9]{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12][0-9]|3[01])[1-4][0-9]{6}(?![0-9])/g;
  var cardRe = /(?<![0-9])[0-9]{4}[-\s][0-9]{4}[-\s][0-9]{4}[-\s][0-9]{4}(?![0-9])/g;
  var emailRe = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  var phoneRe = /(?<![0-9])0[0-9]{1,2}[-\s.]?[0-9]{3,4}[-\s.]?[0-9xX*]{4}(?![0-9])/g;
  var empNoLabelRe = /(사번|사원번호)\s*[:：]?\s*[A-Za-z]{0,3}[0-9]{4,10}/g;
  var empNoCodeRe = /(?<![A-Za-z0-9])[A-Z]{1,3}[0-9]{5,8}(?![A-Za-z0-9])/g;
  var acctLabelRe = /((?:계좌|입금|송금)[^0-9\n]{0,8})([0-9]{10,14})(?![0-9])/g;
  var acctDashRe = /(?<![0-9-])[0-9]{2,6}(?:-[0-9]{2,8}){2,3}(?![0-9-])/g;
  var roadRe = /[가-힣]{1,10}(?:시|군|구)\s?[가-힣0-9]{1,15}(?:로|길)\s?[0-9]{1,4}(?:-[0-9]{1,4})?(?:번길)?/g;
  var lotRe = /[가-힣]{1,10}(?:동|읍|면|리)\s?[0-9]{1,4}-[0-9]{1,4}(?![0-9])/g;
  var nameRe = new RegExp(
    "(?<![가-힣])(?!(?:" + NOT_NAME + "))[" + SURNAME + "][가-힣]{1,2}(?=\\s?(?:" + TITLES + "))",
    "g"
  );

  function maskText(text) {
    return String(text)
      .replace(rrnDash, "[주민번호]")
      .replace(rrnPlain, "[주민번호]")
      .replace(cardRe, "[카드번호]")
      .replace(emailRe, "[이메일]")
      .replace(phoneRe, "[전화번호]")
      .replace(empNoLabelRe, "$1 [사번]")
      .replace(empNoCodeRe, "[사번]")
      .replace(acctLabelRe, "$1[계좌번호]")
      .replace(acctDashRe, function (m) {
        // 날짜(2026-11-03)처럼 짧은 숫자는 두고, 숫자가 10자리 이상일 때만 계좌번호로 본다
        return m.replace(/-/g, "").length >= 10 ? "[계좌번호]" : m;
      })
      .replace(roadRe, "[주소]")
      .replace(lotRe, "[주소]")
      .replace(nameRe, "[이름]");
  }

  g.Mask = { maskText: maskText };
})(window);
