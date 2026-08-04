"""writer.py — génération d'article de synthèse (branche le LLM sur les facts Reach).
Réutilise la chaîne de fallback KORA (groq -> cerebras -> openrouter) en version
locale (sans Supabase). Si aucune clé API n'est définie, bascule en mode TEMPLATE
(prouve le câblage fact -> article sans clé). Le routeur TokenRouter (kimi) peut
être ajouté via TR_KEY.
"""
import os
from typing import Dict, List
import illustrate

PROVIDER_CONFIG = {
    "groq": {"model": "groq/llama-3.3-70b-versatile", "env": "GROQ_API_KEY"},
    "cerebras": {"model": "cerebras/gpt-oss-120b", "env": "CEREBRAS_API_KEY"},
    "openrouter": {"model": "openrouter/meta-llama/llama-3.1-8b-instruct", "env": "OPENROUTER_API_KEY"},
}
PROVIDER_ORDER = ["groq", "cerebras", "openrouter"]

SYSTEM_PROMPT = (
    "Tu es le RÉDACTEUR EN CHEF ADJOINT de kakilambe.com, média d'information guinéen (Conakry). "
    "Ta mission : rédiger un article de synthèse de presse à partir d'une source principale et de contextes complémentaires fournis.\n\n"
    "RÈGLES DE RÉDACTION (strictes) :\n"
    "1. STRUCTURE OBLIGATOIRE (respecte cet ordre) :\n"
    "   # TITRE (accrocheur, factuel, sans clickbait)\n"
    "   <CHAPÔ : paragraphe NU (sans titre ni label), 2 à 3 phrases en OUVERTURE, qui posent les 5W (Qui, Quoi, Quand, Où, Pourquoi) de façon factuelle et sobre, dans le style d'un chapô de presse (France 24 / BBC Afrique). Le chapô DOIT être la première phrase de l'article et introduire le sujet sans sensationnalisme.\n"
    "   ## Décryptage : 3 à 5 paragraphes au corps, pyramide inversée (l'essentiel d'abord, détails ensuite). Le Décryptage DÉVELOPPE le sujet — il ne répète PAS le chapô mot pour mot.\n"
    "   ## À noter : 1 paragraphe de contexte (lien avec la Guinée, enjeu, réaction).\n"
    "   Sources : [nom des sources réelles citées]\n"
    "   Par Kakilambe Kora Agent\n"
    "2. LONGUEUR DYNAMIQUE : l'utilisateur te donne une CIBLE en mots (ex. 'Vise 1200 mots'). "
    "Tu DOIS atteindre AU MOINS cette cible. Pour y parvenir, développe chaque section :\n"
    "   - Chapô : 2 à 3 phrases (les 5W + enjeu), pas plus.\n"
    "   - Décryptage : MINIMUM 5 paragraphes au corps, pyramide inversée, CHAQUE paragraphe >= 60 mots.\n"
    "   - À noter : 2 paragraphes (contexte Guinée + réaction/enjeu).\n"
    "   - Si tu manques de matière, ajoute une section '### Contexte et perspectives' (1-2 paragraphes) STRICTEMENT basée sur les textes fournis — sans inventer.\n"
    "   - Ne tronque jamais pour rester court : remplis la cible.\n"
    "3. TON : factuel, impartial, neutre. Une seule voix (pas de 'nous' subjectif, pas d'opinion du rédacteur). Style presse : phrases courtes, vocabulaire précis, pas d'adjectifs superlatifs.\n"
    "4. ANTI-HALLUCINATION : tu ne dois RIEN inventer. Toute info vient EXCLUSIVEMENT des contextes fournis. "
    "Si une donnée (date précise, chiffre, citation) manque dans les contextes, marque-la '[à vérifier]' — ne jamais supposer.\n"
    "5. PÉRIMÈTRE : actualité Guinée (Conakry). Si le fait est international mais filtré, garde le lien explicite avec la Guinée.\n"
    "6. CITATION : nomme les sources réelles fournies (ex. 'Selon Mosaïque Guinée...'). Pas de 'selon nos sources' vague.\n"
    "7. SIGNATURE : l'article se termine OBLIGATOIREMENT par 'Par Kakilambe Kora Agent' (sur sa propre ligne).\n"
    "8. STRUCTURE RENFORCÉE : si la cible > 1000 mots, ajoute des sous-titres (###) dans le Décryptage pour aérer la lecture.\n"
    "Rédige en français, orthographe et grammaire irréprochables."
)


