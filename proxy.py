#!/usr/bin/env python3
"""
Local CORS proxy for ajnunu.com video URL extraction.
Run this alongside the HTTP server:
  python proxy.py        (port 8766)
  python -m http.server  (port 8765)
"""
import http.server
import urllib.request
import urllib.parse
import json
import re
import sys
import os

PORT = 8766
TARGET_HOST = "ajnunu.com"

M3U8_RE = re.compile(
    r'https://videos\.files\.wordpress\.com/[^\s"\'<>]+\.m3u8(?:[^\s"\'<>]*)?'
)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
    "Accept-Language": "th-TH,th;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


class ProxyHandler(http.server.BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        pass  # silence access log

    def send_cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors()
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        # Health check
        if parsed.path == "/health":
            self.send_response(200)
            self.send_cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"ok":true}')
            return

        # /video?id=COURSE_ID&v=VIDEO_ID  => extract m3u8 URL
        if parsed.path == "/video":
            params = urllib.parse.parse_qs(parsed.query)
            course_id = params.get("id", [None])[0]
            video_id = params.get("v", [None])[0]

            if not course_id or video_id is None:
                self._json_error(400, "Missing id or v parameter")
                return

            url = f"https://ajnunu.com/app/course/index.php?id={course_id}&video_id={video_id}"
            try:
                req = urllib.request.Request(url, headers=HEADERS)
                with urllib.request.urlopen(req, timeout=12) as resp:
                    html = resp.read().decode("utf-8", errors="replace")

                m = M3U8_RE.search(html)
                if m:
                    result = json.dumps({"url": m.group(0)}).encode()
                    self.send_response(200)
                    self.send_cors()
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", len(result))
                    self.end_headers()
                    self.wfile.write(result)
                else:
                    self._json_error(404, "Video URL not found in page")
            except Exception as e:
                self._json_error(500, str(e))
            return

        self._json_error(404, "Unknown endpoint")

    def _json_error(self, code, msg):
        body = json.dumps({"error": msg}).encode()
        self.send_response(code)
        self.send_cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(body))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    server = http.server.HTTPServer(("localhost", PORT), ProxyHandler)
    print(f"Proxy running on http://localhost:{PORT}", flush=True)
    print(f"  /health           — check if proxy is up")
    print(f"  /video?id=ID&v=VID — get m3u8 URL for a lesson")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nProxy stopped.")
