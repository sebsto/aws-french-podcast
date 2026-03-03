#!/bin/bash

# Script to convert PNG images to WebP format for bandwidth optimization
# - Downloads PNGs from S3
# - Converts to WebP with strong compression (quality 80, optimized for mobile)
# - Uploads WebP versions back to S3
# - Keeps original PNGs intact
# - Generates detailed report

set -e

# Configuration
PROFILE="podcast"
REGION="eu-central-1"
BUCKET="aws-french-podcast-media"
IMG_PREFIX="img/"
WORK_DIR="./webp-conversion-temp"
WEBP_QUALITY=80  # Good balance for mobile: high quality, strong compression
REPORT_FILE="webp-conversion-report.txt"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check dependencies
echo -e "${BLUE}Checking dependencies...${NC}"
if ! command -v cwebp &> /dev/null; then
    echo -e "${RED}Error: cwebp not found. Install with: brew install webp${NC}"
    exit 1
fi

if ! command -v aws &> /dev/null; then
    echo -e "${RED}Error: aws cli not found${NC}"
    exit 1
fi

# Create working directory
echo -e "${BLUE}Creating working directory...${NC}"
mkdir -p "$WORK_DIR"
cd "$WORK_DIR"

# Initialize report
echo "WebP Conversion Report - $(date)" > "../$REPORT_FILE"
echo "======================================" >> "../$REPORT_FILE"
echo "" >> "../$REPORT_FILE"

# Get list of PNG files from S3
echo -e "${BLUE}Fetching list of PNG images from S3...${NC}"
aws s3 ls "s3://${BUCKET}/${IMG_PREFIX}" \
    --recursive \
    --profile "$PROFILE" \
    --region "$REGION" | \
    grep "\.png$" | \
    awk '{print $4}' > png_files.txt

TOTAL_FILES=$(wc -l < png_files.txt | tr -d ' ')
echo -e "${GREEN}Found $TOTAL_FILES PNG files${NC}"

# Statistics
CONVERTED=0
SKIPPED=0
FAILED=0
TOTAL_PNG_SIZE=0
TOTAL_WEBP_SIZE=0

# Process each PNG file
while IFS= read -r s3_path; do
    FILENAME=$(basename "$s3_path")
    FILENAME_NO_EXT="${FILENAME%.png}"
    WEBP_FILENAME="${FILENAME_NO_EXT}.webp"
    WEBP_S3_PATH="${IMG_PREFIX}${WEBP_FILENAME}"
    
    echo ""
    echo -e "${BLUE}Processing: $FILENAME${NC}"
    
    # Check if WebP already exists in S3
    if aws s3 ls "s3://${BUCKET}/${WEBP_S3_PATH}" \
        --profile "$PROFILE" \
        --region "$REGION" &> /dev/null; then
        echo -e "${YELLOW}  WebP already exists, skipping...${NC}"
        SKIPPED=$((SKIPPED + 1))
        continue
    fi
    
    # Download PNG
    echo "  Downloading PNG..."
    if ! aws s3 cp "s3://${BUCKET}/${s3_path}" "$FILENAME" \
        --profile "$PROFILE" \
        --region "$REGION" \
        --quiet; then
        echo -e "${RED}  Failed to download${NC}"
        FAILED=$((FAILED + 1))
        continue
    fi
    
    PNG_SIZE=$(stat -f%z "$FILENAME" 2>/dev/null || stat -c%s "$FILENAME" 2>/dev/null)
    
    # Convert to WebP
    echo "  Converting to WebP (quality: $WEBP_QUALITY)..."
    if ! cwebp -q "$WEBP_QUALITY" -m 6 -mt "$FILENAME" -o "$WEBP_FILENAME" &> /dev/null; then
        echo -e "${RED}  Conversion failed${NC}"
        FAILED=$((FAILED + 1))
        rm -f "$FILENAME"
        continue
    fi
    
    WEBP_SIZE=$(stat -f%z "$WEBP_FILENAME" 2>/dev/null || stat -c%s "$WEBP_FILENAME" 2>/dev/null)
    SAVINGS=$((PNG_SIZE - WEBP_SIZE))
    SAVINGS_PCT=$(awk "BEGIN {printf \"%.1f\", ($SAVINGS / $PNG_SIZE) * 100}")
    
    echo "  PNG: $(numfmt --to=iec-i --suffix=B $PNG_SIZE) → WebP: $(numfmt --to=iec-i --suffix=B $WEBP_SIZE) (${SAVINGS_PCT}% smaller)"
    
    # Upload WebP to S3
    echo "  Uploading WebP to S3..."
    if ! aws s3 cp "$WEBP_FILENAME" "s3://${BUCKET}/${WEBP_S3_PATH}" \
        --profile "$PROFILE" \
        --region "$REGION" \
        --content-type "image/webp" \
        --quiet; then
        echo -e "${RED}  Upload failed${NC}"
        FAILED=$((FAILED + 1))
        rm -f "$FILENAME" "$WEBP_FILENAME"
        continue
    fi
    
    echo -e "${GREEN}  ✓ Success${NC}"
    
    # Update statistics
    CONVERTED=$((CONVERTED + 1))
    TOTAL_PNG_SIZE=$((TOTAL_PNG_SIZE + PNG_SIZE))
    TOTAL_WEBP_SIZE=$((TOTAL_WEBP_SIZE + WEBP_SIZE))
    
    # Log to report
    echo "$FILENAME: PNG=$(numfmt --to=iec-i --suffix=B $PNG_SIZE) → WebP=$(numfmt --to=iec-i --suffix=B $WEBP_SIZE) (${SAVINGS_PCT}% reduction)" >> "../$REPORT_FILE"
    
    # Clean up local files
    rm -f "$FILENAME" "$WEBP_FILENAME"
    
