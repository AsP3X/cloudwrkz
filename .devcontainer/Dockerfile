FROM ubuntu:24.04

# Avoid warnings by switching to noninteractive
ENV DEBIAN_FRONTEND=noninteractive

# Install Node.js and other basic tools
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    gnupg \
    lsb-release \
    git \
    libatomic1 \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install PostgreSQL
RUN apt-get update && apt-get install -y \
    postgresql \
    postgresql-contrib \
    sudo \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Configure PostgreSQL to allow local connections without password
# Use port 5433 to avoid conflict with db container's PostgreSQL on port 5432
# PostgreSQL is auto-initialized during installation, find version and configure
RUN PG_VERSION=$(ls /etc/postgresql/ | head -n1) && \
    if [ -n "$PG_VERSION" ]; then \
        echo "local all all trust" > /etc/postgresql/$PG_VERSION/main/pg_hba.conf && \
        echo "host all all 127.0.0.1/32 trust" >> /etc/postgresql/$PG_VERSION/main/pg_hba.conf && \
        echo "host all all ::1/128 trust" >> /etc/postgresql/$PG_VERSION/main/pg_hba.conf && \
        echo "host all all 0.0.0.0/0 trust" >> /etc/postgresql/$PG_VERSION/main/pg_hba.conf && \
        echo "listen_addresses = 'localhost'" >> /etc/postgresql/$PG_VERSION/main/postgresql.conf && \
        echo "port = 5433" >> /etc/postgresql/$PG_VERSION/main/postgresql.conf; \
    fi

# Create a non-root user for development (if not exists) and allow PostgreSQL service management
RUN if ! id -u vscode > /dev/null 2>&1; then \
        useradd -m -s /bin/bash vscode && \
        usermod -aG sudo vscode; \
    fi && \
    echo "vscode ALL=(ALL) NOPASSWD: /usr/sbin/service postgresql *" >> /etc/sudoers.d/postgresql && \
    chmod 0440 /etc/sudoers.d/postgresql

# Install pnpm
RUN npm install -g pnpm

# [Optional] Uncomment this section to install additional OS packages.
# RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
#     && apt-get -y install --no-install-recommends <your-package-list-here>

# [Optional] Uncomment if you want to install an additional version of node using nvm
# ARG EXTRA_NODE_VERSION=10
# RUN su node -c "source /usr/local/share/nvm/nvm.sh && nvm install ${EXTRA_NODE_VERSION}"

# [Optional] Uncomment if you want to install more global node modules
# RUN su node -c "npm install -g <your-package-list-here>"
