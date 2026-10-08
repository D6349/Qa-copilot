# QA Copilot — runs anywhere Docker runs.
FROM mcr.microsoft.com/playwright:v1.49.1-noble

WORKDIR /app
ENV NODE_ENV=production PORT=4100 HOST=0.0.0.0

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# data/ and workspace/ are mounted as volumes so nothing is lost on rebuild
VOLUME ["/app/data", "/app/workspace"]
EXPOSE 4100

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://localhost:4100/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
