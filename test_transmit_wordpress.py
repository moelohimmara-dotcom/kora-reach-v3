"""test_transmit_wordpress.py — valide transmit.py mode wordpress réel (ta table WP)."""
import os, sys
sys.path.insert(0, "/opt/data/kora-reach")
import publishing.transmit as transmit

# Fact HITL réaliste
fact = {
    "champion": {
        "title": "Guinée : la BAD finance un barrage à Koukoutamba (test Reach)",
        "url": "https://mosaiqueguinee.com/koukoutamba-bad-wp-test",
        "source": "mosaiqueguinee.com",
    },
    "contexts": [{"source": "guineenews.org"}, {"source": "guinee360.com"}],
    "n_sources": 3,
    "article": "La Banque africaine de développement (BAD) finance le barrage de "
               "Koukoutamba en Guinée. Plusieurs sources nationales convergent sur ce fait.",
    "gen_model": "template",
    "image": "",
}
res = transmit.transmit(fact, fact["article"], provider="wordpress")
print("RÉSULTAT:", res)
assert res["status"] in ("TRANSMITTED", "FAILED"), f"Statut inattendu: {res}"
if res["status"] == "TRANSMITTED":
    print("✅ WordPress PUBLIÉ ->", res.get("wp_url"), "(post id", res.get("wp_post_id"), ")")
    print("   ⚠️ Article de TEST sur ton site public — à supprimer si non désiré.")
else:
    print("⚠️ Échec WP:", res["detail"])
