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
import subprocess
import tempfile
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

# Voix du mode DIALOGUE (2026-08-24, demande explicite : narration façon
# NotebookLM, deux voix qui discutent). Trois emplacements configurables --
# jamais de nom de personne réelle en dur ici (demande explicite : "je ne
# veux pas que tu notes... les noms des officiels"), uniquement des
# identifiants techniques Fish Audio. Duo homme-femme : VOICE_MALE_1 +
# VOICE_FEMALE_1. Duo deux hommes : VOICE_MALE_1 + VOICE_MALE_2.
# Surchargeables sans toucher au code.
#
# MAJ 2026-08-24 (retour utilisateur : "ça ne sonne pas très pro... je
# veux des voix qui sonnent journalistiquement") -- les 3 premiers choix
# (voix "narrateur cinématique", "voix mâle dynamique", voix générique)
# jugés pas assez pro. Remplacés par 3 voix de la bibliothèque Fish Audio
# dont la DESCRIPTION officielle (pas le titre, ni les tags -- peu fiables,
# renseignés par les uploadeurs) correspond explicitement à un registre
# actualité/documentaire :
# - MALE_1 = "frances 1" (966a09df9c194c04818dbb9bf27e6ae0) : "professional
#   and authoritative... reminiscent of a traditional news anchor".
# - MALE_2 = "frances 2" (d1e5c6c4b9694cde8048824ce8116279) : "professional
#   and informative... well-suited for news reporting or documentary
#   narration" (voix distincte de MALE_1, pour le duo deux hommes).
# - FEMALE_1 = voix identifiée "Mariano Closs Diálogos 2" dans la
#   bibliothèque (d1e5c6c... -- nom d'upload non pertinent, PAS une
#   personnalité utilisée ici, seule la description compte) :
#   "clear and warm... professional yet gentle... measured and empathetic".
# Aucune de ces 3 voix n'est un clone de personnalité publique.
FISH_AUDIO_VOICE_MALE_1 = os.environ.get("FISH_AUDIO_VOICE_MALE_1", "966a09df9c194c04818dbb9bf27e6ae0").strip()
FISH_AUDIO_VOICE_MALE_2 = os.environ.get("FISH_AUDIO_VOICE_MALE_2", "d1e5c6c4b9694cde8048824ce8116279").strip()
FISH_AUDIO_VOICE_FEMALE_1 = os.environ.get("FISH_AUDIO_VOICE_FEMALE_1", "7366956b694c4a5dae0a7d94321bef4a").strip()
# Pause de respiration entre deux répliques (secondes) -- un enchaînement
# immédiat sans le moindre silence sonne mécanique, un vrai duo laisse
# toujours un micro-blanc entre deux prises de parole.
DIALOGUE_TURN_GAP_SEC = float(os.environ.get("KORA_DIALOGUE_TURN_GAP_SEC", "0.35"))

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


def _narrate_fish_audio(clean: str, out_path: str, voice_id: str = None) -> dict:
    """POST direct (urllib stdlib) -- pas de SDK tiers ajoute pour un simple
    appel HTTP. Renvoie {ok, path, error} comme narrate_to_file(). Schema
    verifie contre la doc officielle (docs.fish.audio/api-reference, 2026-
    08-22) : POST /v1/tts, auth Bearer, modele via l'EN-TETE "model" (pas le
    corps JSON), reference_id optionnel (voix par defaut du modele si absent).

    voice_id (2026-08-24, mode dialogue) : surcharge FISH_AUDIO_VOICE_ID pour
    une voix precise (une voix par intervenant du dialogue, voir
    narrate_dialogue_to_file() plus bas) -- repli sur FISH_AUDIO_VOICE_ID
    (mode solo, comportement inchange) si non fourni."""
    body = {
        "text": clean, "format": "mp3", "normalize": True,
        "temperature": FISH_AUDIO_TEMPERATURE, "top_p": FISH_AUDIO_TOP_P,
        "prosody": {"speed": FISH_AUDIO_SPEED, "volume": 0, "normalize_loudness": True},
        "condition_on_previous_chunks": True,
    }
    effective_voice = voice_id or FISH_AUDIO_VOICE_ID
    if effective_voice:
        body["reference_id"] = effective_voice
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


