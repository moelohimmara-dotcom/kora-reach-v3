"""Test charge concurrente P0 — 20 threads x 50 writes doivent passer sans OperationalError."""
import threading, tempfile, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import editorial.audit as audit

errors = []
def worker(n):
    for i in range(50):
        try:
            audit.log(f"test-{n}", f"WRITE {i}", fact_id=f"fact_{n}_{i}", editor="test")
        except Exception as e:
            errors.append(str(e))

threads = [threading.Thread(target=worker, args=(k,)) for k in range(20)]
for t in threads: t.start()
for t in threads: t.join()
print(f"errors={len(errors)}")
if errors:
    print(errors[:3])
    sys.exit(1)
print("PASS — 1000 writes concurrents sans locked")
