"""하루 전체 사용 횟수 한도. 저장소는 Upstash Redis(REST)를 쓴다.

Vercel의 Storage에서 Upstash Redis를 연결하면 아래 환경 변수가 자동으로 생긴다.
  KV_REST_API_URL, KV_REST_API_TOKEN  (또는 UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN)
"""
import datetime
import json
import os
import urllib.request

DEFAULT_LIMIT = 100
_KST = datetime.timezone(datetime.timedelta(hours=9))


def _store():
    url = os.environ.get("KV_REST_API_URL") or os.environ.get("UPSTASH_REDIS_REST_URL")
    token = os.environ.get("KV_REST_API_TOKEN") or os.environ.get("UPSTASH_REDIS_REST_TOKEN")
    return (url.rstrip("/"), token) if url and token else None


def limit_value():
    try:
        return int(os.environ.get("DAILY_LIMIT", DEFAULT_LIMIT))
    except ValueError:
        return DEFAULT_LIMIT


def configured():
    return _store() is not None


def count_and_check():
    """오늘 횟수를 1 올리고 (허용 여부, 오늘 사용 횟수, 한도)를 돌려준다."""
    limit = limit_value()
    st = _store()
    if st is None:
        raise RuntimeError("한도 저장소가 설정되지 않았습니다")
    url, token = st
    key = "classify:" + datetime.datetime.now(_KST).strftime("%Y-%m-%d")
    req = urllib.request.Request(
        url + "/pipeline",
        data=json.dumps([["INCR", key], ["EXPIRE", key, 172800]]).encode("utf-8"),
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=8) as r:
        res = json.load(r)
    used = int(res[0]["result"])
    return used <= limit, used, limit