# Dialogue à deux voix (2026-08-24, demande explicite : "façon NotebookLM
# ... un homme et une femme qui discutent entre eux ... je veux que l'échange
# soit le plus vivant possible, le plus réaliste possible ... pas sous forme
# de lecture, mais un dialogue ... la première doit commencer par une
# salutation courtoise et professionnelle avec une présentation du sujet et
# l'introduction. Ensuite, l'autre prend le relais ... interactif ...
# percutant"). Distinct de _EDITO_SYSTEM_PROMPT (mode solo, un seul
# présentateur) -- reprend les mêmes garde-fous (anti-hallucination,
# anonymat IA, langue) mais restructuré pour deux voix qui se répondent
# vraiment, pas deux monologues juxtaposés.
_DIALOGUE_SYSTEM_PROMPT = (
    "Tu es le DUO DE PRÉSENTATEURS RADIO de KORA, média d'information guinéen "
    "(Conakry). On te donne un article DÉJÀ RÉDIGÉ (titre + texte, pour la "
    "lecture des yeux). Ta mission : le transformer en un ÉCHANGE ORAL À DEUX "
    "VOIX (A et B) qui dialoguent en studio sur ce sujet -- vivant, réaliste, "
    "INTERACTIF, comme un vrai duo de présentateurs qui se répondent en "
    "direct. JAMAIS deux lectures juxtaposées ni une simple alternance "
    "mécanique de phrases : un vrai échange, avec réactions, relances, "
    "transitions.\n\n"
    "RÈGLES STRICTES :\n"
    "1. ANTI-HALLUCINATION : tu ne dois RIEN ajouter comme fait, chiffre, "
    "date, nom ou citation qui n'est pas déjà présent dans l'article fourni. "
    "Tu reformules et restructures pour l'oral, tu n'inventes JAMAIS de "
    "contenu nouveau, tu ne complètes JAMAIS une information manquante.\n"
    "2. OUVERTURE (obligatoire) : la voix A commence TOUJOURS par une "
    "salutation courtoise et professionnelle, puis présente clairement le "
    "sujet et fait une brève introduction -- jamais 'Titre :', jamais de "
    "symbole markdown, jamais de label.\n"
    "3. QUESTION-RÉPONSE RÉEL (le coeur du dialogue) : après l'ouverture, "
    "A pose à B une VRAIE question, précise et sur le fond ('Alors, "
    "qu'est-ce qui explique...', 'Comment expliquer que...', 'Qu'est-ce "
    "qu'on sait exactement sur...'). B répond EN REPRENANT LES TERMES DE LA "
    "QUESTION (jamais un simple enchaînement à côté du sujet) avant de "
    "développer -- par exemple si A demande 'que penses-tu de X ?', B "
    "commence par 'Alors sur X, ...' ou 'C'est une bonne question, et pour "
    "ma part...', jamais une réponse qui ignore ce qui vient d'être demandé. "
    "Après cette réponse, A rebondit à son tour sur ce que B vient de dire "
    "(reformule un point précis de la réponse de B avant d'enchaîner, ou "
    "pose une question de relance qui découle directement de la réponse "
    "précédente -- jamais une nouvelle question sans lien). Ce mécanisme "
    "question -> réponse qui reprend la question -> rebond se répète "
    "plusieurs fois de suite sur les différents éléments de l'article : "
    "chaque échange doit ressembler à une vraie conversation entre deux "
    "journalistes qui S'ÉCOUTENT, pas à deux monologues juxtaposés ni à un "
    "simple résumé découpé en deux voix. Alterne QUI pose la question (pas "
    "toujours A) au fil du dialogue.\n"
    "4. TON : percutant et pertinent -- va à l'essentiel, ne dilue jamais, "
    "chaleureux mais professionnel, factuel et neutre sur le fond -- "
    "l'énergie vient du RYTHME et de l'interaction réelle entre les deux "
    "voix, jamais d'un avis personnel absent de l'article source.\n"
    "5. STYLE ORAL : phrases courtes et rythmées, AUCUN symbole markdown, "
    "AUCUNE liste à puces, AUCUN intertitre, AUCUNE didascalie entre "
    "parenthèses (pas de '(rires)', '(pause)' etc.) -- uniquement du texte "
    "à dire à voix haute.\n"
    "6. CLÔTURE : termine par un court échange de sortie naturel et oral "
    "(l'une des deux voix conclut, l'autre peut ajouter un mot de clôture) -- "
    "jamais 'Par La Rédaction' tel quel, c'est une signature écrite, pas une "
    "formule orale.\n"
    "7. ANONYMAT : ne mentionne jamais que ce texte ou ces voix sont générés "
    "par une IA, un modèle, un assistant ou un robot -- l'auditeur doit "
    "croire à un vrai duo de présentateurs humains.\n"
    "8. LANGUE : français uniquement, aucun mot ni expression dans une autre "
    "langue.\n"
    "9. FORMAT DE SORTIE STRICT : une réplique par ligne, chaque ligne "
    "commence EXACTEMENT par 'A : ' ou 'B : ' (lettre, espace, deux-points, "
    "espace), rien avant. Aucune autre ligne, aucun commentaire, aucun "
    "texte hors de ce format. Exemple de forme illustrant le mécanisme "
    "question -> réponse qui reprend la question -> rebond (contenu "
    "fictif) :\n"
    "A : Bonsoir et bienvenue dans cette édition de KORA. Ce soir, on "
    "revient sur la situation à Conakry.\n"
    "A : Alors, qu'est-ce qui explique vraiment ce qui s'est passé hier ?\n"
    "B : C'est une bonne question, et justement, sur ce qui s'est passé "
    "hier, plusieurs éléments se recoupent...\n"
    "A : Donc si je te suis bien, c'est surtout ce point-là qui a fait "
    "basculer les choses ?\n"
    "B : Exactement, et c'est là que ça devient intéressant, parce que...\n"
)


