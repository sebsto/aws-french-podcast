---
inclusion: always
---

# Social Media Post Preparation for Podcast Episodes

## Purpose

This document tells the AI agent how to prepare a `social_media.md` file for any podcast episode, given just the episode number.

## Inputs

The user provides:
- **Episode number** (required) — e.g. `358`
- **Tone or angle** (optional) — e.g. "focus on S3 Files" or "mets en avant l'invité"

## Source Data

For episode `{N}`, read these files to understand the content:

1. **Episode metadata** : `toucan/contents/episodes/{N}/index.md`
   - `title` : episode title
   - `description` : full narrative description of the episode
   - `guests` : array of guest objects (name, title, LinkedIn link)
   - `links` : array of related blog posts / announcements
   - `publication` : publication date

2. **Transcript** (optional, for deeper content) : download from S3
   ```bash
   aws s3 cp s3://aws-french-podcast-media/text/{N}-transcribe.json /tmp/{N}-transcribe.json --profile podcast --region eu-central-1
   ```
   Note: episodes 1-99 use zero-padded filenames (e.g. `001-transcribe.json`).

## Image

- **Local folder (try first)** : `/Users/stormacq/Library/CloudStorage/OneDrive-amazon.com/te/2026/10 - podcast/`
  Images are inside subfolders named `{N} - <episode title>/` (e.g. `358 - whats new week 15/358.png`). List the directory to find the correct subfolder:
  ```bash
  ls "/Users/stormacq/Library/CloudStorage/OneDrive-amazon.com/te/2026/10 - podcast/" | grep "^{N} "
  ```
- **S3 fallback** : `s3://aws-french-podcast-media/img/{N}.png`
  ```bash
  aws s3 cp s3://aws-french-podcast-media/img/{N}.png /tmp/{N}.png --profile podcast --region eu-central-1
  ```
- **Alt text** : "Épisode {N} du podcast AWS en français" (unless the user specifies something else)
- **Format notes** :
  - LinkedIn and Mastodon accept PNG directly (max 16 MB)
  - Bluesky requires JPG/PNG under 1 MB — compress if needed:
    ```bash
    sips -s format jpeg -s formatOptions 80 /tmp/{N}.png --out /tmp/{N}_bsky.jpg
    ```

## Character Limits

| Platform  | Limit        |
|-----------|-------------|
| LinkedIn  | ~3000 chars |
| Mastodon  | 500 chars   |
| Bluesky   | 300 chars (graphemes) |

If a post exceeds a platform's limit, split it into multiple posts in the thread. Always count characters and annotate each post with its length.

## Output File

Generate `toucan/contents/episodes/{N}/social_media.md` with this structure:

```
Image pour tous les réseaux : {N}.png (S3 : s3://aws-french-podcast-media/img/{N}.png)
Alt text : Épisode {N} du podcast AWS en français

---

Post LinkedIn #1 ({X} chars, image)

[post text]

Post LinkedIn #2 (reply au 1, {X} chars)

[reply text with links and hashtags]

---

Post Mastodon #1 ({X} chars, image)

[post text]

Post Mastodon #2 (reply, {X} chars)

[reply text with links]

---

Post BlueSky #1 ({X} chars, image)

[post text]

Post BlueSky #2 (reply, {X} chars)

[reply text — split into more posts if over 300 chars]
```

## Content Guidelines

### LinkedIn post #1 (main post, with image)
- Start with `le podcast 🎙 AWS ☁️ en 🇫🇷`
- Highlight the main topic of the episode with a short paragraph explaining what it is and why it matters
- If there's a guest, mention their name and role
- List other topics covered with `→` bullet points
- End with `🎧 Lien dans les commentaires`

### LinkedIn post #2 (reply with links)
- Direct link to the episode: `https://francais.podcast.go-aws.com/web/episodes/{N}/index.html`
- List all podcast platforms:
  ```
  🎧 Retrouvez tous les épisodes du  podcast 🎙 AWS ☁️ en 🇫🇷 👉

  Amazon Music : https://sebs.to/paef_amzn
  Spotify : https://sebs.to/paef_spot
  Apple Podcast : https://sebs.to/paef_apple
  YouTube : https://sebs.to/paef_yt
  Deezer: https://bit.ly/paef_deezer
  Flux RSS : https://sebs.to/paef_rss
  ```
- Add relevant hashtags: `#AWS #Cloud #Podcast` + topic-specific ones

### Mastodon post #1 (main post, with image)
- Start with `le podcast 🎙 AWS ☁️ en 🇫🇷`
- Concise summary of the main topic (1-2 lines)
- Brief mention of other topics
- End with `Dispo dans toutes les apps de podcast (lien dans la 🧵👇)`
- Must stay under 500 chars

### Mastodon post #2 (reply with links)
- Same link block as LinkedIn #2 (without hashtags, or with a few)
- Must stay under 500 chars

### Bluesky post #1 (main post, with image)
- Same text as Mastodon #1 (it's usually under 300 chars)
- If over 300 chars, shorten it
- Must stay under 300 chars

### Bluesky post #2+ (reply thread with links)
- Same content as Mastodon #2 but split across multiple posts if needed to stay under 300 chars each
- Split at natural boundaries (after a group of platform links)

## Writing Style

- French, informal but professional
- Use emojis sparingly (🎙 ☁️ 🇫🇷 🎧 → are the standard ones)
- No marketing fluff — be factual and concise
- Mention concrete details: latency numbers, specific feature names, service names
- If there's a guest, always mention them by name and role

## Workflow Summary

1. Read `toucan/contents/episodes/{N}/index.md`
2. Optionally read the transcript for more detail
3. Write the posts following the guidelines above
4. Count characters for each post, split if needed
5. Save to `toucan/contents/episodes/{N}/social_media.md`
6. Show the user the result for review before saving (or after, depending on their preference)