def compute_length_target(fact: Dict) -> Dict:
    """Calcule la longueur cible (mots) selon pertinence + facteurs.
    Retourne {target, score, reasons[]}. Plage 879-1400 mots.
    """
    champ = fact.get("champion", {})
    ctx = fact.get("contexts", []) or fact.get("contextes", []) or []
    score = 0
    reasons = []

    # 1. Pertinence Guinée (level=1 ou guinee_filter)
    level = champ.get("level", 2)
    guinee_filter = champ.get("guinee_filter") or fact.get("guinee_filter")
    if level == 1 or guinee_filter:
        score += 30
        reasons.append("+30 pertinence Guinée (niveau 1 / filtre)")
    else:
        score -= 10
        reasons.append("-10 international seul sans filtre")

    # 2. Nb de sources fusionnées (cap +20)
    n_sources = len(ctx) + 1
    src_pts = min(n_sources * 5, 20)
    score += src_pts
    reasons.append(f"+{src_pts} sources ({n_sources})")

    # 3. Fraîcheur (<6h +15, <12h +10, <24h +5, stale 0)
    import time
    age_h = 99
    ts = champ.get("published_at") or champ.get("fetched_at") or fact.get("created_at")
    if ts:
        try:
            from datetime import datetime
            if isinstance(ts, str):
                ts = ts.replace("Z", "+00:00")
                dt = datetime.fromisoformat(ts)
            else:
                dt = datetime.fromtimestamp(float(ts))
            age_h = (datetime.now(dt.tzinfo) - dt).total_seconds() / 3600
        except Exception:
            age_h = 99
    if age_h < 6:
        score += 15; reasons.append("+15 fraîcheur <6h")
    elif age_h < 12:
        score += 10; reasons.append("+10 fraîcheur <12h")
    elif age_h < 24:
        score += 5; reasons.append("+5 fraîcheur <24h")
    else:
        reasons.append("+0 fraîcheur >24h/stale")

    # 4. Conflit de sources (heuristique : détection de mots contradictoires)
    conflict = False
    texts = [champ.get("raw_content", "")] + [c.get("raw_content", "") for c in ctx]
    contradict = ["dément", "contredit", "réfute", "nie", "faux", "infirm", "désaccord", "opposé"]
    joined = " ".join(texts).lower()
    if any(w in joined for w in contradict):
        conflict = True
        score += 15
        reasons.append("+15 conflit de sources détecté")

    # 5. Diversité entités (heuristique : nb de mots capitaux distincts)
    import re
    caps = set(re.findall(r"\b[A-ZÀ-Ý][a-zà-ÿ]{2,}\b", " ".join(texts)))
    n_ent = len(caps)
    if n_ent >= 8:
        score += 10; reasons.append(f"+10 diversité entités ({n_ent})")
    elif n_ent >= 4:
        score += 5; reasons.append(f"+5 diversité entités ({n_ent})")

    score = max(0, min(100, score))
    # Mapping score -> longueur (879 plancher, 1400 plafond)
    if score >= 80: target = 1400
    elif score >= 60: target = 1200
    elif score >= 40: target = 1050
    elif score >= 20: target = 950
    else: target = 879
    return {"target": target, "score": score, "reasons": reasons}


def _build_messages(fact: Dict) -> List[Dict]:
    champ = fact["champion"]
    ctx = fact.get("contexts", [])
    lt = compute_length_target(fact)
    parts = [f"SOURCE PRINCIPALE ({champ['source']}) :\n{champ['raw_content'][:2500]}"]
    for i, c in enumerate(ctx[:3], 1):
        parts.append(f"CONTEXTE {i} ({c['source']}) :\n{c['raw_content'][:1200]}")
    user = (
        "Rédige un article de synthèse sur le fait suivant.\n\n"
        + "\n\n".join(parts)
        + f"\n\nTitre suggéré : {champ['title']}\n"
        + f"Source champion à citer : {champ['source']}\n"
        + f"Périmètre : Guinée (Conakry).\n"
        + f"CIBLE DE LONGUEUR : Vise {lt['target']} mots (au moins). Pertinence calculée : {lt['score']}/100.\n"
        + "Rédige l'article complet (Titre, CHAPÔ en ouverture — paragraphe nu sans label, Décryptage, À noter, Sources, Par Kakilambe Kora Agent) "
        + "en français, en atteignant la cible sans rien inventer hors des textes ci-dessus."
    )
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user},
    ]


