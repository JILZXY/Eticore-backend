FROM node:24.22.1-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json* .npmrc* ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src

RUN npm run build && npm prune --omit=dev

FROM node:24.22.1-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* .npmrc* ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

USER node
EXPOSE 3000

CMD ["node", "dist/main.js"]
