# ------------ STAGE 1: Builder ------------
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all source code
COPY . .

# Build NestJS (creates /dist)
RUN npm run build


# ------------ STAGE 2: Production Image ------------
FROM node:22-alpine AS production

WORKDIR /app

# Copy only production node_modules
COPY package*.json ./
RUN npm install --omit=dev

# Copy compiled dist folder from builder
COPY --from=builder /app/dist ./dist

# Expose port (Nest default)
EXPOSE 3000

# Run the app
CMD ["node", "dist/main.js"]
