# CoBRAC Agents worker image (build context = repository root "cobrac-web/")
# Base images come from the ECR Public mirror of the Docker official images: CodeBuild pulls anonymously from shared
# IPs, and Docker Hub rate-limits those pulls (429), which fails the deploy.
FROM public.ecr.aws/docker/library/node:22-bookworm-slim AS build
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

FROM public.ecr.aws/docker/library/node:22-bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-pip git ca-certificates curl ripgrep poppler-utils \
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
    CODEX_SQLITE_HOME=/work/codex-home/sqlite \
    PYTHON_BIN=python3
# The worker, Codex and the agent's commands all run as `worker` (docs/02, section 5). So that the agent cannot read
# the API key or the task role's credentials URI from the other processes:
# - node, the Codex binaries and git's ELF binaries are made execute-only. Linux makes a process started from a file
#   it cannot read non-dumpable, and then other processes of the same user cannot read its /proc/<pid>/environ or
#   memory. git is included because Codex runs it with its own environment (which holds CODEX_API_KEY): it clones the
#   plugins repo at startup and diffs each turn. Only ELF binaries are touched; git-core also has shell scripts, which
#   must stay readable to be executed, so chmod-ing them would break those subcommands.
# - /app stays root-owned, so neither those binaries nor the worker code can be replaced or made readable again.
# - Codex's config files cannot be written: CODEX_HOME and /work/.codex (the project config of the trusted /work) are
#   root-owned, only the subdirectories Codex writes to belong to `worker`, and the sticky /work keeps both in place.
RUN useradd -m -u 10001 worker \
 && for f in /usr/local/bin/node /usr/bin/git /usr/lib/git-core/* /app/node_modules/@openai/codex-linux-*/vendor/*/bin/*; do \
      if [ -f "$f" ] && [ "$(head -c4 "$f" 2>/dev/null)" = "$(printf '\177ELF')" ]; then chmod 0111 "$f"; fi; \
    done \
 && install -d -o root -g worker -m 1775 /work \
 && install -d -m 0755 /work/.codex /work/codex-home \
 && printf '[projects."/work"]\ntrust_level = "trusted"\n' > /work/codex-home/config.toml \
 && for d in sessions sqlite shell_snapshots log tmp .tmp skills memories cache thread-writer-locks; do \
      install -d -o worker -g worker "/work/codex-home/$d"; \
    done \
 && install -o worker -g worker -m 0600 /dev/null /work/codex-home/installation_id
USER worker
CMD ["node", "/app/worker/index.js"]
