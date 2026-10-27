FROM nginx:stable-alpine

LABEL org.opencontainers.image.title="Orbital Fieldnotes" \
      org.opencontainers.image.description="Experiment 11: a static night-sky journal served by Nginx"

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY site/ /usr/share/nginx/html/

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1

# The official Nginx image supplies its foreground startup command.
