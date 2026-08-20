"""narrate.py — texte d'article -> fichier audio (voix off).

Fournisseur : edge-tts (voix neuronales Microsoft Edge), gratuit, sans clé
API, sans limite documentée -- verifie en conditions reelles avant
integration (article francais complet, voix fr-FR-HenriNeural, ~5 min
audio genere sans erreur). Alternative retenue apres avoir constate en
DIRECT que le point d'entree TTS "gratuit sans compte" de Pollinations.ai
(text.pollinations.ai?model=openai-audio) est en realite deprecie/retire
cote fournisseur (404 "Model not found"), malgre plusieurs sources en
ligne le donnant encore comme disponible (2026-08-20) -- toujours verifier
un fournisseur externe en le TESTANT reellement, jamais sur la seule foi
d'articles/docs tiers.

edge-tts est un paquet TIERS (pas stdlib) : ajoute a requirements.txt.
Fonctionne de facon 100% equivalente a illustrate.py cote philosophie
(pas de cle, pas de compte) -- seule difference : c'est une bibliotheque
Python (API asyncio), pas un simple GET HTTP.
"""
import asyncio
import os

# Voix francaises neuronales disponibles (verifie 2026-08-20, liste complete
# via `python -m edge_tts --list-voices`). HenriNeural (homme) retenu par
# defaut : ton neutre, adapte a une lecture d'actualite.
VOICES_FR = {
    "henri": "fr-FR-HenriNeural",       # homme, neutre -- defaut
    "denise": "fr-FR-DeniseNeural",     # femme, neutre
    "eloise": "fr-FR-EloiseNeural",     # femme
    "remy": "fr-FR-RemyMultilingualNeural",     # homme, multilingue
    "vivienne": "fr-FR-VivienneMultilingualNeural",  # femme, multilingue
}
DEFAULT_VOICE = VOICES_FR["henri"]

# Limite prudente : edge-tts n'a pas de limite documentee, mais un texte
# demesure (article + erreur de troncature en amont) ne doit jamais generer
# une narration de plusieurs dizaines de minutes par accident.
MAX_CHARS = 8000


def narrate_to_file(text: str, out_path: str, voice: str = None) -> dict:
    """Genere la narration audio de `text` et l'ecrit dans `out_path` (mp3).
    Retourne {ok, path, error}. Ne leve jamais -- toute erreur est capturee
    et renvoyee dans le dict (coherent avec illustrate.illustrate(), qui ne
    fait jamais planter le cycle appelant)."""
    voice = voice or DEFAULT_VOICE
    clean = (text or "").strip()
    if not clean:
        return {"ok": False, "path": None, "error": "texte_vide"}
    if len(clean) > MAX_CHARS:
        clean = clean[:MAX_CHARS]

    try:
        import edge_tts
    except ImportError:
        return {"ok": False, "path": None,
                "error": "edge_tts_non_installe (pip install edge-tts)"}

    async def _run():
        communicate = edge_tts.Communicate(clean, voice)
        await communicate.save(out_path)

    try:
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        asyncio.run(_run())
        if not os.path.exists(out_path) or os.path.getsize(out_path) < 1024:
            return {"ok": False, "path": None, "error": "fichier_audio_vide_ou_absent"}
        return {"ok": True, "path": out_path, "error": None}
    except Exception as e:
        return {"ok": False, "path": None, "error": f"{type(e).__name__}: {e}"}
