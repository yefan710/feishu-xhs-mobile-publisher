FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
COPY --chown=node:node scripts ./scripts
RUN mkdir -p /app/data && chown node:node /app/data
USER node
ENV HOST=0.0.0.0 PORT=3000
EXPOSE 3000
CMD ["node", "src/server.cjs"]
