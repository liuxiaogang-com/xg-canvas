FROM node:22-alpine AS build
WORKDIR /app
RUN npm i -g pnpm@9.15.0 --registry=https://registry.npmmirror.com
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/canvas-api/package.json ./apps/canvas-api/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/constraint-engine/package.json ./packages/constraint-engine/
COPY packages/adapters-contract/package.json ./packages/adapters-contract/
COPY packages/model-catalog/package.json ./packages/model-catalog/
RUN pnpm config set registry https://registry.npmmirror.com && pnpm install --frozen-lockfile

COPY packages/shared-types ./packages/shared-types
COPY packages/constraint-engine ./packages/constraint-engine
COPY packages/adapters-contract ./packages/adapters-contract
COPY packages/model-catalog ./packages/model-catalog
COPY config ./config
COPY apps/canvas-api ./apps/canvas-api
RUN pnpm --filter @xgcanvas/shared-types build && \
    pnpm --filter @xgcanvas/constraint-engine build && \
    pnpm --filter @xgcanvas/adapters-contract build && \
    pnpm --filter @xgcanvas/model-catalog build && \
    pnpm --filter @xgcanvas/model-catalog catalog:build
RUN pnpm --filter @xgcanvas/canvas-api exec nest build -p tsconfig.docker.json

FROM node:22-slim AS app-base
ENV XGCANVAS_SECRET_DIR=/var/lib/xgcanvas/secrets
# Dreamina CLI must be bundled with the application image.
RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update && apt-get install -y --no-install-recommends curl ca-certificates postgresql-client procps \
    && curl -fsSL https://jimeng.jianying.com/cli | bash \
    && ln -s /root/.local/bin/dreamina /usr/local/bin/dreamina \
    && dreamina --version \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN npm i -g pnpm@9.15.0 --registry=https://registry.npmmirror.com
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/canvas-api/package.json ./apps/canvas-api/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/constraint-engine/package.json ./packages/constraint-engine/
COPY packages/adapters-contract/package.json ./packages/adapters-contract/
COPY packages/model-catalog/package.json ./packages/model-catalog/
RUN pnpm config set registry https://registry.npmmirror.com

FROM app-base AS dev
RUN pnpm install --frozen-lockfile
COPY packages/shared-types ./packages/shared-types
COPY packages/constraint-engine ./packages/constraint-engine
COPY packages/adapters-contract ./packages/adapters-contract
COPY packages/model-catalog ./packages/model-catalog
RUN pnpm --filter @xgcanvas/shared-types build && \
    pnpm --filter @xgcanvas/constraint-engine build && \
    pnpm --filter @xgcanvas/adapters-contract build && \
    pnpm --filter @xgcanvas/model-catalog build
COPY apps/canvas-api ./apps/canvas-api
COPY --from=build /app/apps/canvas-api/dist ./apps/canvas-api/dist
COPY config ./config
COPY --from=build /app/config/model-catalog.bundle.json ./config/model-catalog.bundle.json
COPY scripts ./scripts
COPY database ./database
RUN mkdir -p /var/lib/xgcanvas/secrets && chmod 700 /var/lib/xgcanvas/secrets
EXPOSE 5181
CMD ["node", "apps/canvas-api/dist/main"]

FROM app-base AS runtime
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=build /app/packages/constraint-engine/dist ./packages/constraint-engine/dist
COPY --from=build /app/packages/adapters-contract/dist ./packages/adapters-contract/dist
COPY --from=build /app/packages/model-catalog/dist ./packages/model-catalog/dist
COPY --from=build /app/apps/canvas-api/dist ./apps/canvas-api/dist
COPY --from=build /app/config/model-catalog.bundle.json ./config/model-catalog.bundle.json
COPY scripts ./scripts
COPY database ./database
RUN mkdir -p /var/lib/xgcanvas/secrets && chmod 700 /var/lib/xgcanvas/secrets
EXPOSE 5181
CMD ["node", "apps/canvas-api/dist/main"]
