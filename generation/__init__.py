"""generation — transformer un fait deja collecte en article + image.

Modules : writer.py (pipeline LLM multi-passes : redaction, extension,
auto-critique, correction ; fallback multi-fournisseurs), illustrate.py
(generation d'image, chaine de repli), agent_prompts.py (prompts editables
de l'agent).

Depend de : core (config). Rien d'autre.
Ne doit PAS dependre de : editorial — la generation produit du texte/une
image a partir de ce qu'on lui donne en argument, elle ne lit et n'ecrit
JAMAIS le stockage editorial elle-meme (violation trouvee et corrigee le
2026-08-20 : regenerate() vivait ici a tort, deplacee vers
orchestration/reach_agent.py, qui relie legitimement generation + editorial).
"""
