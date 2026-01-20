#!/usr/bin/env node

/**
 * Historical Episode Migration Script
 * 
 * This script processes all existing transcription files in S3 and creates
 * Knowledge Base documents for historical episodes.
 * 
 * Usage:
 *   AWS_PROFILE=podcast npx ts-node migrate-historical-episodes.ts
 * 
 * Requirements:
 *   - AWS CLI configured with 'podcast' profile
 *   - Access to S3 bucket: aws-french-podcast-media
 *   - Bedrock Knowledge Base already deployed
 *   - Environment variables:
 *     - AWS_PROFILE=podcast (required)
 *     - KNOWLEDGE_BASE_ID (required for task 7.4)
 *     - DATA_SOURCE_ID (required for task 7.4)
 */

import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { BedrockAgentClient, StartIngestionJobCommand, GetIngestionJobCommand } from '@aws-sdk/client-bedrock-agent';

// Configuration
const AWS_REGION = 'eu-central-1';
const AWS_PROFILE = 'podcast';
const S3_BUCKET = 'aws-french-podcast-media';
const TEXT_PREFIX = 'text/';
const KB_DOCUMENTS_PREFIX = 'kb-documents/';
const BATCH_SIZE = 10;
const RSS_FEED_URL = 'https://francais.podcast.go-aws.com/web/feed.xml';

// AWS clients
const s3Client = new S3Client({ 
  region: AWS_REGION,
  // Note: AWS SDK will use AWS_PROFILE environment variable if set
});

const bedrockClient = new BedrockAgentClient({ 
  region: AWS_REGION 
});

interface EpisodeMetadata {
  episode: number;
  title: string;
  description: string;
  publicationDate: string;
  author: string;
  guests: Array<{
    name: string;
    title: string;
    link: string;
  }>;
  links: Array<{
    text: string;
    link: string;
  }>;
}

interface TranscriptionJSON {
  results: {
    transcripts: Array<{
      transcript: string;
    }>;
  };
}

interface ProcessingStats {
  total: number;
  successful: number;
  failed: number;
  skipped: number;
  failedEpisodes: Array<{ episode: number; error: string }>;
}

/**
 * Main execution function
 */
