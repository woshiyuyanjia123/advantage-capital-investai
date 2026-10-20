# InvestAI 云端服务（多人登录模式）。部署说明见 docs/CLOUD.md；对外请经 HTTPS 反向代理。
FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4310 INVESTAI_DATA=/data INVESTAI_SECRETS=/secrets/secrets.json
COPY package.json package-lock.json* pnpm-lock.yaml* ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY core ./core
COPY app ./app
COPY fixtures ./fixtures
COPY server.mjs ./
RUN mkdir -p /data /secrets && chown -R node:node /data /secrets
USER node
VOLUME ["/data", "/secrets"]
EXPOSE 4310
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:4310/api/investai?asset=index.html').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
