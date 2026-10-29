FROM nginx:1.30.6-alpine@sha256:47928bf67eb62a1863cb08d9ecb52d3e704304ba614eaee17884204677702951
LABEL org.opencontainers.image.title="SproutHouse Frontend" \
      org.opencontainers.image.description="Community seed library frontend for CSA1020 Experiment 18" \
      org.opencontainers.image.version="1.0.0"
COPY nginx.conf /etc/nginx/nginx.conf
COPY index.html styles.css app.js /usr/share/nginx/html/
USER 101:101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
