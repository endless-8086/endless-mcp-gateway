FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY tsconfig.json ./
COPY tsconfig.build.json ./
COPY src ./src
RUN node node_modules/typescript/bin/tsc -p tsconfig.build.json

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
COPY config/gateway.example.json ./config/gateway.example.json
COPY README.md ./README.md
EXPOSE 8080
CMD ["node", "dist/main.js"]
