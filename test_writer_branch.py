"""test_writer_branch.py — prouve le branchement writer LLM sur les facts Reach.
Mode dry-run (aucune clé) -> template. Avec TR_KEY -> vraie génération kimi.
"""
import os
from orchestration.reach_agent import agent

res = agent.run(scope_filter="GN_NAT", demand=2)
assert res.get("status") == "ok", res
f = res["facts"][0]
print("=== FLUX fact -> writer ===")
print("Modèle génération :", f["gen_model"], "| statut :", f["gen_status"])
print("Image :", f["image"][:60] or "(aucune)")
print("\n=== ARTICLE GÉNÉRÉ ===")
print(f["article"][:500])
assert f["article"], "ERREUR: article vide"
print("\n✅ TEST OK : writer branché, article livré (dry-run ou LLM).")