def build_dialogue_script(title: str, article_text: str) -> list:
    """Équivalent de build_edito_script() pour le mode dialogue à deux voix.
    Retourne une liste de tuples (speaker, texte) -- speaker vaut "A" ou "B".
    Repli MÉCANIQUE si le LLM échoue ou renvoie un format inexploitable :
    un dialogue à 2 lignes minimal (A introduit, B clôt), jamais un blocage
    de la génération vidéo pour ça (même philosophie que build_edito_script)."""
    clean_fallback = re.sub(r"^#\s.*\n+", "", article_text or "", count=1)
    clean_fallback = re.sub(r"\n*Par La R[ée]daction\s*$", "", clean_fallback,
                             flags=re.IGNORECASE).strip()
    fallback = [("A", f"Bonsoir et bienvenue dans cette édition de KORA. Aujourd'hui, on revient sur : {title}."),
                ("B", clean_fallback[:MAX_CHARS] if clean_fallback else "Voilà pour cette actualité."),
                ("A", "Voilà pour cette édition, merci de nous avoir suivis.")]
    try:
        import generation.writer as writer
    except Exception:
        return fallback
    user = f"TITRE : {title}\n\nARTICLE :\n{article_text}"
    try:
        out = writer.simple_completion(_DIALOGUE_SYSTEM_PROMPT, user, max_tokens=1800)
    except Exception:
        out = None
    if not out:
        return fallback
    turns = _parse_dialogue(out)
    # Repli si le parsing échoue totalement ou produit un dialogue
    # anormalement court (LLM en échec silencieux, format non respecté).
    if len(turns) < 2 or sum(len(t[1].split()) for t in turns) < 20:
        return fallback
    return turns


def _parse_dialogue(raw: str) -> list:
    """Parse le format strict 'A : ...' / 'B : ...' (une réplique par ligne,
    voir règle 9 de _DIALOGUE_SYSTEM_PROMPT). Tolère une casse/espacement
    légèrement différents (ex. 'a:' au lieu de 'A : '), ignore toute ligne
    qui ne matche pas ce format plutôt que de planter dessus."""
    turns = []
    for line in (raw or "").splitlines():
        m = re.match(r"^\s*([AB])\s*:\s*(.+?)\s*$", line, flags=re.IGNORECASE)
        if m:
            speaker = m.group(1).upper()
            text = m.group(2).strip()
            if text:
                turns.append((speaker, text))
    return turns


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


# ============================================================
# MODE DIALOGUE (2026-08-24) : synthèse d'un script à deux voix
# (build_dialogue_script() + _parse_dialogue() plus haut) -> un seul
# fichier audio final, une voix par intervenant.
# ============================================================

# mode -> (fish_voice_A, fish_voice_B, edge_voice_A, edge_voice_B). edge-tts
# sert de repli si Fish Audio est indisponible -- deux voix distinctes
# existent nativement chez edge-tts (voir VOICES_FR), donc le repli reste
# un vrai dialogue à deux timbres, pas deux répliques identiques.
_DIALOGUE_VOICE_MODES = {
    "duo_hf": (FISH_AUDIO_VOICE_MALE_1, FISH_AUDIO_VOICE_FEMALE_1, VOICES_FR["henri"], VOICES_FR["denise"]),
    "duo_hh": (FISH_AUDIO_VOICE_MALE_1, FISH_AUDIO_VOICE_MALE_2, VOICES_FR["henri"], VOICES_FR["remy"]),
}


