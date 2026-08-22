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
import re
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
# Expressivite / prosodie (2026-08-23, demande explicite : "sa lecture doit
# etre vivante et realiste, comme le ferait un lecteur humain") -- parametres
# CONFIRMES contre la doc officielle (docs.fish.audio/api-reference/endpoint/
# openapi-v1/text-to-speech, verifie 2026-08-23), jamais devines :
# - temperature (0-1, defaut API 0.7) : "Controls expressiveness. Higher is
#   more varied, lower is more consistent." Releve legerement au-dessus du
#   defaut pour une intonation moins plate qu'une lecture mecanique, sans
#   aller jusqu'a l'instabilite (recommande < 0.9 par la doc).
# - prosody.speed (0.5-2.0, defaut 1.0) : legerement < 1.0, debit d'actu
#   naturel (un present­ateur ne debite pas a vitesse machine).
# - condition_on_previous_chunks : le texte d'un article depasse souvent
#   chunk_length (300 caracteres, decoupage interne cote Fish Audio) --
#   sans ce flag, chaque nouveau segment repart "a froid" et la voix peut
#   changer legerement de ton entre deux paragraphes ; active, elle garde
#   la MEME intonation tout du long, essentiel pour un rendu credible sur
#   un article de plusieurs paragraphes.
FISH_AUDIO_TEMPERATURE = float(os.environ.get("FISH_AUDIO_TEMPERATURE", "0.85"))
FISH_AUDIO_TOP_P = float(os.environ.get("FISH_AUDIO_TOP_P", "0.7"))
FISH_AUDIO_SPEED = float(os.environ.get("FISH_AUDIO_SPEED", "0.97"))

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
    body = {
        "text": clean, "format": "mp3", "normalize": True,
        "temperature": FISH_AUDIO_TEMPERATURE, "top_p": FISH_AUDIO_TOP_P,
        "prosody": {"speed": FISH_AUDIO_SPEED, "volume": 0, "normalize_loudness": True},
        "condition_on_previous_chunks": True,
    }
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
        # rate legerement ralenti (2026-08-23, meme demande que Fish Audio
        # ci-dessus : "lecture vivante et realiste") -- edge-tts n'a pas de
        # parametre d'expressivite comme "temperature" (voix neuronale a
        # prosodie fixe), seul le debit est ajustable ici ; ce chemin n'est
        # de toute facon qu'un REPLI (Fish Audio est prioritaire), garde
        # coherent avec le reglage principal plutot que de laisser un debit
        # different selon le fournisseur qui a fini par repondre.
        communicate = edge_tts.Communicate(clean, voice, rate="-3%")
        await communicate.save(out_path)

    try:
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        asyncio.run(_run())
        if not os.path.exists(out_path) or os.path.getsize(out_path) < 1024:
            return {"ok": False, "path": None, "error": "fichier_audio_vide_ou_absent"}
        return {"ok": True, "path": out_path, "error": None}
    except Exception as e:
        return {"ok": False, "path": None, "error": f"{type(e).__name__}: {e}"}


