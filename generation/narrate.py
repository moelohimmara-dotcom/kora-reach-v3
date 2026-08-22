"""narrate.py — texte d'article -> fichier audio (voix off).

Fournisseur PRIORITAIRE (2026-08-22, demande explicite) : ElevenLabs, si
ELEVENLABS_API_KEY est renseignee dans l'environnement -- qualite de voix
nettement superieure, cle personnelle de l'utilisateur. Repli AUTOMATIQUE
sur edge-tts (voix neuronales Microsoft Edge, gratuit, sans cle) si la cle
est absente, ou si l'appel ElevenLabs echoue pour quelque raison que ce
soit (quota epuise, reseau, cle revoquee...) -- meme philosophie de
cascade resiliente que generation/writer.py (fournisseurs LLM) et
generation/illustrate.py (image) : ne JAMAIS laisser une panne d'un
fournisseur externe bloquer la generation video.

edge-tts est un paquet TIERS (pas stdlib) : ajoute a requirements.txt.
Fonctionne de facon 100% equivalente a illustrate.py cote philosophie
(pas de cle, pas de compte) -- seule difference : c'est une bibliotheque
Python (API asyncio), pas un simple GET HTTP. L'appel ElevenLabs, lui,
est un simple POST HTTP (urllib stdlib, zero dependance supplementaire).
"""
import asyncio
import json
import os
import urllib.request
import urllib.error

ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY", "").strip()
# Voix par defaut ElevenLabs : "Daniel" (Steady Broadcaster), premade --
# verifiee EN CONDITIONS REELLES le 2026-08-22 avec la cle du compte (le
# defaut generique "Rachel" ne fonctionne PAS : 402 payment_required, "Free
# users cannot use library voices via the API" -- Daniel fait partie des
# voix propres au compte, testee sans erreur). Surchargeable par
# ELEVENLABS_VOICE_ID (voir GET /v1/voices pour la liste du compte).
ELEVENLABS_VOICE_ID = os.environ.get("ELEVENLABS_VOICE_ID", "onwK4e9ZLuTAKqWW03F9")
ELEVENLABS_TIMEOUT = int(os.environ.get("ELEVENLABS_TIMEOUT_SEC", "60"))

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


def _narrate_elevenlabs(clean: str, out_path: str) -> dict:
    """POST direct (urllib stdlib) -- pas de SDK tiers ajoute pour un simple
    appel HTTP. Renvoie {ok, path, error} comme narrate_to_file()."""
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}"
    body = json.dumps({
        "text": clean,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
    }).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    })
    try:
        with urllib.request.urlopen(req, timeout=ELEVENLABS_TIMEOUT) as r:
            audio = r.read()
    except urllib.error.HTTPError as e:
        detail = ""
        try: detail = e.read().decode("utf-8", "ignore")[:300]
        except Exception: pass
        return {"ok": False, "path": None, "error": f"elevenlabs_http_{e.code}: {detail}"}
    except Exception as e:
        return {"ok": False, "path": None, "error": f"elevenlabs_{type(e).__name__}: {e}"}
    if len(audio) < 1024:
        return {"ok": False, "path": None, "error": "elevenlabs_audio_vide"}
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

    Cascade (2026-08-22) : ElevenLabs d'abord si une cle est configuree,
    edge-tts en repli automatique (cle absente OU appel ElevenLabs en echec)
    -- jamais d'echec total de narration a cause d'un seul fournisseur."""
    voice = voice or DEFAULT_VOICE
    clean = (text or "").strip()
    if not clean:
        return {"ok": False, "path": None, "error": "texte_vide"}
    if len(clean) > MAX_CHARS:
        clean = clean[:MAX_CHARS]

    if ELEVENLABS_API_KEY:
        res = _narrate_elevenlabs(clean, out_path)
        if res["ok"]:
            return res
        # Repli silencieux vers edge-tts, mais le detail de l'echec ElevenLabs
        # est conserve dans le message si edge-tts echoue aussi (diagnostic).
        fallback = _narrate_edge_tts(clean, out_path, voice)
        if not fallback["ok"]:
            fallback["error"] = f"elevenlabs_echec({res['error']}) puis {fallback['error']}"
        return fallback
    return _narrate_edge_tts(clean, out_path, voice)
