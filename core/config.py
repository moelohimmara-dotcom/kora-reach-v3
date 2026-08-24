"""config.py — sources autorisées + limites (whitelist initiale)."""
from dataclasses import dataclass, field
from typing import List

@dataclass
class Source:
    name: str
    url: str
    scope: str          # "GN_NAT" | "INTL"
    source_level: int    # 1=guinéen, 2=panafricain/intl, 3=repli
    fmt: str             # "rss" | "html"
    guinee_filter: bool = False  # si INTL: ne garder que mention Guinée

# Sources — état vérifié le 2026-08-01 (fetch réel).
# Niveau 1 : actives (items > 0 au test).
# Niveau 3 : repli désactivé (RSS morts / Cloudflare / DNS down au test).
SOURCES: List[Source] = [
    # --- Niveau 1 : médias guinéens ACTIFS (GN_NAT) ---
    Source("Mosaique Guinée", "https://mosaiqueguinee.com/", "GN_NAT", 1, "html"),
    Source("Guinéenews", "https://guineenews.org/", "GN_NAT", 1, "html"),
    Source("Guinée 360", "https://www.guinee360.com/", "GN_NAT", 1, "html"),
    Source("Mediaguinee", "https://mediaguinee.com/", "GN_NAT", 1, "html"),
    Source("Guineematin", "https://guineematin.com/", "GN_NAT", 1, "html"),
    Source("Guinee7", "https://www.guinee7.com/", "GN_NAT", 1, "html"),
    Source("Africa Guinee", "https://www.africaguinee.com/", "GN_NAT", 1, "html"),
    Source("Vision Guinee", "https://www.visionguinee.info/", "GN_NAT", 1, "html"),
    Source("RFI Guinée", "https://www.rfi.fr/en/tag/guinea/rss", "INTL", 1, "rss", guinee_filter=True),
    # --- Niveau 2 : panafricains / internationaux filtrés "Guinée" (INTL) ---
    Source("BBC Afrique", "https://feeds.bbci.co.uk/afrique/rss.xml", "INTL", 2, "rss", guinee_filter=True),
    Source("France24 Afrique", "https://www.france24.com/fr/afrique/rss", "INTL", 2, "rss", guinee_filter=True),
    # --- Agrégateurs (contourne blocage bot, FREE, légal) niveau 2 ---
    Source("Google News Guinée", "Guinée", "INTL", 2, "gnews", guinee_filter=False),
    # --- Niveau 3 : repli DÉSACTIVÉ (RSS morts / Cloudflare / DNS) ---
    Source("Aminata", "https://aminata.com", "GN_NAT", 3, "sitemap"),
    Source("Guineelive", "https://guineelive.com/", "GN_NAT", 3, "rss"),
    Source("Guineefoot", "https://guineefoot.com/", "GN_NAT", 3, "rss"),
    Source("Le Jour Guinée", "https://lejourguinee.com/", "GN_NAT", 3, "rss"),
    Source("Le Lynx", "https://lelynxguinee.com/", "GN_NAT", 3, "rss"),
    Source("Jeune Afrique", "https://www.jeuneafrique.com/guinee/rss", "INTL", 3, "rss", guinee_filter=True),
    Source("TV5MONDE Afrique", "information.tv5monde.com/afrique*", "INTL", 3, "wayback"),
    # --- Niveau 3 : repli API (optionnel) ---
    # Source("GDELT Guinée", "Guinée", "INTL", 3, "gdelt"),
    # Source("Tavily repli", "tavily://news/days=1", "INTL", 3, "api", guinee_filter=True),
]

# Sources de niveau 1/2 uniquement sont interrogées par défaut (repli level 3 ignoré).
ACTIVE_LEVELS = (1, 2)

LIMITS = {
    "rate_limit_per_host_sec": 2.0,
    "timeout_sec": 10,
    "retry": 2,
    "dossier_sim_threshold": 0.35,  # seuil Jaccard vrai (voir collection/dossiers.py, refonte 2026-08-19)
    "daily_article_limit": 10,
    "timezone": "Africa/Conakry",
    # Nombre d'articles generes EN PARALLELE pendant un cycle (2026-08-20,
    # demande explicite : reduire le temps total du cycle SANS toucher a la
    # rigueur du pipeline auto-critique par article, qui reste intact -- voir
    # reach_agent.run()). Valeur prudente par defaut : chaque article fait
    # jusqu'a ~4 appels LLM sequentiels (~400s), donc 3 en parallele reste
    # raisonnable pour les quotas des fournisseurs (Groq/Cerebras/OpenRouter)
    # sans les saturer. A ajuster si le disjoncteur LLM (llm_circuit_status)
    # se declenche plus souvent apres ce changement.
    "cycle_concurrency": 3,
}
