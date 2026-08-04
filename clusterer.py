"""clusterer.py — fingerprint + clustering par sujet (sans LLM)."""
import re
from collections import defaultdict

# Mots porteurs : noms propres (capitalisés) + entités Guinée + scores
_STOP = set("la le les un une des du de ce sa se au en à par pour sur dans avec "
            "des son sa ses leur leurs que qui quoi dont comme buts deux trois "
            "score final face face au équipe équipes match amical première mi temps "
            "public nombreux spectateurs stade septembre samedi dimanche".split())

def _entities(text: str) -> set:
    """Extrait les tokens distinctifs : noms propres et entités Guinée.
    On EXCLUT les chiffres isolés (dates, compteurs) et les mots français courants
    qui polluent l'empreinte. Seuls les scores type '2-1' sont gardés."""
    toks = set()
    # noms propres : Majuscule + minuscules (ex. Sylla, Conakry, Mali)
    for m in re.findall(r"\b[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'-]+\b", text):
        ml = m.lower()
        if ml not in _STOP:
            toks.add(ml)
    # scores sportifs type 2-1 / 3-0
    for m in re.findall(r"\b\d-\d\b", text):
        toks.add("score-" + m)
    # entités Guinée explicites (insensible à la casse)
    low = text.lower()
    for e in ("guinée", "guinee", "conakry", "mali", "sénégal", "bcrg", "matd",
              "kankan", "kindia", "n'zérékoré", "labé", "boke", "fria"):
        if e in low:
            toks.add(e)
    return toks

def fingerprint(text: str, n: int = 5) -> str:
    """Empreinte = entités distinctives triées (pas tous les mots)."""
    return " ".join(sorted(_entities(text))[:n])

def _sim_entities(a: str, b: str) -> float:
    sa, sb = _entities(a), _entities(b)
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / min(len(sa), len(sb))  # Jaccard sur le plus petit

def _ent_set(text: str, n: int = 5) -> set:
    """Ensemble réduit (n) d'entités distinctives — pour comparaison de similarité."""
    return set(sorted(_entities(text))[:n])

def cluster(items: list, thr: float = 0.5) -> list:
    """Regroupe les items par ENTITÉS communes (même fait). 1 fait = 1 cluster.
    Seuil 0.5 : partage >=50% des entités distinctives = même sujet.
    Compare les ensembles réduits d'entités (pas le texte brut, qui dilue)."""
    clusters = []
    for it in items:
        key = it["title"] + " " + it.get("raw_content", "")[:300]
        es = _ent_set(key)
        placed = False
        for c in clusters:
            ckey = c[0]["title"] + " " + c[0].get("raw_content", "")[:300]
            ces = _ent_set(ckey)
            if len(es & ces) / min(len(es), len(ces)) >= thr:
                c.append(it)
                placed = True
                break
        if not placed:
            clusters.append([it])
    return clusters

def score_item(it: dict) -> float:
    """Pertinence : +source_level, +richesse, +factuel, +fraîcheur."""
    s = 0.0
    s += it.get("source_level", 1) * 2.0
    s += min(len(it.get("raw_content", "")) / 500.0, 3.0)  # richesse
    rc = it.get("raw_content", "")
    if re.search(r"\d", rc):
        s += 1.0  # factuel
    if re.search(r"\d{4}", rc):
        s += 0.5  # dates
    return s

def pick_champion(cluster: list) -> tuple:
    """Retourne (champion, contextes) pour un cluster."""
    ranked = sorted(cluster, key=score_item, reverse=True)
    return ranked[0], ranked[1:]
