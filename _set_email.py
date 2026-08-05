import db, auth
con, _ = db.conn()
cur = con.cursor()
cur.execute("UPDATE kora_users SET email=%s WHERE username=%s", ("moelohimmara@gmail.com", "admin"))
con.commit()
u = auth._get_user_by_username("admin")
print("admin email ->", u["email"] if isinstance(u, dict) else u[3])
