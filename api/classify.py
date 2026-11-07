"""Vercel 서버 조각: POST /api/classify  {"text": "..."} → 칸 · 긴급도 · 이유 · 확신"""
import json
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _service  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def _send(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        try:
            n = min(int(self.headers.get("Content-Length", "0")), 4096)
        except ValueError:
            n = 0
        status, payload = _service.handle_classify(self.rfile.read(n))
        self._send(status, payload)

    def do_GET(self):
        self._send(405, {"오류": "POST로 호출하세요"})
