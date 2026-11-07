"""내 컴퓨터에서 Gemini 점수를 잰다. 키는 .env에서만 읽고 화면에 찍지 않는다.

사용: python score_ai.py [횟수]   (기본 2회: AI 1, AI 2)
data/answer.json을 여는 때는 이 채점 때뿐이다.
"""
import datetime
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "api"))


def load_env():
    path = os.path.join(HERE, ".env")
    if not os.path.exists(path):
        return
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env()
import _core  # noqa: E402


def main():
    runs = int(sys.argv[1]) if len(sys.argv) > 1 else 2
    answers = json.load(open(os.path.join(HERE, "data", "answer.json"), encoding="utf-8"))
    rules = _core.CRITERIA.get("가장_나쁜_실수_규칙", [])
    report = {
        "날짜": datetime.date.today().isoformat(),
        "기준": "criteria.json version %s" % _core.CRITERIA.get("version"),
        "지시문": _core.PROMPT_VERSION,
        "예시수": len(_core.EXAMPLES),
        "정답수": len(answers),
        "실행": [],
    }
    for r in range(1, runs + 1):
        ok_c = ok_u = ok_b = 0
        worst_bad = worst_total = 0
        low_conf = 0
        wrong = []
        models = {}
        for a in answers:
            res = _core.classify_text(a["text"])
            models[res["모델"]] = models.get(res["모델"], 0) + 1
            c_ok = res["칸"] == a["칸"]
            u_ok = res["긴급도"] == a["긴급도"]
            ok_c += c_ok
            ok_u += u_ok
            ok_b += c_ok and u_ok
            low_conf += res["확인필요"]
            for w in rules:
                if a["칸"] == w["칸"] and a["긴급도"] == w["긴급도"]:
                    worst_total += 1
                    if not (c_ok and u_ok):
                        worst_bad += 1
            if not (c_ok and u_ok):
                wrong.append({
                    "id": a["id"], "text": a["text"],
                    "정답": [a["칸"], a["긴급도"]],
                    "AI": [res["칸"], res["긴급도"]],
                    "이유": res["이유"], "확신": res["확신"],
                })
            time.sleep(0.3)
        report["실행"].append({
            "회차": "AI %d" % r, "모델별호출수": models,
            "칸": ok_c, "긴급도": ok_u, "둘다": ok_b,
            "가장나쁜실수": [worst_bad, worst_total],
            "사람확인표시": low_conf, "틀린문장": wrong,
        })
        print("AI %d: 칸 %d/%d  긴급도 %d/%d  둘다 %d/%d  가장나쁜실수 %d/%d  사람확인표시 %d  모델 %s" % (
            r, ok_c, len(answers), ok_u, len(answers), ok_b, len(answers), worst_bad, worst_total, low_conf, json.dumps(models)))
    os.makedirs(os.path.join(HERE, "log"), exist_ok=True)
    out = os.path.join(HERE, "log", "ai_점수_%s_%s.json" % (report["날짜"], report["지시문"]))
    json.dump(report, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print("자세한 결과:", os.path.relpath(out, HERE))


if __name__ == "__main__":
    main()
