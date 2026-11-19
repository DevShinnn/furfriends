"""How FurFriends talks to the model. Shared by the server (app.py) and training (train_lora.py),
so the model is trained on exactly the format it is later asked in (the app builds the same prompt)."""

import json
import os
import re

# The instructions live in the app (src/lib/aiPrompt.json), so the app and training always use the same text.
# The Hugging Face Space has a copy next to this file (deploy_space.py puts it there).
_HERE = os.path.dirname(os.path.abspath(__file__))
_PROMPT_FILE = next(p for p in (os.path.join(_HERE, "aiPrompt.json"), os.path.join(_HERE, "..", "src", "lib", "aiPrompt.json"))
                    if os.path.exists(p))
_PROMPT = json.load(open(_PROMPT_FILE, encoding="utf-8"))
SYSTEM_PROMPT = _PROMPT["system"]
SOURCES_INTRO = _PROMPT["sourcesIntro"]   # shown above the checked sources
NOT_FOUND = _PROMPT["notFound"]           # what the model says when the sources don't answer the question

HISTORY = 10  # earlier messages kept, matching the app


def describe_pet(pet):
    """One short paragraph about the pet the owner picked in the app (or None): the pet's "pre-context".
    Must print exactly what describePet() in src/lib/prompt.js prints; the app works every value out (petContext),
    this only prints it. add_pet_profiles.py checks the two agree for every training profile."""
    if not pet:
        return None
    facts = [pet.get("species"), pet.get("breed"), pet.get("gender"), pet.get("age"),
             f"{_num(pet['weightKg'])} kg" if pet.get("weightKg") else None, pet.get("lifeStage")]
    lines = [f"The owner is asking about {pet.get('name') or 'their pet'}: " + ", ".join(f for f in facts if f) + "."]
    for key, label in (("allergies", "Allergies"), ("medications", "Medications"), ("recentConditions", "Recent illnesses or surgery")):
        if key == "recentConditions" and "history" in pet:   # the history with dates, instead of the undated list
            if pet["history"]:
                lines.append("Medical history: " + ", ".join(f"{h['title']} ({h['when']})" for h in pet["history"]) + ".")
            continue
        if pet.get(key):
            lines.append(f"{label}: {', '.join(pet[key])}.")
    trend = pet.get("weightTrend")
    if trend:
        lines.append(f"Weight trend: {_num(trend['from'])} kg {trend['since']}, {_num(trend['to'])} kg now.")
    vax = pet.get("vaccines") or []
    if vax:
        lines.append("Vaccines: " + ", ".join(f"{v.get('name')} ({v.get('status')})" for v in vax) + ".")
    if pet.get("missingVaccines"):
        lines.append(f"No record of: {', '.join(pet['missingVaccines'])} vaccine.")
    diet = pet.get("diet") or {}
    if diet.get("foods"):
        n = diet.get("mealsPerDay")
        lines.append(f"Diet: {', '.join(diet['foods'])}, {n} meal{'' if n == 1 else 's'} a day.")
    if "checkupDaysAgo" in pet:
        d = pet["checkupDaysAgo"]
        lines.append(f"Last checkup: {'none recorded' if d is None else f'{d} days ago'}.")
    flags = (pet.get("health") or {}).get("flags") or []
    if flags:
        lines.append(f"Health check: {'; '.join(flags)}.")
    return " ".join(lines)


def _num(x):
    """A number as JavaScript prints it: 30.0 -> "30", 29.4 -> "29.4"."""
    return str(int(x)) if isinstance(x, float) and x.is_integer() else str(x)


def format_sources(sources):
    """[{"label": "CDC Healthy Pets: Rabies", "text": "..."}] -> the block added to the system prompt.
    src/lib/assistant.js builds the same text in the app."""
    return SOURCES_INTRO + "\n" + "\n\n".join(f"[{i}] {s['label']}\n{s['text']}" for i, s in enumerate(sources, 1))


# Pet details only a model trained with whole pet profiles (v6 on: add_pet_profiles.py) is given. Earlier models
# were trained with a species at most; given these extra lines, rag-v2 wrote things the records don't say (a check
# on 2026-11-11: "if he has diabetes..."), so they get the pet details they always had. src/lib/prompt.js: the same.
PROFILE_KEYS = ("lifeStage", "recovering", "missingVaccines", "diet", "checkupDaysAgo", "health", "years", "history",
                "overdueCare", "weightVsBreed", "weightTrend")


def basic_pet(pet):
    """The pet details without the profile lines (for models trained before v6)."""
    return {k: v for k, v in pet.items() if k not in PROFILE_KEYS} if pet else pet


def knows_profiles(model):
    """Was this model ("rag-v6", "DevShin00/furfriends-rag-v6", ...) trained with whole pet profiles?"""
    m = re.search(r"rag-v(\d+)", model or "")
    return bool(m) and int(m.group(1)) >= 6


def build_messages(messages, pet=None, sources=None, full_pet=True):
    """Chat messages for the model: system prompt (+ pet details, + checked sources), then the conversation.
    full_pet=False leaves out the pet profile lines (for models trained before v6, see knows_profiles)."""
    system = SYSTEM_PROMPT
    about = describe_pet(pet if full_pet else basic_pet(pet))
    if about:
        system += "\n\n" + about
    if sources:
        system += "\n\n" + format_sources(sources)
    convo = [{"role": m["role"], "content": str(m["content"])}
             for m in messages[-HISTORY:] if m.get("role") in ("user", "assistant") and m.get("content")]
    return [{"role": "system", "content": system}] + convo
