---
inclusion: always
---

# Podcast Episode Structure and Organization

## Overview

Each podcast episode consists of multiple files stored in S3 and a local markdown file with frontmatter metadata. All files use the episode number as the primary identifier.

## S3 Bucket Structure

**Bucket**: `s3://aws-french-podcast-media/`

### Directory Layout

```
aws-french-podcast-media/
├── media/          # Audio files (MP3)
├── img/            # Image files (PNG)
└── text/           # Transcription files (JSON)
```

## File Naming Convention

All files for an episode use the episode number in their filename. For example, episode 341:

### Audio File (1 per episode)
- **Location**: `s3://aws-french-podcast-media/media/`
- **Format**: `{episode_number}.mp3`
- **Example**: `341.mp3`

### Image Files (3 per episode)
- **Location**: `s3://aws-french-podcast-media/img/`
- **Format**: PNG files
- **Files**:
  1. `{episode_number}.png` - Social media square image
  2. `{episode_number}-bannerh.png` - Horizontal banner
  3. `{episode_number}-bannerv.png` - Vertical banner
- **Examples**:
  - `341.png`
  - `341-bannerh.png`
  - `341-bannerv.png`

### Transcription File (1 per episode)
- **Location**: `s3://aws-french-podcast-media/text/`
- **Format**: `{episode_number}-transcribe.json`
  - Episodes 1-99: Zero-padded (e.g., `001-transcribe.json`, `099-transcribe.json`)
  - Episodes 100+: No padding (e.g., `100-transcribe.json`, `341-transcribe.json`)
- **Examples**: 
  - `001-transcribe.json` (episode 1)
  - `099-transcribe.json` (episode 99)
  - `341-transcribe.json` (episode 341)
- **Content**: JSON output from Amazon Transcribe service

## Local Episode Metadata

### Location
- **Path**: `toucan/contents/episodes/{episode_number}/index.md`
- **Example**: `toucan/contents/episodes/341/index.md`

### Markdown Frontmatter Structure

Each episode has a markdown file with YAML frontmatter containing metadata:

```yaml
---
title: "Episode Title"
description: "Episode description text"
episode: 341
duration: "HH:MM:SS"
size: 12345678  # File size in bytes
file: "341.mp3"
social-background: "341.png"
category: "podcasts"
publication: "YYYY-MM-DD HH:MM:SS +0100"
author: "Author Name"
guests:
- name: "Guest Name"
  link: https://linkedin.com/in/guest
  title: "Guest Title/Role"
links:
- text: "Link description"
  link: https://example.com
---
```

### Frontmatter Fields

- **title**: Episode title
- **description**: Full episode description (narrative format)
- **episode**: Episode number (integer)
- **duration**: Audio duration in HH:MM:SS format
- **size**: MP3 file size in bytes
- **file**: MP3 filename (always `{episode}.mp3`)
- **social-background**: Social media image filename (always `{episode}.png`)
- **category**: Always "podcasts"
- **publication**: Publication date and time with timezone
- **author**: Podcast host name
- **guests**: Array of guest objects with name, LinkedIn link, and title
- **links**: Array of related links with text and URL

## Working with Episodes

### Finding Episode Files

```bash
# List all files for episode 341
aws s3 ls s3://aws-french-podcast-media/media/341.mp3 --profile podcast --region eu-central-1
aws s3 ls s3://aws-french-podcast-media/img/ --profile podcast --region eu-central-1 | grep "341"
aws s3 ls s3://aws-french-podcast-media/text/341-transcribe.json --profile podcast --region eu-central-1
```

### Downloading Episode Files

```bash
# Download audio
aws s3 cp s3://aws-french-podcast-media/media/341.mp3 . --profile podcast --region eu-central-1

# Download images
aws s3 cp s3://aws-french-podcast-media/img/341.png . --profile podcast --region eu-central-1
aws s3 cp s3://aws-french-podcast-media/img/341-bannerh.png . --profile podcast --region eu-central-1
aws s3 cp s3://aws-french-podcast-media/img/341-bannerv.png . --profile podcast --region eu-central-1

# Download transcription
aws s3 cp s3://aws-french-podcast-media/text/341-transcribe.json . --profile podcast --region eu-central-1
```

### Uploading Episode Files

```bash
# Upload audio
aws s3 cp 341.mp3 s3://aws-french-podcast-media/media/ --profile podcast --region eu-central-1

# Upload images
aws s3 cp 341.png s3://aws-french-podcast-media/img/ --profile podcast --region eu-central-1
aws s3 cp 341-bannerh.png s3://aws-french-podcast-media/img/ --profile podcast --region eu-central-1
aws s3 cp 341-bannerv.png s3://aws-french-podcast-media/img/ --profile podcast --region eu-central-1
```

## Episode Processing Workflow

1. **Upload MP3**: Upload `{episode}.mp3` to `media/` folder
2. **Automatic Transcription**: EventBridge triggers transcription workflow
3. **Transcription Output**: `{episode}-transcribe.json` created in `text/` folder
4. **Content Generation**: EventBridge triggers content generation workflow
5. **Email Notification**: Receive generated titles, description, and social media content
6. **Create Metadata**: Create `toucan/contents/episodes/{episode}/index.md` with frontmatter
7. **Upload Images**: Upload the 3 PNG images to `img/` folder

## Episode Number Extraction

When working with files, extract the episode number from the filename:

- From MP3: `341.mp3` → `341`
- From transcription: 
  - `001-transcribe.json` → `1` (episodes 1-99 use zero-padding)
  - `341-transcribe.json` → `341` (episodes 100+ use no padding)
- From images: `341.png`, `341-bannerh.png`, `341-bannerv.png` → `341`

## Important Notes

- **Episode numbers are integers, but transcription filenames for episodes 1-99 use zero-padding (001, 002, etc.)**
- **Episodes 100+ use regular numbers in all filenames (no leading zeros)**
- **All files for an episode must use the same episode number**
- **Transcription files always end with `-transcribe.json`**
- **Image files always use `.png` format**
- **Audio files always use `.mp3` format**
- **Local metadata is stored in `toucan/contents/episodes/{episode}/index.md`**
- **S3 files and local metadata must be kept in sync manually**