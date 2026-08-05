import db, auth
con, _ = db.conn()
cur = con.cursor()
# genere un token via forgot
auth.forgot_password("admin@kora.reach")
cur.execute("SELECT reset_token FROM kora_users WHERE username=%s" % ("'admin'" if db.BACKEND=="postgres" else "'admin'"))
row = cur.fetchone()
token = row["reset_token"] if isinstance(row, dict) else row[0]
print("TOKEN:" + (token or "NONE"))
