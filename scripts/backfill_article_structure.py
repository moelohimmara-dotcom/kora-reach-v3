#!/usr/bin/env python3
"""backfill_article_structure.py — rattrapage historique de la structure des articles.

CONTEXTE
--------
Rapporté (2026-08-20) : certains articles déjà générés ne respectent pas la
règle 1 (STRUCTURE) du prompt système — pas de chapô séparé, pas de
paragraphes de corps, tout en un seul bloc de texte. Cause : l'auto-critique
existante ne vérifie QUE 5 axes (orthographe/grammaire/accords/conjugaison/
cohérence sémantique), jamais la structure elle-même — un écart de
conformité du LLM sur ce point précis passait totalement inaperçu. Corrigé
pour toute NOUVELLE génération (generation/writer.py, cascade
_structure_ok -> _llm_fix_structure -> _mechanical_paragraph_split).

Ce script rattrape UNIQUEMENT l'historique : il applique la MÊME cascade
aux articles DÉJÀ EN BASE qui échouent _structure_ok(), et seulement ceux-là
— zéro modification sur un article déjà bien structuré.

CHAMP TOUCHÉ : hitl_facts.article UNIQUEMENT. Vérifié avant d'écrire ce
script (voir server.py /api/hitl/decide, hitl_store.decide()) : une édition
manuelle humaine (bouton "Modifier") est stockée à part dans
hitl_decisions.final_text/edited_text, JAMAIS répercutée dans
hitl_facts.article — et list_facts()/get_fact() (donc l'affichage frontend
et la fiche article) lisent hitl_facts.article, pas final_text. Ce rattrapage
ne touche donc JAMAIS une retouche manuelle existante, quel que soit le
statut (PENDING_REVIEW/EDITED/APPROVED/TRANSMITTED/TRASHED/REJECTED) — tous
sont éligibles au même titre, avec la même garantie de sécurité.

LIMITE CONNUE (signalée, pas corrigée par ce script) : un article déjà
TRANSMITTED (publié sur WordPress/Supabase) verra sa copie INTERNE (KORA)
corrigée, mais PAS sa copie déjà publiée en ligne — retransmettre reste une
action séparée, volontaire, hors du périmètre de ce rattrapage.

RÈGLE DE SÉLECTION (sans faux positif)
--------------------------------------
Un fact est candidat si, et seulement si, generation.writer._structure_ok()
rend False sur son hitl_facts.article actuel (même détection EXACTE que la
garde utilisée pour toute nouvelle génération — aucune logique dupliquée).

REPARATION (même cascade que generation/writer.py, réutilisée telle quelle)
-----------------------------------------------------------------------
1. Passe LLM ciblée (_llm_fix_structure) : reformate SANS changer le
   contenu, avec garde-fou anti-perte (rejette si <85% des mots du texte
   d'origine).
2. Filet mécanique déterministe (_mechanical_paragraph_split) si l'étape 1
   échoue — ne peut jamais échouer à produire QUELQUE structure, revérifié
   après coup (voir generation/writer.py, correctif de la revue de code du
   2026-08-20).

SÉCURITÉ
--------
- APERÇU PAR DÉFAUT : sans --apply, aucune écriture. Affiche le nombre de
  candidats, un échantillon, et la méthode de réparation qui SERAIT utilisée.
- ÉCRITURE seulement avec --apply, UNE transaction PAR FACT (pas une seule
  transaction globale) : un échec sur un fact n'annule pas les précédents
  déjà corrigés — un rattrapage de plusieurs dizaines/centaines d'appels LLM
  qui s'interromprait au milieu ne doit jamais perdre le travail déjà fait.
- IDEMPOTENT : relancer ne retouche pas un article déjà structuré (y compris
  un article corrigé par un run précédent de ce même script).
- ESPACEMENT entre appels LLM (2s) : courtoisie envers le fournisseur, même
  esprit que generation/video.py (rate-limit Pollinations découvert en prod).
- FAIS UNE SAUVEGARDE de la base avant --apply (voir README ci-dessous).

USAGE
-----
  # 1) Aperçu (aucune modification) — sur le VPS, avec l'environnement de prod :
  sudo -u kora bash -c 'set -a; source deploy/.env; set +a; \\
      ./.venv/bin/python scripts/backfill_article_structure.py'

  # 2) Sauvegarde Postgres (exemple) :
  pg_dump "$DATABASE_URL" > /tmp/kora_avant_backfill_structure.sql

  # 3) Application réelle :
  sudo -u kora bash -c 'set -a; source deploy/.env; set +a; \\
      ./.venv/bin/python scripts/backfill_article_structure.py --apply'
"""
import os
import sys
import time
import argparse

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import core.db as db  # noqa: E402
import generation.writer as writer  # noqa: E402

