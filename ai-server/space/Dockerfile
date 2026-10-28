# The FurFriends assistant server on a free Hugging Face Space (CPU basic: 2 CPUs, 16 GB).
# deploy_space.py copies app.py, prompting.py and the app's aiPrompt.json next to this file and uploads it all.
FROM python:3.12-slim

RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user PATH=/home/user/.local/bin:$PATH PYTHONUNBUFFERED=1
WORKDIR /home/user/app

COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

COPY --chown=user . .
# MODEL_ONNX, MODEL_VERSION, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and ALLOWED_ORIGINS are Space variables.
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
