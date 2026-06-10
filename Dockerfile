FROM node:20-alpine

RUN apk add --no-cache \
    g++ \
    make \
    python3 \
    cairo-dev \
    pango-dev \
    jpeg-dev \
    giflib-dev \
    librsvg-dev

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

RUN mkdir -p data backups uploads

EXPOSE 3000

CMD ["node", "backend/server.js"]
