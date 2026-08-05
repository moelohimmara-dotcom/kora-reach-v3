import db, auth
# Remet le mot de passe admin a la valeur communiquee (demo)
con, _ = db.conn()
cur = con.cursor()
ph = db.placeholder()
cur.execute(f"UPDATE kora_users SET password_hash={ph} WHERE username={ph}", (auth._hash_password("8pmZ51MomotX9WpP"), "admin"))
con.commit()
print("OK reset to 8pmZ51MomotX9WpP")
print("LOGIN:", auth.login("admin", "8pmZ51MomotX9WpP"))
