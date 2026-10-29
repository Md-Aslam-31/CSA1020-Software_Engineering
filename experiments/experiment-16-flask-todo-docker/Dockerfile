FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DATA_DIR=/data \
    APP_VERSION=1.0.0

WORKDIR /app
LABEL org.opencontainers.image.title="Morrow Task Studio" \
      org.opencontainers.image.description="A persistent Flask to-do workspace for CSA1020 Experiment 16" \
      org.opencontainers.image.version="1.0.0"
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && groupadd --gid 10001 morrow \
    && useradd --uid 10001 --gid morrow --no-create-home morrow \
    && mkdir -p /data \
    && chown morrow:morrow /data

COPY --chown=morrow:morrow app.py ./
COPY --chown=morrow:morrow templates ./templates
COPY --chown=morrow:morrow static ./static

USER 10001:10001
VOLUME ["/data"]
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=15s --start-period=30s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/readyz', timeout=5)"
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "1", "--threads", "4", "--timeout", "60", "--access-logfile", "-", "--error-logfile", "-", "app:app"]
