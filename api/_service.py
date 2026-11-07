"""요청 하나를 처리한다. Vercel(api/classify.py)과 내 컴퓨터(dev_server.py)가 같이 쓴다."""
import json
import os

import _core
import _limit

MAX_RAW_CHARS = 500


def handle_classify(raw_body):
    """(HTTP 상태, 응답 dict)를 돌려준다."""
    try:
        data = json.loads(raw_body.decode("utf-8"))
        text = data.get("text") if isinstance(data, dict) else None
    except (ValueError, UnicodeDecodeError):
        text = None
    if not isinstance(text, str) or not text.strip():
        return 400, {"오류": "문장을 넣어 주세요", "종류": "입력"}
    if len(text) > MAX_RAW_CHARS:
        return 400, {"오류": "문장이 너무 깁니다 (%d자 이하)" % MAX_RAW_CHARS, "종류": "입력"}

    # 하루 한도. 저장소가 없으면 막는다(내 컴퓨터 테스트는 LOCAL_DEV=1일 때만 건너뜀).
    if os.environ.get("LOCAL_DEV") == "1" and not _limit.configured():
        pass
    else:
        try:
            ok, used, limit = _limit.count_and_check()
        except Exception:
            return 503, {"오류": "사용 한도 장치를 쓸 수 없습니다", "종류": "한도장치"}
        if not ok:
            return 429, {"오류": "오늘 사용 한도(%d회)에 도달했어요. 내일 다시 써 주세요." % limit, "종류": "한도"}

    try:
        res = _core.classify_text(text)
    except _core.GeminiError:
        return 502, {"오류": "AI 호출에 실패했습니다", "종류": "AI"}
    return 200, res
