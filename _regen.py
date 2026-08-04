import hitl_store as hs, writer, json, db, time

SKIP = {"fact_43fe17d3fd824459"}  # deja fait
facts = hs.list_facts()
todo = [f for f in facts if f["fact_id"] not in SKIP]
print(f"Facts a regenerer: {len(todo)}")

for f in todo:
    fid = f["fact_id"]
    champ = f["champion"] if isinstance(f["champion"], dict) else json.loads(f["champion"])
    ctx = f["contexts"] if isinstance(f["contexts"], list) else (json.loads(f["contexts"]) if f["contexts"] else [])
    fact = {"champion": champ, "contexts": ctx}
    try:
        r = writer.write_article(fact)
        art = r.get("article", "")
        words = len(art.split())
        con, mode = db.conn()
        cur = con.cursor()
        cur.execute("UPDATE hitl_facts SET article=%s WHERE fact_id=%s", (art, fid))
        con.commit(); con.close()
        ok = words >= 879
        print(f"  {fid[:14]} -> {words} mots | {r.get('model')} | RESPECTE_879={ok}")
    except Exception as e:
        print(f"  {fid[:14]} -> ERREUR: {e}")
    time.sleep(1)
print("REGEN_DONE")
