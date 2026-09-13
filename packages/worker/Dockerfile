# CoBRAC Agents worker image (build context = repository root "cobrac-web/")
FROM node:22-bookworm-slim AS build
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY packages/worker/package.json packages/worker/
COPY packages/api/package.json packages/api/
COPY packages/web/package.json packages/web/
COPY packages/infra/package.json packages/infra/
# install only what shared + worker need (other workspaces are listed but not installed)
RUN npm install --workspace=@cobrac/shared --workspace=@cobrac/worker --include-workspace-root=false --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/worker packages/worker
RUN npm run build -w @cobrac/shared && npm run build -w @cobrac/worker \
 && mkdir -p packages/worker/node_modules \
 && rm -rf node_modules/@cobrac \
 && mkdir -p node_modules/@cobrac/shared \
 && cp -r packages/shared/dist node_modules/@cobrac/shared/dist \
 && cp packages/shared/package.json node_modules/@cobrac/shared/package.json

FROM node:22-bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-pip git ca-certificates curl ripgrep \
 && rm -rf /var/lib/apt/lists/*
COPY prompts/requirements.txt /tmp/requirements.txt
RUN pip3 install --no-cache-dir --break-system-packages -r /tmp/requirements.txt

WORKDIR /app
# root node_modules (workspace symlink to @cobrac/shared replaced by a real copy in the build stage)
COPY --from=build /repo/node_modules ./node_modules
# worker-local node_modules (nested deps, may be empty)
COPY --from=build /repo/packages/worker/node_modules ./worker/node_modules
COPY --from=build /repo/packages/worker/dist ./worker
COPY --from=build /repo/packages/worker/package.json ./worker/package.json
COPY prompts ./prompts

ENV NODE_ENV=production \
    WORK_DIR=/work \
    PROMPTS_DIR=/app/prompts \
    CODEX_HOME_DIR=/work/codex-home \
    PYTHON_BIN=python3
RUN mkdir -p /work && useradd -m -u 10001 worker && chown -R worker:worker /work /app
USER worker
CMD ["node", "/app/worker/index.js"]
