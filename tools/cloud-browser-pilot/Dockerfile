FROM node:22.23.2-bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
    && curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
    && echo 'deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main' > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends google-chrome-stable xvfb x11vnc openbox novnc websockify tzdata fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
RUN apt-get update \
    && apt-get install -y --no-install-recommends wmctrl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY proxy-forwarder.mjs chrome-window-close.mjs runtime.mjs *.test.mjs ./
ENV TZ=Europe/Berlin
USER 1000:1000
RUN node --test *.test.mjs
CMD ["node", "runtime.mjs"]
