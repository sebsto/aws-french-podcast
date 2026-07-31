# Swift Toucan Stage 
FROM swift:6.2 AS toucan

RUN git clone --depth 1 --branch 1.0.0-rc.1 https://github.com/toucansites/toucan
WORKDIR /toucan
RUN swift build -c release --static-swift-stdlib

# NodeJS Stage
FROM ubuntu:24.04

# Install toucan
COPY --from=toucan /toucan/.build/release/toucan* /usr/local/bin

# Install GIT, Node.js 23, and AWS CLI v2
RUN apt-get update && \
    apt-get install -y curl git unzip && \
    curl -fsSL https://deb.nodesource.com/setup_23.x | bash - && \
    apt-get install -y nodejs && \
    curl -sL "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o /tmp/awscliv2.zip && \
    unzip -q /tmp/awscliv2.zip -d /tmp && \
    /tmp/aws/install && \
    rm -rf /tmp/aws /tmp/awscliv2.zip && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /build

# Set default command
ENTRYPOINT ["/bin/bash"]
