# ---- Base Stage ----
# Use a Node.js version that includes pnpm
FROM node:18-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# ---- Dependencies Stage ----
FROM base AS dependencies
COPY package.json pnpm-lock.yaml .npmrc ./
# This is less efficient than --mount but works without BuildKit
RUN pnpm install --prod --frozen-lockfile

# ---- Production Stage ----
FROM base AS production

# Install dependencies required for Puppeteer
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
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
    xdg-utils && \
    rm -rf /var/lib/apt/lists/*

# Copy dependencies from the 'dependencies' stage
COPY --from=dependencies /app/node_modules ./node_modules
# Copy application source code
COPY src ./src

EXPOSE 3001
USER node
CMD [ "node", "src/index.js" ]
