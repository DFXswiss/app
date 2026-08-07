FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .

ARG REACT_APP_API_URL=http://api:3000
ARG REACT_APP_PUBLIC_URL=http://frontend
ARG REACT_APP_BUILD_ID=e2e-stack
ENV REACT_APP_API_URL=${REACT_APP_API_URL}
ENV REACT_APP_PUBLIC_URL=${REACT_APP_PUBLIC_URL}
ENV REACT_APP_BUILD_ID=${REACT_APP_BUILD_ID}
ENV CI=false

# Do not use `npm run build` — scripts/build.sh patches .env with a public API URL.
RUN node scripts/generate-version.js && npx react-app-rewired build

FROM nginx:alpine
COPY --from=builder /app/build /usr/share/nginx/html
COPY e2e-stack/images/frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
