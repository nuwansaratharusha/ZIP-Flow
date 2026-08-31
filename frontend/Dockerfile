# --- Build stage ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# API is served same-origin behind the nginx reverse proxy, so the SPA calls
# relative paths (/api/...). Empty base URL => same origin.
ENV VITE_API_BASE_URL=""
RUN npm run build

# --- Runtime stage ---
FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
