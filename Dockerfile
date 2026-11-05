FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
RUN npm ci
RUN npm run build
COPY LICENSE NOTICE ./

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4100 STORAGE_DIR=/data/files WEB_DIST=/app/apps/web/dist
WORKDIR /app
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /data/files && chown -R node:node /data
USER node
EXPOSE 4100
CMD ["npm", "run", "start"]
