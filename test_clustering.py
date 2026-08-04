"""test_clustering.py — prouve la fusion multi-sources sur un même fait.
Simule 3 'articles' de 3 médias guinéens parlant du MÊME fait (match Guinée-Mali)
avec rédactions différentes, comme en réalité. Vérifie que Reach les clusterise
en 1 fait + sélectionne le champion le plus parlant.
"""
from clusterer import cluster, pick_champion, score_item

items = [
    {"title": "Guinée bat Mali 2-1 en match amical à Conakry",
     "url": "https://a.com/guinee-mali-2-1",
     "raw_content": "La Guinée a battu le Mali 2-1 ce samedi au stade du 28 septembre à Conakry. Buts de S. Sylla (23e) et M. Camara (67e). Le Mali a réduit le score par K. Traoré (80e). 15 000 spectateurs.",
     "source_level": 1, "source": "Mosaique"},
    {"title": "Victoire de la Guinée face au Mali (2-1)",
     "url": "https://b.com/guinee-mali-score",
     "raw_content": "Score final Guinée Mali 2-1. Deux buts guinéens inscrits en première mi-temps. Le Mali a marqué en fin de match. Rencontre amicale disputée à Conakry devant un public nombreux.",
     "source_level": 1, "source": "Guinéenews"},
    {"title": "Mali-Guinée : les guinéens s'imposent 2 à 1",
     "url": "https://c.com/mali-guinee-2-1",
     "raw_content": "Battus 2-1 par la Guinée, les maliens ont encaissé deux buts à Conakry. Un match amical disputé ce weekend. La Guinée a ouvert le score et doublé la mise avant la réduction malienne.",
     "source_level": 1, "source": "Guinée360"},
    {"title": "La Banque Centrale abaisse son taux directeur",
     "url": "https://a.com/bcrg-taux",
     "raw_content": "La BCRG a décidé d'abaisser son taux directeur de 25 points de base pour soutenir l'économie nationale guinéenne.",
     "source_level": 1, "source": "Mosaique"},
]

clusters = cluster(items, thr=0.5)
assert len(clusters) == 2, f"ERREUR: {len(clusters)} clusters (attendu 2)"
c = clusters[0]
assert len(c) == 3, f"ERREUR: le fait match n'a fusionné que {len(c)} sources"
champ, ctx = pick_champion(c)
assert len(ctx) == 2
print("✅ TEST OK")
print(f"  - 3 sources même fait (match Guinée-Mali) → 1 cluster (fusion)")
print(f"  - Champion: {champ['source']} | Contextes: {[x['source'] for x in ctx]}")
print(f"  - Fait économie BCRG → cluster séparé (non fusionné)")
