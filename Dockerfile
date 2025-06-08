# Use an official Node.js runtime as a parent image
# Using LTS (Long Term Support) version like Node 18. You can adjust if needed.
FROM node:18-slim

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (if available)
# Doing this separately leverages Docker's cache. If only code changes,
# npm install won't run again unless package files changed.
COPY package*.json ./

# Install app dependencies
# Using --only=production to avoid installing devDependencies if you had any
# and --no-optional to skip optional dependencies.
# Consider using CI for a cleaner build: RUN npm ci --only=production
RUN npm install --only=production --no-optional

# Bundle app source
COPY . .

# Your app binds to port 8080 (or whatever PORT env var specifies)
# Expose this port from the container. Cloud Run will map this.
EXPOSE 8080

# Define the command to run your app using CMD which defines your runtime
# This will use the "start" script from your package.json: "node server.js"
CMD [ "npm", "start" ]
