FROM node:20-bookworm-slim AS base

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    NODE_ENV=production \
    SERVER_ENV=dev \
    SERVER_HOST=0.0.0.0 \
    SERVER_PORT=5200

WORKDIR /app

FROM base AS build

ENV NODE_ENV=development

COPY package.json package-lock.json tsconfig.json libs.d.ts ./
RUN npm ci

COPY src ./src
COPY public ./public
COPY configs ./configs
RUN npm run build

FROM base AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libatspi2.0-0 \
    libwayland-client0 \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npx playwright-core install chromium

COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/configs ./configs

RUN mkdir -p /app/data /app/logs /app/tmp

EXPOSE 5200

CMD ["npm", "start"]