async function main() {
  console.log('='.repeat(80));
  console.log('Historical Episode Migration Script');
  console.log('='.repeat(80));
  console.log(`AWS Region: ${AWS_REGION}`);
  console.log(`AWS Profile: ${process.env.AWS_PROFILE || 'default'}`);
  console.log(`S3 Bucket: ${S3_BUCKET}`);
  console.log(`Batch Size: ${BATCH_SIZE}`);
  console.log('='.repeat(80));
  console.log('');

  // Validate AWS_PROFILE is set
  if (!process.env.AWS_PROFILE || process.env.AWS_PROFILE !== AWS_PROFILE) {
    console.error(`ERROR: AWS_PROFILE environment variable must be set to '${AWS_PROFILE}'`);
    console.error(`Usage: AWS_PROFILE=${AWS_PROFILE} npx ts-node migrate-historical-episodes.ts`);
    process.exit(1);
  }

  try {
    // Step 1: List all transcription files
    console.log('Step 1: Listing transcription files from S3...');
    const transcriptionFiles = await listTranscriptionFiles();
    console.log(`Found ${transcriptionFiles.length} transcription files`);
    console.log('');

    if (transcriptionFiles.length === 0) {
      console.log('No transcription files found. Exiting.');
      return;
    }

    // Step 2: Extract episode numbers
    console.log('Step 2: Extracting episode numbers...');
    const episodeNumbers = extractEpisodeNumbers(transcriptionFiles);
    console.log(`Extracted ${episodeNumbers.length} episode numbers`);
    console.log(`Episode range: ${Math.min(...episodeNumbers)} - ${Math.max(...episodeNumbers)}`);
    console.log('');

    // Confirm before proceeding
    console.log(`Ready to process ${episodeNumbers.length} episodes`);
    console.log('Press Ctrl+C to cancel, or the script will continue in 5 seconds...');
    await sleep(5000);
    console.log('');

    // Step 3: Process episodes (implemented in task 7.2)
    console.log('Step 3: Processing episodes in batches...');
    const stats = await processEpisodesInBatches(episodeNumbers);
    console.log('');

    // Step 4: Report results
    console.log('Step 4: Processing complete');
    console.log(`Total episodes: ${stats.total}`);
    console.log(`Successful: ${stats.successful}`);
    console.log(`Failed: ${stats.failed}`);
    console.log(`Skipped: ${stats.skipped}`);
    
    if (stats.failedEpisodes.length > 0) {
      console.log('');
      console.log('Failed episodes:');
      stats.failedEpisodes.forEach(({ episode, error }) => {
        console.log(`  - Episode ${episode}: ${error}`);
      });
    }
    console.log('');

    // Step 5: Trigger full Knowledge Base ingestion
    if (stats.successful > 0) {
      console.log('Step 5: Triggering full Knowledge Base ingestion...');
      const ingestionResult = await triggerFullIngestion();
      console.log('');
      
      // Step 6: Monitor ingestion job
      console.log('Step 6: Monitoring ingestion job...');
      await monitorIngestionJob(ingestionResult.ingestionJobId);
      console.log('');
    } else {
      console.log('Step 5: Skipping ingestion (no documents processed successfully)');
      console.log('');
    }

    console.log('='.repeat(80));
    console.log('Migration script completed successfully');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('');
    console.error('='.repeat(80));
    console.error('FATAL ERROR: Migration script failed');
    console.error('='.repeat(80));
    console.error(error);
    process.exit(1);
  }
}

/**
 * List all transcription files in S3
 * Filters for files ending with -transcribe.json
 */
