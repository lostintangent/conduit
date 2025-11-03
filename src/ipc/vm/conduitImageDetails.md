Here is docker file definition of how we build the conduit image with nodejs and popular package managers and global packages @ µVM

```Dockerfile


# Ensure we have curl/gnupg and fresh package lists
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
 && rm -rf /var/lib/apt/lists/*

# Add NodeSource repo and install Node.js 22 (this runs as root; no sudo)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get update \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

# Install package managers
RUN npm install -g yarn pnpm \
 && curl -fsSL https://bun.sh/install | bash \
 && ln -s /root/.bun/bin/bun /usr/local/bin/bun

# Install popular global packages
RUN npm install -g \
    typescript \
    ts-node \
    @types/node \
    eslint \
    prettier \
    create-next-app \
    @angular/cli \
    @vue/cli \
    vite \
    @github/copilot \
    @anthropic-ai/claude-code

# Set up global Bun path
RUN echo 'export PATH="/root/.bun/bin:$PATH"' >> /etc/profile.d/bun.sh

# Verify installations
RUN node --version && npm --version && yarn --version && bun --version
```