def _template_article(fact: Dict) -> str:
    champ = fact["champion"]
    ctx = fact.get("contextes" if "contextes" in fact else "contexts", [])
    art = f"# {champ['title']}\n\n"
    art += champ["raw_content"][:600] + "...\n\n"
    if ctx:
        art += "**Contexte complémentaire** : " + ", ".join(c["source"] for c in ctx) + "\n"
        for c in ctx[:2]:
            art += f"- {c['source']} : {c['raw_content'][:150]}...\n"
    art += "\n*Par Kakilambe Kora Agent*"
    return art


def _illustrate_fact(fact: Dict) -> Dict:
    """Génère l'image (FAL synchrone) ou fallback OG. Retourne dict image/metadonnées."""
    champ = fact["champion"]
    # L'OG du champion peut être dans champ['image'] (son URL d'illustration source)
    og = champ.get("image", "") or fact.get("image", "")
    chapeau = (champ.get("raw_content") or "")[:200]
    res = illustrate.illustrate({"image": og}, champ.get("title", ""), chapeau)
    return res


def _ollama_chat(messages: List[Dict], max_tokens: int = 600) -> str:
    """Appel Ollama Cloud (gemma4). Retourne le texte ou None si échec."""
    if not os.environ.get("OLLAMA_API_KEY"):
        return None
    try:
        import urllib.request as _req
        import json as _json
        model = os.environ.get("OLLAMA_MODEL", "gemma4")
        req = _req.Request(
            "https://ollama.com/v1/chat/completions",
            data=_json.dumps({"model": model, "messages": messages, "max_tokens": max_tokens, "temperature": 0.4, "stream": False}).encode(),
            headers={"Authorization": f"Bearer {os.environ['OLLAMA_API_KEY']}", "Content-Type": "application/json"},
        )
        with _req.urlopen(req, timeout=180) as r:
            data = _json.loads(r.read())
        return data["choices"][0]["message"]["content"].strip()
    except Exception:
        return None


def _strip_section_title(text: str, label: str) -> str:
    """Retire les lignes de titre de section que le modèle répète (ex. '## Le fait en bref :', '## Décryptage (9/9)')."""
    import re
    out = []
    for line in text.split("\n"):
        if re.match(rf"^#+\s*{label}(\s*\(?\d+/\d+\)?)?\s*[:\-]?\s*$", line.strip(), re.IGNORECASE):
            continue
        out.append(line)
    return "\n".join(out).strip()


