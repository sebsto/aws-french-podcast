SHELL=/bin/sh

# if you need image optimization, you can install optipng and jpegoptim
# brew install optipng jpegoptim

TOUCAN="/usr/local/bin/toucan"

# directories
WEB_DIR=./src
DIST_DIR=./dist
TOUCAN_DIR=./toucan
BUILD_DIR=./build

# Define source files 
SRC_FILES = $(wildcard $(WEB_DIR)/**/*.*)
CONTENT_FILES = $(wildcard $(TOUCAN_DIR)/content/*.md)
THEME_FILES = $(wildcard $(TOUCAN_DIR)/themes/aws_podcasts/**/*.*)

# Build web assets and generate base site
build:
	npm install && npm run build && npm run copy
	${TOUCAN} generate $(TOUCAN_DIR)

# Prod build
prod: build
	${TOUCAN}  generate --target prod

# Development build
dev: build
	${TOUCAN}  generate --target dev

# Watch depends on dev build
watch: dev
	${TOUCAN}  watch . --ignore $(DIST_DIR) --target dev

# Serve depends on having the dist directory
serve:
	${TOUCAN}  serve $(DIST_DIR)

# Image optimization targets
png: $(wildcard $(TOUCAN_DIR)/**/*.png)
	find $(TOUCAN_DIR)/* -type f -name '*.png' -exec optipng -o7 {} \;

jpg: $(wildcard $(TOUCAN_DIR)/**/*.jpg)
	find $(TOUCAN_DIR)/* -type f -name '*.jpg' | xargs jpegoptim --all-progressive '*.jpg'

# Clean target to remove generated files
clean:
	rm -rf $(DIST_DIR)

# Declare phony targets (targets that don't create files)
.PHONY: build dev prod watch serve png jpg codebuild clean

# codebuild:
# 	docker build cdk/docker -t adp:latest
# 	./codebuild_build.sh -i adp:latest -a .