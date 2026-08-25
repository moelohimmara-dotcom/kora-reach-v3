#!/usr/bin/env python3
"""test_smoke_hitl_transitions.py — verrouille en permanence la classe de bug
rapportee 2026-08-20 ("Rejeter" puis "Envoyer en brouillon" n'aboutissait
jamais, sans aucune trace visible). Les boutons Approuver / Modifier / Rejeter
du tiroir article (voir kora-vite/src/app.js, renderSheet()) s'affichent SANS
CONDITION quel que soit le statut actuel de l'article ; le bouton "Annuler la
decision" s'affiche pour APPROVED, EDITED et TRANSMITTED. Ce test verifie que
CHAQUE combinaison ainsi exposee dans l'interface reste acceptee par le
backend (editorial/hitl_store.py), ET que les statuts "systeme" proteges
(TRASHED, TRANSMITTED) restent bloques sauf via leur fonction dediee
(restore_fact(), retract()) -- si un futur changement modifie _ALLOWED ou les
garde-fous sans mettre a jour l'UI en consequence, ce test echoue
immediatement au lieu de laisser un bug reapparaitre en silence.

Usage : python3 tests/test_smoke_hitl_transitions.py
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

DB_FILE = os.path.join(REPO_ROOT, "reach_state.db")

# Le statut que decide() evalue pour son garde-fou _ALLOWED est
# hitl_decisions.status (la derniere DECISION editoriale), pas
# hitl_facts.status (le statut AFFICHE). Les deux colonnes divergent
# volontairement dans un cas : un REJETE met hitl_facts a TRASHED mais
# laisse hitl_decisions.status='REJECTED' (tracabilite) -- c'est CE qui
# permet a "Rejeter" puis "Envoyer en brouillon" (REJECTED -> EDITED) de
# fonctionner (voir test 3 plus bas, la regression exacte du bug rapporte),
# tout en bloquant categoriquement decide() sur un fait VRAIMENT en
# corbeille (trash_facts(), qui met aussi hitl_decisions.status='TRASHED',
# refuse par _ALLOWED["TRASHED"] = set()). Voir le commentaire de decide()
# dans hitl_store.py (6e passage de revue de code, 2026-08-20) pour le
# raisonnement complet.
ALL_STATUSES = [
    "PENDING_REVIEW", "EDITED", "APPROVED", "TRANSMISSION_FAILED",
    "REJECTED", "TRANSMITTED", "RETRACTED", "TRASHED",
]
# Statuts pour lesquels le tiroir article (avec ses boutons Approuver/
# Modifier/Rejeter) peut effectivement s'ouvrir ET ou decide() doit reussir.
# TRASHED en est exclu : app.js n'ouvre jamais le tiroir generique pour une
# carte de la corbeille (seule sortie : "Restaurer" -> restore_fact()).
# TRANSMITTED en est exclu : un article deja publie sur WordPress ne doit
# jamais etre retouchable par decide() generique (risque de republication en
# double) -- seul retract() (fonction dediee) peut le faire sortir de cet
# etat. _ALLOWED["TRASHED"] et _ALLOWED["TRANSMITTED"] valent donc set().
SHEET_OPENABLE_STATUSES = [s for s in ALL_STATUSES if s not in ("TRASHED", "TRANSMITTED")]
# Statuts "proteges" : decide() doit TOUJOURS les refuser comme source,
# quelle que soit la cible visee -- seule leur fonction dediee peut en sortir.
PROTECTED_SOURCE_STATUSES = ["TRASHED", "TRANSMITTED"]
# Cibles toujours atteignables d'un clic, quel que soit le statut courant
# (boutons Approuver / Modifier / Rejeter, non conditionnels).
ALWAYS_CLICKABLE = ["APPROVED", "EDITED", "REJECTED"]
# Statuts pour lesquels le bouton "Annuler la decision" est affiche.
RETRACT_VISIBLE_FROM = ["APPROVED", "EDITED", "TRANSMITTED"]


def main():
    if os.path.exists(DB_FILE):
        print(f"[abandon] {DB_FILE} existe deja -- ce test ne s'execute que sur une base fraiche.")
        return 1

    import editorial.hitl_store as hitl_store
    import core.db as db

    try:
        failed = []

        def make_fact(tag):
            return hitl_store.upsert_fact({
                "champion": {"title": f"Article {tag}", "source": "test", "url": f"http://x/{tag}"},
                "sources_secondaires": [], "article": "# T\n\nchapo.\n\ncorps un.\n\ncorps deux.\n\ncorps trois.\n\nPar La Redaction",
                "image": "", "image_meta": {}, "gen_model": "test", "n_sources": 1,
            })

        def force_status(fact_id, facts_status, decisions_status=None):
            """Place hitl_facts.status (source de verite lue par decide()) ET,
            si fourni, hitl_decisions.status separement -- permet de simuler
            aussi bien un etat coherent qu'une divergence deliberee (ex: le
            cas REJECTED/TRASHED, voir test 6 ci-dessous)."""
            if decisions_status is None:
                decisions_status = facts_status
            con, mode = db.conn()
            cur = con.cursor()
            p = hitl_store._ph()
            cur.execute(f"UPDATE hitl_facts SET status={p} WHERE fact_id={p}", (facts_status, fact_id))
            existing = hitl_store.get(fact_id)
            if existing:
                cur.execute(f"UPDATE hitl_decisions SET status={p} WHERE fact_id={p}", (decisions_status, fact_id))
            else:
                cur.execute(
                    f"INSERT INTO hitl_decisions (fact_id, status, decision, edited_text, final_text, decided_by, decided_at) "
                    f"VALUES ({p},{p},{p},{p},{p},{p},{p})",
                    (fact_id, decisions_status, decisions_status, "", "", "test", "2026-01-01T00:00:00"))
            con.commit()
            con.close()

        # ---- 1. Boutons Approuver / Modifier / Rejeter : toujours autorises
        # depuis tout statut ou le tiroir peut reellement s'ouvrir -- SAUF
        # REJECTED -> APPROVED, verrouille deliberement (voir 1ter) ----
        for src_status in SHEET_OPENABLE_STATUSES:
            for target in ALWAYS_CLICKABLE:
                if src_status == "REJECTED" and target == "APPROVED":
                    continue
                fid = make_fact(f"{src_status}_{target}")
                force_status(fid, src_status)
                r = hitl_store.decide(fid, target, "test_editor")
                if r.get("error"):
                    failed.append(f"decide({src_status} -> {target}) rejete a tort : {r}")
        if not any("decide(" in f for f in failed):
            print(f"OK   les {len(SHEET_OPENABLE_STATUSES)} statuts x {len(ALWAYS_CLICKABLE)} boutons toujours visibles (Approuver/Modifier/Rejeter) passent tous (hors REJECTED -> APPROVED, verrouille)")

        # ---- 1ter. REJECTED -> APPROVED reste verrouille (regle metier
        # preexistante, verifiee par verify_hitl.py : "re-decider un REJECTED
        # vers APPROVED doit etre refuse"). L'elargissement de _ALLOWED pour
        # corriger REJECTED -> EDITED ne doit JAMAIS rouvrir celui-ci (revue
        # de code 2026-08-20, 7e passage). ----
        fid = make_fact("verrou_rejected_vers_approved")
        force_status(fid, "REJECTED")
        r = hitl_store.decide(fid, "APPROVED", "test_editor")
        if r.get("error") != "transition_interdite":
            failed.append(f"REGRESSION 7e revue : REJECTED -> APPROVED aurait du rester verrouille (transition_interdite) mais a donne : {r}")
        else:
            print("OK   REJECTED -> APPROVED reste verrouille (regle metier preexistante, verify_hitl.py)")

        # ---- 1bis. TRASHED et TRANSMITTED : statuts source PROTEGES ----
        for src_status in PROTECTED_SOURCE_STATUSES:
            for target in ALWAYS_CLICKABLE + ["PENDING_REVIEW"]:
                fid = make_fact(f"protected_{src_status}_{target}")
                force_status(fid, src_status)
                r = hitl_store.decide(fid, target, "test_editor")
                if not r.get("error"):
                    failed.append(f"GARDE-FOU: decide({src_status} -> {target}) aurait du etre refuse mais a ete accepte : {r}")
        if not any("GARDE-FOU: decide(" in f for f in failed):
            print(f"OK   decide() refuse systematiquement {PROTECTED_SOURCE_STATUSES} comme statut source (seules restore_fact()/retract() en sortent)")

        # ---- 2. Bouton "Annuler la decision" : autorise partout ou il s'affiche ----
        for src_status in RETRACT_VISIBLE_FROM:
            fid = make_fact(f"retract_{src_status}")
            force_status(fid, src_status)
            r = hitl_store.retract(fid, "test_editor")
            if r.get("error"):
                failed.append(f"retract() depuis {src_status} rejete a tort alors que le bouton est affiche : {r}")
        if not any("retract()" in f for f in failed):
            print(f"OK   retract() accepte depuis les {len(RETRACT_VISIBLE_FROM)} statuts ou le bouton est visible")

        # ---- 3. Regression precise du bug rapporte : REJECTED -> EDITED ----
        fid = make_fact("regression_reject_puis_brouillon")
        # Un vrai article rejete a hitl_facts='TRASHED' (voir decide(), branche
        # REJECTED/TRASHED) -- c'est CE statut que le bouton "Envoyer en
        # brouillon" doit pouvoir depasser. (hitl_decisions reste 'REJECTED'
        # pour la tracabilite, simule ici explicitement.)
        force_status(fid, "TRASHED", decisions_status="REJECTED")
        r = hitl_store.decide(fid, "EDITED", "test_editor")
        if r.get("error"):
            failed.append(f"REGRESSION exacte du bug rapporte : REJECTED -> EDITED ('Envoyer en brouillon' apres 'Rejeter') encore refusee : {r}")
        else:
            print("OK   regression precise couverte : REJECTED -> EDITED ('Rejeter' puis 'Envoyer en brouillon') fonctionne")

        # ---- 4. Garde-fou : une transition non exposee par l'UI reste refusee ----
        fid = make_fact("garde_fou_trashed_transmitted")
        force_status(fid, "TRASHED")
        r = hitl_store.decide(fid, "TRANSMITTED", "test_editor")
        if not r.get("error"):
            failed.append("GARDE-FOU: TRASHED -> TRANSMITTED aurait du rester refuse (aucun bouton ne l'expose) mais a ete accepte")
        else:
            print("OK   TRASHED -> TRANSMITTED reste refuse (aucune ouverture excessive de _ALLOWED)")

        # ---- 5. Correctifs trouves par revue de code independante (2026-08-20) ----
        # FIX B : decide(..., "TRASHED", ...) doit poser trashed_at, sinon la
        # purge automatique (11j) ne trouve jamais ces faits.
        fid = make_fact("trashed_at_direct")
        force_status(fid, "PENDING_REVIEW")
        hitl_store.decide(fid, "TRASHED", "test_editor")
        con, mode = db.conn()
        cur = con.cursor()
        ph = db.placeholder()
        cur.execute(f"SELECT trashed_at FROM hitl_facts WHERE fact_id={ph}", (fid,))
        row = cur.fetchone()
        con.close()
        trashed_at = row["trashed_at"] if hasattr(row, "keys") else row[0]
        if not trashed_at:
            failed.append("FIX B: decide(..., 'TRASHED', ...) laisse trashed_at a NULL -- purge automatique (11j) cassee pour ce chemin")
        else:
            print("OK   decide(..., 'TRASHED', ...) pose bien trashed_at (purge automatique fonctionnelle)")

        # ---- 6. La divergence hitl_facts(TRASHED)/hitl_decisions(REJECTED)
        # est INTENTIONNELLE (voir commentaire en tete de fichier) -- mais
        # quand decide() accepte la transition (via hitl_decisions.status),
        # l'ECRITURE REELLE dans hitl_facts (ce que l'utilisateur voit
        # vraiment) doit suivre, jamais un "ok=True" fantome qui laisse le
        # fait coince en corbeille (bug trouve au 6e passage de revue :
        # l'ancien garde "AND status <> 'TRASHED'" sur l'ecriture aurait
        # silencieusement ignore ce cas precis). ----
        fid = make_fact("divergence_rejete_puis_brouillon_groupe")
        force_status(fid, "TRASHED", decisions_status="REJECTED")
        r = hitl_store.decide(fid, "PENDING_REVIEW", "test_editor")
        row = hitl_store.get_fact(fid)
        if r.get("error"):
            failed.append(f"REGRESSION 6e revue : TRASHED (rejete) -> PENDING_REVIEW refuse a tort : {r}")
        elif row["status"] != "PENDING_REVIEW":
            failed.append(f"REGRESSION 6e revue : decide() a renvoye ok=True mais hitl_facts.status est reste {row['status']!r} au lieu de 'PENDING_REVIEW' (succes en facade)")
        else:
            print("OK   plus de divergence hitl_facts/hitl_decisions : un decide() qui reussit change reellement le statut affiche")

        print()
        if failed:
            print(f"{len(failed)} ECHEC(S):")
            for f in failed:
                print(f"  - {f}")
            return 1
        print("TOUS LES TESTS DE TRANSITIONS HITL PASSENT")
        return 0
    finally:
        try:
            os.remove(DB_FILE)
        except OSError:
            pass


if __name__ == "__main__":
    sys.exit(main())
