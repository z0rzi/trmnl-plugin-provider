FROM oven/bun:1

USER $USER

RUN mkdir /app
WORKDIR /app

COPY ./package.json /app/package.json
RUN bun install

COPY ./fonts /app/fonts
COPY ./.env /app/.env
COPY ./src /app/src

CMD ["bun", "/app/src/index.ts"]
