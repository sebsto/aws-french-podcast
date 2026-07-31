#!/usr/bin/env node
//
// Generate episode-titles.json from Toucan episode markdown files.
// Reads toucan/contents/episodes/{N}/index.md YAML frontmatter.
// Output: { "341": "WIT: AWS Tech Alliance", "380": "...", ... }
//
// Usage: node generate-episode-titles.js
// Uploads to: s3://podcast-stormacq-net/analytics-state/episode-titles.json
//
const fs = require('fs');
const path = require('path');

const EPISODES_DIR = path.resolve(__dirname, '../../../../../toucan/contents/episodes');
const OUTPUT_FILE = path.resolve(__dirname, 'episode-titles.json');

function extractTitle(content) {
  // Match both formats:
  // title: "Episode Title"
  // "title": "Episode Title"
  const match = content.match(/^"?title"?:\s*"([^"]+)"/m);
  return match ? match[1].trim() : null;
}

function extractEpisodeNumber(content) {
  // Match both formats:
  // episode: 341
  // "episode": !!int "1"
  const match = content.match(/^"?episode"?:\s*(?:!!int\s*)?"?(\d+)"?\s*$/m);
  return match ? match[1] : null;
}

const titles = {};

const dirs = fs.readdirSync(EPISODES_DIR).filter(d => {
  const stat = fs.statSync(path.join(EPISODES_DIR, d));
  return stat.isDirectory() && /^\d+$/.test(d);
});

for (const dir of dirs) {
  const mdFile = path.join(EPISODES_DIR, dir, 'index.md');
  if (!fs.existsSync(mdFile)) continue;
  
  const content = fs.readFileSync(mdFile, 'utf8');
  const episode = extractEpisodeNumber(content) || dir;
  const title = extractTitle(content);
  
  if (title) {
    titles[episode] = title;
  }
}

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(titles, null, 2));
console.log(`Generated episode-titles.json with ${Object.keys(titles).length} episodes`);
