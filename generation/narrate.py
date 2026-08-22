"""narrate.py — texte d'article -> fichier audio (voix off).

Fournisseur PRIORITAIRE (2026-08-22, demande explicite) : Fish Audio, si
FISH_AUDIO_API_KEY est renseignee dans l'environnement. Repli AUTOMATIQUE
sur edge-tts (voix neuronales Microsoft Edge, gratuit, sans cle) si la cle
est absente, ou si l'appel Fish Audio echoue pour quelque raison que ce
soit (credit API epuise, reseau, cle revoquee...) -- meme philosophie de
cascade resiliente que generation/writer.py (fournisseurs LLM) et
generation/illustrate.py (image) : ne JAMAIS laisser une panne d'un
fournisseur externe bloquer la generation video.

Historique (2026-08-22) : ElevenLabs essaye en premier, retire le jour
meme -- credit epuise des le 1er test reel (quota_exceeded, compte
gratuit). Fish Audio choisi a la place (cle fournie par l'utilisateur) --
le modele par defaut "s1" renvoyait d'abord "402 Insufficient API credit"
(credit API distinct du credit plateforme, cf. fish.audio/app/developers),
resolu en passant au modele "s2.1-pro-free" (palier gratuit, n'exige pas
de credit API) + une reference_id (voix) fournie par l'utilisateur --
VERIFIE en conditions reelles, audio genere avec succes.

edge-tts est un paquet TIERS (pas stdlib) : ajoute a requirements.txt.
Fonctionne de facon 100% equivalente a illustrate.py cote philosophie
(pas de cle, pas de compte) -- seule difference : c'est une bibliotheque
Python (API asyncio), pas un simple GET HTTP. L'appel Fish Audio, lui,
est un simple POST HTTP (urllib stdlib, zero dependance supplementaire).
"""
import asyncio
import json
import os
import urllib.request
import urllib.error

FISH_AUDIO_API_KEY = os.environ.get("FISH_AUDIO_API_KEY", "").strip()
# reference_id (voix) : nouvelle voix adoptee par l'utilisateur (2026-08-22)
# -- VERIFIEE en conditions reelles (audio genere avec succes, 53 Ko pour
# une phrase de test). Remplace l'ancienne voix (690813f2df56491b82ee02a22
# d1c67fd, gardee en commentaire au cas ou). Surchargeable par
# FISH_AUDIO_VOICE_ID.
FISH_AUDIO_VOICE_ID = os.environ.get("FISH_AUDIO_VOICE_ID", "da31468f7d0248838545b75fdfe6ffd1").strip()
# Modele TTS (en-tete "model", PAS le corps JSON -- voir doc API) :
# "s2.1-pro-free" -- VERIFIE en conditions reelles (2026-08-22) : contourne
# le "402 Insufficient API credit" rencontre avec "s1" sur ce compte (le
# palier gratuit du modele n'exige pas de credit API). Surchargeable par
# FISH_AUDIO_MODEL si un jour du credit est ajoute et qu'un modele
# superieur (s2.1-pro, s2-pro) est prefere.
FISH_AUDIO_MODEL = os.environ.get("FISH_AUDIO_MODEL", "s2.1-pro-free")
FISH_AUDIO_TIMEOUT = int(os.environ.get("FISH_AUDIO_TIMEOUT_SEC", "60"))

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


def _narrate_fish_audio(clean: str, out_path: str) -> dict:
    """POST direct (urllib stdlib) -- pas de SDK tiers ajoute pour un simple
    appel HTTP. Renvoie {ok, path, error} comme narrate_to_file(). Schema
    verifie contre la doc officielle (docs.fish.audio/api-reference, 2026-
    08-22) : POST /v1/tts, auth Bearer, modele via l'EN-TETE "model" (pas le
    corps JSON), reference_id optionnel (voix par defaut du modele si absent)."""
    body = {"text": clean, "format": "mp3", "normalize": True}
    if FISH_AUDIO_VOICE_ID:
        body["reference_id"] = FISH_AUDIO_VOICE_ID
    req = urllib.request.Request(
        "https://api.fish.audio/v1/tts", data=json.dumps(body).encode("utf-8"),
        method="POST", headers={
            "Authorization": f"Bearer {FISH_AUDIO_API_KEY}",
            "Content-Type": "application/json",
            "model": FISH_AUDIO_MODEL,
        })
    try:
        with urllib.request.urlopen(req, timeout=FISH_AUDIO_TIMEOUT) as r:
            audio = r.read()
    except urllib.error.HTTPError as e:
        detail = ""
        try: detail = e.read().decode("utf-8", "ignore")[:300]
        except Exception: pass
        return {"ok": False, "path": None, "error": f"fish_audio_http_{e.code}: {detail}"}
    except Exception as e:
        return {"ok": False, "path": None, "error": f"fish_audio_{type(e).__name__}: {e}"}
    if len(audio) < 1024:
        return {"ok": False, "path": None, "error": "fish_audio_audio_vide"}
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "wb") as f:
        f.write(audio)
    return {"ok": True, "path": out_path, "error": None}


def _narrate_edge_tts(clean: str, out_path: str, voice: str) -> dict:
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


def narrate_to_file(text: str, out_path: str, voice: str = None) -> dict:
    """Genere la narration audio de `text` et l'ecrit dans `out_path` (mp3).
    Retourne {ok, path, error}. Ne leve jamais -- toute erreur est capturee
    et renvoyee dans le dict (coherent avec illustrate.illustrate(), qui ne
    fait jamais planter le cycle appelant).

    Cascade (2026-08-22) : Fish Audio d'abord si une cle est configuree,
    edge-tts en repli automatique (cle absente OU appel Fish Audio en echec)
    -- jamais d'echec total de narration a cause d'un seul fournisseur."""
    voice = voice or DEFAULT_VOICE
    clean = (text or "").strip()
    if not clean:
        return {"ok": False, "path": None, "error": "texte_vide"}
    if len(clean) > MAX_CHARS:
        clean = clean[:MAX_CHARS]

    if FISH_AUDIO_API_KEY:
        res = _narrate_fish_audio(clean, out_path)
        if res["ok"]:
            return res
        # Repli silencieux vers edge-tts, mais le detail de l'echec Fish Audio
        # est conserve dans le message si edge-tts echoue aussi (diagnostic).
        fallback = _narrate_edge_tts(clean, out_path, voice)
        if not fallback["ok"]:
            fallback["error"] = f"fish_audio_echec({res['error']}) puis {fallback['error']}"
        return fallback
    return _narrate_edge_tts(clean, out_path, voice)