done < png_files.txt

# Calculate final statistics
TOTAL_SAVINGS=$((TOTAL_PNG_SIZE - TOTAL_WEBP_SIZE))
if [ $TOTAL_PNG_SIZE -gt 0 ]; then
    TOTAL_SAVINGS_PCT=$(awk "BEGIN {printf \"%.1f\", ($TOTAL_SAVINGS / $TOTAL_PNG_SIZE) * 100}")
else
    TOTAL_SAVINGS_PCT="0.0"
fi

# Print summary
echo ""
echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}Conversion Complete!${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""
echo "Total files processed: $TOTAL_FILES"
echo "  Converted: $CONVERTED"
echo "  Skipped (already exists): $SKIPPED"
echo "  Failed: $FAILED"
echo ""
echo "Size comparison:"
echo "  Total PNG size: $(numfmt --to=iec-i --suffix=B $TOTAL_PNG_SIZE)"
echo "  Total WebP size: $(numfmt --to=iec-i --suffix=B $TOTAL_WEBP_SIZE)"
echo "  Total savings: $(numfmt --to=iec-i --suffix=B $TOTAL_SAVINGS) (${TOTAL_SAVINGS_PCT}%)"
echo ""
echo -e "${BLUE}Report saved to: $REPORT_FILE${NC}"

# Append summary to report
echo "" >> "../$REPORT_FILE"
echo "======================================" >> "../$REPORT_FILE"
echo "SUMMARY" >> "../$REPORT_FILE"
echo "======================================" >> "../$REPORT_FILE"
echo "Total files processed: $TOTAL_FILES" >> "../$REPORT_FILE"
echo "  Converted: $CONVERTED" >> "../$REPORT_FILE"
echo "  Skipped: $SKIPPED" >> "../$REPORT_FILE"
echo "  Failed: $FAILED" >> "../$REPORT_FILE"
echo "" >> "../$REPORT_FILE"
echo "Total PNG size: $(numfmt --to=iec-i --suffix=B $TOTAL_PNG_SIZE)" >> "../$REPORT_FILE"
echo "Total WebP size: $(numfmt --to=iec-i --suffix=B $TOTAL_WEBP_SIZE)" >> "../$REPORT_FILE"
echo "Total savings: $(numfmt --to=iec-i --suffix=B $TOTAL_SAVINGS) (${TOTAL_SAVINGS_PCT}%)" >> "../$REPORT_FILE"

# Clean up
cd ..
rm -rf "$WORK_DIR"

echo ""
echo -e "${GREEN}All PNG files remain intact in S3.${NC}"
echo -e "${GREEN}WebP versions are now available alongside PNGs.${NC}"
