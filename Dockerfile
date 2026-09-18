FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Expose the documented port[cite: 4]
EXPOSE 3000
# Ensure app binds to 0.0.0.0 
CMD ["node", "server.js"]