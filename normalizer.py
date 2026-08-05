"""normalizer.py — schéma commun + fenêtre 24h glissante stricte (DEC-004).

Règles (CDC §2.5) :
- Fenêtre glissante calculée depuis l'HEURE DE DÉCLENCHEMENT DU CYCLE.
- Date absente/ambiguë -> JAMAIS remplacée par heure de collecte -> marquée
  anomalie (date_status="UNRELIABLE"), EXCLU du corpus actif (actual=False).
- Date future/incohérente -> anomalie.
- Heure source, normalisée, collecte restent traçables.
"""
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
import config

TZ = ZoneInfo(config.LIMITS["timezone"])
_DATE_FORMATS = (
    "%a, %d %b %Y %H:%M:%S %z",      # RSS RFC822 avec tz
    "%a, %d %b %Y %H:%M:%S %Z",      # RSS RFC822 sans tz num
    "%Y-%m-%dT%H:%M:%S%z",          # ISO avec tz
    "%Y-%m-%dT%H:%M:%S",            # ISO sans tz
    "%Y-%m-%dT%H:%M:%SZ",           # ISO Z
    "%Y-%m-%d %H:%M:%S",
    "%a, %d %b %Y %H:%M:%S",
    "%Y-%m-%d",
    "%d %b %Y %H:%M:%S %z",
)


def _parse_date(s: str):
    if not s:
        return None
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def normalize_dates(published_at: str, cycle_start: datetime):
    """Retourne (dt_normalized, date_status, actual).
    cycle_start : datetime fuseau Conakry de l'heure de déclenchement.
    """
    raw = published_at or ""
    dt = _parse_date(raw)
    if dt is None:
        # date absente/ambiguë -> anomalie, PAS de substitution
        return None, "UNRELIABLE", False
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=TZ)
    else:
        dt = dt.astimezone(TZ)
    # Fenêtre glissante stricte 24h : [cycle_start - 24h, cycle_start]
    # Règle métier (2026-08) : 1 article par génération, fraîcheur 24h.
    # Les médias guinéens peuvent être lents, mais l'utilisateur veut de
    # l'actualité FRAÎCHE : hors 24h => STALE (pas d'article généré).
    lower = cycle_start - timedelta(hours=24)
    if dt > cycle_start:
        return dt, "FUTURE", False   # date future -> anomalie
    if dt < lower:
        return dt, "STALE", False    # hors fenêtre 24h
    return dt, "OK", True


def normalize(raw: dict, source, cycle_start: datetime) -> dict:
    published = raw.get("published_at", "")
    dt, status, actual = normalize_dates(published, cycle_start)
    return {
        "title": raw.get("title", ""),
        "url": raw.get("url", ""),
        "summary": raw.get("summary", ""),
        "published_at": published,
        "date_normalized": dt.isoformat() if dt else "",
        "date_status": status,
        "collected_at": datetime.now(TZ).isoformat(),
        "source": source.name,
        "source_id": getattr(source, "id", source.name),
        "source_level": source.source_level,
        "scope": source.scope,
        "raw_content": raw.get("raw_content", ""),
        "image": raw.get("image", ""),
        "actual": actual,
        "whitelist_version": getattr(source, "version", ""),
    }