# Réécriture "édito" (2026-08-23, demande explicite : "sa lecture doit être
# vivante et réaliste, comme le ferait un lecteur humain. Il doit le faire
# sous forme d'édito") -- l'article ECRIT (titre markdown '# ...', chapô,
# corps, signature 'Par La Rédaction') est rédigé pour être LU DES YEUX, pas
# pour être dit à voix haute : le lire tel quel à une voix de synthèse
# produit une lecture plate et mécanique, symboles markdown compris. Cette
# fonction transforme le texte en un script d'édito radio AVANT narration --
# même contenu factuel, mais restructuré pour l'oral (accroche, connecteurs
# parlés, rythme varié, clôture naturelle). Aucune invention : mêmes règles
# anti-hallucination que generation/writer.py (le LLM ne fait que reformuler
# ce qui est déjà dans l'article fourni).
_EDITO_SYSTEM_PROMPT = (
    "Tu es un ÉDITORIALISTE RADIO chevronné qui présente les actualités de KORA, "
    "média d'information guinéen (Conakry), à l'oral. On te donne un article DÉJÀ "
    "RÉDIGÉ (titre + texte, pour la lecture des yeux). Ta mission : le transformer "
    "en un texte destiné à être LU À HAUTE VOIX par une voix de synthèse, sous "
    "forme d'ÉDITO -- vivant, naturel, incarné, comme le ferait un vrai "
    "présentateur humain en studio. JAMAIS une lecture plate mot à mot de "
    "l'article écrit.\n\n"
    "RÈGLES STRICTES :\n"
    "1. ANTI-HALLUCINATION : tu ne dois RIEN ajouter comme fait, chiffre, date, "
    "nom ou citation qui n'est pas déjà présent dans l'article fourni. Tu "
    "reformules et restructures pour l'oral, tu n'inventes JAMAIS de contenu "
    "nouveau, tu ne complètes JAMAIS une information manquante.\n"
    "2. OUVERTURE : commence par une phrase d'accroche naturelle et vivante qui "
    "capte l'attention, comme le ferait un présentateur -- jamais 'Titre :', "
    "jamais de symbole markdown ('#', '**', '##'), jamais de label.\n"
    "3. STYLE ORAL : phrases courtes et rythmées, connecteurs parlés naturels "
    "('Alors,', 'Et c'est là que...', 'Concrètement,', 'Sur le terrain,'), "
    "variation du rythme (alterne phrases courtes et longues), AUCUN symbole "
    "markdown, AUCUNE liste à puces, AUCUN intertitre. Le texte doit se lire "
    "naturellement à voix haute, avec une ponctuation qui marque les "
    "respirations (virgules, points courts).\n"
    "4. TON : chaleureux mais professionnel, factuel et neutre sur le fond -- "
    "l'énergie vient du RYTHME et de la construction des phrases, jamais d'un "
    "avis personnel, d'une opinion ou d'un jugement de valeur absent de "
    "l'article source.\n"
    "5. CLÔTURE : termine par une courte phrase de sortie naturelle et orale "
    "(par exemple 'Voilà pour cette édition.' ou 'On en reste là pour cette "
    "actualité.') -- jamais 'Par La Rédaction' tel quel, c'est une signature "
    "écrite, pas une formule orale.\n"
    "6. ANONYMAT : ne mentionne jamais que ce texte ou cette voix est généré "
    "par une IA, un modèle, un assistant ou un robot -- l'auditeur doit croire "
    "à une vraie voix de rédaction humaine.\n"
    "7. LANGUE : français uniquement, aucun mot ni expression dans une autre "
    "langue.\n"
    "Réponds UNIQUEMENT par le texte de l'édito, prêt à être lu à voix haute, "
    "rien d'autre (pas de titre, pas de commentaire, pas de guillemets "
    "englobants)."
)


def build_edito_script(title: str, article_text: str) -> str:
    """Transforme un article ÉCRIT (titre markdown + chapô + corps + signature)
    en un script destiné à être LU À HAUTE VOIX sous forme d'édito. Réutilise
    le même LLM que la rédaction d'article (generation.writer.simple_completion,
    cascade de fournisseurs identique) -- import paresseux pour éviter tout
    couplage/coût au chargement de ce module (même précaution que
    _derive_source_level dans publishing/transmit.py).

    Repli MÉCANIQUE (jamais de blocage de la génération vidéo pour ça) : si
    l'appel LLM échoue (réseau, disjoncteur ouvert, réponse vide/suspecte),
    renvoie le texte source dégrossi (titre markdown et signature retirés)
    plutôt qu'un texte d'article brut avec ses symboles."""
    clean_fallback = re.sub(r"^#\s.*\n+", "", article_text or "", count=1)
    clean_fallback = re.sub(r"\n*Par La R[ée]daction\s*$", "", clean_fallback,
                             flags=re.IGNORECASE).strip()
    try:
        import generation.writer as writer
    except Exception:
        return clean_fallback
    user = f"TITRE : {title}\n\nARTICLE :\n{article_text}"
    try:
        out = writer.simple_completion(_EDITO_SYSTEM_PROMPT, user, max_tokens=1400)
    except Exception:
        out = None
    # Reponse vide ou anormalement courte (LLM en echec silencieux, sortie
    # tronquee...) -> repli mecanique, jamais un edito manifestement casse.
    if not out or len(out.split()) < 20:
        return clean_fallback
    return out.strip()


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
