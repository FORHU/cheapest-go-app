# 1. Base Image
FROM node:24-alpine AS base
WORKDIR /app
# Pinned, not @latest. An unpinned toolchain means the image can change behaviour
# with no commit to this repo — which is exactly how this broke: pnpm 10 began
# failing on undecided dependency build scripts, and `@latest` picked it up.
# Keep this in step with the pnpm the lockfile was produced by.
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# 2. Dependencies
FROM base AS deps
# pnpm-workspace.yaml carries onlyBuiltDependencies / ignoredBuiltDependencies.
# Without it pnpm sees every dependency build script as undecided and refuses to
# continue, which is why this built locally — where the file is present — and
# failed in Docker, where it was never copied.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

# 3. Builder
FROM base AS builder

# Declare brand-specific args BEFORE COPY so changing them busts the cache
# and prevents layer reuse between CheapestGo and GeomeeGo builds.
ARG NEXT_PUBLIC_BRAND_NAME=CheapestGo
ARG NEXT_PUBLIC_BRAND_EMAIL=no-reply@mail.cheapestgo.com
ARG NEXT_PUBLIC_BRAND_FAVICON=/Fav_Icon_Light.png
ARG NEXT_PUBLIC_BRAND_LOGO=/Web_Logo_Light.png
ARG NEXT_PUBLIC_BRAND_LOGO_DARK=
ARG NEXT_PUBLIC_LOCALE
ARG NEXT_PUBLIC_DEFAULT_CURRENCY=USD
ARG NEXT_PUBLIC_DEFAULT_COUNTRY=US
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_MAPBOX_TOKEN
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_PUBLIC_MAPBOX_TOKEN=$NEXT_PUBLIC_MAPBOX_TOKEN
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_BRAND_NAME=$NEXT_PUBLIC_BRAND_NAME
ENV NEXT_PUBLIC_BRAND_EMAIL=$NEXT_PUBLIC_BRAND_EMAIL
ENV NEXT_PUBLIC_BRAND_FAVICON=$NEXT_PUBLIC_BRAND_FAVICON
ENV NEXT_PUBLIC_BRAND_LOGO=$NEXT_PUBLIC_BRAND_LOGO
ENV NEXT_PUBLIC_BRAND_LOGO_DARK=$NEXT_PUBLIC_BRAND_LOGO_DARK
ENV NEXT_PUBLIC_LOCALE=$NEXT_PUBLIC_LOCALE
ENV NEXT_PUBLIC_DEFAULT_CURRENCY=$NEXT_PUBLIC_DEFAULT_CURRENCY
ENV NEXT_PUBLIC_DEFAULT_COUNTRY=$NEXT_PUBLIC_DEFAULT_COUNTRY

RUN echo "BUILD brand=$NEXT_PUBLIC_BRAND_NAME locale=$NEXT_PUBLIC_LOCALE site=$NEXT_PUBLIC_SITE_URL"

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
