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

# main.js/main.css are named after a content hash that changes whenever the widget bundle
# changes (shared translations, hooks, components, or the widget entry point itself). Render
# host.html's placeholders with the filenames this build actually produced instead of pinning
# them in the repo, so the host page can never reference a bundle that does not exist. Fail the
# build loudly if the expected file is missing, instead of silently shipping a host page whose
# script/link tag points nowhere.
RUN set -eu; \
    js_matches="$(find widget/static/js -maxdepth 1 -name 'main.*.js' ! -name '*.LICENSE.txt')"; \
    css_matches="$(find widget/static/css -maxdepth 1 -name 'main.*.css')"; \
    js_count="$(printf '%s\n' "$js_matches" | grep -c . || true)"; \
    css_count="$(printf '%s\n' "$css_matches" | grep -c . || true)"; \
    if [ "$js_count" -ne 1 ] || [ "$css_count" -ne 1 ]; then \
      echo "ERROR: expected exactly one main JS bundle and one main CSS bundle under widget/static; found JS: '$js_matches' CSS: '$css_matches'" >&2; \
      exit 1; \
    fi; \
    js_file="$(basename "$js_matches")"; \
    css_file="$(basename "$css_matches")"; \
    sed \
      -e "s|__WIDGET_JS_FILENAME__|$js_file|" \
      -e "s|__WIDGET_CSS_FILENAME__|$css_file|" \
      e2e-stack/images/frontend-widget/host.html > /app/host.html.rendered; \
    grep -qF "$js_file" /app/host.html.rendered; \
    grep -qF "$css_file" /app/host.html.rendered

FROM nginx:alpine
COPY --from=builder /app/widget /usr/share/nginx/html/widget
COPY e2e-stack/images/frontend-widget/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/host.html.rendered /usr/share/nginx/html/host.html
EXPOSE 80
