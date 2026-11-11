FROM node:22-alpine
WORKDIR /app
COPY server/qc-photo-access/package*.json ./server/qc-photo-access/
RUN cd server/qc-photo-access && npm install --omit=dev --ignore-scripts
COPY scripts/lib/ ./scripts/lib/
COPY server/qc-photo-access/index.mjs ./server/qc-photo-access/index.mjs
ENV NODE_ENV=production
USER node
EXPOSE 8080
CMD ["node", "server/qc-photo-access/index.mjs"]
