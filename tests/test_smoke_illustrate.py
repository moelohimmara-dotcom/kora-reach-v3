#!/usr/bin/env python3
"""test_smoke_illustrate.py — verrouille la nouvelle regle de selection
d'image de couverture (2026-08-21, demande explicite : refleter la realite
plutot que fabriquer -- retrait complet de FAL/Pollinations) : priorite
absolue a une image REELLE issue d'une des sources du dossier (champion,
puis contextes par fiabilite), repli sur une photo stock (LoremFlickr/
Picsum) UNIQUEMENT si aucune source n'a d'image. Verifie aussi qu'AUCUN
appel reseau n'est tente quand une image reelle existe deja (preuve que
Pollinations est bien deconnecte), et la garantie d'unicite inter-articles
de illustrate_all().

Usage : python3 tests/test_smoke_illustrate.py
"""
import sys
import os

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, REPO_ROOT)

import generation.illustrate as illustrate  # noqa: E402


def main():
    failed = []

    # ---- 1. Champion illustre -> priorite absolue ----
    champ = {"title": "T", "image": "https://source-a.example/photo1.jpg", "source_level": 2}
    ctx = [{"image": "https://source-b.example/photo2.jpg", "source_level": 3}]
    img = illustrate.select_source_image(champ, ctx)
    if img != champ["image"]:
        failed.append(f"le champion illustre aurait du etre priorise, obtenu : {img!r}")
    else:
        print("OK   le champion (meilleure source) est priorise quand il a une image")

    # ---- 2. Champion SANS image, 2+ sources (contexts) en ont -> choisit
    # parmi les contexts, le plus fiable (source_level le plus haut) ----
    champ2 = {"title": "T", "image": "", "source_level": 1}
    ctx2 = [
        {"image": "https://faible.example/x.jpg", "source_level": 1},
        {"image": "https://fiable.example/y.jpg", "source_level": 3},
    ]
    img2 = illustrate.select_source_image(champ2, ctx2)
    if img2 != "https://fiable.example/y.jpg":
        failed.append(f"aurait du choisir le contexte le plus fiable (source_level=3), obtenu : {img2!r}")
    else:
        print("OK   champion sans image -> choisit le contexte le plus fiable parmi 2+ sources")

    # ---- 3. Cluster a une seule source (n_sources=1), avec image -> la
    # regle se degenere naturellement (un seul candidat) ----
    champ3 = {"title": "T", "image": "https://seule-source.example/z.jpg"}
    img3 = illustrate.select_source_image(champ3, [])
    if img3 != champ3["image"]:
        failed.append(f"source unique avec image aurait du etre choisie, obtenu : {img3!r}")
    else:
        print("OK   dossier a une seule source : son image est choisie (cas degenere de la regle)")

    # ---- 4. Aucune source du dossier n'a d'image -> "" (pas de candidat reel) ----
    champ4 = {"title": "T", "image": ""}
    ctx4 = [{"image": ""}, {"image": ""}]
    img4 = illustrate.select_source_image(champ4, ctx4)
    if img4 != "":
        failed.append(f"aucune image dans le dossier aurait du renvoyer '', obtenu : {img4!r}")
    else:
        print("OK   aucune image dans le dossier -> select_source_image renvoie '' (pas de faux positif)")

    # ---- 5. AUCUN appel reseau quand une image reelle existe (preuve du
    # retrait de Pollinations) : on fait planter _call_loremflickr si jamais
    # invoque -- illustrate() ne doit JAMAIS l'atteindre dans ce cas. ----
    def _boom(*a, **k):
        raise AssertionError("_call_loremflickr appele alors qu'une image reelle du dossier existait")
    _orig_lf = illustrate._call_loremflickr
    illustrate._call_loremflickr = _boom
    try:
        res5 = illustrate.illustrate(champ, ctx, "T")
        if res5["provider"] != "source" or res5["image"] != champ["image"]:
            failed.append(f"illustrate() aurait du retourner l'image source sans appel reseau : {res5}")
        elif res5.get("generated") is not False:
            failed.append(f"generated devrait etre False pour une vraie photo de source : {res5}")
        else:
            print("OK   illustrate() ne fait AUCUN appel reseau (Pollinations bien deconnecte) quand une image reelle existe")
    finally:
        illustrate._call_loremflickr = _orig_lf

    # ---- 6. Aucune image dans le dossier -> repli LoremFlickr (mocke, pas de reseau) ----
    illustrate._call_loremflickr = lambda title, salt="", lock_override=None: ("https://loremflickr.example/mock.jpg", "loremflickr")
    try:
        res6 = illustrate.illustrate(champ4, ctx4, "Sujet")
        if res6["provider"] != "loremflickr" or res6.get("generated") is not True:
            failed.append(f"repli LoremFlickr attendu quand aucune source n'a d'image : {res6}")
        else:
            print("OK   repli sur une vraie photo stock (LoremFlickr) quand aucune source n'a d'image")
    finally:
        illustrate._call_loremflickr = _orig_lf

    # ---- 7. Repli Picsum si LoremFlickr echoue aussi (dernier recours) ----
    illustrate._call_loremflickr = lambda *a, **k: (_ for _ in ()).throw(RuntimeError("indisponible"))
    try:
        res7 = illustrate.illustrate(champ4, ctx4, "Sujet")
        if res7["provider"] != "picsum":
            failed.append(f"repli Picsum attendu en dernier recours : {res7}")
        else:
            print("OK   repli sur Picsum si LoremFlickr echoue aussi (jamais d'article sans visuel)")
    finally:
        illustrate._call_loremflickr = _orig_lf

    # ---- 8. illustrate_all() : garantie d'unicite inter-articles ----
    facts = [
        {"fact_id": "f1", "champion": {"title": "A", "image": "https://x.example/meme.jpg"}, "sources_secondaires": []},
        {"fact_id": "f2", "champion": {"title": "B", "image": "https://x.example/meme.jpg"}, "sources_secondaires": [
            {"image": "https://x.example/autre.jpg", "source_level": 1}]},
    ]
    illustrate.illustrate_all(facts)
    imgs = [f["image"] for f in facts]
    if len(set(imgs)) != len(imgs):
        failed.append(f"illustrate_all() a produit des images dupliquees entre articles : {imgs}")
    elif facts[1]["image"] != "https://x.example/autre.jpg":
        failed.append(f"le 2e fait aurait du retomber sur son 2e candidat (le 1er est deja pris) : {facts[1]['image']!r}")
    else:
        print("OK   illustrate_all() garantit l'unicite : le 2e fait retombe sur son candidat suivant plutot que de dupliquer")

    print()
    if failed:
        print(f"{len(failed)} ECHEC(S):")
        for f in failed:
            print(f"  - {f}")
        return 1
    print("TOUS LES TESTS DE SELECTION D'IMAGE PASSENT")
    return 0


if __name__ == "__main__":
    sys.exit(main())
