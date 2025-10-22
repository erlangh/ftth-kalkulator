# FTTH Kalkulator - Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY server.js ./
COPY public ./public
EXPOSE 5173
CMD ["node", "server.js"]