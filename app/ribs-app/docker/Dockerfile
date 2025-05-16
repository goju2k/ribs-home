# === stage1 : build ====================================================================
FROM node:18-alpine3.17 AS build

# workdir
WORKDIR /app

# arg / env
ARG SISUL_BOT_WEBHOOK_URL
ENV SISUL_BOT_WEBHOOK_URL=$SISUL_BOT_WEBHOOK_URL

# dep install
COPY package*.json ./
RUN npm i

# dep copy
COPY . .

# build
RUN npm run build:ribs

# build2
RUN npm run build:bot

# remove dev dep
RUN npm prune --production

# === stage2 : create production image =================================================
FROM node:18-alpine3.17

# workdir
WORKDIR /app

# set env
ENV NODE_ENV=production

# group / user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# copy for prod
COPY --from=build /app/app/ribs-app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/app/ribs-app/.next/standalone/app/ribs-app  ./
COPY --from=build --chown=nextjs:nodejs /app/app/ribs-app/.next/standalone/node_modules  ./node_modules
COPY --from=build --chown=nextjs:nodejs /app/app/ribs-app/.next/standalone/package.json  ./
COPY --from=build --chown=nextjs:nodejs /app/app/ribs-app/.next/static  ./.next/static

# copy for server
COPY --from=build --chown=nextjs:nodejs /app/dist/app/my-bot-server-app ./apiserver
COPY --from=build --chown=nextjs:nodejs /app/node_modules ./apiserver/node_modules

# copy sh
COPY --from=build /app/app-start.sh ./

# user
USER nextjs

# expose port
EXPOSE 3000
EXPOSE 3333

# start app
# CMD ["node", "server.js"]
CMD ["sh", "app-start.sh"]