LLM_CALL_SPACING_SEC = 2.0


def _val(row, key, idx):
    """Accès tolérant sqlite3.Row (par nom) / dict psycopg2 / tuple."""
    try:
        return row[key]
    except (KeyError, IndexError, TypeError):
        try:
            return row[idx]
        except Exception:
            return None


def fetch_candidates(con):
    """Retourne [(fact_id, article, title, status)] pour tout fact dont
    l'article échoue _structure_ok() -- même détection que la garde de
    génération, aucune logique dupliquée ici.

    Bug trouvé par revue de code (2026-08-20) : hitl_store.list_facts()
    traite un article stocké en JSON string vide ("{}"/"[]") comme "pas
    encore d'article" (convention "B1 fix", voir son code) -- SANS ce même
    filtre ici, un fact réellement vide serait pris pour un défaut de
    structure, "réparé" par la cascade, et le résultat écrit écraserait le
    placeholder par un texte fabriqué qui ne serait PLUS reconnu comme vide
    par list_facts() -- pire que le problème d'origine. Reproduit ici
    EXACTEMENT la même détection."""
    cur = con.cursor()
    cur.execute("SELECT fact_id, article, champion, status FROM hitl_facts WHERE article IS NOT NULL AND length(article) > 0")
    rows = cur.fetchall()
    candidates = []
    for row in rows:
        fid = _val(row, "fact_id", 0)
        art = _val(row, "article", 1)
        champ_raw = _val(row, "champion", 2)
        status = _val(row, "status", 3)
        if not art or not isinstance(art, str):
            continue
        if art.startswith("{") or art.startswith("["):
            import json
            try:
                parsed = json.loads(art)
                if isinstance(parsed, (dict, list)) and not parsed:
                    continue  # placeholder vide (convention list_facts()) -- pas un vrai article
            except json.JSONDecodeError:
                pass  # pas du JSON valide -> traité comme texte normal ci-dessous
        if writer._structure_ok(art):
            continue
        title = ""
        try:
            import json
            champ = json.loads(champ_raw) if isinstance(champ_raw, str) else (champ_raw or {})
            title = champ.get("title", "")
        except Exception:
            pass
        candidates.append((fid, art, title, status))
    return candidates


def repair_one(article: str, try_llm: bool = True) -> dict:
    """Applique la MÊME cascade que generation/writer.py._finalize_article()
    pour la partie structure (pas de re-génération, pas de ré-appel de
    l'auto-critique orthographe/grammaire -- UNIQUEMENT la réparation de
    structure, sur le texte déjà validé et publiable tel quel).
    `try_llm=False` (2026-08-20, revue de code) : saute directement au filet
    mécanique sans même tenter l'appel réseau, quand on sait déjà qu'aucun
    fournisseur n'est configuré -- évite un appel voué à l'échec ET la
    pause de courtoisie associée (voir main())."""
    fixed = writer._llm_fix_structure(article) if try_llm else None
    if fixed and writer._structure_ok(fixed):
        return {"article": fixed, "method": "llm"}
    mech = writer._mechanical_paragraph_split(article)
    ok = writer._structure_ok(mech)
    return {"article": mech, "method": "mecanique" if ok else "mecanique_insuffisant"}


