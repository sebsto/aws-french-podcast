#!/bin/bash

# Run toucan using the same container image as the cloud build
# This ensures consistency between local and cloud builds

CONTAINER_IMAGE="533267385481.dkr.ecr.eu-central-1.amazonaws.com/cdk-hnb659fds-container-assets-533267385481-eu-central-1:e002e3d5a02630a9378da38f1f9ee9875a03054c02b663cb5d38a6270114f444"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "Error: Docker is not running"
    exit 1
fi

# Run toucan in container with current directory mounted
docker run --rm \
    -v "$(pwd):/workspace" \
    -w /workspace \
    --entrypoint /bin/bash \
    "$CONTAINER_IMAGE" \
    -c "/usr/local/bin/toucan $*"
