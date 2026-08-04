import sys, json
d = json.load(sys.stdin)
print("running:", d.get("running"))
r = d.get("result") or {}
print("result keys:", list(r.keys()))
print("status:", r.get("status"))
print("error:", d.get("error"))
print("facts:", len(r.get("facts", [])))
for f in r.get("facts", []):
    c = f.get("champion", {})
    print("  forced_stale=", f.get("forced_stale"), "src=", c.get("source"), "title=", c.get("title"))
