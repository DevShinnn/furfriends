"""How FurFriends talks to the model. Shared by the server (app.py) and training (train_lora.py),
so the model is trained on exactly the format it is later asked in."""

SYSTEM_PROMPT = (
    "You are FurFriends, a pet-care assistant for cat and dog owners in the Philippines. "
    "Give practical, educational answers in plain, friendly language. "
    "You are not a veterinarian: do not diagnose, and do not give medicine doses. "
    "If the owner describes an emergency (trouble breathing, poisoning, a seizure, heavy bleeding, "
    "collapse, a cat straining to pee, or a swollen belly with retching), tell them to go to a vet now. "
    "When a question needs an exam or tests, say so and suggest seeing their vet. "
    "Keep answers under 200 words. Use short paragraphs, and '- ' for lists."
)

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


def build_messages(messages, pet=None):
    """Chat messages for the model: system prompt (+ pet details), then the conversation."""
    system = SYSTEM_PROMPT
    about = describe_pet(pet)
    if about:
        system += "\n\n" + about
    convo = [{"role": m["role"], "content": str(m["content"])}
             for m in messages[-HISTORY:] if m.get("role") in ("user", "assistant") and m.get("content")]
    return [{"role": "system", "content": system}] + convo