def _gen_sections(fact: Dict, lt: Dict) -> str:
    """Génération section par section (algo spécialisé longueur pour petit modèle 4B).
    Chaque section = 1 appel avec consigne de longueur précise -> assemblage."""
    champ = fact["champion"]
    ctx = fact.get("contexts", [])
    target = lt["target"]
    # Nb de paragraphes de décryptage selon cible (assez pour la longueur, pas de redite)
    if target >= 1400: n_para = 10
    elif target >= 1200: n_para = 8
    elif target >= 1050: n_para = 7
    else: n_para = 6

    src_block = "\n".join(
        [f"SOURCE PRINCIPALE ({champ['source']}) :\n{champ['raw_content'][:2500]}"]
        + [f"CONTEXTE {i} ({c['source']}) :\n{c['raw_content'][:1200]}" for i, c in enumerate(ctx[:3], 1)]
    )

    sys_base = SYSTEM_PROMPT.split("2. LONGUEUR")[0]  # garde rôle + structure + anti-hallu

    # 1. Chapô (ouverture, paragraphe nu, 2-3 phrases les 5W)
    lede_msg = [
        {"role": "system", "content": sys_base + "Rédige UNIQUEMENT le CHAPÔ de l'article (2-3 phrases, ~70 mots, les 5W + enjeu, style presse France 24/BBC Afrique). Paragraphe NU sans titre ni label. Pas de 'Le fait en bref'."},
        {"role": "user", "content": f"{src_block}\n\nTitre suggéré : {champ['title']}"},
    ]
    lede = _ollama_chat(lede_msg, 250) or ""
    lede = _strip_section_title(lede, "Le fait en bref")
    lede = _strip_section_title(lede, "Chapô")

    # 2. Décryptage (n paragraphes)
    deco_parts = []
    for p in range(n_para):
        p_msg = [
            {"role": "system", "content": sys_base + f"Rédige UNIQUEMENT le paragraphe {p+1}/{n_para} du '## Décryptage' (~120 mots, pyramide inversée). Angles STRICTEMENT DIFFÉRENTS et NON RÉPÉTITIFS entre paragraphes : si les précédents traitent l'aspect diplomatique, traite l'aspect économique, social, ou historique. Base-toi STRICTEMENT sur les textes. Si donnée manque, '[à vérifier]'."},
            {"role": "user", "content": f"{src_block}\n\nTitre : {champ['title']}\nParagraphe à rédiger : {p+1} sur {n_para}."},
        ]
        para = _ollama_chat(p_msg, 250)
        if para:
            deco_parts.append(_strip_section_title(para, "Décryptage"))
    deco = "\n\n".join(deco_parts)

    # 3. À noter
    note_msg = [
        {"role": "system", "content": sys_base + "Rédige UNIQUEMENT la section '## À noter' (2 paragraphes, ~120 mots : contexte Guinée + réaction/enjeu). Pas de titre."},
        {"role": "user", "content": f"{src_block}\n\nTitre : {champ['title']}"},
    ]
    note = _ollama_chat(note_msg, 350) or ""
    note = _strip_section_title(note, "À noter")

    # Assemblage
    article = f"# {champ['title']}\n\n{lede}\n\n## Décryptage\n{deco}\n\n## À noter\n{note}\n\nSources : {champ['source']}" + (", " + ", ".join(c['source'] for c in ctx) if ctx else "") + "\n\nPar Kakilambe Kora Agent"
    # Nettoyage global : retire toute ligne de titre de section résiduelle que le modèle répète
    import re as _re
    article = "\n".join(
        l for l in article.split("\n")
        if not _re.match(r"^#+\s*(Le fait en bref|Décryptage|À noter)\b.*$", l.strip(), _re.IGNORECASE)
    )
    return article


def _ensure_min_length(raw: str, fact: Dict, lt: Dict, min_words: int = 879) -> str:
    """Repass : si l'article généré est sous le plancher (879 mots), demande au
    modèle d'étendre le Décryptage SANS répéter, jusqu'à atteindre la cible.
    Anti-boucle : max 3 tentatives, tokens larges."""
    n = len(raw.split())
    if n >= min_words:
        return raw
    champ = fact["champion"]
    target = lt.get("target", min_words)
    sys_base = SYSTEM_PROMPT.split("2. LONGUEUR")[0]
    for attempt in range(3):
        need = max(target, min_words) - n
        msg = [
            {"role": "system", "content": sys_base + f"L'article ci-dessous fait {n} mots mais la cible est {target} mots (minimum {min_words}, il manque ~{need} mots). ÉTENDS-LE en ajoutant de NOUVEAUX paragraphes UNIQUEMENT dans la section '## Décryptage' (pyramide inversée, angles non répétitifs, STRICTEMENT basés sur les textes fournis). Ne répète AUCUNE phrase existante. Garde la structure (Titre, CHAPÔ en ouverture, Décryptage, À noter, Sources, signature). Réponds avec l'article COMPLET étendu."},
            {"role": "user", "content": f"SOURCE PRINCIPALE ({champ['source']}) :\n{champ['raw_content'][:2500]}\n\nARTICLE ACTUEL À ÉTENDRE :\n{raw}"},
        ]
        ext = _ollama_chat(msg, 3400)
        if ext and len(ext.split()) > n:
            raw = ext
            n = len(raw.split())
            if n >= min_words:
                break
    return raw


