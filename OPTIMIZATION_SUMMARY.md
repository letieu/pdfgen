# Build Optimization Summary

## Changes Made

### 1. Dockerfile Optimizations

#### Layer Reorganization
- **Before**: System dependencies were installed in the production stage, causing them to be rebuilt on every code change
- **After**: Created a separate `system-deps` stage that installs system packages (Chromium, fonts, libraries)
  - This layer is cached and only rebuilt when system packages change
  - Both `dependencies` and `production` stages now inherit from `system-deps`

#### PNPM Cache Mount
- **Before**: `pnpm install` downloaded all packages on every build
- **After**: Added `RUN --mount=type=cache,id=pnpm,target=/pnpm/store`
  - BuildKit caches the pnpm store between builds
  - Dramatically speeds up dependency installation
  - Only downloads changed packages

### 2. GitHub Actions Optimizations

#### Docker Buildx Setup
- Added `docker/setup-buildx-action@v3` step
- Required for BuildKit cache features
- Enables advanced build features and better performance

#### GitHub Actions Cache
- **Added**: `cache-from: type=gha` - Restore cache from previous builds
- **Added**: `cache-to: type=gha,mode=max` - Save all layers to cache
  - `mode=max` saves all intermediate layers, not just final image
  - Maximizes cache hits for faster rebuilds

#### Additional Tag
- Added `latest` tag alongside SHA-based tag
- Makes it easier to reference the most recent build

## Expected Performance Improvements

### First Build (Cold Cache)
- No change in duration (~5-10 minutes for ARM64 build)

### Subsequent Builds

#### When only code changes (src/*.js):
- **Before**: ~5-10 minutes (reinstalls everything)
- **After**: ~1-2 minutes
  - System deps: cached ✓
  - Node modules: cached ✓
  - Only rebuilds final layer

#### When dependencies change (package.json):
- **Before**: ~5-10 minutes
- **After**: ~2-4 minutes
  - System deps: cached ✓
  - Node modules: partially cached (only changed packages downloaded)

#### When system packages change (rare):
- Similar to before, but still benefits from pnpm cache

## How to Test

1. Push changes and observe first build time
2. Push another small code change
3. Compare build times - should see 50-80% reduction

## Cache Invalidation

Caches are automatically invalidated when:
- Dockerfile instructions change
- package.json or pnpm-lock.yaml changes
- System package list changes
- GitHub Actions cache expires (7 days of inactivity)

## Notes

- GitHub Actions cache has a 10GB limit per repository
- Oldest caches are evicted when limit is reached
- Cache is scoped to branch by default