async function listTranscriptionFiles(): Promise<string[]> {
  const transcriptionFiles: string[] = [];
  let continuationToken: string | undefined;

  try {
    do {
      const command = new ListObjectsV2Command({
        Bucket: S3_BUCKET,
        Prefix: TEXT_PREFIX,
        ContinuationToken: continuationToken
      });

      const response = await s3Client.send(command);

      if (response.Contents) {
        for (const object of response.Contents) {
          if (object.Key && object.Key.endsWith('-transcribe.json')) {
            transcriptionFiles.push(object.Key);
          }
        }
      }

      continuationToken = response.NextContinuationToken;

    } while (continuationToken);

    return transcriptionFiles.sort();

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to list transcription files from S3: ${errorMessage}`);
  }
}

/**
 * Extract episode numbers from S3 keys
 * Example: text/341-transcribe.json -> 341
 */
function extractEpisodeNumbers(keys: string[]): number[] {
  const episodeNumbers: number[] = [];

  for (const key of keys) {
    try {
      const filename = key.split('/').pop() || '';
      const episodeStr = filename.split('-')[0];
      const episode = parseInt(episodeStr, 10);

      if (!isNaN(episode)) {
        episodeNumbers.push(episode);
      } else {
        console.warn(`Warning: Could not extract episode number from: ${key}`);
      }
    } catch (error) {
      console.warn(`Warning: Error processing key ${key}:`, error);
    }
  }

  return episodeNumbers.sort((a, b) => a - b);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Process episodes in batches
 */
async function processEpisodesInBatches(episodeNumbers: number[]): Promise<ProcessingStats> {
  const stats: ProcessingStats = {
    total: episodeNumbers.length,
    successful: 0,
    failed: 0,
    skipped: 0,
    failedEpisodes: []
  };

  // Fetch RSS feed once and cache
  console.log('Fetching RSS feed...');
  const rssFeedCache = await fetchAndCacheRSSFeed();
  console.log(`Cached metadata for ${rssFeedCache.size} episodes`);
  console.log('');

  // Process episodes in batches
  const batches = chunkArray(episodeNumbers, BATCH_SIZE);
  
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const batchNumber = batchIndex + 1;
    
    console.log(`Processing batch ${batchNumber}/${batches.length} (episodes ${batch[0]}-${batch[batch.length - 1]})...`);
    
    for (const episodeNumber of batch) {
      try {
        await processEpisode(episodeNumber, rssFeedCache);
        stats.successful++;
      } catch (error) {
        stats.failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        stats.failedEpisodes.push({ episode: episodeNumber, error: errorMessage });
        console.error(`  ✗ Episode ${episodeNumber}: ${errorMessage}`);
      }
    }
    
    // Progress reporting every batch
    console.log(`  Batch ${batchNumber} complete: ${stats.successful} successful, ${stats.failed} failed`);
    console.log('');
  }

  return stats;
}

/**
 * Process a single episode
 */
async function processEpisode(
  episodeNumber: number,
  rssFeedCache: Map<number, EpisodeMetadata>
): Promise<void> {
  // Read transcription from S3
  // Episodes 1-99 use zero-padded filenames (001, 002, etc.)
  // Episodes 100+ use regular numbers (100, 101, etc.)
  const paddedEpisode = episodeNumber < 100 ? episodeNumber.toString().padStart(3, '0') : episodeNumber.toString();
  const transcriptionKey = `${TEXT_PREFIX}${paddedEpisode}-transcribe.json`;
  const transcriptionText = await readTranscriptionFile(transcriptionKey);

  // Get metadata from cache
  const metadata = rssFeedCache.get(episodeNumber) || getDefaultMetadata(episodeNumber);

  // Format document
  const formattedDocument = formatDocument(episodeNumber, transcriptionText, metadata);

  // Write document to S3
  await writeDocumentToS3(episodeNumber, formattedDocument);

  console.log(`  ✓ Episode ${episodeNumber}: Document created`);
}

/**
 * Fetch and cache RSS feed
 */
async function fetchAndCacheRSSFeed(): Promise<Map<number, EpisodeMetadata>> {
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(RSS_FEED_URL);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const xmlText = await response.text();
      return parseRSSFeed(xmlText);

    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      console.warn(`  Warning: RSS fetch attempt ${attempt}/${maxRetries} failed: ${lastError.message}`);
      
      if (attempt < maxRetries) {
        const delayMs = Math.pow(2, attempt - 1) * 1000;
        await sleep(delayMs);
      }
    }
  }

  console.error(`  Error: Failed to fetch RSS feed after ${maxRetries} attempts`);
  console.error(`  Continuing with default metadata for all episodes`);
  return new Map();
}

/**
 * Parse RSS feed XML and extract episode metadata
 */
function parseRSSFeed(xmlText: string): Map<number, EpisodeMetadata> {
  const episodeMap = new Map<number, EpisodeMetadata>();

  try {
    // Simple XML parsing using regex
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    const items = xmlText.match(itemRegex) || [];

    for (const item of items) {
      try {
        // Extract episode number
        const episodeMatch = item.match(/<itunes:episode>(\d+)<\/itunes:episode>/);
        if (!episodeMatch) continue;
        const episode = parseInt(episodeMatch[1], 10);

        // Extract title
        const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/);
        const title = titleMatch ? titleMatch[1] : `Episode ${episode}`;

        // Extract description
        const descMatch = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/);
        const description = descMatch ? descMatch[1] : '';

        // Extract publication date
        const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
        const publicationDate = pubDateMatch ? new Date(pubDateMatch[1]).toISOString() : new Date().toISOString();

        // Extract author
        const authorMatch = item.match(/<itunes:author>(.*?)<\/itunes:author>/);
        const author = authorMatch ? authorMatch[1] : 'Sébastien Stormacq';

        // Extract guests
        const guests: Array<{ name: string; title: string; link: string }> = [];
        const guestRegex = /<itunes:guest>([\s\S]*?)<\/itunes:guest>/g;
        let guestMatch;
        while ((guestMatch = guestRegex.exec(item)) !== null) {
          const guestXml = guestMatch[1];
          const nameMatch = guestXml.match(/<name>(.*?)<\/name>/);
          const titleMatch = guestXml.match(/<title>(.*?)<\/title>/);
          const linkMatch = guestXml.match(/<link>(.*?)<\/link>/);

          if (nameMatch) {
            guests.push({
              name: nameMatch[1],
              title: titleMatch ? titleMatch[1] : '',
              link: linkMatch ? linkMatch[1] : ''
            });
          }
        }

        // Extract links
        const links: Array<{ text: string; link: string }> = [];
        const linkMatch = item.match(/<link>(.*?)<\/link>/);
        if (linkMatch) {
          links.push({
            text: 'Episode Page',
            link: linkMatch[1]
          });
        }

        episodeMap.set(episode, {
          episode,
          title,
          description,
          publicationDate,
          author,
          guests,
          links
        });

      } catch (itemError) {
        // Continue processing other items
      }
    }

    return episodeMap;

  } catch (error) {
    console.error('Error parsing RSS feed XML:', error);
    return new Map();
  }
}

/**
 * Read and parse transcription JSON file from S3
 */
async function readTranscriptionFile(key: string): Promise<string> {
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const command = new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: key
      });

      const response = await s3Client.send(command);
      const content = await response.Body!.transformToString();

      // Parse JSON structure
      const transcriptJson: TranscriptionJSON = JSON.parse(content);

      // Validate transcript structure
      if (!transcriptJson.results?.transcripts?.[0]?.transcript) {
        throw new Error('Invalid transcription structure');
      }

      const transcriptText = transcriptJson.results.transcripts[0].transcript;

      if (!transcriptText || transcriptText.trim().length === 0) {
        throw new Error('Empty transcript text');
      }

      return transcriptText;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      
      if (attempt < maxRetries) {
        const delayMs = Math.pow(2, attempt - 1) * 1000;
        await sleep(delayMs);
      }
    }
  }

  throw new Error(`Failed to read transcription after ${maxRetries} attempts: ${lastError?.message}`);
}

/**
 * Format document with metadata and transcription
 * 
 * NOTE: Transcription comes FIRST to avoid Bedrock extracting too much metadata.
 * S3 Vectors has a 2048 byte limit for filterable metadata, and Bedrock extracts
 * everything before the main content as metadata.
 */
function formatDocument(
  episodeNumber: number,
  transcriptionText: string,
  metadata: EpisodeMetadata
): string {
  const sections: string[] = [];

  // Put transcription FIRST to avoid metadata extraction issues
  sections.push(transcriptionText);
  sections.push('');
  sections.push('---');
  sections.push('');

  // Metadata section AFTER transcription
  sections.push(`Episode: ${episodeNumber}`);
  sections.push(`Title: ${metadata.title}`);
  sections.push(`Date: ${metadata.publicationDate}`);
  sections.push(`Author: ${metadata.author}`);

  // Guests
  if (metadata.guests && metadata.guests.length > 0) {
    const guestNames = metadata.guests.map(guest => guest.name).join(', ');
    sections.push(`Guests: ${guestNames}`);
  }

  // Description
  if (metadata.description && metadata.description !== 'Description not available') {
    sections.push('');
    sections.push('Description:');
    sections.push(metadata.description);
  }

  // Links
  if (metadata.links && metadata.links.length > 0) {
    sections.push('');
    sections.push('Related Links:');
    metadata.links.forEach(link => {
      sections.push(`- ${link.text}: ${link.link}`);
    });
  }

  // Guest details
  if (metadata.guests && metadata.guests.length > 0) {
    const guestsWithDetails = metadata.guests.filter(g => g.title || g.link);
    if (guestsWithDetails.length > 0) {
      sections.push('');
      sections.push('Guest Details:');
      guestsWithDetails.forEach(guest => {
        const details: string[] = [guest.name];
        if (guest.title) details.push(guest.title);
        if (guest.link) details.push(guest.link);
        sections.push(`- ${details.join(' - ')}`);
      });
    }
  }

  return sections.join('\n');
}

/**
 * Write formatted document to S3 kb-documents/ prefix
 */
async function writeDocumentToS3(
  episodeNumber: number,
  document: string
): Promise<void> {
  const documentKey = `${KB_DOCUMENTS_PREFIX}${episodeNumber}.txt`;
  
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const command = new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: documentKey,
        Body: document,
        ContentType: 'text/plain; charset=utf-8'
      });

      await s3Client.send(command);
      return;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      
      if (attempt < maxRetries) {
        const delayMs = Math.pow(2, attempt - 1) * 1000;
        await sleep(delayMs);
      }
    }
  }

  throw new Error(`Failed to write document to S3 after ${maxRetries} attempts: ${lastError?.message}`);
}

/**
 * Get default metadata when RSS feed is unavailable
 */
function getDefaultMetadata(episodeNumber: number): EpisodeMetadata {
  return {
    episode: episodeNumber,
    title: `Episode ${episodeNumber}`,
    description: 'Description not available',
    publicationDate: new Date().toISOString(),
    author: 'Sébastien Stormacq',
    guests: [],
    links: []
  };
}

/**
 * Split array into chunks
 */
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Trigger full Knowledge Base ingestion job
 */
async function triggerFullIngestion(): Promise<{ ingestionJobId: string }> {
  const knowledgeBaseId = process.env.KNOWLEDGE_BASE_ID || 'OT4JU2FZZF';
  const dataSourceId = process.env.DATA_SOURCE_ID || 'CVHXBD68AY';

  if (!knowledgeBaseId || !dataSourceId) {
    console.error('ERROR: Missing required environment variables');
    console.error('Please set KNOWLEDGE_BASE_ID and DATA_SOURCE_ID');
    console.error('');
    console.error('You can get these values from the CloudFormation stack outputs:');
    console.error('  aws cloudformation describe-stacks --stack-name PodcastKnowledgeBaseStack --profile podcast --region eu-central-1');
    throw new Error('Missing required environment variables: KNOWLEDGE_BASE_ID and DATA_SOURCE_ID');
  }

  console.log(`Knowledge Base ID: ${knowledgeBaseId}`);
  console.log(`Data Source ID: ${dataSourceId}`);

  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Starting ingestion job (attempt ${attempt}/${maxRetries})...`);

      const command = new StartIngestionJobCommand({
        knowledgeBaseId,
        dataSourceId
      });

      const response = await bedrockClient.send(command);
      
      const ingestionJobId = response.ingestionJob?.ingestionJobId;
      
      if (!ingestionJobId) {
        throw new Error('Ingestion job started but no job ID returned');
      }

      console.log(`✓ Ingestion job started: ${ingestionJobId}`);
      return { ingestionJobId };

    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      const errorMessage = lastError.message;
      
      console.error(`✗ Attempt ${attempt} failed: ${errorMessage}`);

      if (attempt < maxRetries) {
        const delayMs = Math.pow(2, attempt - 1) * 1000;
        console.log(`  Retrying in ${delayMs}ms...`);
        await sleep(delayMs);
      }
    }
  }

  throw new Error(`Failed to start ingestion job after ${maxRetries} attempts: ${lastError?.message}`);
}

