FROM node:lts-alpine as builder

RUN apk add --no-cache \
  git

WORKDIR /app
COPY package*.json ./
RUN npm install

COPY . .
ENV NODE_ENV=local
RUN npm run build


FROM nginx:stable-alpine

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
