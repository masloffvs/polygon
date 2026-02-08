FROM oven/bun:1.3.6 AS build

WORKDIR /app

COPY web/package.json web/bun.lock ./web/
RUN cd web && bun install --frozen-lockfile

COPY web ./web
RUN cd web && bun run build

FROM nginx:1.27-alpine

COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/public /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
