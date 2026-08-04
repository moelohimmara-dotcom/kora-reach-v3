p = "/opt/kora-reach/deploy/.env"
lines = open(p).read().splitlines()
out = [ln for ln in lines if not ln.startswith("PORT=")]
open(p, "w").write("\n".join(out) + "\n")
print("PORT removed from .env; remaining keys:", sum(1 for ln in out if ln and not ln.startswith("#")))
