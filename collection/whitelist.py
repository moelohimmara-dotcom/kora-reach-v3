"""whitelist.py — gouvernance des sources versionnée (G1 du CDC).

Refonte 2026-08-19 (diagnostic P2 §8, gestion via UI demandée explicitement) :
la whitelist était figée en dur dans ce fichier (liste Python), modifiable
uniquement par un commit Git. Elle est désormais stockée en base (table
`whitelist_sources`, via db.py — SQLite en dev, Postgres en prod) et
gérable depuis l'interface (advanced) : ajout, modification, activation/
suspension d'une source. La piste d'audit qu'assurait le commit Git est
reprise par audit.log() sur chaque mutation (voir server.py, capacité
"gerer_sources").

Principe inchangé (G1) : aucune découverte de domaine automatique. Toute
cible hors liste des domaines autorisés d'une source = refusée, y compris
après redirection (is_allowed()).
"""
from dataclasses import dataclass
from typing import List, Optional
from urllib.parse import urlparse
import json
import threading
from datetime import datetime
import core.db as db


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
    version: str = "2026-08-02"  # version de CETTE entrée (bump à chaque édition)
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


# Amorce de seed (utilisée UNE fois, si la table est vide — premier démarrage
# ou migration depuis l'ancienne whitelist figée en code). Après le premier
# seed, la base est la seule source de vérité : modifier cette liste n'a
# ensuite plus aucun effet.
_SEED: List[WhitelistEntry] = [
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
    WhitelistEntry("aminata", "Aminata", "GN_NAT",
        "https://aminata.com/", ("aminata.com", "www.aminata.com"),
        "html", "", responsible="edito", version="2026-08-19"),
    WhitelistEntry("guineelive", "Guinéelive", "GN_NAT",
        "https://guineelive.com/", ("guineelive.com", "www.guineelive.com"),
        "html", "sitemap", responsible="edito", version="2026-08-19"),
    WhitelistEntry("verite224", "Vérité224", "GN_NAT",
        "https://verite224.com/", ("verite224.com", "www.verite224.com"),
        "html", "sitemap", responsible="edito", version="2026-08-19"),
    WhitelistEntry("guineedirect", "Guinéedirect", "GN_NAT",
        "https://guineedirect.org/", ("guineedirect.org", "www.guineedirect.org"),
        "html", "sitemap", responsible="edito", version="2026-08-19"),
    WhitelistEntry("conakryinfos", "Conakryinfos", "GN_NAT",
        "https://conakryinfos.com/", ("conakryinfos.com", "www.conakryinfos.com"),
        "html", "sitemap", responsible="edito", version="2026-08-19"),
    WhitelistEntry("rfi_guinee", "RFI Guinée", "INTL",
        "https://www.rfi.fr/fr/tag/guin%C3%A9e/rss", ("www.rfi.fr", "rfi.fr"),
        "rss", guinee_filter=True, responsible="edito"),
    WhitelistEntry("bbc_afrique", "BBC Afrique", "INTL",
        "https://feeds.bbci.co.uk/afrique/rss.xml?lang=fr", ("feeds.bbci.co.uk", "www.bbc.com", "bbc.com"),
        "rss", guinee_filter=True, responsible="edito"),
    WhitelistEntry("france24_afrique", "France24 Afrique", "INTL",
        "https://www.france24.com/fr/afrique/rss", ("www.france24.com", "france24.com"),
        "rss", guinee_filter=True, responsible="edito"),
    # Google News Guinée retiré du seed le 2026-08-19 sur demande explicite
    # (agrégateur, pas un média identifiable — republiait des articles sous
    # une date fraîche alors que le contenu original pouvait être ancien).
    # Voir retire de la base en prod via update_entry(status="retired") +
    # migration idempotente _retire_google_news() plus bas.
]

# Marqueur de génération de gouvernance (statique, PAS calculé depuis la base
# à l'import — voir incident 2026-08-18 : ne jamais faire de travail DB au
# chargement du module). Le suivi fin par source vit dans le champ `version`
# de chaque entrée, mis à jour à chaque édition via l'UI.
WHITELIST_VERSION = "2026-08-19-db"

_initialized = False
# Garde-fou de precaution 2026-08-19 (voir state_store.py, incident reel :
# deux threads dans init() au tout premier appel -> CREATE TABLE IF NOT
# EXISTS concurrent sur Postgres peut lever UniqueViolation). Meme patron
# ici, verrou par precaution.
_init_lock = threading.Lock()


