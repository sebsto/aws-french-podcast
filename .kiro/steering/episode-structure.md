---
inclusion: always
---

# Podcast AWS en Français - Guide de Production

## Overview

Ce document décrit l'ensemble du workflow de production du podcast AWS en français : structure des fichiers, métadonnées, et publication sur les réseaux sociaux.

## Episode Structure

Each podcast episode consists of multiple files stored in S3 and a local markdown file with frontmatter metadata. All files use the episode number as the primary identifier.

## S3 Bucket Structure

**Bucket**: `s3://podcast-stormacq-net/`

### Directory Layout

```
podcast-stormacq-net/
└── awsfr/
    ├── media/         # MP3 audio files
    ├── img/           # Episode images (PNG, WebP)
    ├── text/          # Transcription JSON files
    ├── site/          # Website HTML (deployed by pipeline)
    └── kb-documents/  # Knowledge base documents
```

## File Naming Convention

All files for an episode use the episode number in their filename. For example, episode 378:

### Audio File (1 per episode)
- **Location**: `s3://podcast-stormacq-net/awsfr/media/`
- **Format**: `{episode_number}.mp3`
- **Example**: `378.mp3`

### Image Files (3 per episode, in PNG + WebP)
- **Location**: `s3://podcast-stormacq-net/awsfr/img/`
- **Formats**: PNG and WebP
- **Files**:
  1. `{episode_number}.png` / `{episode_number}.webp` - Social media square image
  2. `{episode_number}-bannerh.png` / `{episode_number}-bannerh.webp` - Horizontal banner
  3. `{episode_number}-bannerv.png` / `{episode_number}-bannerv.webp` - Vertical banner
- **Examples**:
  - `378.png`, `378.webp`
  - `378-bannerh.png`, `378-bannerh.webp`
  - `378-bannerv.png`, `378-bannerv.webp`

### Transcription File (1 per episode)
- **Location**: `s3://podcast-stormacq-net/awsfr/text/`
- **Format**: `{episode_number}-transcribe.json`
  - Episodes 1-99: Zero-padded (e.g., `001-transcribe.json`, `099-transcribe.json`)
  - Episodes 100+: No padding (e.g., `100-transcribe.json`, `378-transcribe.json`)
- **Content**: JSON output from Amazon Transcribe service

## Local Episode Metadata

### Location
- **Path**: `toucan/contents/episodes/{episode_number}/index.md`
- **Example**: `toucan/contents/episodes/378/index.md`

### Markdown Frontmatter Structure

Each episode has a markdown file with YAML frontmatter containing metadata:

```yaml
---
title: "Episode Title"
description: "Episode description text"
episode: 378
duration: "HH:MM:SS"
size: 12345678  # File size in bytes
file: "378.mp3"
social-background: "378.png"
category: "podcasts"
publication: "YYYY-MM-DD HH:MM:SS +0100"
author: "Sébastien Stormacq"
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
- **guests**: Array of guest objects with name, LinkedIn link, and title. Empty array `[]` for solo episodes.
- **links**: Array of related links with text and URL

## Working with Episodes

### Finding Episode Files

```bash
# List all files for episode 378
aws s3 ls s3://podcast-stormacq-net/awsfr/media/378.mp3 --profile podcast --region eu-central-1
aws s3 ls s3://podcast-stormacq-net/awsfr/img/ --profile podcast --region eu-central-1 | grep "378"
aws s3 ls s3://podcast-stormacq-net/awsfr/text/378-transcribe.json --profile podcast --region eu-central-1
```

### Downloading Episode Files

```bash
# Download audio
aws s3 cp s3://podcast-stormacq-net/awsfr/media/378.mp3 . --profile podcast --region eu-central-1

# Download images
aws s3 cp s3://podcast-stormacq-net/awsfr/img/378.png . --profile podcast --region eu-central-1
aws s3 cp s3://podcast-stormacq-net/awsfr/img/378-bannerh.png . --profile podcast --region eu-central-1
aws s3 cp s3://podcast-stormacq-net/awsfr/img/378-bannerv.png . --profile podcast --region eu-central-1

# Download transcription
aws s3 cp s3://podcast-stormacq-net/awsfr/text/378-transcribe.json . --profile podcast --region eu-central-1
```

### Uploading Episode Files

Use the upload script:

```bash
scripts/upload_episode.sh 378
```

This uploads the MP3 and all image variants (PNG + WebP) for the episode.

Or manually:

```bash
# Upload audio
aws s3 cp 378.mp3 s3://podcast-stormacq-net/awsfr/media/ --profile podcast --region eu-central-1

