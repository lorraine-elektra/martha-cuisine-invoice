FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
# The database lives in /data. Mount a persistent disk there, or invoices vanish on every deploy.
ENV DB_FILE=/data/invoices.db TRUST_PROXY=1 PORT=3000
VOLUME /data
EXPOSE 3000
CMD ["node", "--disable-warning=ExperimentalWarning", "src/server.js"]
