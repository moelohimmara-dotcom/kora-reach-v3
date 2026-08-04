import os

keyfile = "/tmp/_key.txt"
p = "/opt/kora-reach/deploy/.env"
with open(keyfile) as f:
    key = f.read().strip()

lines = open(p).read().splitlines()
out = []
seen = False
for ln in lines:
    if ln.startswith("OLLAMA_API_KEY="):
        out.append('OLLAMA_API_KEY="' + key + '"')
        seen = True
    else:
        out.append(ln)
if not seen:
    out.append('OLLAMA_API_KEY="' + key + '"')
open(p, "w").write("\n".join(out) + "\n")

# verify
import subprocess
raw = open(p).read()
for ln in raw.splitlines():
    if ln.startswith("OLLAMA_API_KEY="):
        v = ln.split("=", 1)[1].strip().strip('"')
        print("OLLAMA_API_KEY len in .env:", len(v))
        break
os.remove(keyfile)
print("keyfile removed; .env updated")
