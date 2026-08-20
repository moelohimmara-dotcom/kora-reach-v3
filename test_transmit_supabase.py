"""test_transmit_supabase.py — valide transmit.py en mode supabase réel (ta table)."""
import os
os.environ.setdefault("SUPABASE_URL", "https://zixpugzpyrqnzjbjopns.supabase.co")
# La clé est fournie en env par l'appel terminal (jamais dans le fichier).

import sys
sys.path.insert(0, "/opt/data/kora-reach")
import publishing.transmit as transmit

# Fact HITL réaliste (issu de la logique reconçue : 3 sources fusionnées)
fact = {
    "champion": {
        "title": "Guinée : la BAD finance un barrage à Koukoutamba",
        "url": "https://mosaiqueguinee.com/koukoutamba-bad-2026",
        "source": "mosaiqueguinee.com",
    },
    "contexts": [{"source": "guineenews.org"}, {"source": "guinee360.com"}],
    "n_sources": 3,
    "article": "La Banque africaine de développement (BAD) finance le barrage "
               "de Koukoutamba en Guinée. Plusieurs sources nationales convergent.",
    "gen_model": "template",
    "image": "",
}
final = fact["article"]

res = transmit.transmit(fact, final, provider="supabase")
print("RÉSULTAT:", res)
assert res["status"] in ("TRANSMITTED", "SKIPPED_DUPLICATE"), f"Échec: {res}"
print("✅ transmit.py mode supabase branché sur TON schéma (articles) ->", res["status"])
