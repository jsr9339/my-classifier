"""내 컴퓨터에서 화면과 /api/classify를 같이 띄운다. (Vercel에 올리기 전 확인용)

사용: python dev_server.py   →   http://localhost:8000
이 컴퓨터에서만 열린다(127.0.0.1). 키는 .env에서 읽고 화면에 찍지 않는다.
"""
import http.server
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "api"))
os.chdir(HERE)


def load_env():
    path = os.path.join(HERE, ".env")
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env()
os.environ["LOCAL_DEV"] = "1"
import _service  # noqa: E402


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path.split("?")[0] != "/api/classify":
            self.send_error(404)
            return
        try:
            n = min(int(self.headers.get("Content-Length", "0")), 4096)
        except ValueError:
            n = 0
        status, payload = _service.handle_classify(self.rfile.read(n))
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    print("http://localhost:8000 에서 열립니다 (끄려면 Ctrl+C)")
    http.server.ThreadingHTTPServer(("127.0.0.1", 8000), Handler).serve_forever()
