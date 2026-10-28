---
title: FurFriends AI
emoji: 🐾
colorFrom: green
colorTo: yellow
sdk: docker
app_port: 7860
pinned: false
license: apache-2.0
short_description: Pet-care assistant server for the FurFriends thesis app
---

# FurFriends AI server

Answers questions from the [FurFriends](https://furfriends-black.vercel.app) app with the team's own model,
[DevShin00/furfriends-rag-v2](https://huggingface.co/DevShin00/furfriends-rag-v2). The app sends the owner's
question with the 2 best-matching checked passages, and the model writes the answer from them.

Only people logged in to FurFriends get answers. This is a student thesis prototype, not a vet.

Source: `ai-server/` in the FurFriends repository (`app.py`, deployed with `deploy_space.py`).
