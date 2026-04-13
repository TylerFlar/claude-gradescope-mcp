FROM node:22-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm prune --omit=dev

ENV MCP_TRANSPORT=http
ENV MCP_PORT=3100
EXPOSE 3100

CMD ["node", "dist/index.js"]
