FROM node:22.23.0-bookworm-slim@sha256:d9f850096136edbc402debdd8729579a288aac64574ada0ff4db26b6ae58b0b2
WORKDIR /work
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY src ./src
COPY tsconfig.json vitest.config.ts ./
COPY scripts/acceptance ./scripts/acceptance
ENV HOME=/tmp/synthetic-home PI_CODING_AGENT_DIR=/tmp/synthetic-home/.pi/agent
CMD ["sh", "-ec", "mkdir -p \"$PI_CODING_AGENT_DIR\"; ./node_modules/.bin/pi install /work; node scripts/acceptance/package.mjs; node scripts/acceptance/auth-cleanup.mjs; node scripts/acceptance/initialization.mjs; node scripts/acceptance/lifecycle.mjs; node scripts/acceptance/children.mjs; node scripts/acceptance/switching.mjs; node scripts/acceptance/verification.mjs; npm run typecheck; npm test"]
