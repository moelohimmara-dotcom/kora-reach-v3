p = "/opt/kora-reach/deploy/.env"
lines = open(p).read().splitlines()
out = []
for ln in lines:
    if ln.startswith("OLLAMA_MODEL="):
        out.append('OLLAMA_MODEL="gemma4"')
    else:
        out.append(ln)
open(p, "w").write("\n".join(out) + "\n")
print("OLLAMA_MODEL set to gemma4")
