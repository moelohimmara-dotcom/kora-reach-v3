"""test_article_illustre.py — test bout en bout : collecte réelle -> clustering ->
génération d'un article de synthèse ILLUSTRÉ (image du champion).
Le 'writer' ici est un template (le LLM writer KORA serait branché ensuite).
Prouve que Reach livre un article prêt à publier AVEC son image."""
from reach_agent import agent

def synth_template(champion, contexts):
    """Simule le writer KORA : article de synthèse à partir du champion + contextes."""
    lines = []
    lines.append(f"# {champion['title']}\n")
    lines.append(champion["raw_content"][:600] + "...\n")
    if contexts:
        lines.append("\n**Contexte complémentaire** (sources : "
                     + ", ".join(c["source"] for c in contexts) + ") :")
        for c in contexts[:2]:
            lines.append(f"- {c['source']} : {c['raw_content'][:150]}...")
    lines.append("\n*Par Kakilambe Kora Agent*")
    return "\n".join(lines)

res = agent.run(scope_filter="GN_NAT", demand=3)
assert res.get("status") == "ok", res
facts = res["facts"]
print(f"✅ Cycle OK | sources_ok={res['sources_ok']} items={res['total_items']} "
      f"clusters={res['clusters']} faits={res['facts_to_generate']}\n")

# Génère le 1er article de synthèse illustré
f = facts[0]
art = synth_template(f["champion"], f["contexts"])
print("=== ARTICLE DE SYNTHÈSE (illustré) ===")
print(art[:700])
print("\n=== IMAGE ASSOCIÉE ===")
print("URL image  :", f["champion"].get("image") or "(aucune trouvée)")
assert f["champion"].get("image"), "ERREUR: article sans image"
print("\n✅ TEST OK : article de synthèse livré avec image illustrée.")
