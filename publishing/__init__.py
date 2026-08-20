"""publishing — envoi d'un article valide vers l'exterieur (WordPress, Supabase).

Module : transmit.py.

Depend de : rien en interne au monolithe (module feuille — aucun import
d'un autre paquet du projet). Reçoit un article DEJA VALIDE en argument ;
ne lit ni n'ecrit jamais directement le stockage editorial ni la generation.
"""
