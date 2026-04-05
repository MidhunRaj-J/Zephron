from __future__ import annotations

import argparse
import os
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent
FRONTEND_DIR = ROOT / "frontend"


class ZephronHandler(SimpleHTTPRequestHandler):
	def __init__(self, *args, **kwargs):
		super().__init__(*args, directory=str(FRONTEND_DIR), **kwargs)

	def do_GET(self):
		if self.path in {"/", "/index.html"}:
			self.path = "/index.html"
		return super().do_GET()

	def log_message(self, format, *args):
		return


def parse_args() -> argparse.Namespace:
	parser = argparse.ArgumentParser(description="Serve the Zephron frontend.")
	parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8000")))
	parser.add_argument("--no-browser", action="store_true", help="Do not open a browser window.")
	return parser.parse_args()


def main() -> None:
	args = parse_args()
	server = ThreadingHTTPServer(("127.0.0.1", args.port), ZephronHandler)
	url = f"http://127.0.0.1:{args.port}/"
	print(f"Zephron is running at {url}")

	if not args.no_browser:
		threading.Timer(0.5, lambda: webbrowser.open(url)).start()

	try:
		server.serve_forever()
	except KeyboardInterrupt:
		print("\nShutting down Zephron.")
	finally:
		server.server_close()


if __name__ == "__main__":
	main()