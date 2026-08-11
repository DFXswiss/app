FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .

# Default is intentionally a loopback address, not "http://api:3000": CRA bakes this value
# into the JS bundle at build time, so it must be an address the *browser* can reach, not
# just the container running nginx. "http://api:3000" only resolves from inside the sandbox
# network; a host browser (manual exploration) cannot resolve "api" at all.
# "http://localhost:3000" works from both places instead: inside the `tests` container it
# hits the socat forwarder (images/playwright/entrypoint.sh) relaying to the real API
# service; on the host it hits the published proxy port that forwards to the same API. See
# e2e-stack/README.md ("Manual exploration") for the full explanation.
ARG REACT_APP_API_URL=http://localhost:3000
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
