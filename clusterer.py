"""clusterer.py — fingerprint + clustering par sujet (sans LLM).

Refonte 2026-08-19 (diagnostic P0 §1) : l'ancienne version comparait des
ensembles d'entités tronqués arbitrairement aux 5 premiers (ordre alphabétique
-> perdait des entités distinctives comme des noms de joueurs) et divisait par
min(len(a), len(b)) au lieu de l'union -> un article pouvait être "similaire à
100%" simplement parce qu'il était un sous-ensemble d'un autre, même sur un
fait totalement différent (deux articles guinéens partagent quasi toujours
"guinée"/"conakry"). Corrections apportées :
  1. Comparaison sur l'ENSEMBLE COMPLET des entités (plus de cap arbitraire).
  2. Vrai indice de Jaccard (intersection / union), pas intersection / min.
  3. Plancher absolu (>=2 entités partagées) pour éviter qu'un seul mot
     générique commun ("guinée") ne suffise à fusionner deux faits distincts.
  4. Nettoyage des artefacts de regex sur les titres à tiret ("Mali-Guinée"
     capturait auparavant "mali-" au lieu de "mali").
"""
import re

# Mots porteurs : noms propres (capitalisés) + entités Guinée + scores
_STOP = set("la le les un une des du de ce sa se au en à par pour sur dans avec "
            "des son sa ses leur leurs que qui quoi dont comme buts deux trois "
            "score final face face au équipe équipes match amical première mi temps "
            "public nombreux spectateurs stade septembre samedi dimanche".split())

# Plancher absolu d'entités communes exigé pour fusionner (indépendant du ratio
# Jaccard) : évite qu'un seul mot générique partagé ("guinée", "conakry", quasi
# toujours présent dans ce corpus) suffise à fusionner deux faits distincts.
_MIN_SHARED_ENTITIES = 2

def _entities(text: str) -> set:
    """Extrait les tokens distinctifs : noms propres et entités Guinée.
    On EXCLUT les chiffres isolés (dates, compteurs) et les mots français courants
    qui polluent l'empreinte. Seuls les scores type '2-1' sont gardés."""
    toks = set()
    # noms propres : Majuscule + minuscules (ex. Sylla, Conakry, Mali)
    for m in re.findall(r"\b[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'-]+\b", text):
        # strip("-'") : "Mali-Guinée" fait matcher "Mali-" (tiret capturé en
        # fin de token car autorisé dans la classe de caractères) -> sans ce
        # nettoyage "mali-" != "mali" et le lien avec les autres items est perdu.
        ml = m.lower().strip("-'")
        if len(ml) > 1 and ml not in _STOP:
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
    """Empreinte lisible = n entités distinctives triées (usage log/debug
    uniquement — la comparaison de similarité utilise l'ensemble complet)."""
    return " ".join(sorted(_entities(text))[:n])

def _sim(es: set, c_union: set) -> float:
    """Vrai indice de Jaccard : intersection / union (pas / min)."""
    if not es or not c_union:
        return 0.0
    inter = es & c_union
    if len(inter) < _MIN_SHARED_ENTITIES:
        return 0.0
    return len(inter) / len(es | c_union)

def _key_of(it: dict) -> str:
    return it["title"] + " " + it.get("raw_content", "")[:300]

def cluster(items: list, thr: float = 0.35) -> list:
    """Regroupe les items par ENTITÉS communes (même fait). 1 fait = 1 cluster.
    Compare le nouvel item contre l'UNION des entités de TOUS les membres du
    cluster (pas seulement le premier), avec un vrai Jaccard (intersection sur
    union) et un plancher absolu d'entités partagées (voir _MIN_SHARED_ENTITIES).
    Seuil par défaut abaissé (0.5 -> 0.35) car un Jaccard sur union est
    structurellement plus strict qu'un Jaccard sur min (l'ancien calcul)."""
    clusters = []       # list[list[item]]
    cluster_ents = []   # union d'entités courante, parallèle à `clusters`
    for it in items:
        es = _entities(_key_of(it))
        placed = False
        for idx, c_union in enumerate(cluster_ents):
            if _sim(es, c_union) >= thr:
                clusters[idx].append(it)
                cluster_ents[idx] = c_union | es
                placed = True
                break
        if not placed:
            clusters.append([it])
            cluster_ents.append(es)
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
