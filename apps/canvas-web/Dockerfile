FROM node:22-alpine AS base
WORKDIR /app
RUN npm i -g pnpm@9.15.0 --registry=https://registry.npmmirror.com
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/canvas-web/package.json ./apps/canvas-web/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/constraint-engine/package.json ./packages/constraint-engine/
COPY packages/ui-kit/package.json ./packages/ui-kit/
RUN pnpm config set registry https://registry.npmmirror.com && pnpm install --frozen-lockfile
COPY packages/shared-types ./packages/shared-types
COPY packages/constraint-engine ./packages/constraint-engine
COPY packages/ui-kit ./packages/ui-kit
RUN pnpm --filter @xgcanvas/shared-types build && \
    pnpm --filter @xgcanvas/constraint-engine build
COPY apps/canvas-web ./apps/canvas-web

FROM base AS build
RUN pnpm --filter @xgcanvas/canvas-web build

FROM nginx:alpine AS runtime
COPY --from=build /app/apps/canvas-web/dist /usr/share/nginx/html
# SPA fallback for client-side routing. Preserve an outer HTTPS proxy's public
# scheme; otherwise use this web container's own scheme.
RUN printf 'map $http_x_forwarded_proto $xgcanvas_forwarded_proto {\n\
    default $http_x_forwarded_proto;\n\
    "" $scheme;\n\
}\n\
server {\n\
    listen 80;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
    location /api {\n\
        proxy_pass http://canvas-api:5181;\n\
        proxy_http_version 1.1;\n\
        proxy_set_header Host $host;\n\
        proxy_set_header X-Forwarded-Host $host;\n\
        proxy_set_header X-Forwarded-Proto $xgcanvas_forwarded_proto;\n\
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf
EXPOSE 80
