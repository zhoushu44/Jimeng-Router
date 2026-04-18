FROM node:20-alpine AS base

ENV NODE_ENV=production \
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

RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    && rm -rf /var/cache/apk/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/configs ./configs

RUN mkdir -p /app/data /app/logs /app/tmp

EXPOSE 5200

CMD ["npm", "start"]
