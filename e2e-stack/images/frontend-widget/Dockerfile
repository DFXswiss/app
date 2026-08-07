FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN cp src/index-widget.tsx src/index.tsx

ARG REACT_APP_API_URL=http://api:3000
ARG REACT_APP_PUBLIC_URL=http://frontend-widget
ARG REACT_APP_BUILD_ID=e2e-stack-widget
ENV REACT_APP_API_URL=${REACT_APP_API_URL}
ENV REACT_APP_PUBLIC_URL=${REACT_APP_PUBLIC_URL}
ENV REACT_APP_BUILD_ID=${REACT_APP_BUILD_ID}
ENV BUILD_PATH=./widget
ENV GENERATE_SOURCEMAP=false
ENV CUSTOM_CHUNK_PATH=/widget/
ENV CI=false

# Do not use scripts/build-widget.sh — it patches .env with public/production URLs.
RUN node scripts/generate-version.js && npx react-app-rewired build

FROM nginx:alpine
COPY --from=builder /app/widget /usr/share/nginx/html/widget
COPY e2e-stack/images/frontend-widget/nginx.conf /etc/nginx/conf.d/default.conf
COPY e2e-stack/images/frontend-widget/host.html /usr/share/nginx/html/host.html
EXPOSE 80
