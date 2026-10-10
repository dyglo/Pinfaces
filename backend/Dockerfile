# syntax=docker/dockerfile:1
FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN --mount=type=secret,id=proxy_ca if [ -f /run/secrets/proxy_ca ]; then export PIP_CERT=/run/secrets/proxy_ca; fi; pip install --no-cache-dir -r backend/requirements.txt
COPY --chmod=755 backend backend
RUN --mount=type=secret,id=proxy_ca if [ -f /run/secrets/proxy_ca ]; then export SSL_CERT_FILE=/run/secrets/proxy_ca; fi; python -m backend.download_models
RUN useradd --uid 10001 --create-home pinfaces && mkdir /data && chown pinfaces /data
USER pinfaces
ENV RECOGNITION_DATA_DIR=/data PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn backend.recognition:app --host 0.0.0.0 --port ${PORT} --no-access-log"]