def _ph():
    return db.placeholder()


def init():
    """(Ré)crée la table si besoin + seed initial si vide. Idempotent
    process-wide (même garde que hitl_store/state_store — voir incident
    2026-08-18 : ne pas re-exécuter CREATE/seed à chaque appel)."""
    global _initialized
    if _initialized:
        return
    with _init_lock:
        if _initialized:
            return
        _init_locked()


def _init_locked():
    global _initialized
    con, mode = db.conn()
    try:
        cur = con.cursor()
        cur.execute("""CREATE TABLE IF NOT EXISTS whitelist_sources (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
            entry_url TEXT NOT NULL, allowed_domains TEXT NOT NULL,
            vector_primary TEXT NOT NULL, vector_secondary TEXT DEFAULT '',
            allowed_redirects TEXT DEFAULT '[]', guinee_filter TEXT DEFAULT 'false',
            responsible TEXT DEFAULT 'edito', version TEXT, status TEXT DEFAULT 'active',
            created_at TEXT, updated_at TEXT)""")
        con.commit()
        cur.execute("SELECT COUNT(*) AS n FROM whitelist_sources")
        row = cur.fetchone()
        n = row["n"] if isinstance(row, dict) else row[0]
        if n == 0:
            now = datetime.now().isoformat(timespec="seconds")
            p = _ph()
            for e in _SEED:
                cur.execute(
                    f"""INSERT INTO whitelist_sources
                       (id,name,category,entry_url,allowed_domains,vector_primary,vector_secondary,
                        allowed_redirects,guinee_filter,responsible,version,status,created_at,updated_at)
                       VALUES ({p},{p},{p},{p},{p},{p},{p},{p},{p},{p},{p},{p},{p},{p})""",
                    (e.id, e.name, e.category, e.entry_url, json.dumps(list(e.allowed_domains)),
                     e.vector_primary, e.vector_secondary, json.dumps(list(e.allowed_redirects)),
                     "true" if e.guinee_filter else "false", e.responsible, e.version, e.status, now, now))
            con.commit()
        else:
            # Migration idempotente 2026-08-19 : Google News banni sur
            # demande explicite (agrégateur, pas un média guinéen vérifié —
            # pouvait republier un article ancien sous une date fraîche).
            # Ne touche que les bases déjà seedées (n>0) où l'entrée
            # existe encore active ; sans effet si déjà retirée/absente.
            p = _ph()
            cur.execute(
                f"UPDATE whitelist_sources SET status={p}, updated_at={p} "
                f"WHERE id={p} AND status={p}",
                ("retired", datetime.now().isoformat(timespec="seconds"),
                 "google_news_guinee", "active"))
            con.commit()
    finally:
        con.close()
    _initialized = True


def _row_to_entry(row) -> WhitelistEntry:
    r = dict(row)
    return WhitelistEntry(
        id=r["id"], name=r["name"], category=r["category"], entry_url=r["entry_url"],
        allowed_domains=tuple(json.loads(r["allowed_domains"] or "[]")),
        vector_primary=r["vector_primary"], vector_secondary=r.get("vector_secondary") or "",
        allowed_redirects=tuple(json.loads(r.get("allowed_redirects") or "[]")),
        guinee_filter=(str(r.get("guinee_filter")).lower() == "true"),
        responsible=r.get("responsible") or "edito", version=r.get("version") or "",
        status=r.get("status") or "active",
    )


def all_entries() -> List[WhitelistEntry]:
    """Toutes les sources, quel que soit leur statut (pour l'écran de gestion)."""
    init()
    con, mode = db.conn()
    try:
        cur = con.cursor()
        cur.execute("SELECT * FROM whitelist_sources ORDER BY category, name")
        return [_row_to_entry(r) for r in cur.fetchall()]
    finally:
        con.close()


def active_entries() -> List[WhitelistEntry]:
    init()
    con, mode = db.conn()
    try:
        cur = con.cursor()
        p = _ph()
        cur.execute(f"SELECT * FROM whitelist_sources WHERE status={p} ORDER BY category, name", ("active",))
        return [_row_to_entry(r) for r in cur.fetchall()]
    finally:
        con.close()


def get_entry(source_id: str) -> WhitelistEntry:
    init()
    con, mode = db.conn()
    try:
        cur = con.cursor()
        p = _ph()
        cur.execute(f"SELECT * FROM whitelist_sources WHERE id={p}", (source_id,))
        row = cur.fetchone()
        if not row:
            raise KeyError(f"Source {source_id} absente de la whitelist")
        return _row_to_entry(row)
    finally:
        con.close()


