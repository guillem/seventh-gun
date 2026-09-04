# Self-host image: the whole game plus the multiplayer arena, one process.
# No Durable Object, no database, no accounts — room state is in memory and
# dies with the container, which is exactly what a friends-and-LAN server wants.

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:dist

# Resolve production deps (just ws) separately so the runtime stage carries no
# build toolchain and no dev tree.
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0
COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/dist/client   ./dist/client
COPY --from=build /app/dist/node     ./dist/node
COPY bin ./bin
COPY package.json LICENSE README.md THIRD-PARTY.md ./
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "bin/seventh-gun.mjs"]
