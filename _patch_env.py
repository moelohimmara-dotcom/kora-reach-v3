import os

p = "/opt/kora-reach/deploy/.env"
key = os.environ.get("OLLAMA_API_KEY")
if not key:
    print("NO KEY PROVIDED")
    raise SystemExit(1)

lines = open(p).read().splitlines()
new = []
seen = set()
for ln in lines:
    if "=" in ln and not ln.lstrip().startswith("#"):
        k, v = ln.split("=", 1)
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        if " " in v and not (v.startswith('"') and v.endswith('"')):
            v = '"' + v + '"'
        if k not in seen:
            new.append(f'{k}={v}')
            seen.add(k)
    else:
        new.append(ln)

if "OLLAMA_API_KEY" not in seen:
    new.append('OLLAMA_API_KEY="' + key + '"')

open(p, "w").write("\n".join(new) + "\n")
print("OLLAMA_API_KEY added to deploy/.env; total lines:", len(new))
