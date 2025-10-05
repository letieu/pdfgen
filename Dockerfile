# ---- Base Stage ----
FROM node:18-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# ---- System Dependencies Stage ----
# This stage is cached unless system packages change
FROM base AS system-deps

# Install Chromium + Puppeteer dependencies + Vietnamese fonts
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    fonts-noto \
    fonts-dejavu \
    fonts-freefont-ttf \
    fontconfig \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    chromium \
    && fc-cache -fv \
    && rm -rf /var/lib/apt/lists/*

# ---- Dependencies Stage ----
FROM system-deps AS dependencies
COPY package.json pnpm-lock.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

# ---- Production Stage ----
FROM system-deps AS production

# Tell Puppeteer to use system Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Copy dependencies and source code
COPY --from=dependencies /app/node_modules ./node_modules
COPY src ./src

EXPOSE 3001
USER node
CMD ["node", "src/index.js"]