def _narrate_turn(text: str, out_path: str, fish_voice_id: str, edge_voice: str) -> dict:
    """Synthétise UNE réplique avec une voix précise (cascade Fish Audio ->
    edge-tts, même philosophie que narrate_to_file() mais paramétrée par
    voix plutôt que par le seul FISH_AUDIO_VOICE_ID global -- indispensable
    pour un dialogue où chaque intervenant doit garder son propre timbre."""
    clean = (text or "").strip()
    if not clean:
        return {"ok": False, "path": None, "error": "texte_vide"}
    if len(clean) > MAX_CHARS:
        clean = clean[:MAX_CHARS]
    if FISH_AUDIO_API_KEY:
        res = _narrate_fish_audio(clean, out_path, voice_id=fish_voice_id)
        if res["ok"]:
            return res
        fallback = _narrate_edge_tts(clean, out_path, edge_voice)
        if not fallback["ok"]:
            fallback["error"] = f"fish_audio_echec({res['error']}) puis {fallback['error']}"
        return fallback
    return _narrate_edge_tts(clean, out_path, edge_voice)


def _silence_clip(path: str, duration_sec: float) -> bool:
    """Génère un court silence mp3 (ffmpeg anullsrc) -- micro-pause entre
    deux répliques pour un rendu naturel (voir DIALOGUE_TURN_GAP_SEC)."""
    ffmpeg_bin = os.environ.get("KORA_FFMPEG_BIN", "ffmpeg")
    cmd = [ffmpeg_bin, "-y", "-f", "lavfi", "-i", f"anullsrc=r=44100:cl=mono",
           "-t", str(duration_sec), "-q:a", "9", path, "-loglevel", "error"]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        return r.returncode == 0 and os.path.exists(path)
    except Exception:
        return False


def narrate_dialogue_to_file(turns: list, out_path: str, mode: str = "duo_hf") -> dict:
    """Synthétise un dialogue à deux voix (turns = liste de tuples
    (speaker, texte), voir build_dialogue_script()) en UN SEUL fichier audio
    final (out_path, mp3) : une voix par intervenant (A/B), micro-pause
    entre chaque réplique, concaténation via ffmpeg (concat demuxer -- pas
    de perte de qualité, pas de ré-encodage superflu par segment).

    Retourne {ok, path, error} comme narrate_to_file() -- ne lève jamais.
    Repli : si mode inconnu, retombe sur "duo_hf"."""
    fish_a, fish_b, edge_a, edge_b = _DIALOGUE_VOICE_MODES.get(mode, _DIALOGUE_VOICE_MODES["duo_hf"])
    voices = {"A": (fish_a, edge_a), "B": (fish_b, edge_b)}
    if not turns:
        return {"ok": False, "path": None, "error": "dialogue_vide"}

    work_dir = tempfile.mkdtemp(prefix="kora_dialogue_")
    try:
        clip_paths = []
        for i, (speaker, text) in enumerate(turns):
            fish_voice, edge_voice = voices.get(speaker, voices["A"])
            clip_path = os.path.join(work_dir, f"turn_{i:03d}.mp3")
            res = _narrate_turn(text, clip_path, fish_voice, edge_voice)
            if not res["ok"]:
                return {"ok": False, "path": None,
                        "error": f"replique_{i}_({speaker})_echouee: {res['error']}"}
            clip_paths.append(clip_path)
            # Micro-pause après chaque réplique SAUF la dernière.
            if i < len(turns) - 1 and DIALOGUE_TURN_GAP_SEC > 0:
                gap_path = os.path.join(work_dir, f"gap_{i:03d}.mp3")
                if _silence_clip(gap_path, DIALOGUE_TURN_GAP_SEC):
                    clip_paths.append(gap_path)

        # Concaténation ffmpeg (concat demuxer -- fichier liste, pas de
        # ré-encodage par segment, juste le mux final vers out_path).
        list_path = os.path.join(work_dir, "list.txt")
        with open(list_path, "w", encoding="utf-8") as f:
            for p in clip_paths:
                escaped = p.replace("'", "'\\''")
                f.write(f"file '{escaped}'\n")
        ffmpeg_bin = os.environ.get("KORA_FFMPEG_BIN", "ffmpeg")
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        cmd = [ffmpeg_bin, "-y", "-f", "concat", "-safe", "0", "-i", list_path,
               "-c:a", "libmp3lame", "-q:a", "2", out_path, "-loglevel", "error"]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if r.returncode != 0:
            return {"ok": False, "path": None, "error": f"ffmpeg_concat: {r.stderr[:400]}"}
        if not os.path.exists(out_path) or os.path.getsize(out_path) < 1024:
            return {"ok": False, "path": None, "error": "dialogue_final_vide_ou_absent"}
        return {"ok": True, "path": out_path, "error": None}
    finally:
        import shutil
        shutil.rmtree(work_dir, ignore_errors=True)
    return _narrate_edge_tts(clean, out_path, voice)
