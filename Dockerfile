FROM node:22-alpine AS frontend-build

WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN npm --prefix frontend ci

COPY frontend ./frontend
RUN npm --prefix frontend run build

FROM node:22-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4173

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY demo ./demo
COPY assets ./assets
COPY data/demo-cache ./data/demo-cache
COPY data/demo-users ./data/demo-users
COPY data/case-memory ./data/case-memory
COPY sliced ./sliced
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

EXPOSE 4173
CMD ["node", "demo/server.mjs"]
