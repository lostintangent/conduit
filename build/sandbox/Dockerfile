FROM ubuntu:24.04

# Ensure we have curl/gnupg and fresh package lists
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg unzip wget \
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

# Install gh cli
RUN mkdir -p -m 755 /etc/apt/keyrings \
    && out=$(mktemp) && wget -nv -O$out https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    && cat $out | tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null \
    && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && mkdir -p -m 755 /etc/apt/sources.list.d \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt update \
    && apt install gh -y

# Install popular global packages and coding agents
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
    @anthropic-ai/claude-code \ 
    @openai/codex

# Set up global Bun path
RUN echo 'export PATH="/root/.bun/bin:$PATH"' >> /etc/profile.d/bun.sh

# Verify installations
RUN node --version && npm --version && yarn --version && bun --version