FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY src ./src
ENV NODE_ENV=production
USER node
ENTRYPOINT ["node", "src/index.js"]
