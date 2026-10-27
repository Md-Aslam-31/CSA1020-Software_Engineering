FROM node:24-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53 AS base
ENV NODE_ENV=production
WORKDIR /app
COPY --chown=node:node app/package.json ./package.json
COPY --chown=node:node app/src/ ./src/
COPY --chown=node:node app/public/ ./public/
USER node

FROM base AS test
COPY --chown=node:node app/tests/ ./tests/
CMD ["node", "--test", "--test-reporter=junit"]

FROM base AS runtime
ARG GIT_SHA=development
ARG BUILD_NUMBER=local
ENV GIT_SHA=$GIT_SHA \
    BUILD_NUMBER=$BUILD_NUMBER \
    PORT=8000 \
    APP_MODE=ci
LABEL org.opencontainers.image.title="FocusLane" \
      org.opencontainers.image.description="Educational study-sprint planner" \
      org.opencontainers.image.revision=$GIT_SHA
EXPOSE 8000
HEALTHCHECK --interval=20s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
