import sys, json
d = json.load(sys.stdin)
print("audit entries:", len(d))
for e in d[:20]:
    ts = e.get("ts", "")[:19]
    ev = e.get("event", "")
    det = (e.get("detail") or "")[:90]
    print(ts, "|", ev, "|", det)
