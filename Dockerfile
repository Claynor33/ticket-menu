FROM node:22-alpine
WORKDIR /app
COPY server ./server
COPY scripts ./scripts
COPY package.json ./
ENV NODE_ENV=production PORT=3000 DB_PATH=/data/ticketmenu.db COOKIE_SECURE=1 TRUST_PROXY=1
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server/src/server.js"]
