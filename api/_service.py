"""요청 하나를 처리한다. Vercel(api/classify.py)과 내 컴퓨터(dev_server.py)가 같이 쓴다."""
import json
import os

import _core
import _limit

MAX_RAW_CHARS = 500
MAX_BATCH = 10  # 한 번에 보낼 수 있는 의견 수 (대시보드의 묶음 분류)


def _gate():
    """하루 · 분당 한도를 확인한다. 막아야 하면 (상태, 응답)을, 통과하면 None을 돌려준다."""
    # 저장소가 없으면 막는다(내 컴퓨터 테스트는 LOCAL_DEV=1일 때만 건너뜀).
    if os.environ.get("LOCAL_DEV") == "1" and not _limit.configured():
        return None
    if not _limit.configured():
        return 503, {"오류": "사용 횟수를 세는 장치를 쓸 수 없습니다", "종류": "한도장치미설정"}
    try:
        verdict, used, limit = _limit.count_and_check()
    except Exception as e:
        code = getattr(e, "code", "")  # HTTP 오류 번호만 알려 준다 (비밀 값은 담지 않는다)
        return 503, {"오류": "사용 한도 장치를 쓸 수 없습니다", "종류": "한도장치오류",
                     "세부": (type(e).__name__ + (" %s" % code if code else ""))}
    if verdict == "분당":
        return 429, {"오류": "요청이 몰렸어요. 몇 초 뒤에 다시 눌러 주세요.", "종류": "분당"}
    if verdict == "하루":
        return 429, {"오류": "오늘 사용할 수 있는 횟수를 모두 썼어요. 내일 다시 써 주세요.", "종류": "한도"}
    return None


def handle_classify(raw_body):
    """(HTTP 상태, 응답 dict)를 돌려준다. {"text": "..."} 한 문장 또는 {"texts": [...]} 묶음."""
    try:
        data = json.loads(raw_body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        data = None
    if not isinstance(data, dict):
        return 400, {"오류": "문장을 넣어 주세요", "종류": "입력"}

    if "texts" in data:
        texts = data["texts"]
        if (not isinstance(texts, list) or not texts or len(texts) > MAX_BATCH
                or not all(isinstance(t, str) for t in texts)):
            return 400, {"오류": "의견은 한 번에 %d개까지 보낼 수 있습니다" % MAX_BATCH, "종류": "입력"}
        if any(len(t) > MAX_RAW_CHARS for t in texts):
            return 400, {"오류": "문장이 너무 깁니다 (%d자 이하)" % MAX_RAW_CHARS, "종류": "입력"}
        if not any(t.strip() for t in texts):
            return 400, {"오류": "문장을 넣어 주세요", "종류": "입력"}
        blocked = _gate()
        if blocked:
            return blocked
        try:
            return 200, {"결과": _core.classify_batch(texts, variant=bool(data.get("확인")))}
        except _core.GeminiError:
            return 502, {"오류": "AI 호출에 실패했습니다", "종류": "AI"}

    text = data.get("text")
    if not isinstance(text, str) or not text.strip():
        return 400, {"오류": "문장을 넣어 주세요", "종류": "입력"}
    if len(text) > MAX_RAW_CHARS:
        return 400, {"오류": "문장이 너무 깁니다 (%d자 이하)" % MAX_RAW_CHARS, "종류": "입력"}
    blocked = _gate()
    if blocked:
        return blocked
    try:
        res = _core.classify_text(text)
    except _core.GeminiError:
        return 502, {"오류": "AI 호출에 실패했습니다", "종류": "AI"}
    return 200, res
