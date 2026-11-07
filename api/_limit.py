"""사용 횟수 한도 두 가지. 저장소는 Upstash Redis(REST)를 쓴다.

- 하루 한도(DAILY_LIMIT): Google 무료 구간의 하루 요청 수(RPD 500)보다 낮게 잡는다.
  Google은 태평양 시간 자정에 초기화하므로 같은 기준으로 센다.
- 분당 한도(MINUTE_LIMIT): Google 무료 구간의 분당 요청 수(RPM 15)보다 낮게 잡는다.

Vercel의 Storage에서 Upstash Redis를 연결하면 아래 환경 변수가 자동으로 생긴다.
  KV_REST_API_URL, KV_REST_API_TOKEN  (또는 UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN)
"""
import datetime
import json
import os
import time
import urllib.request

DEFAULT_DAILY = 400   # gemini-3.5-flash-lite 무료 RPD 500의 80%. 재시도 · 테스트 몫을 남긴다.
DEFAULT_MINUTE = 12   # 같은 모델 무료 RPM 15의 80%.

try:
    from zoneinfo import ZoneInfo
    _PACIFIC = ZoneInfo("America/Los_Angeles")
except Exception:  # tzdata가 없는 환경(일부 Windows)에서는 겨울 시간(UTC-8)으로 근사
    _PACIFIC = datetime.timezone(datetime.timedelta(hours=-8))


def _store():
    url = os.environ.get("KV_REST_API_URL") or os.environ.get("UPSTASH_REDIS_REST_URL")
    token = os.environ.get("KV_REST_API_TOKEN") or os.environ.get("UPSTASH_REDIS_REST_TOKEN")
    return (url.rstrip("/"), token) if url and token else None


def _int_env(name, default):
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


def daily_limit():
    return _int_env("DAILY_LIMIT", DEFAULT_DAILY)


def minute_limit():
    return _int_env("MINUTE_LIMIT", DEFAULT_MINUTE)


def configured():
    return _store() is not None


def _incr(url, token, key, ttl):
    req = urllib.request.Request(
        url + "/pipeline",
        data=json.dumps([["INCR", key], ["EXPIRE", key, ttl]]).encode("utf-8"),
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=8) as r:
        res = json.load(r)
    return int(res[0]["result"])


def count_and_check(now=None):
    """요청 한 번을 센다. ('ok' | '분당' | '하루', 사용 횟수, 한도)를 돌려준다."""
    st = _store()
    if st is None:
        raise RuntimeError("한도 저장소가 설정되지 않았습니다")
    url, token = st
    now = now or time.time()

    # 분당: 1분 칸에 센다. 넘으면 하루 횟수는 올리지 않는다.
    m_used = _incr(url, token, "classify:min:%d" % int(now // 60), 180)
    m_lim = minute_limit()
    if m_used > m_lim:
        return "분당", m_used, m_lim

    day = datetime.datetime.fromtimestamp(now, _PACIFIC).strftime("%Y-%m-%d")
    d_used = _incr(url, token, "classify:day:" + day, 172800)
    d_lim = daily_limit()
    if d_used > d_lim:
        return "하루", d_used, d_lim
    return "ok", d_used, d_lim