def main():
    ap = argparse.ArgumentParser(
        description="Rattrapage historique : corrige la structure (chapô + paragraphes) des articles déjà générés.")
    ap.add_argument("--apply", action="store_true",
                     help="Applique réellement les corrections (sinon: aperçu seul, aucune écriture).")
    ap.add_argument("--sample", type=int, default=10,
                     help="Nombre de candidats à afficher en aperçu (défaut: 10).")
    ap.add_argument("--limit", type=int, default=0,
                     help="Limite le nombre de facts CORRIGÉS en mode --apply (0 = illimité). Utile pour un premier lot de test.")
    args = ap.parse_args()

    con, mode = db.conn()
    try:
        print(f"[backend] {mode}")
        candidates = fetch_candidates(con)
        print(f"[candidats] {len(candidates)} article(s) échouent la structure minimale (chapô + paragraphes).")
        by_status = {}
        for _, _, _, status in candidates:
            by_status[status] = by_status.get(status, 0) + 1
        print("[répartition par statut]", by_status)

        for fid, art, title, status in candidates[:max(0, args.sample)]:
            preview = art.replace("\n", " ")[:100]
            print(f"    - [{status:>15}] {fid}  {title[:50]!r}  ...  {preview!r}")
        if len(candidates) > args.sample:
            print(f"    … (+{len(candidates) - args.sample} autres)")

        if not candidates:
            print("[fin] Rien à rattraper. Tous les articles en base respectent déjà la structure minimale.")
            return

        if not args.apply:
            print("\n[APERÇU] Aucune modification effectuée. "
                  "Relance avec --apply (APRÈS sauvegarde) pour écrire.")
            return

        # --- Réparation réelle, UNE transaction PAR FACT ---
        to_process = candidates[:args.limit] if args.limit else candidates
        skipped_by_limit = len(candidates) - len(to_process)
        print(f"\n[APPLICATION] {len(to_process)} article(s) à traiter...")
        # Bug trouvé par revue de code (2026-08-20) : aucun fournisseur LLM
        # configuré (ou circuit ouvert) -> _llm_fix_structure() ne fait de
        # toute façon AUCUN appel réseau, mais le script dormait quand même
        # LLM_CALL_SPACING_SEC "par courtoisie" a chaque fact -- des heures
        # perdues pour rien sur un run sans fournisseur disponible.
        llm_available = bool(
            os.environ.get("NVIDIA_API_KEY") or os.environ.get("OLLAMA_API_KEY")
            or os.environ.get("TR_KEY")
            or any(os.environ.get(writer.PROVIDER_CONFIG[p]["env"]) for p in writer.PROVIDER_ORDER)
        )
        if not llm_available:
            print("[avertissement] Aucun fournisseur LLM configuré -- réparation MÉCANIQUE uniquement pour ce run.")
        p = db.placeholder()
        results = {"llm": 0, "mecanique": 0, "mecanique_insuffisant_non_ecrit": 0, "erreur": 0}
        for i, (fid, art, title, status) in enumerate(to_process, 1):
            try:
                rep = repair_one(art, try_llm=llm_available)
                # Bug trouvé par revue de code (2026-08-20) : un résultat
                # "mecanique_insuffisant" (n'atteint toujours pas le seuil)
                # était écrit quand même, remplaçant l'original par une
                # version qui ne résout rien -- aucune raison d'écraser
                # l'original dans ce cas précis, on le laisse tel quel.
                if rep["method"] == "mecanique_insuffisant":
                    results["mecanique_insuffisant_non_ecrit"] += 1
                    print(f"  [{i}/{len(to_process)}] {fid} -> insuffisant, ORIGINAL CONSERVÉ (trop court pour le seuil)")
                else:
                    cur = con.cursor()
                    cur.execute(f"UPDATE hitl_facts SET article={p} WHERE fact_id={p}", (rep["article"], fid))
                    con.commit()
                    results[rep["method"]] += 1
                    print(f"  [{i}/{len(to_process)}] {fid} -> {rep['method']}")
            except Exception as e:
                con.rollback()
                results["erreur"] += 1
                print(f"  [{i}/{len(to_process)}] {fid} -> ERREUR: {type(e).__name__}: {e}")
            if i < len(to_process) and llm_available:
                time.sleep(LLM_CALL_SPACING_SEC)

        print(f"\n[APPLIQUÉ] {json_summary(results)}")
        remaining = fetch_candidates(con)
        # Bug trouvé par revue de code (2026-08-20) : avec --limit, la
        # plupart des candidats restants sont simplement NON TRAITÉS (pas
        # des échecs de réparation) -- message ambigu corrigé pour distinguer
        # les deux cas.
        if skipped_by_limit:
            print(f"[vérification] {len(remaining)} article(s) encore hors structure : "
                  f"{skipped_by_limit} non traité(s) à cause de --limit, le reste "
                  f"génuinement trop court pour le seuil même après réparation. "
                  f"Relancez sans --limit (ou avec une limite plus grande) pour continuer.")
        else:
            print(f"[vérification] {len(remaining)} article(s) encore hors structure après ce passage "
                  f"(attendu : uniquement les articles génuinement trop courts pour le seuil).")
    finally:
        con.close()


def json_summary(d):
    import json
    return json.dumps(d, ensure_ascii=False)


if __name__ == "__main__":
    main()