# Upload images
aws s3 cp 378.png s3://podcast-stormacq-net/awsfr/img/ --profile podcast --region eu-central-1
aws s3 cp 378.webp s3://podcast-stormacq-net/awsfr/img/ --content-type "image/webp" --profile podcast --region eu-central-1
aws s3 cp 378-bannerh.png s3://podcast-stormacq-net/awsfr/img/ --profile podcast --region eu-central-1
aws s3 cp 378-bannerv.png s3://podcast-stormacq-net/awsfr/img/ --profile podcast --region eu-central-1
```

## Episode Publishing Workflow

1. **Upload MP3 and images**: Run `scripts/upload_episode.sh {episode}` (uploads from local podcast folder)
2. **Create Metadata**: Create `toucan/contents/episodes/{episode}/index.md` with frontmatter
3. **Push to GitHub**: `git push` triggers the CodePipeline which builds and deploys the site
4. **Verify**: Check `https://podcast.stormacq.net/awsfr/episodes/{episode}/` and the RSS feed

### Manual site deploy (if pipeline not yet triggered)

```bash
make prod
aws s3 sync dist/ s3://podcast-stormacq-net/awsfr/site/ --profile podcast --region eu-central-1 --delete
aws cloudfront create-invalidation --distribution-id EO6GCHTJJJV6D --paths "/*" --profile podcast --region us-east-1
```

## URLs

| Resource | URL |
|----------|-----|
| Website | `https://podcast.stormacq.net/awsfr/` |
| Episode page | `https://podcast.stormacq.net/awsfr/episodes/{N}/` |
| RSS feed | `https://podcast.stormacq.net/awsfr/feed.xml` |
| Media (via op3+podtrac) | `https://op3.dev/e,pg=d8347e02-cf46-566b-924b-468b4d848aee/dts.podtrac.com/redirect.mp3/podcast.stormacq.net/awsfr/media/{N}.mp3` |
| Direct media | `https://podcast.stormacq.net/awsfr/media/{N}.mp3` |
| Images | `https://podcast.stormacq.net/awsfr/img/{N}.png` |

## Episode Number Extraction

When working with files, extract the episode number from the filename:

- From MP3: `378.mp3` → `378`
- From transcription: 
  - `001-transcribe.json` → `1` (episodes 1-99 use zero-padding)
  - `378-transcribe.json` → `378` (episodes 100+ use no padding)
- From images: `378.png`, `378-bannerh.png`, `378-bannerv.png` → `378`

## Important Notes

- **Episode numbers are integers, but transcription filenames for episodes 1-99 use zero-padding (001, 002, etc.)**
- **Episodes 100+ use regular numbers in all filenames (no leading zeros)**
- **All files for an episode must use the same episode number**
- **Transcription files always end with `-transcribe.json`**
- **Image files use `.png` and `.webp` formats**
- **Audio files always use `.mp3` format**
- **Local metadata is stored in `toucan/contents/episodes/{episode}/index.md`**
- **S3 paths always include the `awsfr/` prefix**
- **Automatic transcription/content generation is NOT deployed (deferred)**

## Social Media Posting

### Social Media Content File

Each episode has a social media content file at `toucan/contents/episodes/{episode_number}/social_media.md` containing pre-written posts for LinkedIn, Mastodon, and Bluesky.

### How to Post

Use the Kiro CLI Social Media agent to publish posts. The command is:

```bash
kiro-cli-chat --agent "Social Media"
```

Then provide a prompt like:

```
Poste le message LinkedIn et Mastodon de l'épisode {episode_number}. L'image est {episode_number}.webp
```

The agent reads the social media content from `toucan/contents/episodes/{episode_number}/social_media.md` and posts to the configured platforms.

### Social Media Image

- The social media image for posting is `{episode_number}.webp` (WebP format, not PNG)
- This is different from the S3 images which include both PNG and WebP
- The `.webp` image is used specifically for social media posts via the Social Media agent

### Platforms

- **LinkedIn**: Full-length post with hashtags
- **Mastodon**: Full-length post (same as LinkedIn or adapted)
- **Bluesky**: Short version, 300 caractères max (limite Bluesky), avec lien vers l'épisode

### Social Media Content Guidelines

When writing social media posts for an episode:

- **LinkedIn**: Include an emoji hook (🎙), a summary of the episode topic, key figures/stats from the conversation, guest name and title, hashtags (#AWS #Cloud #Podcast, etc.), and end with "🎧 Lien dans les commentaires"
- **Mastodon**: Same content as LinkedIn, or slightly adapted. Hashtags are important for discoverability on Mastodon.
- **Bluesky**: 300 caractères max. Résumé concis du sujet, mention du guest, lien vers l'épisode. Pas de hashtags (peu utilisés sur Bluesky), privilégier un ton conversationnel.
