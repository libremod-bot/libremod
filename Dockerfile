# Baut den Libremod-Bot als schlankes Image.
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/db/package.json packages/db/
COPY apps/bot/package.json apps/bot/
RUN pnpm install --frozen-lockfile
COPY packages/db packages/db
COPY apps/bot apps/bot
RUN pnpm --filter @libremod/db build && pnpm --filter @libremod/bot build \
 && pnpm --filter @libremod/bot deploy --prod --legacy /out

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out .
USER node
CMD ["node", "dist/index.js"]
