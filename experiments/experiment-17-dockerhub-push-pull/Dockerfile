FROM nginx:1.30.6-alpine@sha256:47928bf67eb62a1863cb08d9ecb52d3e704304ba614eaee17884204677702951

LABEL org.opencontainers.image.title="Meridian Atlas" \
      org.opencontainers.image.description="CSA1020 Experiment 17 static city field guide for a verified Docker Hub push and pull workflow" \
      org.opencontainers.image.version="1.0.0"

COPY nginx.conf /etc/nginx/nginx.conf
COPY site/ /usr/share/nginx/html/

USER 101:101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=15s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1

# Bypass the base image's root-oriented configuration hooks. All writable state
# is placed in /tmp, so the runtime root filesystem can stay read-only.
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
