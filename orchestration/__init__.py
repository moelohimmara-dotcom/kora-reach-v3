"""orchestration — enchaine collection -> generation -> editorial en un cycle.

Module : reach_agent.py (ReachAgent.run() : collecte parallele, filtre,
dedoublonne, regroupe, genere les articles EN PARALLELE (concurrency
configurable), illustre, journalise ; regenerate() : relit un fait deja
acquis en base et le fait regenerer sans re-scraping).

Depend de : collection, generation, editorial, core. Seul paquet
autorise a dependre de PLUSIEURS domaines a la fois — c'est precisement
son role : relier les autres paquets entre eux. Aucun autre paquet ne doit
dependre de orchestration (server.py excepte, qui l'invoque comme
frontiere HTTP).
"""
