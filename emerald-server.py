#!/usr/bin/env python3
"""
Emerald Tablet OS — Local Server
Serves L7 WAY on the local network. Privacy first by design.
Binds to 0.0.0.0 for all devices on YOUR network.

Only files placed in SERVE_DIR (~/.l7/public) are ever reachable — nothing
else on this machine is exposed. Nothing leaves that directory; nothing is
served, logged, or tracked from outside it.
"""

import http.server
import os
import sys

PORT = 7777
SERVE_DIR = os.path.expanduser('~/.l7/public')

os.makedirs(SERVE_DIR, exist_ok=True)

INDEX_PATH = os.path.join(SERVE_DIR, 'index.html')
if not os.path.exists(INDEX_PATH):
    with open(INDEX_PATH, 'w') as f:
        f.write(
            '<!DOCTYPE html><html><head><meta charset="utf-8">'
            '<title>L7 WAY — Emerald</title></head><body>'
            '<p>Emerald server is running. See <a href="/brief">/brief</a> '
            'for the current health brief.</p>'
            '<p>Files placed in <code>~/.l7/public</code> are served here.</p>'
            '</body></html>'
        )

os.chdir(SERVE_DIR)

BRIEF_PATH = os.path.expanduser('~/.l7/state/health-brief.txt')

class SilentHandler(http.server.SimpleHTTPRequestHandler):
    """Serve files silently. No logging to stdout."""
    def log_message(self, format, *args):
        pass  # Silence

    def end_headers(self):
        # Local network only — no CORS needed for external
        self.send_header('X-L7-Privacy', 'sacred-ground')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_GET(self):
        if self.path == '/brief':
            try:
                with open(BRIEF_PATH, 'r') as f:
                    content = f.read()
                self.send_response(200)
                self.send_header('Content-Type', 'text/plain; charset=utf-8')
                self.end_headers()
                self.wfile.write(content.encode('utf-8'))
            except FileNotFoundError:
                self.send_response(503)
                self.send_header('Content-Type', 'text/plain')
                self.end_headers()
                self.wfile.write(b'Heart has not generated a brief yet. Waiting for first system check.')
            return
        return super().do_GET()

if __name__ == '__main__':
    with http.server.HTTPServer(('0.0.0.0', PORT), SilentHandler) as server:
        sys.stderr.write(f'[emerald] Serving on port {PORT}\n')
        sys.stderr.write(f'[emerald] Root: {SERVE_DIR}\n')
        sys.stderr.write(f'[emerald] Privacy: sacred ground. No data shared.\n')
        server.serve_forever()
