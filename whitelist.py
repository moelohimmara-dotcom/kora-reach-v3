"""whitelist.py — gouvernance des sources versionnée (G1 du CDC).

Matrice des 12 sources autorisées avec :
- identifiant interne stable
- domaines/sous-domaines autorisés (liste fermée)
- URL d'entrée
- vecteur prioritaire/secondaire
- redirections autorisées (liste fermée)
- responsable + date + version
Aucune découverte de domaine automatique. Toute cible hors liste = refusée,
y compris après redirection.
"""
from dataclasses import dataclass, field
from typing import List, Set
from urllib.parse import urlparse


@dataclass(frozen=True)
class WhitelistEntry:
    id: str                      # identifiant interne stable
    name: str                    # nom éditorial
    category: str                # "GN_NAT" | "INTL"
    entry_url: str               # URL d'entrée
    allowed_domains: tuple       # domaines + sous-domaines autorisés (fermé)
    vector_primary: str          # "rss" | "html" | "gnews"
    vector_secondary: str = ""   # "sitemap" | "" 
    allowed_redirects: tuple = ()  # redirections explicitement autorisées
    guinee_filter: bool = False  # INTL: mention Guinée exigée
    responsible: str = "edito"   # responsable validation
    version: str = "2026-08-02"  # version whitelist
    status: str = "active"       # active | suspended | retired

    @property
    def url(self) -> str:
        """Alias pour compatibilité fetchers (utilise entry_url)."""
        return self.entry_url

    @property
    def fmt(self) -> str:
        """Alias pour compatibilité (vecteur primaire)."""
        return self.vector_primary

    @property
    def scope(self) -> str:
        return self.category

    @property
    def source_level(self) -> int:
        # GN_NAT -> niveau 1, INTL -> niveau 2
        return 1 if self.category == "GN_NAT" else 2


# Version figée de la whitelist (G1). Domaines listés explicitement.
WHITELIST: List[WhitelistEntry] = [
    WhitelistEntry("mosaique", "Mosaique Guinée", "GN_NAT",
        "https://mosaiqueguinee.com/", ("mosaiqueguinee.com",),
        "html", "sitemap", responsible="edito"),
    WhitelistEntry("guineenews", "Guinéenews", "GN_NAT",
        "https://guineenews.org/", ("guineenews.org",),
        "html", "sitemap", responsible="edito"),
    WhitelistEntry("guinee360", "Guinée 360", "GN_NAT",
        "https://www.guinee360.com/", ("www.guinee360.com", "guinee360.com"),
        "html", "sitemap", responsible="edito"),
    WhitelistEntry("mediaguinee", "Mediaguinee", "GN_NAT",
        "https://mediaguinee.com/", ("mediaguinee.com",),
        "html", "sitemap", responsible="edito"),
    WhitelistEntry("guineematin", "Guineematin", "GN_NAT",
        "https://guineematin.com/", ("guineematin.com",),
        "html", "sitemap", responsible="edito"),
    WhitelistEntry("guinee7", "Guinee7", "GN_NAT",
        "https://www.guinee7.com/", ("www.guinee7.com", "guinee7.com"),
        "html", "sitemap", responsible="edito"),
    WhitelistEntry("africaguinee", "Africa Guinee", "GN_NAT",
        "https://www.africaguinee.com/", ("www.africaguinee.com", "africaguinee.com"),
        "html", "sitemap", responsible="edito"),
    WhitelistEntry("visionguinee", "Vision Guinee", "GN_NAT",
        "https://www.visionguinee.info/", ("www.visionguinee.info", "visionguinee.info"),
        "html", "sitemap", responsible="edito"),
    WhitelistEntry("rfi_guinee", "RFI Guinée", "INTL",
        "https://www.rfi.fr/fr/tag/guin%C3%A9e/rss", ("www.rfi.fr", "rfi.fr"),
        "rss", guinee_filter=True, responsible="edito"),
    WhitelistEntry("bbc_afrique", "BBC Afrique", "INTL",
        "https://feeds.bbci.co.uk/afrique/rss.xml?lang=fr", ("feeds.bbci.co.uk", "www.bbc.com", "bbc.com"),
        "rss", guinee_filter=True, responsible="edito"),
    WhitelistEntry("france24_afrique", "France24 Afrique", "INTL",
        "https://www.france24.com/fr/afrique/rss", ("www.france24.com", "france24.com"),
        "rss", guinee_filter=True, responsible="edito"),
    WhitelistEntry("google_news_guinee", "Google News Guinée", "INTL",
        "https://news.google.com/rss/search?q=Guin%C3%A9e&hl=fr&gl=GN&ceid=GN:fr",
        ("news.google.com",), "gnews", guinee_filter=False,
        allowed_redirects=("news.google.com",), responsible="edito"),
]

WHITELIST_VERSION = "2026-08-02"
_ACTIVE_DOMAINS: Set[str] = set()
for _e in WHITELIST:
    _ACTIVE_DOMAINS.update(_e.allowed_domains)
    _ACTIVE_DOMAINS.update(_e.allowed_redirects)


def _host(url: str) -> str:
    try:
        return (urlparse(url).netloc or "").lower()
    except Exception:
        return ""


def is_allowed(url: str) -> bool:
    """Vrai si l'hôte est dans un domaine autorisé (avant OU après redirection)."""
    host = _host(url)
    if not host:
        return False
    # match exact ou sous-domaine d'un domaine autorisé
    return any(host == d or host.endswith("." + d) for d in _ACTIVE_DOMAINS)


def get_entry(source_id: str) -> WhitelistEntry:
    for e in WHITELIST:
        if e.id == source_id:
            return e
    raise KeyError(f"Source {source_id} absente de la whitelist")


def get_entry_by_source(source_name: str):
    """Retourne l'entrée whitelist dont le nom/domaine correspond au 'source'
    d'un article (ex. 'mosaiqueguinee.com', 'RFI Guinée'). None si aucune."""
    if not source_name:
        return None
    s = source_name.lower()
    for e in WHITELIST:
        if s in e.name.lower():
            return e
        for d in e.allowed_domains:
            if s in d.lower():
                return e
    return None


def active_entries() -> List[WhitelistEntry]:
    return [e for e in WHITELIST if e.status == "active"]
