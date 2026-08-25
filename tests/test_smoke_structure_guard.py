#!/usr/bin/env python3
"""test_smoke_structure_guard.py — verifie le garde-fou structure de
generation/writer.py (2026-08-20, rapporte : articles generes en un seul
bloc malgre la regle 1 du prompt systeme, non detecte par l'auto-critique
existante). Cascade : detection (_structure_ok) -> reparation LLM ciblee
(_llm_fix_structure, avec garde-fou anti-perte de contenu) -> filet
mecanique deterministe (_mechanical_paragraph_split, ne peut jamais
echouer) -> integration complete (_finalize_article).

Usage : python3 tests/test_smoke_structure_guard.py
"""
import sys
import os
import types

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, REPO_ROOT)

for _mod, _attr, _val in (
    ("feedparser", "parse", lambda *a, **k: types.SimpleNamespace(entries=[], bozo=1)),
    ("trafilatura", "extract", lambda *a, **k: ""),
):
    try:
        __import__(_mod)
    except ImportError:
        stub = types.ModuleType(_mod)
        setattr(stub, _attr, _val)
        sys.modules[_mod] = stub

import generation.writer as writer

BIEN_STRUCTURE = """# Titre de l'article

Chapô en deux ou trois phrases qui pose le contexte factuel de l'article de presse.

Premier paragraphe du corps qui développe un premier angle avec plusieurs phrases distinctes et du contenu substantiel pour dépasser le seuil des soixante mots requis par paragraphe.

Deuxième paragraphe du corps qui développe un second angle avec plusieurs phrases distinctes et du contenu substantiel pour dépasser le seuil des soixante mots requis par paragraphe.

Troisième paragraphe du corps qui développe un troisième angle avec plusieurs phrases distinctes et du contenu substantiel pour dépasser le seuil des soixante mots requis par paragraphe.

Quatrième paragraphe du corps qui développe un dernier angle avec plusieurs phrases distinctes et du contenu substantiel pour dépasser le seuil des soixante mots requis par paragraphe.

Par La Rédaction"""

MAL_STRUCTURE = ("# Titre de l'article\n\n"
    + " ".join([f"Phrase numéro {i} qui contient plusieurs mots pour simuler du contenu réel d'article de presse en Guinée."
                for i in range(1, 40)])
    + "\n\nPar La Rédaction")


