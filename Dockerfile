# 1. Base Image
FROM node:24-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# 2. Dependencies
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

# 3. Builder
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_MAPBOX_TOKEN
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_BRAND_NAME=CheapestGo
ARG NEXT_PUBLIC_BRAND_EMAIL=support@cheapestgo.com
ARG NEXT_PUBLIC_BRAND_FAVICON=/Fav_Icon_Light.png
ARG NEXT_PUBLIC_LOCALE

ENV NEXT_PUBLIC_MAPBOX_TOKEN=$NEXT_PUBLIC_MAPBOX_TOKEN
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_BRAND_NAME=$NEXT_PUBLIC_BRAND_NAME
ENV NEXT_PUBLIC_BRAND_EMAIL=$NEXT_PUBLIC_BRAND_EMAIL
ENV NEXT_PUBLIC_BRAND_FAVICON=$NEXT_PUBLIC_BRAND_FAVICON
ENV NEXT_PUBLIC_LOCALE=$NEXT_PUBLIC_LOCALE

RUN pnpm build

# 4. Runner
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