def get_entry_by_source(source_name: str) -> Optional[WhitelistEntry]:
    """Retourne l'entrée whitelist dont le nom/domaine correspond au 'source'
    d'un article (ex. 'mosaiqueguinee.com', 'RFI Guinée'). None si aucune."""
    if not source_name:
        return None
    s = source_name.lower()
    for e in all_entries():
        if s in e.name.lower():
            return e
        for d in e.allowed_domains:
            if s in d.lower():
                return e
    return None


def add_entry(data: dict) -> WhitelistEntry:
    """Ajoute une nouvelle source (capacité 'gerer_sources', advanced —
    voir server.py). `data['id']` doit être unique et stable (slug)."""
    init()
    sid = (data.get("id") or "").strip()
    if not sid:
        raise ValueError("id requis (identifiant stable, ex: 'nouveausite')")
    now = datetime.now().isoformat(timespec="seconds")
    version = data.get("version") or now[:10]
    con, mode = db.conn()
    try:
        cur = con.cursor()
        p = _ph()
        cur.execute(f"SELECT 1 FROM whitelist_sources WHERE id={p}", (sid,))
        if cur.fetchone():
            raise ValueError(f"Source '{sid}' existe déjà")
        cur.execute(
            f"""INSERT INTO whitelist_sources
               (id,name,category,entry_url,allowed_domains,vector_primary,vector_secondary,
                allowed_redirects,guinee_filter,responsible,version,status,created_at,updated_at)
               VALUES ({p},{p},{p},{p},{p},{p},{p},{p},{p},{p},{p},{p},{p},{p})""",
            (sid, data.get("name", sid), data.get("category", "GN_NAT"), data.get("entry_url", ""),
             json.dumps(data.get("allowed_domains", [])), data.get("vector_primary", "html"),
             data.get("vector_secondary", ""), json.dumps(data.get("allowed_redirects", [])),
             "true" if data.get("guinee_filter") else "false", data.get("responsible", "edito"),
             version, data.get("status", "active"), now, now))
        con.commit()
    finally:
        con.close()
    return get_entry(sid)


def update_entry(source_id: str, patch: dict) -> WhitelistEntry:
    """Modifie une source existante (statut, domaines, vecteur, filtre...).
    Bump automatique du champ `version` à la date du jour (piste d'audit
    granulaire par source, en plus de audit.log() côté server.py)."""
    init()
    current = get_entry(source_id)  # lève KeyError si absent
    now = datetime.now().isoformat(timespec="seconds")
    fields = {
        "name": patch.get("name", current.name),
        "category": patch.get("category", current.category),
        "entry_url": patch.get("entry_url", current.entry_url),
        "allowed_domains": json.dumps(patch.get("allowed_domains", list(current.allowed_domains))),
        "vector_primary": patch.get("vector_primary", current.vector_primary),
        "vector_secondary": patch.get("vector_secondary", current.vector_secondary),
        "allowed_redirects": json.dumps(patch.get("allowed_redirects", list(current.allowed_redirects))),
        "guinee_filter": "true" if patch.get("guinee_filter", current.guinee_filter) else "false",
        "responsible": patch.get("responsible", current.responsible),
        "status": patch.get("status", current.status),
        "version": patch.get("version") or now[:10],
        "updated_at": now,
    }
    con, mode = db.conn()
    try:
        cur = con.cursor()
        p = _ph()
        set_clause = ", ".join(f"{k}={p}" for k in fields)
        cur.execute(f"UPDATE whitelist_sources SET {set_clause} WHERE id={p}",
                    tuple(fields.values()) + (source_id,))
        con.commit()
    finally:
        con.close()
    return get_entry(source_id)


def _host(url: str) -> str:
    try:
        return (urlparse(url).netloc or "").lower()
    except Exception:
        return ""


def is_allowed(url: str) -> bool:
    """Vrai si l'hôte est dans un domaine autorisé (avant OU après
    redirection), toutes sources confondues (actives ou non — un domaine
    suspendu reste un domaine connu/gouverné, pas un domaine étranger)."""
    host = _host(url)
    if not host:
        return False
    domains = set()
    for e in all_entries():
        domains.update(e.allowed_domains)
        domains.update(e.allowed_redirects)
    return any(host == d or host.endswith("." + d) for d in domains)
