"""test_illustrate_fal.py — prouve le chemin FAL réel (via FAL_PROXY_URL mock local)."""
import os, sys, threading, http.server, json
sys.path.insert(0, "/opt/data/kora-reach")
import illustrate

# Mock server qui imite un proxy FAL (renvoie une URL d'image)
class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        self.rfile.read(n)
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"image": "https://fal.media/mock_generated.png"}).encode())
    def log_message(self, *a): pass

srv = http.server.HTTPServer(("127.0.0.1", 8899), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()

os.environ["FAL_PROXY_URL"] = "http://127.0.0.1:8899"
os.environ["FAL_KEY"] = ""  # force mode proxy
illustrate.FAL_PROXY_URL = "http://127.0.0.1:8899"

res = illustrate.illustrate({"image": "https://og.example/x.jpg"},
                             "Guinée: accord minier signé à Conakry", "Le gouvernement a signé.")
print("RÉSULTAT:", res)
assert res["generated"] is True and res["provider"] == "fal_proxy", f"Échec: {res}"
print("✅ Chemin FAL réel prouvé (proxy mock) -> image générée:", res["image"])
srv.shutdown()
