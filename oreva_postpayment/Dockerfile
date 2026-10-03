FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node . .
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3100 DATABASE_PATH=/app/data/store.sqlite
EXPOSE 3100
VOLUME ["/app/data"]
CMD ["node", "server.mjs"]