def main():
    failed = []

    if not writer._structure_ok(BIEN_STRUCTURE):
        failed.append("_structure_ok: un article bien structure devrait passer")
    else:
        print("OK   _structure_ok accepte un article bien structure")

    if writer._structure_ok(MAL_STRUCTURE):
        failed.append("_structure_ok: un bloc unique ne devrait PAS passer")
    else:
        print("OK   _structure_ok rejette un bloc unique")

    fixed = writer._mechanical_paragraph_split(MAL_STRUCTURE)
    if not writer._structure_ok(fixed):
        failed.append(f"_mechanical_paragraph_split: resultat toujours mal structure -- {fixed[:200]}")
    else:
        print("OK   _mechanical_paragraph_split repare un bloc unique")

    orig_words = set(MAL_STRUCTURE.replace("\n", " ").split())
    fixed_words = set(fixed.replace("\n", " ").split())
    if not orig_words.issubset(fixed_words):
        failed.append(f"_mechanical_paragraph_split: mots perdus -- {list(orig_words - fixed_words)[:10]}")
    else:
        print("OK   _mechanical_paragraph_split ne perd aucun mot")

    if not fixed.startswith("# Titre de l'article"):
        failed.append(f"_mechanical_paragraph_split: titre non preserve -- {fixed[:60]!r}")
    else:
        print("OK   titre preserve")
    if not fixed.rstrip().endswith("Par La Rédaction"):
        failed.append(f"_mechanical_paragraph_split: signature non preservee -- {fixed[-60:]!r}")
    else:
        print("OK   signature preservee")

    if writer._mechanical_paragraph_split("") != "":
        failed.append("_mechanical_paragraph_split(''): devrait rendre ''")
    else:
        print("OK   texte vide gere proprement")

    writer.simple_completion = lambda sysp, usrp, max_tokens=2600: "Reponse LLM tronquee trop courte."
    if writer._llm_fix_structure(MAL_STRUCTURE) is not None:
        failed.append("_llm_fix_structure: aurait du rejeter une reponse avec perte de contenu suspecte")
    else:
        print("OK   _llm_fix_structure rejette une reponse LLM avec perte de contenu suspecte")

    mal_words = MAL_STRUCTURE.replace("\n\n", " ").split()
    reformatted = ("# Titre de l'article\n\n" + " ".join(mal_words[2:22]) + "\n\n"
                   + " ".join(mal_words[22:42]) + "\n\n" + " ".join(mal_words[42:])
                   + "\n\nPar La Rédaction")
    writer.simple_completion = lambda sysp, usrp, max_tokens=2600: reformatted
    if writer._llm_fix_structure(MAL_STRUCTURE) != reformatted:
        failed.append("_llm_fix_structure: aurait du accepter une reponse LLM correcte (meme contenu, reformatee)")
    else:
        print("OK   _llm_fix_structure accepte une reponse LLM correcte")

    writer.simple_completion = lambda sysp, usrp, max_tokens=2600: (_ for _ in ()).throw(RuntimeError("panne reseau"))
    if writer._llm_fix_structure(MAL_STRUCTURE) is not None:
        failed.append("_llm_fix_structure: une exception devrait rendre None, pas lever")
    else:
        print("OK   _llm_fix_structure absorbe une exception reseau sans lever")

    writer.simple_completion = lambda sysp, usrp, max_tokens=2600: None
    writer._self_critique = lambda raw: ""
    writer._ensure_min_length = lambda raw, fact, lt, max_attempts=1: raw
    fact = {"champion": {"title": "Test", "source": "test", "url": "http://x"}, "sources_secondaires": []}
    lt = {"target": 10, "score": 0, "reasons": []}
    result = writer._finalize_article(MAL_STRUCTURE, fact, lt)
    if not writer._structure_ok(result["article"]):
        failed.append(f"_finalize_article: article final toujours mal structure -- {result['article'][:200]}")
    else:
        print("OK   _finalize_article repare la structure via le filet mecanique (LLM indisponible)")
    if not result.get("structure_fixed"):
        failed.append("_finalize_article: structure_fixed devrait etre True")
    else:
        print("OK   structure_fixed=True correctement signale")

    call_count = {"n": 0}
    def counting_completion(sysp, usrp, max_tokens=2600):
        call_count["n"] += 1
        return "ne devrait jamais etre appelee"
    writer.simple_completion = counting_completion
    result2 = writer._finalize_article(BIEN_STRUCTURE, fact, lt)
    if call_count["n"] != 0:
        failed.append(f"_finalize_article: {call_count['n']} appel(s) LLM inutile(s) sur un article deja correct")
    else:
        print("OK   aucun appel LLM de reparation sur un article deja bien structure")
    if result2.get("structure_fixed"):
        failed.append("_finalize_article: structure_fixed devrait etre False sur un article deja correct")
    else:
        print("OK   structure_fixed=False sur un article deja correct")

    # Cas trouve par revue de code independante (2026-08-20) : le filet
    # mecanique se voulait une garantie absolue ("ne peut jamais echouer")
    # mais une taille de groupe FIXE pouvait produire MOINS de blocs que le
    # seuil sur un article court -- corrige (taille dynamique). Verifie sur
    # un cas exactement a la limite (6 phrases de corps).
    mal_court = ("# Titre court\n\n"
        + " ".join([f"Phrase numero {i} du corps de l'article." for i in range(1, 7)])
        + "\n\nPar La Rédaction")
    fixed_court = writer._mechanical_paragraph_split(mal_court)
    if not writer._structure_ok(fixed_court):
        failed.append(f"_mechanical_paragraph_split: cas limite (6 phrases) toujours sous le seuil -- {fixed_court!r}")
    else:
        print("OK   _mechanical_paragraph_split atteint le seuil sur un article court (regression testee)")

    # Cas VRAIMENT trop court (4 phrases) : meme le filet ne peut pas
    # garantir le seuil sans dupliquer/couper des phrases -- _finalize_article
    # doit rapporter HONNETEMENT structure_fixed=False plutot que pretendre
    # un succes qui n'a pas eu lieu.
    mal_tres_court = "# Titre\n\n" + " ".join([f"Phrase {i}." for i in range(1, 5)]) + "\n\nPar La Rédaction"
    writer.simple_completion = lambda sysp, usrp, max_tokens=2600: None
    result3 = writer._finalize_article(mal_tres_court, fact, lt)
    if result3.get("structure_fixed") and not writer._structure_ok(result3["article"]):
        failed.append("_finalize_article: pretend structure_fixed=True sur un resultat qui echoue toujours _structure_ok")
    else:
        print("OK   _finalize_article honnete sur l'echec du cas extreme (jamais de faux succes)")

    print()
    if failed:
        print(f"{len(failed)} ECHEC(S):")
        for f in failed:
            print(f"  - {f}")
        return 1
    print("TOUS LES TESTS DU GARDE-FOU STRUCTURE PASSENT")
    return 0


if __name__ == "__main__":
    sys.exit(main())
