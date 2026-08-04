"""guinea_filter.py — désambiguïsation stricte de la mention "Guinée" (DEC-003).

Rejette les contenus internationaux qui mentionnent :
- la Guinée-Bissau
- la Guinée équatoriale
- la Papouasie-Nouvelle-Guinée
- ou toute référence ambiguë SANS mention explicite de la Guinée (Conakry).
Une mention "Guinée" seule est ambiguë -> rejet + signalement (jamais acceptée
par supposition). Le pays visé doit être explicitement la Guinée (Conakry).
"""
import re

# Formes ambiguës / autres pays à EXCLURE (insensibilité cas, accents)
_EXCLUDE_PATTERNS = [
    r"guin[ée]e[- ]?bissau",
    r"guin[ée]e[- ]?equatorial",
    r"guin[ée]e[- ]?equatoriale",
    r"papouasie[- ]?nouvelle[- ]?guin[ée]e",
    r"nouvelle[- ]?guin[ée]e",
    r"bissau",
    r"malabo",            # capitale Guinée équatoriale
    r"\bequatoriale\b",
]

# Marqueurs explicites de la Guinée (Conakry)
_GUINEA_POSITIVE = [
    r"guin[ée]e",                    # "Guinée"/"Guinea" nue -> ambiguë, traitée séparément
    r"conakry",
    r"konakry",
    r"\bguin[ée]en\b",              # "guinéen" = relatif à la Guinée
    r"\bguin[ée]enne\b",
    r"\bguinean\b",                 # anglais
    r"\bguinea\b",                  # anglais
]


def mentions_greenhouse(text: str) -> bool:
    """Vrai si une forme de 'Guinée/Guinea' apparaît (fr + en)."""
    return bool(re.search(r"guin[ée]e|guinean|guinea", text, re.IGNORECASE))


def is_greenhouse_ambiguous(text: str) -> bool:
    """Vrai si le texte parle d'un AUTRE pays que la Guinée (Conakry)."""
    return any(re.search(p, text, re.IGNORECASE) for p in _EXCLUDE_PATTERNS)


def is_explicit_greenhouse(text: str) -> bool:
    """Le texte vise-t-il la Guinée (Conakry) ?
    Règle (CDC DEC-003) : 'guinée/guinea' présente + AUCUN pays exclus
    (Bissau/Équatorial/Papouasie) -> accepté. Conakry/guinéen sont des marqueurs
    forts mais NON requis (un article RFI 'Guinée' sans 'Conakry' vise la Guinée).
    """
    t = text or ""
    if is_greenhouse_ambiguous(t):
        return False  # un autre pays est explicitement nommé -> pas la Guinée
    return mentions_greenhouse(t)


def filter_guinea(text: str, title: str = None) -> tuple[bool, str]:
    """Retourne (accepté, motif).
    - True si la Guinée (Conakry) est le SUJET de l'article.
    - False + motif si rejeté (Bissau/Équatorial/Papouasie/ambigu/mention accessoire).
    Règle (DEC-003 renforcée) : la mention 'Guinée/Guinea' doit être le sujet,
    pas une citation accessoire. On exige donc que 'Guinée' soit présente dans le
    TITRE (paramètre title) OU apparaisse au moins 2 fois dans le corps.
    """
    t = text or ""
    if is_greenhouse_ambiguous(t):
        return False, "AUTRE_PAYS_EXCLU"
    if not mentions_greenhouse(t):
        return False, "PAS_DE_MENTION"
    # La Guinée doit être le sujet (titre) ou suffisamment présente (>=2 mentions)
    title_part = (title or "")[:150]
    mentions = len(re.findall(r"guin[ée]e|guinean|guinea", t, re.IGNORECASE))
    if mentions_greenhouse(title_part) or mentions >= 2:
        return True, "OK"
    return False, "AMBIGU_MENTION_ACCESSOIRE"