def write_article(fact: Dict, dry_run: bool = None) -> Dict:
    """Génère l'article de synthèse pour un fact. Retourne dict avec article + image."""
    if dry_run is None:
        # dry-run si aucune clé LLM dispo (Ollama Cloud, TokenRouter, ou providers litellm)
        has_llm = (
            os.environ.get("OLLAMA_API_KEY")
            or os.environ.get("TR_KEY")
            or any(os.environ.get(PROVIDER_CONFIG[p]["env"]) for p in PROVIDER_ORDER)
        )
        dry_run = not has_llm

    image_meta = _illustrate_fact(fact)
    image = image_meta.get("image", "")
    if dry_run:
        return {"article": _template_article(fact), "image": image,
                "image_meta": image_meta, "model": "template", "status": "dry_run"}

    # Vrai appel LLM avec fallback
    messages = _build_messages(fact)
    last_err = None
    lt = compute_length_target(fact)
    # Mode sections désactivé : gemma4:31b n'est pas un petit modèle 4B, le mode
    # direct Ollama Cloud (+ ensure_min_length) donne une longueur plus fiable.
    # (conservé ci-dessous comme référence, non exécuté)
    if False and os.environ.get("OLLAMA_API_KEY") and lt["target"] > 500:
        try:
            art = _gen_sections(fact, lt)
            if art and len(art.split()) >= 400:
                art = _ensure_min_length(art, fact, lt)
                return {"article": art, "image": image, "image_meta": image_meta,
                        "model": f"ollama/{os.environ.get('OLLAMA_MODEL', 'gemma4')}-sections",
                        "status": "ok", "length_target": lt["target"], "length_score": lt["score"]}
        except Exception as e:
            last_err = e
    # Ollama Cloud en priorité si dispo (OpenAI-compatible, prévisible, pas de timeout reasoning)
    if os.environ.get("OLLAMA_API_KEY"):
        try:
            import urllib.request as _req
            import json as _json
            model = os.environ.get("OLLAMA_MODEL", "gemma4")
            req = _req.Request(
                "https://ollama.com/v1/chat/completions",
                data=_json.dumps({"model": model, "messages": messages, "max_tokens": 2600, "temperature": 0.4, "stream": False}).encode(),
                headers={"Authorization": f"Bearer {os.environ['OLLAMA_API_KEY']}", "Content-Type": "application/json"},
            )
            with _req.urlopen(req, timeout=300) as r:
                data = _json.loads(r.read())
            art = data["choices"][0]["message"]["content"]
            art = _ensure_min_length(art, fact, lt)
            return {"article": art, "image": image, "image_meta": image_meta, "model": f"ollama/{model}", "status": "ok", "length_target": lt["target"], "length_score": lt["score"]}
        except Exception as e:
            last_err = e

    # TokenRouter (kimi) en secours si dispo
    if os.environ.get("TR_KEY"):
        try:
            import urllib.request as _req
            import json as _json
            req = _req.Request(
                "https://api.tokenrouter.com/v1/chat/completions",
                data=_json.dumps({"model": "moonshotai/kimi-k3-free", "messages": messages, "max_tokens": 2200, "temperature": 0.4}).encode(),
                headers={"Authorization": f"Bearer {os.environ['TR_KEY']}", "Content-Type": "application/json"},
            )
            with _req.urlopen(req, timeout=120) as r:
                data = _json.loads(r.read())
            art = data["choices"][0]["message"]["content"]
            art = _ensure_min_length(art, fact, lt)
            return {"article": art, "image": image, "image_meta": image_meta, "model": "tokenrouter/kimi-k3-free", "status": "ok"}
        except Exception as e:
            last_err = e

    for p in PROVIDER_ORDER:
        key = os.environ.get(PROVIDER_CONFIG[p]["env"])
        if not key:
            continue
        try:
            import litellm
            setattr(litellm, f"{p}_key", key)
            resp = litellm.completion(model=PROVIDER_CONFIG[p]["model"], messages=messages, max_tokens=2600, temperature=0.4)
            art = resp.choices[0].message.content
            art = _ensure_min_length(art, fact, lt)
            return {"article": art, "image": image, "image_meta": image_meta, "model": PROVIDER_CONFIG[p]["model"], "status": "ok"}
        except Exception as e:
            last_err = e
            continue
    # Tout a échoué -> template
    return {"article": _template_article(fact), "image": image, "image_meta": image_meta, "model": "template(fallback)", "status": "llm_error", "error": str(last_err)[:200]}