/**
 * Monitor ingestion job status until completion
 */
async function monitorIngestionJob(ingestionJobId: string): Promise<void> {
  const knowledgeBaseId = process.env.KNOWLEDGE_BASE_ID || 'OT4JU2FZZF';
  const dataSourceId = process.env.DATA_SOURCE_ID || 'CVHXBD68AY';

  if (!knowledgeBaseId || !dataSourceId) {
    console.error('ERROR: Missing required environment variables for monitoring');
    return;
  }

  const maxPolls = 120; // Poll for up to 10 minutes (120 * 5 seconds)
  const pollIntervalMs = 5000; // 5 seconds

  console.log(`Monitoring ingestion job: ${ingestionJobId}`);
  console.log('This may take several minutes...');
  console.log('');

  let lastStatus = '';

  for (let poll = 1; poll <= maxPolls; poll++) {
    try {
      // Wait before polling (except first iteration)
      if (poll > 1) {
        await sleep(pollIntervalMs);
      }

      const command = new GetIngestionJobCommand({
        knowledgeBaseId,
        dataSourceId,
        ingestionJobId
      });

      const response = await bedrockClient.send(command);
      const status = response.ingestionJob?.status;
      const statistics = response.ingestionJob?.statistics;

      // Only log status changes to reduce noise
      if (status !== lastStatus) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] Status: ${status}`);
        
        if (statistics) {
          console.log(`  Documents scanned: ${statistics.numberOfDocumentsScanned || 0}`);
          console.log(`  Documents failed: ${statistics.numberOfDocumentsFailed || 0}`);
        }
        
        lastStatus = status || '';
      }

      // Check if job completed
      if (status === 'COMPLETE') {
        console.log('');
        console.log('✓ Ingestion job completed successfully');
        console.log('');
        console.log('Completion statistics:');
        console.log(`  Documents scanned: ${statistics?.numberOfDocumentsScanned || 0}`);
        console.log(`  Documents failed: ${statistics?.numberOfDocumentsFailed || 0}`);
        console.log(`  Total processing time: ${Math.round((poll * pollIntervalMs) / 1000)} seconds`);
        return;
      }

      // Check if job failed
      if (status === 'FAILED') {
        const failureReasons = response.ingestionJob?.failureReasons || [];
        
        console.log('');
        console.error('✗ Ingestion job failed');
        console.error('');
        console.error('Failure reasons:');
        failureReasons.forEach(reason => {
          console.error(`  - ${reason}`);
        });
        
        if (statistics) {
          console.error('');
          console.error('Statistics:');
          console.error(`  Documents scanned: ${statistics.numberOfDocumentsScanned || 0}`);
          console.error(`  Documents failed: ${statistics.numberOfDocumentsFailed || 0}`);
        }

        throw new Error(`Ingestion job failed: ${failureReasons.join(', ')}`);
      }

      // Show progress indicator for long-running jobs
      if (poll % 12 === 0) { // Every minute
        console.log(`  Still ${status}... (${Math.round((poll * pollIntervalMs) / 1000)}s elapsed)`);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // If this is a failure we already logged, re-throw it
      if (error instanceof Error && error.message.includes('Ingestion job failed')) {
        throw error;
      }

      console.error('');
      console.error(`✗ Error polling ingestion job status: ${errorMessage}`);
      console.error('The ingestion job may still be running. Check AWS console for status.');
      return;
    }
  }

  // Reached max polls without completion
  console.log('');
  console.warn('⚠ Ingestion job monitoring timed out');
  console.warn(`The job may still be running. Check status manually:`);
  console.warn(`  aws bedrock-agent get-ingestion-job \\`);
  console.warn(`    --knowledge-base-id ${knowledgeBaseId} \\`);
  console.warn(`    --data-source-id ${dataSourceId} \\`);
  console.warn(`    --ingestion-job-id ${ingestionJobId} \\`);
  console.warn(`    --profile podcast --region eu-central-1`);
}

// Run the script
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

// Export functions for testing
export {
  listTranscriptionFiles,
  extractEpisodeNumbers,
  processEpisodesInBatches,
  fetchAndCacheRSSFeed,
  parseRSSFeed,
  formatDocument,
  getDefaultMetadata,
  triggerFullIngestion,
  monitorIngestionJob
};
