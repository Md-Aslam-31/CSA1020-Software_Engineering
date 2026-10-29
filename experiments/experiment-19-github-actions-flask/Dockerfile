FROM python:3.12-slim-bookworm AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY requirements.txt ./
RUN python -m pip install --no-cache-dir -r requirements.txt

FROM base AS test
COPY app.py ./
COPY templates ./templates
COPY static ./static
COPY tests ./tests
CMD ["python", "-m", "unittest", "discover", "-s", "tests", "-v"]

FROM base AS runtime
ARG GIT_SHA=development
ARG BUILD_NUMBER=local
ENV GIT_SHA=${GIT_SHA} BUILD_NUMBER=${BUILD_NUMBER} PORT=8000
RUN groupadd --gid 10001 packlight && useradd --uid 10001 --gid packlight --no-create-home packlight
COPY --chown=10001:10001 app.py ./
COPY --chown=10001:10001 templates ./templates
COPY --chown=10001:10001 static ./static
USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','8000')+'/healthz',timeout=3)"
CMD ["sh", "-c", "exec gunicorn --bind 0.0.0.0:${PORT:-8000} --workers 2 --threads 2 --worker-tmp-dir /tmp --access-logfile - --error-logfile - app:app"]
