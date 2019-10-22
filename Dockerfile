FROM node:latest

# Create and change to the app directory.
WORKDIR /usr/src/app

# Copy local code to the container image.
COPY . .

RUN npm install --only=production --unsafe-perm

RUN npm run build

# Run the web service on container startup.
CMD [ "npm", "start" ]