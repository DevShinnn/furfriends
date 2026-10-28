"""How FurFriends talks to the model. Shared by the server (app.py) and training (train_lora.py),
so the model is trained on exactly the format it is later asked in (the app builds the same prompt)."""

import json
import os

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
    """One short paragraph about the pet the owner picked in the app (or None)."""
    if not pet:
        return None
    facts = [pet.get("species"), pet.get("breed"), pet.get("gender"), pet.get("age"),
             f"{pet['weightKg']} kg" if pet.get("weightKg") else None]
    lines = [f"The owner is asking about {pet.get('name', 'their pet')}: " + ", ".join(f for f in facts if f) + "."]
    for key, label in (("allergies", "Allergies"), ("medications", "Medications"), ("recentConditions", "Recent illnesses or surgery")):
        if pet.get(key):
            lines.append(f"{label}: {', '.join(pet[key])}.")
    vax = pet.get("vaccines") or []
    if vax:
        lines.append("Vaccines: " + ", ".join(f"{v.get('name')} ({v.get('status')})" for v in vax) + ".")
    return " ".join(lines)


def format_sources(sources):
    """[{"label": "CDC Healthy Pets: Rabies", "text": "..."}] -> the block added to the system prompt.
    src/lib/assistant.js builds the same text in the app."""
    return SOURCES_INTRO + "\n" + "\n\n".join(f"[{i}] {s['label']}\n{s['text']}" for i, s in enumerate(sources, 1))


def build_messages(messages, pet=None, sources=None):
    """Chat messages for the model: system prompt (+ pet details, + checked sources), then the conversation."""
    system = SYSTEM_PROMPT
    about = describe_pet(pet)
    if about:
        system += "\n\n" + about
    if sources:
        system += "\n\n" + format_sources(sources)
    convo = [{"role": m["role"], "content": str(m["content"])}
             for m in messages[-HISTORY:] if m.get("role") in ("user", "assistant") and m.get("content")]
    return [{"role": "system", "content": system}] + convo
