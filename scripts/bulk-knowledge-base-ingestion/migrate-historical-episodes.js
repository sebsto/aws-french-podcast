#!/usr/bin/env node
"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.listTranscriptionFiles = listTranscriptionFiles;
exports.extractEpisodeNumbers = extractEpisodeNumbers;
exports.processEpisodesInBatches = processEpisodesInBatches;
exports.fetchAndCacheRSSFeed = fetchAndCacheRSSFeed;
exports.parseRSSFeed = parseRSSFeed;
exports.formatDocument = formatDocument;
exports.getDefaultMetadata = getDefaultMetadata;
exports.triggerFullIngestion = triggerFullIngestion;
exports.monitorIngestionJob = monitorIngestionJob;
const client_s3_1 = require("@aws-sdk/client-s3");
const client_bedrock_agent_1 = require("@aws-sdk/client-bedrock-agent");
// Configuration
const AWS_REGION = 'eu-central-1';
const AWS_PROFILE = 'podcast';
const S3_BUCKET = 'aws-french-podcast-media';
const TEXT_PREFIX = 'text/';
const KB_DOCUMENTS_PREFIX = 'kb-documents/';
const BATCH_SIZE = 10;
const RSS_FEED_URL = 'https://francais.podcast.go-aws.com/web/feed.xml';
// AWS clients
const s3Client = new client_s3_1.S3Client({
    region: AWS_REGION,
    // Note: AWS SDK will use AWS_PROFILE environment variable if set
});
const bedrockClient = new client_bedrock_agent_1.BedrockAgentClient({
    region: AWS_REGION
});
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
        }
        else {
            console.log('Step 5: Skipping ingestion (no documents processed successfully)');
            console.log('');
        }
        console.log('='.repeat(80));
        console.log('Migration script completed successfully');
        console.log('='.repeat(80));
    }
    catch (error) {
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
async function listTranscriptionFiles() {
    const transcriptionFiles = [];
    let continuationToken;
    try {
        do {
            const command = new client_s3_1.ListObjectsV2Command({
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
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Failed to list transcription files from S3: ${errorMessage}`);
    }
}
/**
 * Extract episode numbers from S3 keys
 * Example: text/341-transcribe.json -> 341
 */
function extractEpisodeNumbers(keys) {
    const episodeNumbers = [];
    for (const key of keys) {
        try {
            const filename = key.split('/').pop() || '';
            const episodeStr = filename.split('-')[0];
            const episode = parseInt(episodeStr, 10);
            if (!isNaN(episode)) {
                episodeNumbers.push(episode);
            }
            else {
                console.warn(`Warning: Could not extract episode number from: ${key}`);
            }
        }
        catch (error) {
            console.warn(`Warning: Error processing key ${key}:`, error);
        }
    }
    return episodeNumbers.sort((a, b) => a - b);
}
/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * Process episodes in batches
 */
async function processEpisodesInBatches(episodeNumbers) {
    const stats = {
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
            }
            catch (error) {
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
async function processEpisode(episodeNumber, rssFeedCache) {
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
async function fetchAndCacheRSSFeed() {
    const maxRetries = 3;
    let lastError = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(RSS_FEED_URL);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const xmlText = await response.text();
            return parseRSSFeed(xmlText);
        }
        catch (error) {
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
function parseRSSFeed(xmlText) {
    const episodeMap = new Map();
    try {
        // Simple XML parsing using regex
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        const items = xmlText.match(itemRegex) || [];
        for (const item of items) {
            try {
                // Extract episode number
                const episodeMatch = item.match(/<itunes:episode>(\d+)<\/itunes:episode>/);
                if (!episodeMatch)
                    continue;
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
                const guests = [];
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
                const links = [];
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
            }
            catch (itemError) {
                // Continue processing other items
            }
        }
        return episodeMap;
    }
    catch (error) {
        console.error('Error parsing RSS feed XML:', error);
        return new Map();
    }
}
/**
 * Read and parse transcription JSON file from S3
 */
async function readTranscriptionFile(key) {
    const maxRetries = 3;
    let lastError = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const command = new client_s3_1.GetObjectCommand({
                Bucket: S3_BUCKET,
                Key: key
            });
            const response = await s3Client.send(command);
            const content = await response.Body.transformToString();
            // Parse JSON structure
            const transcriptJson = JSON.parse(content);
            // Validate transcript structure
            if (!transcriptJson.results?.transcripts?.[0]?.transcript) {
                throw new Error('Invalid transcription structure');
            }
            const transcriptText = transcriptJson.results.transcripts[0].transcript;
            if (!transcriptText || transcriptText.trim().length === 0) {
                throw new Error('Empty transcript text');
            }
            return transcriptText;
        }
        catch (error) {
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
function formatDocument(episodeNumber, transcriptionText, metadata) {
    const sections = [];
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
                const details = [guest.name];
                if (guest.title)
                    details.push(guest.title);
                if (guest.link)
                    details.push(guest.link);
                sections.push(`- ${details.join(' - ')}`);
            });
        }
    }
    return sections.join('\n');
}
/**
 * Write formatted document to S3 kb-documents/ prefix
 */
async function writeDocumentToS3(episodeNumber, document) {
    const documentKey = `${KB_DOCUMENTS_PREFIX}${episodeNumber}.txt`;
    const maxRetries = 3;
    let lastError = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const command = new client_s3_1.PutObjectCommand({
                Bucket: S3_BUCKET,
                Key: documentKey,
                Body: document,
                ContentType: 'text/plain; charset=utf-8'
            });
            await s3Client.send(command);
            return;
        }
        catch (error) {
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
function getDefaultMetadata(episodeNumber) {
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
function chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
}
/**
 * Trigger full Knowledge Base ingestion job
 */
async function triggerFullIngestion() {
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
    let lastError = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Starting ingestion job (attempt ${attempt}/${maxRetries})...`);
            const command = new client_bedrock_agent_1.StartIngestionJobCommand({
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
        }
        catch (error) {
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
async function monitorIngestionJob(ingestionJobId) {
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
            const command = new client_bedrock_agent_1.GetIngestionJobCommand({
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
        }
        catch (error) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWlncmF0ZS1oaXN0b3JpY2FsLWVwaXNvZGVzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibWlncmF0ZS1oaXN0b3JpY2FsLWVwaXNvZGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBRUE7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBaUJHOztBQXl3QkQsd0RBQXNCO0FBQ3RCLHNEQUFxQjtBQUNyQiw0REFBd0I7QUFDeEIsb0RBQW9CO0FBQ3BCLG9DQUFZO0FBQ1osd0NBQWM7QUFDZCxnREFBa0I7QUFDbEIsb0RBQW9CO0FBQ3BCLGtEQUFtQjtBQS93QnJCLGtEQUF3RztBQUN4Ryx3RUFBcUg7QUFFckgsZ0JBQWdCO0FBQ2hCLE1BQU0sVUFBVSxHQUFHLGNBQWMsQ0FBQztBQUNsQyxNQUFNLFdBQVcsR0FBRyxTQUFTLENBQUM7QUFDOUIsTUFBTSxTQUFTLEdBQUcsMEJBQTBCLENBQUM7QUFDN0MsTUFBTSxXQUFXLEdBQUcsT0FBTyxDQUFDO0FBQzVCLE1BQU0sbUJBQW1CLEdBQUcsZUFBZSxDQUFDO0FBQzVDLE1BQU0sVUFBVSxHQUFHLEVBQUUsQ0FBQztBQUN0QixNQUFNLFlBQVksR0FBRyxrREFBa0QsQ0FBQztBQUV4RSxjQUFjO0FBQ2QsTUFBTSxRQUFRLEdBQUcsSUFBSSxvQkFBUSxDQUFDO0lBQzVCLE1BQU0sRUFBRSxVQUFVO0lBQ2xCLGlFQUFpRTtDQUNsRSxDQUFDLENBQUM7QUFFSCxNQUFNLGFBQWEsR0FBRyxJQUFJLHlDQUFrQixDQUFDO0lBQzNDLE1BQU0sRUFBRSxVQUFVO0NBQ25CLENBQUMsQ0FBQztBQW1DSDs7R0FFRztBQUNILEtBQUssVUFBVSxJQUFJO0lBQ2pCLE9BQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQzVCLE9BQU8sQ0FBQyxHQUFHLENBQUMscUNBQXFDLENBQUMsQ0FBQztJQUNuRCxPQUFPLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENB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TyxDQUFDLElBQUksS0FBSyxNQUFNLEVBQUUsQ0FBQztJQUM1QixJQUFJLEVBQUUsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEVBQUU7UUFDbkIsT0FBTyxDQUFDLEtBQUssQ0FBQyxrQkFBa0IsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN6QyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2xCLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcblxuLyoqXG4gKiBIaXN0b3JpY2FsIEVwaXNvZGUgTWlncmF0aW9uIFNjcmlwdFxuICogXG4gKiBUaGlzIHNjcmlwdCBwcm9jZXNzZXMgYWxsIGV4aXN0aW5nIHRyYW5zY3JpcHRpb24gZmlsZXMgaW4gUzMgYW5kIGNyZWF0ZXNcbiAqIEtub3dsZWRnZSBCYXNlIGRvY3VtZW50cyBmb3IgaGlzdG9yaWNhbCBlcGlzb2Rlcy5cbiAqIFxuICogVXNhZ2U6XG4gKiAgIEFXU19QUk9GSUxFPXBvZGNhc3QgbnB4IHRzLW5vZGUgbWlncmF0ZS1oaXN0b3JpY2FsLWVwaXNvZGVzLnRzXG4gKiBcbiAqIFJlcXVpcmVtZW50czpcbiAqICAgLSBBV1MgQ0xJIGNvbmZpZ3VyZWQgd2l0aCAncG9kY2FzdCcgcHJvZmlsZVxuICogICAtIEFjY2VzcyB0byBTMyBidWNrZXQ6IGF3cy1mcmVuY2gtcG9kY2FzdC1tZWRpYVxuICogICAtIEJlZHJvY2sgS25vd2xlZGdlIEJhc2UgYWxyZWFkeSBkZXBsb3llZFxuICogICAtIEVudmlyb25tZW50IHZhcmlhYmxlczpcbiAqICAgICAtIEFXU19QUk9GSUxFPXBvZGNhc3QgKHJlcXVpcmVkKVxuICogICAgIC0gS05PV0xFREdFX0JBU0VfSUQgKHJlcXVpcmVkIGZvciB0YXNrIDcuNClcbiAqICAgICAtIERBVEFfU09VUkNFX0lEIChyZXF1aXJlZCBmb3IgdGFzayA3LjQpXG4gKi9cblxuaW1wb3J0IHsgUzNDbGllbnQsIExpc3RPYmplY3RzVjJDb21tYW5kLCBHZXRPYmplY3RDb21tYW5kLCBQdXRPYmplY3RDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXMzJztcbmltcG9ydCB7IEJlZHJvY2tBZ2VudENsaWVudCwgU3RhcnRJbmdlc3Rpb25Kb2JDb21tYW5kLCBHZXRJbmdlc3Rpb25Kb2JDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LWJlZHJvY2stYWdlbnQnO1xuXG4vLyBDb25maWd1cmF0aW9uXG5jb25zdCBBV1NfUkVHSU9OID0gJ2V1LWNlbnRyYWwtMSc7XG5jb25zdCBBV1NfUFJPRklMRSA9ICdwb2RjYXN0JztcbmNvbnN0IFMzX0JVQ0tFVCA9ICdhd3MtZnJlbmNoLXBvZGNhc3QtbWVkaWEnO1xuY29uc3QgVEVYVF9QUkVGSVggPSAndGV4dC8nO1xuY29uc3QgS0JfRE9DVU1FTlRTX1BSRUZJWCA9ICdrYi1kb2N1bWVudHMvJztcbmNvbnN0IEJBVENIX1NJWkUgPSAxMDtcbmNvbnN0IFJTU19GRUVEX1VSTCA9ICdodHRwczovL2ZyYW5jYWlzLnBvZGNhc3QuZ28tYXdzLmNvbS93ZWIvZmVlZC54bWwnO1xuXG4vLyBBV1MgY2xpZW50c1xuY29uc3QgczNDbGllbnQgPSBuZXcgUzNDbGllbnQoeyBcbiAgcmVnaW9uOiBBV1NfUkVHSU9OLFxuICAvLyBOb3RlOiBBV1MgU0RLIHdpbGwgdXNlIEFXU19QUk9GSUxFIGVudmlyb25tZW50IHZhcmlhYmxlIGlmIHNldFxufSk7XG5cbmNvbnN0IGJlZHJvY2tDbGllbnQgPSBuZXcgQmVkcm9ja0FnZW50Q2xpZW50KHsgXG4gIHJlZ2lvbjogQVdTX1JFR0lPTiBcbn0pO1xuXG5pbnRlcmZhY2UgRXBpc29kZU1ldGFkYXRhIHtcbiAgZXBpc29kZTogbnVtYmVyO1xuICB0aXRsZTogc3RyaW5nO1xuICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICBwdWJsaWNhdGlvbkRhdGU6IHN0cmluZztcbiAgYXV0aG9yOiBzdHJpbmc7XG4gIGd1ZXN0czogQXJyYXk8e1xuICAgIG5hbWU6IHN0cmluZztcbiAgICB0aXRsZTogc3RyaW5nO1xuICAgIGxpbms6IHN0cmluZztcbiAgfT47XG4gIGxpbmtzOiBBcnJheTx7XG4gICAgdGV4dDogc3RyaW5nO1xuICAgIGxpbms6IHN0cmluZztcbiAgfT47XG59XG5cbmludGVyZmFjZSBUcmFuc2NyaXB0aW9uSlNPTiB7XG4gIHJlc3VsdHM6IHtcbiAgICB0cmFuc2NyaXB0czogQXJyYXk8e1xuICAgICAgdHJhbnNjcmlwdDogc3RyaW5nO1xuICAgIH0+O1xuICB9O1xufVxuXG5pbnRlcmZhY2UgUHJvY2Vzc2luZ1N0YXRzIHtcbiAgdG90YWw6IG51bWJlcjtcbiAgc3VjY2Vzc2Z1bDogbnVtYmVyO1xuICBmYWlsZWQ6IG51bWJlcjtcbiAgc2tpcHBlZDogbnVtYmVyO1xuICBmYWlsZWRFcGlzb2RlczogQXJyYXk8eyBlcGlzb2RlOiBudW1iZXI7IGVycm9yOiBzdHJpbmcgfT47XG59XG5cbi8qKlxuICogTWFpbiBleGVjdXRpb24gZnVuY3Rpb25cbiAqL1xuYXN5bmMgZnVuY3Rpb24gbWFpbigpIHtcbiAgY29uc29sZS5sb2coJz0nLnJlcGVhdCg4MCkpO1xuICBjb25zb2xlLmxvZygnSGlzdG9yaWNhbCBFcGlzb2RlIE1pZ3JhdGlvbiBTY3JpcHQnKTtcbiAgY29uc29sZS5sb2coJz0nLnJlcGVhdCg4MCkpO1xuICBjb25zb2xlLmxvZyhgQVdTIFJlZ2lvbjogJHtBV1NfUkVHSU9OfWApO1xuICBjb25zb2xlLmxvZyhgQVdTIFByb2ZpbGU6ICR7cHJvY2Vzcy5lbnYuQVdTX1BST0ZJTEUgfHwgJ2RlZmF1bHQnfWApO1xuICBjb25zb2xlLmxvZyhgUzMgQnVja2V0OiAke1MzX0JVQ0tFVH1gKTtcbiAgY29uc29sZS5sb2coYEJhdGNoIFNpemU6ICR7QkFUQ0hfU0laRX1gKTtcbiAgY29uc29sZS5sb2coJz0nLnJlcGVhdCg4MCkpO1xuICBjb25zb2xlLmxvZygnJyk7XG5cbiAgLy8gVmFsaWRhdGUgQVdTX1BST0ZJTEUgaXMgc2V0XG4gIGlmICghcHJvY2Vzcy5lbnYuQVdTX1BST0ZJTEUgfHwgcHJvY2Vzcy5lbnYuQVdTX1BST0ZJTEUgIT09IEFXU19QUk9GSUxFKSB7XG4gICAgY29uc29sZS5lcnJvcihgRVJST1I6IEFXU19QUk9GSUxFIGVudmlyb25tZW50IHZhcmlhYmxlIG11c3QgYmUgc2V0IHRvICcke0FXU19QUk9GSUxFfSdgKTtcbiAgICBjb25zb2xlLmVycm9yKGBVc2FnZTogQVdTX1BST0ZJTEU9JHtBV1NfUFJPRklMRX0gbnB4IHRzLW5vZGUgbWlncmF0ZS1oaXN0b3JpY2FsLWVwaXNvZGVzLnRzYCk7XG4gICAgcHJvY2Vzcy5leGl0KDEpO1xuICB9XG5cbiAgdHJ5IHtcbiAgICAvLyBTdGVwIDE6IExpc3QgYWxsIHRyYW5zY3JpcHRpb24gZmlsZXNcbiAgICBjb25zb2xlLmxvZygnU3RlcCAxOiBMaXN0aW5nIHRyYW5zY3JpcHRpb24gZmlsZXMgZnJvbSBTMy4uLicpO1xuICAgIGNvbnN0IHRyYW5zY3JpcHRpb25GaWxlcyA9IGF3YWl0IGxpc3RUcmFuc2NyaXB0aW9uRmlsZXMoKTtcbiAgICBjb25zb2xlLmxvZyhgRm91bmQgJHt0cmFuc2NyaXB0aW9uRmlsZXMubGVuZ3RofSB0cmFuc2NyaXB0aW9uIGZpbGVzYCk7XG4gICAgY29uc29sZS5sb2coJycpO1xuXG4gICAgaWYgKHRyYW5zY3JpcHRpb25GaWxlcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKCdObyB0cmFuc2NyaXB0aW9uIGZpbGVzIGZvdW5kLiBFeGl0aW5nLicpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFN0ZXAgMjogRXh0cmFjdCBlcGlzb2RlIG51bWJlcnNcbiAgICBjb25zb2xlLmxvZygnU3RlcCAyOiBFeHRyYWN0aW5nIGVwaXNvZGUgbnVtYmVycy4uLicpO1xuICAgIGNvbnN0IGVwaXNvZGVOdW1iZXJzID0gZXh0cmFjdEVwaXNvZGVOdW1iZXJzKHRyYW5zY3JpcHRpb25GaWxlcyk7XG4gICAgY29uc29sZS5sb2coYEV4dHJhY3RlZCAke2VwaXNvZGVOdW1iZXJzLmxlbmd0aH0gZXBpc29kZSBudW1iZXJzYCk7XG4gICAgY29uc29sZS5sb2coYEVwaXNvZGUgcmFuZ2U6ICR7TWF0aC5taW4oLi4uZXBpc29kZU51bWJlcnMpfSAtICR7TWF0aC5tYXgoLi4uZXBpc29kZU51bWJlcnMpfWApO1xuICAgIGNvbnNvbGUubG9nKCcnKTtcblxuICAgIC8vIENvbmZpcm0gYmVmb3JlIHByb2NlZWRpbmdcbiAgICBjb25zb2xlLmxvZyhgUmVhZHkgdG8gcHJvY2VzcyAke2VwaXNvZGVOdW1iZXJzLmxlbmd0aH0gZXBpc29kZXNgKTtcbiAgICBjb25zb2xlLmxvZygnUHJlc3MgQ3RybCtDIHRvIGNhbmNlbCwgb3IgdGhlIHNjcmlwdCB3aWxsIGNvbnRpbnVlIGluIDUgc2Vjb25kcy4uLicpO1xuICAgIGF3YWl0IHNsZWVwKDUwMDApO1xuICAgIGNvbnNvbGUubG9nKCcnKTtcblxuICAgIC8vIFN0ZXAgMzogUHJvY2VzcyBlcGlzb2RlcyAoaW1wbGVtZW50ZWQgaW4gdGFzayA3LjIpXG4gICAgY29uc29sZS5sb2coJ1N0ZXAgMzogUHJvY2Vzc2luZyBlcGlzb2RlcyBpbiBiYXRjaGVzLi4uJyk7XG4gICAgY29uc3Qgc3RhdHMgPSBhd2FpdCBwcm9jZXNzRXBpc29kZXNJbkJhdGNoZXMoZXBpc29kZU51bWJlcnMpO1xuICAgIGNvbnNvbGUubG9nKCcnKTtcblxuICAgIC8vIFN0ZXAgNDogUmVwb3J0IHJlc3VsdHNcbiAgICBjb25zb2xlLmxvZygnU3RlcCA0OiBQcm9jZXNzaW5nIGNvbXBsZXRlJyk7XG4gICAgY29uc29sZS5sb2coYFRvdGFsIGVwaXNvZGVzOiAke3N0YXRzLnRvdGFsfWApO1xuICAgIGNvbnNvbGUubG9nKGBTdWNjZXNzZnVsOiAke3N0YXRzLnN1Y2Nlc3NmdWx9YCk7XG4gICAgY29uc29sZS5sb2coYEZhaWxlZDogJHtzdGF0cy5mYWlsZWR9YCk7XG4gICAgY29uc29sZS5sb2coYFNraXBwZWQ6ICR7c3RhdHMuc2tpcHBlZH1gKTtcbiAgICBcbiAgICBpZiAoc3RhdHMuZmFpbGVkRXBpc29kZXMubGVuZ3RoID4gMCkge1xuICAgICAgY29uc29sZS5sb2coJycpO1xuICAgICAgY29uc29sZS5sb2coJ0ZhaWxlZCBlcGlzb2RlczonKTtcbiAgICAgIHN0YXRzLmZhaWxlZEVwaXNvZGVzLmZvckVhY2goKHsgZXBpc29kZSwgZXJyb3IgfSkgPT4ge1xuICAgICAgICBjb25zb2xlLmxvZyhgICAtIEVwaXNvZGUgJHtlcGlzb2RlfTogJHtlcnJvcn1gKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgICBjb25zb2xlLmxvZygnJyk7XG5cbiAgICAvLyBTdGVwIDU6IFRyaWdnZXIgZnVsbCBLbm93bGVkZ2UgQmFzZSBpbmdlc3Rpb25cbiAgICBpZiAoc3RhdHMuc3VjY2Vzc2Z1bCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKCdTdGVwIDU6IFRyaWdnZXJpbmcgZnVsbCBLbm93bGVkZ2UgQmFzZSBpbmdlc3Rpb24uLi4nKTtcbiAgICAgIGNvbnN0IGluZ2VzdGlvblJlc3VsdCA9IGF3YWl0IHRyaWdnZXJGdWxsSW5nZXN0aW9uKCk7XG4gICAgICBjb25zb2xlLmxvZygnJyk7XG4gICAgICBcbiAgICAgIC8vIFN0ZXAgNjogTW9uaXRvciBpbmdlc3Rpb24gam9iXG4gICAgICBjb25zb2xlLmxvZygnU3RlcCA2OiBNb25pdG9yaW5nIGluZ2VzdGlvbiBqb2IuLi4nKTtcbiAgICAgIGF3YWl0IG1vbml0b3JJbmdlc3Rpb25Kb2IoaW5nZXN0aW9uUmVzdWx0LmluZ2VzdGlvbkpvYklkKTtcbiAgICAgIGNvbnNvbGUubG9nKCcnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coJ1N0ZXAgNTogU2tpcHBpbmcgaW5nZXN0aW9uIChubyBkb2N1bWVudHMgcHJvY2Vzc2VkIHN1Y2Nlc3NmdWxseSknKTtcbiAgICAgIGNvbnNvbGUubG9nKCcnKTtcbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZygnPScucmVwZWF0KDgwKSk7XG4gICAgY29uc29sZS5sb2coJ01pZ3JhdGlvbiBzY3JpcHQgY29tcGxldGVkIHN1Y2Nlc3NmdWxseScpO1xuICAgIGNvbnNvbGUubG9nKCc9Jy5yZXBlYXQoODApKTtcblxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJycpO1xuICAgIGNvbnNvbGUuZXJyb3IoJz0nLnJlcGVhdCg4MCkpO1xuICAgIGNvbnNvbGUuZXJyb3IoJ0ZBVEFMIEVSUk9SOiBNaWdyYXRpb24gc2NyaXB0IGZhaWxlZCcpO1xuICAgIGNvbnNvbGUuZXJyb3IoJz0nLnJlcGVhdCg4MCkpO1xuICAgIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgfVxufVxuXG4vKipcbiAqIExpc3QgYWxsIHRyYW5zY3JpcHRpb24gZmlsZXMgaW4gUzNcbiAqIEZpbHRlcnMgZm9yIGZpbGVzIGVuZGluZyB3aXRoIC10cmFuc2NyaWJlLmpzb25cbiAqL1xuYXN5bmMgZnVuY3Rpb24gbGlzdFRyYW5zY3JpcHRpb25GaWxlcygpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG4gIGNvbnN0IHRyYW5zY3JpcHRpb25GaWxlczogc3RyaW5nW10gPSBbXTtcbiAgbGV0IGNvbnRpbnVhdGlvblRva2VuOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cbiAgdHJ5IHtcbiAgICBkbyB7XG4gICAgICBjb25zdCBjb21tYW5kID0gbmV3IExpc3RPYmplY3RzVjJDb21tYW5kKHtcbiAgICAgICAgQnVja2V0OiBTM19CVUNLRVQsXG4gICAgICAgIFByZWZpeDogVEVYVF9QUkVGSVgsXG4gICAgICAgIENvbnRpbnVhdGlvblRva2VuOiBjb250aW51YXRpb25Ub2tlblxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgczNDbGllbnQuc2VuZChjb21tYW5kKTtcblxuICAgICAgaWYgKHJlc3BvbnNlLkNvbnRlbnRzKSB7XG4gICAgICAgIGZvciAoY29uc3Qgb2JqZWN0IG9mIHJlc3BvbnNlLkNvbnRlbnRzKSB7XG4gICAgICAgICAgaWYgKG9iamVjdC5LZXkgJiYgb2JqZWN0LktleS5lbmRzV2l0aCgnLXRyYW5zY3JpYmUuanNvbicpKSB7XG4gICAgICAgICAgICB0cmFuc2NyaXB0aW9uRmlsZXMucHVzaChvYmplY3QuS2V5KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29udGludWF0aW9uVG9rZW4gPSByZXNwb25zZS5OZXh0Q29udGludWF0aW9uVG9rZW47XG5cbiAgICB9IHdoaWxlIChjb250aW51YXRpb25Ub2tlbik7XG5cbiAgICByZXR1cm4gdHJhbnNjcmlwdGlvbkZpbGVzLnNvcnQoKTtcblxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnN0IGVycm9yTWVzc2FnZSA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InO1xuICAgIHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIGxpc3QgdHJhbnNjcmlwdGlvbiBmaWxlcyBmcm9tIFMzOiAke2Vycm9yTWVzc2FnZX1gKTtcbiAgfVxufVxuXG4vKipcbiAqIEV4dHJhY3QgZXBpc29kZSBudW1iZXJzIGZyb20gUzMga2V5c1xuICogRXhhbXBsZTogdGV4dC8zNDEtdHJhbnNjcmliZS5qc29uIC0+IDM0MVxuICovXG5mdW5jdGlvbiBleHRyYWN0RXBpc29kZU51bWJlcnMoa2V5czogc3RyaW5nW10pOiBudW1iZXJbXSB7XG4gIGNvbnN0IGVwaXNvZGVOdW1iZXJzOiBudW1iZXJbXSA9IFtdO1xuXG4gIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgZmlsZW5hbWUgPSBrZXkuc3BsaXQoJy8nKS5wb3AoKSB8fCAnJztcbiAgICAgIGNvbnN0IGVwaXNvZGVTdHIgPSBmaWxlbmFtZS5zcGxpdCgnLScpWzBdO1xuICAgICAgY29uc3QgZXBpc29kZSA9IHBhcnNlSW50KGVwaXNvZGVTdHIsIDEwKTtcblxuICAgICAgaWYgKCFpc05hTihlcGlzb2RlKSkge1xuICAgICAgICBlcGlzb2RlTnVtYmVycy5wdXNoKGVwaXNvZGUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS53YXJuKGBXYXJuaW5nOiBDb3VsZCBub3QgZXh0cmFjdCBlcGlzb2RlIG51bWJlciBmcm9tOiAke2tleX1gKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS53YXJuKGBXYXJuaW5nOiBFcnJvciBwcm9jZXNzaW5nIGtleSAke2tleX06YCwgZXJyb3IpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBlcGlzb2RlTnVtYmVycy5zb3J0KChhLCBiKSA9PiBhIC0gYik7XG59XG5cbi8qKlxuICogU2xlZXAgZm9yIHNwZWNpZmllZCBtaWxsaXNlY29uZHNcbiAqL1xuZnVuY3Rpb24gc2xlZXAobXM6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuICByZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIG1zKSk7XG59XG5cbi8qKlxuICogUHJvY2VzcyBlcGlzb2RlcyBpbiBiYXRjaGVzXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIHByb2Nlc3NFcGlzb2Rlc0luQmF0Y2hlcyhlcGlzb2RlTnVtYmVyczogbnVtYmVyW10pOiBQcm9taXNlPFByb2Nlc3NpbmdTdGF0cz4ge1xuICBjb25zdCBzdGF0czogUHJvY2Vzc2luZ1N0YXRzID0ge1xuICAgIHRvdGFsOiBlcGlzb2RlTnVtYmVycy5sZW5ndGgsXG4gICAgc3VjY2Vzc2Z1bDogMCxcbiAgICBmYWlsZWQ6IDAsXG4gICAgc2tpcHBlZDogMCxcbiAgICBmYWlsZWRFcGlzb2RlczogW11cbiAgfTtcblxuICAvLyBGZXRjaCBSU1MgZmVlZCBvbmNlIGFuZCBjYWNoZVxuICBjb25zb2xlLmxvZygnRmV0Y2hpbmcgUlNTIGZlZWQuLi4nKTtcbiAgY29uc3QgcnNzRmVlZENhY2hlID0gYXdhaXQgZmV0Y2hBbmRDYWNoZVJTU0ZlZWQoKTtcbiAgY29uc29sZS5sb2coYENhY2hlZCBtZXRhZGF0YSBmb3IgJHtyc3NGZWVkQ2FjaGUuc2l6ZX0gZXBpc29kZXNgKTtcbiAgY29uc29sZS5sb2coJycpO1xuXG4gIC8vIFByb2Nlc3MgZXBpc29kZXMgaW4gYmF0Y2hlc1xuICBjb25zdCBiYXRjaGVzID0gY2h1bmtBcnJheShlcGlzb2RlTnVtYmVycywgQkFUQ0hfU0laRSk7XG4gIFxuICBmb3IgKGxldCBiYXRjaEluZGV4ID0gMDsgYmF0Y2hJbmRleCA8IGJhdGNoZXMubGVuZ3RoOyBiYXRjaEluZGV4KyspIHtcbiAgICBjb25zdCBiYXRjaCA9IGJhdGNoZXNbYmF0Y2hJbmRleF07XG4gICAgY29uc3QgYmF0Y2hOdW1iZXIgPSBiYXRjaEluZGV4ICsgMTtcbiAgICBcbiAgICBjb25zb2xlLmxvZyhgUHJvY2Vzc2luZyBiYXRjaCAke2JhdGNoTnVtYmVyfS8ke2JhdGNoZXMubGVuZ3RofSAoZXBpc29kZXMgJHtiYXRjaFswXX0tJHtiYXRjaFtiYXRjaC5sZW5ndGggLSAxXX0pLi4uYCk7XG4gICAgXG4gICAgZm9yIChjb25zdCBlcGlzb2RlTnVtYmVyIG9mIGJhdGNoKSB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCBwcm9jZXNzRXBpc29kZShlcGlzb2RlTnVtYmVyLCByc3NGZWVkQ2FjaGUpO1xuICAgICAgICBzdGF0cy5zdWNjZXNzZnVsKys7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBzdGF0cy5mYWlsZWQrKztcbiAgICAgICAgY29uc3QgZXJyb3JNZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcic7XG4gICAgICAgIHN0YXRzLmZhaWxlZEVwaXNvZGVzLnB1c2goeyBlcGlzb2RlOiBlcGlzb2RlTnVtYmVyLCBlcnJvcjogZXJyb3JNZXNzYWdlIH0pO1xuICAgICAgICBjb25zb2xlLmVycm9yKGAgIOKclyBFcGlzb2RlICR7ZXBpc29kZU51bWJlcn06ICR7ZXJyb3JNZXNzYWdlfWApO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICAvLyBQcm9ncmVzcyByZXBvcnRpbmcgZXZlcnkgYmF0Y2hcbiAgICBjb25zb2xlLmxvZyhgICBCYXRjaCAke2JhdGNoTnVtYmVyfSBjb21wbGV0ZTogJHtzdGF0cy5zdWNjZXNzZnVsfSBzdWNjZXNzZnVsLCAke3N0YXRzLmZhaWxlZH0gZmFpbGVkYCk7XG4gICAgY29uc29sZS5sb2coJycpO1xuICB9XG5cbiAgcmV0dXJuIHN0YXRzO1xufVxuXG4vKipcbiAqIFByb2Nlc3MgYSBzaW5nbGUgZXBpc29kZVxuICovXG5hc3luYyBmdW5jdGlvbiBwcm9jZXNzRXBpc29kZShcbiAgZXBpc29kZU51bWJlcjogbnVtYmVyLFxuICByc3NGZWVkQ2FjaGU6IE1hcDxudW1iZXIsIEVwaXNvZGVNZXRhZGF0YT5cbik6IFByb21pc2U8dm9pZD4ge1xuICAvLyBSZWFkIHRyYW5zY3JpcHRpb24gZnJvbSBTM1xuICAvLyBFcGlzb2RlcyAxLTk5IHVzZSB6ZXJvLXBhZGRlZCBmaWxlbmFtZXMgKDAwMSwgMDAyLCBldGMuKVxuICAvLyBFcGlzb2RlcyAxMDArIHVzZSByZWd1bGFyIG51bWJlcnMgKDEwMCwgMTAxLCBldGMuKVxuICBjb25zdCBwYWRkZWRFcGlzb2RlID0gZXBpc29kZU51bWJlciA8IDEwMCA/IGVwaXNvZGVOdW1iZXIudG9TdHJpbmcoKS5wYWRTdGFydCgzLCAnMCcpIDogZXBpc29kZU51bWJlci50b1N0cmluZygpO1xuICBjb25zdCB0cmFuc2NyaXB0aW9uS2V5ID0gYCR7VEVYVF9QUkVGSVh9JHtwYWRkZWRFcGlzb2RlfS10cmFuc2NyaWJlLmpzb25gO1xuICBjb25zdCB0cmFuc2NyaXB0aW9uVGV4dCA9IGF3YWl0IHJlYWRUcmFuc2NyaXB0aW9uRmlsZSh0cmFuc2NyaXB0aW9uS2V5KTtcblxuICAvLyBHZXQgbWV0YWRhdGEgZnJvbSBjYWNoZVxuICBjb25zdCBtZXRhZGF0YSA9IHJzc0ZlZWRDYWNoZS5nZXQoZXBpc29kZU51bWJlcikgfHwgZ2V0RGVmYXVsdE1ldGFkYXRhKGVwaXNvZGVOdW1iZXIpO1xuXG4gIC8vIEZvcm1hdCBkb2N1bWVudFxuICBjb25zdCBmb3JtYXR0ZWREb2N1bWVudCA9IGZvcm1hdERvY3VtZW50KGVwaXNvZGVOdW1iZXIsIHRyYW5zY3JpcHRpb25UZXh0LCBtZXRhZGF0YSk7XG5cbiAgLy8gV3JpdGUgZG9jdW1lbnQgdG8gUzNcbiAgYXdhaXQgd3JpdGVEb2N1bWVudFRvUzMoZXBpc29kZU51bWJlciwgZm9ybWF0dGVkRG9jdW1lbnQpO1xuXG4gIGNvbnNvbGUubG9nKGAgIOKckyBFcGlzb2RlICR7ZXBpc29kZU51bWJlcn06IERvY3VtZW50IGNyZWF0ZWRgKTtcbn1cblxuLyoqXG4gKiBGZXRjaCBhbmQgY2FjaGUgUlNTIGZlZWRcbiAqL1xuYXN5bmMgZnVuY3Rpb24gZmV0Y2hBbmRDYWNoZVJTU0ZlZWQoKTogUHJvbWlzZTxNYXA8bnVtYmVyLCBFcGlzb2RlTWV0YWRhdGE+PiB7XG4gIGNvbnN0IG1heFJldHJpZXMgPSAzO1xuICBsZXQgbGFzdEVycm9yOiBFcnJvciB8IG51bGwgPSBudWxsO1xuXG4gIGZvciAobGV0IGF0dGVtcHQgPSAxOyBhdHRlbXB0IDw9IG1heFJldHJpZXM7IGF0dGVtcHQrKykge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKFJTU19GRUVEX1VSTCk7XG4gICAgICBcbiAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBIVFRQICR7cmVzcG9uc2Uuc3RhdHVzfTogJHtyZXNwb25zZS5zdGF0dXNUZXh0fWApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCB4bWxUZXh0ID0gYXdhaXQgcmVzcG9uc2UudGV4dCgpO1xuICAgICAgcmV0dXJuIHBhcnNlUlNTRmVlZCh4bWxUZXh0KTtcblxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsYXN0RXJyb3IgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IgOiBuZXcgRXJyb3IoJ1Vua25vd24gZXJyb3InKTtcbiAgICAgIGNvbnNvbGUud2FybihgICBXYXJuaW5nOiBSU1MgZmV0Y2ggYXR0ZW1wdCAke2F0dGVtcHR9LyR7bWF4UmV0cmllc30gZmFpbGVkOiAke2xhc3RFcnJvci5tZXNzYWdlfWApO1xuICAgICAgXG4gICAgICBpZiAoYXR0ZW1wdCA8IG1heFJldHJpZXMpIHtcbiAgICAgICAgY29uc3QgZGVsYXlNcyA9IE1hdGgucG93KDIsIGF0dGVtcHQgLSAxKSAqIDEwMDA7XG4gICAgICAgIGF3YWl0IHNsZWVwKGRlbGF5TXMpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGNvbnNvbGUuZXJyb3IoYCAgRXJyb3I6IEZhaWxlZCB0byBmZXRjaCBSU1MgZmVlZCBhZnRlciAke21heFJldHJpZXN9IGF0dGVtcHRzYCk7XG4gIGNvbnNvbGUuZXJyb3IoYCAgQ29udGludWluZyB3aXRoIGRlZmF1bHQgbWV0YWRhdGEgZm9yIGFsbCBlcGlzb2Rlc2ApO1xuICByZXR1cm4gbmV3IE1hcCgpO1xufVxuXG4vKipcbiAqIFBhcnNlIFJTUyBmZWVkIFhNTCBhbmQgZXh0cmFjdCBlcGlzb2RlIG1ldGFkYXRhXG4gKi9cbmZ1bmN0aW9uIHBhcnNlUlNTRmVlZCh4bWxUZXh0OiBzdHJpbmcpOiBNYXA8bnVtYmVyLCBFcGlzb2RlTWV0YWRhdGE+IHtcbiAgY29uc3QgZXBpc29kZU1hcCA9IG5ldyBNYXA8bnVtYmVyLCBFcGlzb2RlTWV0YWRhdGE+KCk7XG5cbiAgdHJ5IHtcbiAgICAvLyBTaW1wbGUgWE1MIHBhcnNpbmcgdXNpbmcgcmVnZXhcbiAgICBjb25zdCBpdGVtUmVnZXggPSAvPGl0ZW0+KFtcXHNcXFNdKj8pPFxcL2l0ZW0+L2c7XG4gICAgY29uc3QgaXRlbXMgPSB4bWxUZXh0Lm1hdGNoKGl0ZW1SZWdleCkgfHwgW107XG5cbiAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgaXRlbXMpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIC8vIEV4dHJhY3QgZXBpc29kZSBudW1iZXJcbiAgICAgICAgY29uc3QgZXBpc29kZU1hdGNoID0gaXRlbS5tYXRjaCgvPGl0dW5lczplcGlzb2RlPihcXGQrKTxcXC9pdHVuZXM6ZXBpc29kZT4vKTtcbiAgICAgICAgaWYgKCFlcGlzb2RlTWF0Y2gpIGNvbnRpbnVlO1xuICAgICAgICBjb25zdCBlcGlzb2RlID0gcGFyc2VJbnQoZXBpc29kZU1hdGNoWzFdLCAxMCk7XG5cbiAgICAgICAgLy8gRXh0cmFjdCB0aXRsZVxuICAgICAgICBjb25zdCB0aXRsZU1hdGNoID0gaXRlbS5tYXRjaCgvPHRpdGxlPjwhXFxbQ0RBVEFcXFsoLio/KVxcXVxcXT48XFwvdGl0bGU+Lyk7XG4gICAgICAgIGNvbnN0IHRpdGxlID0gdGl0bGVNYXRjaCA/IHRpdGxlTWF0Y2hbMV0gOiBgRXBpc29kZSAke2VwaXNvZGV9YDtcblxuICAgICAgICAvLyBFeHRyYWN0IGRlc2NyaXB0aW9uXG4gICAgICAgIGNvbnN0IGRlc2NNYXRjaCA9IGl0ZW0ubWF0Y2goLzxkZXNjcmlwdGlvbj48IVxcW0NEQVRBXFxbKC4qPylcXF1cXF0+PFxcL2Rlc2NyaXB0aW9uPi8pO1xuICAgICAgICBjb25zdCBkZXNjcmlwdGlvbiA9IGRlc2NNYXRjaCA/IGRlc2NNYXRjaFsxXSA6ICcnO1xuXG4gICAgICAgIC8vIEV4dHJhY3QgcHVibGljYXRpb24gZGF0ZVxuICAgICAgICBjb25zdCBwdWJEYXRlTWF0Y2ggPSBpdGVtLm1hdGNoKC88cHViRGF0ZT4oLio/KTxcXC9wdWJEYXRlPi8pO1xuICAgICAgICBjb25zdCBwdWJsaWNhdGlvbkRhdGUgPSBwdWJEYXRlTWF0Y2ggPyBuZXcgRGF0ZShwdWJEYXRlTWF0Y2hbMV0pLnRvSVNPU3RyaW5nKCkgOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG5cbiAgICAgICAgLy8gRXh0cmFjdCBhdXRob3JcbiAgICAgICAgY29uc3QgYXV0aG9yTWF0Y2ggPSBpdGVtLm1hdGNoKC88aXR1bmVzOmF1dGhvcj4oLio/KTxcXC9pdHVuZXM6YXV0aG9yPi8pO1xuICAgICAgICBjb25zdCBhdXRob3IgPSBhdXRob3JNYXRjaCA/IGF1dGhvck1hdGNoWzFdIDogJ1PDqWJhc3RpZW4gU3Rvcm1hY3EnO1xuXG4gICAgICAgIC8vIEV4dHJhY3QgZ3Vlc3RzXG4gICAgICAgIGNvbnN0IGd1ZXN0czogQXJyYXk8eyBuYW1lOiBzdHJpbmc7IHRpdGxlOiBzdHJpbmc7IGxpbms6IHN0cmluZyB9PiA9IFtdO1xuICAgICAgICBjb25zdCBndWVzdFJlZ2V4ID0gLzxpdHVuZXM6Z3Vlc3Q+KFtcXHNcXFNdKj8pPFxcL2l0dW5lczpndWVzdD4vZztcbiAgICAgICAgbGV0IGd1ZXN0TWF0Y2g7XG4gICAgICAgIHdoaWxlICgoZ3Vlc3RNYXRjaCA9IGd1ZXN0UmVnZXguZXhlYyhpdGVtKSkgIT09IG51bGwpIHtcbiAgICAgICAgICBjb25zdCBndWVzdFhtbCA9IGd1ZXN0TWF0Y2hbMV07XG4gICAgICAgICAgY29uc3QgbmFtZU1hdGNoID0gZ3Vlc3RYbWwubWF0Y2goLzxuYW1lPiguKj8pPFxcL25hbWU+Lyk7XG4gICAgICAgICAgY29uc3QgdGl0bGVNYXRjaCA9IGd1ZXN0WG1sLm1hdGNoKC88dGl0bGU+KC4qPyk8XFwvdGl0bGU+Lyk7XG4gICAgICAgICAgY29uc3QgbGlua01hdGNoID0gZ3Vlc3RYbWwubWF0Y2goLzxsaW5rPiguKj8pPFxcL2xpbms+Lyk7XG5cbiAgICAgICAgICBpZiAobmFtZU1hdGNoKSB7XG4gICAgICAgICAgICBndWVzdHMucHVzaCh7XG4gICAgICAgICAgICAgIG5hbWU6IG5hbWVNYXRjaFsxXSxcbiAgICAgICAgICAgICAgdGl0bGU6IHRpdGxlTWF0Y2ggPyB0aXRsZU1hdGNoWzFdIDogJycsXG4gICAgICAgICAgICAgIGxpbms6IGxpbmtNYXRjaCA/IGxpbmtNYXRjaFsxXSA6ICcnXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBFeHRyYWN0IGxpbmtzXG4gICAgICAgIGNvbnN0IGxpbmtzOiBBcnJheTx7IHRleHQ6IHN0cmluZzsgbGluazogc3RyaW5nIH0+ID0gW107XG4gICAgICAgIGNvbnN0IGxpbmtNYXRjaCA9IGl0ZW0ubWF0Y2goLzxsaW5rPiguKj8pPFxcL2xpbms+Lyk7XG4gICAgICAgIGlmIChsaW5rTWF0Y2gpIHtcbiAgICAgICAgICBsaW5rcy5wdXNoKHtcbiAgICAgICAgICAgIHRleHQ6ICdFcGlzb2RlIFBhZ2UnLFxuICAgICAgICAgICAgbGluazogbGlua01hdGNoWzFdXG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBlcGlzb2RlTWFwLnNldChlcGlzb2RlLCB7XG4gICAgICAgICAgZXBpc29kZSxcbiAgICAgICAgICB0aXRsZSxcbiAgICAgICAgICBkZXNjcmlwdGlvbixcbiAgICAgICAgICBwdWJsaWNhdGlvbkRhdGUsXG4gICAgICAgICAgYXV0aG9yLFxuICAgICAgICAgIGd1ZXN0cyxcbiAgICAgICAgICBsaW5rc1xuICAgICAgICB9KTtcblxuICAgICAgfSBjYXRjaCAoaXRlbUVycm9yKSB7XG4gICAgICAgIC8vIENvbnRpbnVlIHByb2Nlc3Npbmcgb3RoZXIgaXRlbXNcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gZXBpc29kZU1hcDtcblxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHBhcnNpbmcgUlNTIGZlZWQgWE1MOicsIGVycm9yKTtcbiAgICByZXR1cm4gbmV3IE1hcCgpO1xuICB9XG59XG5cbi8qKlxuICogUmVhZCBhbmQgcGFyc2UgdHJhbnNjcmlwdGlvbiBKU09OIGZpbGUgZnJvbSBTM1xuICovXG5hc3luYyBmdW5jdGlvbiByZWFkVHJhbnNjcmlwdGlvbkZpbGUoa2V5OiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuICBjb25zdCBtYXhSZXRyaWVzID0gMztcbiAgbGV0IGxhc3RFcnJvcjogRXJyb3IgfCBudWxsID0gbnVsbDtcblxuICBmb3IgKGxldCBhdHRlbXB0ID0gMTsgYXR0ZW1wdCA8PSBtYXhSZXRyaWVzOyBhdHRlbXB0KyspIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgY29tbWFuZCA9IG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgQnVja2V0OiBTM19CVUNLRVQsXG4gICAgICAgIEtleToga2V5XG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBzM0NsaWVudC5zZW5kKGNvbW1hbmQpO1xuICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHJlc3BvbnNlLkJvZHkhLnRyYW5zZm9ybVRvU3RyaW5nKCk7XG5cbiAgICAgIC8vIFBhcnNlIEpTT04gc3RydWN0dXJlXG4gICAgICBjb25zdCB0cmFuc2NyaXB0SnNvbjogVHJhbnNjcmlwdGlvbkpTT04gPSBKU09OLnBhcnNlKGNvbnRlbnQpO1xuXG4gICAgICAvLyBWYWxpZGF0ZSB0cmFuc2NyaXB0IHN0cnVjdHVyZVxuICAgICAgaWYgKCF0cmFuc2NyaXB0SnNvbi5yZXN1bHRzPy50cmFuc2NyaXB0cz8uWzBdPy50cmFuc2NyaXB0KSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCB0cmFuc2NyaXB0aW9uIHN0cnVjdHVyZScpO1xuICAgICAgfVxuXG4gICAgICBjb25zdCB0cmFuc2NyaXB0VGV4dCA9IHRyYW5zY3JpcHRKc29uLnJlc3VsdHMudHJhbnNjcmlwdHNbMF0udHJhbnNjcmlwdDtcblxuICAgICAgaWYgKCF0cmFuc2NyaXB0VGV4dCB8fCB0cmFuc2NyaXB0VGV4dC50cmltKCkubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignRW1wdHkgdHJhbnNjcmlwdCB0ZXh0Jyk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB0cmFuc2NyaXB0VGV4dDtcblxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsYXN0RXJyb3IgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IgOiBuZXcgRXJyb3IoJ1Vua25vd24gZXJyb3InKTtcbiAgICAgIFxuICAgICAgaWYgKGF0dGVtcHQgPCBtYXhSZXRyaWVzKSB7XG4gICAgICAgIGNvbnN0IGRlbGF5TXMgPSBNYXRoLnBvdygyLCBhdHRlbXB0IC0gMSkgKiAxMDAwO1xuICAgICAgICBhd2FpdCBzbGVlcChkZWxheU1zKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICB0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byByZWFkIHRyYW5zY3JpcHRpb24gYWZ0ZXIgJHttYXhSZXRyaWVzfSBhdHRlbXB0czogJHtsYXN0RXJyb3I/Lm1lc3NhZ2V9YCk7XG59XG5cbi8qKlxuICogRm9ybWF0IGRvY3VtZW50IHdpdGggbWV0YWRhdGEgYW5kIHRyYW5zY3JpcHRpb25cbiAqIFxuICogTk9URTogVHJhbnNjcmlwdGlvbiBjb21lcyBGSVJTVCB0byBhdm9pZCBCZWRyb2NrIGV4dHJhY3RpbmcgdG9vIG11Y2ggbWV0YWRhdGEuXG4gKiBTMyBWZWN0b3JzIGhhcyBhIDIwNDggYnl0ZSBsaW1pdCBmb3IgZmlsdGVyYWJsZSBtZXRhZGF0YSwgYW5kIEJlZHJvY2sgZXh0cmFjdHNcbiAqIGV2ZXJ5dGhpbmcgYmVmb3JlIHRoZSBtYWluIGNvbnRlbnQgYXMgbWV0YWRhdGEuXG4gKi9cbmZ1bmN0aW9uIGZvcm1hdERvY3VtZW50KFxuICBlcGlzb2RlTnVtYmVyOiBudW1iZXIsXG4gIHRyYW5zY3JpcHRpb25UZXh0OiBzdHJpbmcsXG4gIG1ldGFkYXRhOiBFcGlzb2RlTWV0YWRhdGFcbik6IHN0cmluZyB7XG4gIGNvbnN0IHNlY3Rpb25zOiBzdHJpbmdbXSA9IFtdO1xuXG4gIC8vIFB1dCB0cmFuc2NyaXB0aW9uIEZJUlNUIHRvIGF2b2lkIG1ldGFkYXRhIGV4dHJhY3Rpb24gaXNzdWVzXG4gIHNlY3Rpb25zLnB1c2godHJhbnNjcmlwdGlvblRleHQpO1xuICBzZWN0aW9ucy5wdXNoKCcnKTtcbiAgc2VjdGlvbnMucHVzaCgnLS0tJyk7XG4gIHNlY3Rpb25zLnB1c2goJycpO1xuXG4gIC8vIE1ldGFkYXRhIHNlY3Rpb24gQUZURVIgdHJhbnNjcmlwdGlvblxuICBzZWN0aW9ucy5wdXNoKGBFcGlzb2RlOiAke2VwaXNvZGVOdW1iZXJ9YCk7XG4gIHNlY3Rpb25zLnB1c2goYFRpdGxlOiAke21ldGFkYXRhLnRpdGxlfWApO1xuICBzZWN0aW9ucy5wdXNoKGBEYXRlOiAke21ldGFkYXRhLnB1YmxpY2F0aW9uRGF0ZX1gKTtcbiAgc2VjdGlvbnMucHVzaChgQXV0aG9yOiAke21ldGFkYXRhLmF1dGhvcn1gKTtcblxuICAvLyBHdWVzdHNcbiAgaWYgKG1ldGFkYXRhLmd1ZXN0cyAmJiBtZXRhZGF0YS5ndWVzdHMubGVuZ3RoID4gMCkge1xuICAgIGNvbnN0IGd1ZXN0TmFtZXMgPSBtZXRhZGF0YS5ndWVzdHMubWFwKGd1ZXN0ID0+IGd1ZXN0Lm5hbWUpLmpvaW4oJywgJyk7XG4gICAgc2VjdGlvbnMucHVzaChgR3Vlc3RzOiAke2d1ZXN0TmFtZXN9YCk7XG4gIH1cblxuICAvLyBEZXNjcmlwdGlvblxuICBpZiAobWV0YWRhdGEuZGVzY3JpcHRpb24gJiYgbWV0YWRhdGEuZGVzY3JpcHRpb24gIT09ICdEZXNjcmlwdGlvbiBub3QgYXZhaWxhYmxlJykge1xuICAgIHNlY3Rpb25zLnB1c2goJycpO1xuICAgIHNlY3Rpb25zLnB1c2goJ0Rlc2NyaXB0aW9uOicpO1xuICAgIHNlY3Rpb25zLnB1c2gobWV0YWRhdGEuZGVzY3JpcHRpb24pO1xuICB9XG5cbiAgLy8gTGlua3NcbiAgaWYgKG1ldGFkYXRhLmxpbmtzICYmIG1ldGFkYXRhLmxpbmtzLmxlbmd0aCA+IDApIHtcbiAgICBzZWN0aW9ucy5wdXNoKCcnKTtcbiAgICBzZWN0aW9ucy5wdXNoKCdSZWxhdGVkIExpbmtzOicpO1xuICAgIG1ldGFkYXRhLmxpbmtzLmZvckVhY2gobGluayA9PiB7XG4gICAgICBzZWN0aW9ucy5wdXNoKGAtICR7bGluay50ZXh0fTogJHtsaW5rLmxpbmt9YCk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBHdWVzdCBkZXRhaWxzXG4gIGlmIChtZXRhZGF0YS5ndWVzdHMgJiYgbWV0YWRhdGEuZ3Vlc3RzLmxlbmd0aCA+IDApIHtcbiAgICBjb25zdCBndWVzdHNXaXRoRGV0YWlscyA9IG1ldGFkYXRhLmd1ZXN0cy5maWx0ZXIoZyA9PiBnLnRpdGxlIHx8IGcubGluayk7XG4gICAgaWYgKGd1ZXN0c1dpdGhEZXRhaWxzLmxlbmd0aCA+IDApIHtcbiAgICAgIHNlY3Rpb25zLnB1c2goJycpO1xuICAgICAgc2VjdGlvbnMucHVzaCgnR3Vlc3QgRGV0YWlsczonKTtcbiAgICAgIGd1ZXN0c1dpdGhEZXRhaWxzLmZvckVhY2goZ3Vlc3QgPT4ge1xuICAgICAgICBjb25zdCBkZXRhaWxzOiBzdHJpbmdbXSA9IFtndWVzdC5uYW1lXTtcbiAgICAgICAgaWYgKGd1ZXN0LnRpdGxlKSBkZXRhaWxzLnB1c2goZ3Vlc3QudGl0bGUpO1xuICAgICAgICBpZiAoZ3Vlc3QubGluaykgZGV0YWlscy5wdXNoKGd1ZXN0LmxpbmspO1xuICAgICAgICBzZWN0aW9ucy5wdXNoKGAtICR7ZGV0YWlscy5qb2luKCcgLSAnKX1gKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBzZWN0aW9ucy5qb2luKCdcXG4nKTtcbn1cblxuLyoqXG4gKiBXcml0ZSBmb3JtYXR0ZWQgZG9jdW1lbnQgdG8gUzMga2ItZG9jdW1lbnRzLyBwcmVmaXhcbiAqL1xuYXN5bmMgZnVuY3Rpb24gd3JpdGVEb2N1bWVudFRvUzMoXG4gIGVwaXNvZGVOdW1iZXI6IG51bWJlcixcbiAgZG9jdW1lbnQ6IHN0cmluZ1xuKTogUHJvbWlzZTx2b2lkPiB7XG4gIGNvbnN0IGRvY3VtZW50S2V5ID0gYCR7S0JfRE9DVU1FTlRTX1BSRUZJWH0ke2VwaXNvZGVOdW1iZXJ9LnR4dGA7XG4gIFxuICBjb25zdCBtYXhSZXRyaWVzID0gMztcbiAgbGV0IGxhc3RFcnJvcjogRXJyb3IgfCBudWxsID0gbnVsbDtcblxuICBmb3IgKGxldCBhdHRlbXB0ID0gMTsgYXR0ZW1wdCA8PSBtYXhSZXRyaWVzOyBhdHRlbXB0KyspIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgY29tbWFuZCA9IG5ldyBQdXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgQnVja2V0OiBTM19CVUNLRVQsXG4gICAgICAgIEtleTogZG9jdW1lbnRLZXksXG4gICAgICAgIEJvZHk6IGRvY3VtZW50LFxuICAgICAgICBDb250ZW50VHlwZTogJ3RleHQvcGxhaW47IGNoYXJzZXQ9dXRmLTgnXG4gICAgICB9KTtcblxuICAgICAgYXdhaXQgczNDbGllbnQuc2VuZChjb21tYW5kKTtcbiAgICAgIHJldHVybjtcblxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsYXN0RXJyb3IgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IgOiBuZXcgRXJyb3IoJ1Vua25vd24gZXJyb3InKTtcbiAgICAgIFxuICAgICAgaWYgKGF0dGVtcHQgPCBtYXhSZXRyaWVzKSB7XG4gICAgICAgIGNvbnN0IGRlbGF5TXMgPSBNYXRoLnBvdygyLCBhdHRlbXB0IC0gMSkgKiAxMDAwO1xuICAgICAgICBhd2FpdCBzbGVlcChkZWxheU1zKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICB0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byB3cml0ZSBkb2N1bWVudCB0byBTMyBhZnRlciAke21heFJldHJpZXN9IGF0dGVtcHRzOiAke2xhc3RFcnJvcj8ubWVzc2FnZX1gKTtcbn1cblxuLyoqXG4gKiBHZXQgZGVmYXVsdCBtZXRhZGF0YSB3aGVuIFJTUyBmZWVkIGlzIHVuYXZhaWxhYmxlXG4gKi9cbmZ1bmN0aW9uIGdldERlZmF1bHRNZXRhZGF0YShlcGlzb2RlTnVtYmVyOiBudW1iZXIpOiBFcGlzb2RlTWV0YWRhdGEge1xuICByZXR1cm4ge1xuICAgIGVwaXNvZGU6IGVwaXNvZGVOdW1iZXIsXG4gICAgdGl0bGU6IGBFcGlzb2RlICR7ZXBpc29kZU51bWJlcn1gLFxuICAgIGRlc2NyaXB0aW9uOiAnRGVzY3JpcHRpb24gbm90IGF2YWlsYWJsZScsXG4gICAgcHVibGljYXRpb25EYXRlOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgYXV0aG9yOiAnU8OpYmFzdGllbiBTdG9ybWFjcScsXG4gICAgZ3Vlc3RzOiBbXSxcbiAgICBsaW5rczogW11cbiAgfTtcbn1cblxuLyoqXG4gKiBTcGxpdCBhcnJheSBpbnRvIGNodW5rc1xuICovXG5mdW5jdGlvbiBjaHVua0FycmF5PFQ+KGFycmF5OiBUW10sIGNodW5rU2l6ZTogbnVtYmVyKTogVFtdW10ge1xuICBjb25zdCBjaHVua3M6IFRbXVtdID0gW107XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgYXJyYXkubGVuZ3RoOyBpICs9IGNodW5rU2l6ZSkge1xuICAgIGNodW5rcy5wdXNoKGFycmF5LnNsaWNlKGksIGkgKyBjaHVua1NpemUpKTtcbiAgfVxuICByZXR1cm4gY2h1bmtzO1xufVxuXG4vKipcbiAqIFRyaWdnZXIgZnVsbCBLbm93bGVkZ2UgQmFzZSBpbmdlc3Rpb24gam9iXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIHRyaWdnZXJGdWxsSW5nZXN0aW9uKCk6IFByb21pc2U8eyBpbmdlc3Rpb25Kb2JJZDogc3RyaW5nIH0+IHtcbiAgY29uc3Qga25vd2xlZGdlQmFzZUlkID0gcHJvY2Vzcy5lbnYuS05PV0xFREdFX0JBU0VfSUQgfHwgJ09UNEpVMkZaWkYnO1xuICBjb25zdCBkYXRhU291cmNlSWQgPSBwcm9jZXNzLmVudi5EQVRBX1NPVVJDRV9JRCB8fCAnQ1ZIWEJENjhBWSc7XG5cbiAgaWYgKCFrbm93bGVkZ2VCYXNlSWQgfHwgIWRhdGFTb3VyY2VJZCkge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0VSUk9SOiBNaXNzaW5nIHJlcXVpcmVkIGVudmlyb25tZW50IHZhcmlhYmxlcycpO1xuICAgIGNvbnNvbGUuZXJyb3IoJ1BsZWFzZSBzZXQgS05PV0xFREdFX0JBU0VfSUQgYW5kIERBVEFfU09VUkNFX0lEJyk7XG4gICAgY29uc29sZS5lcnJvcignJyk7XG4gICAgY29uc29sZS5lcnJvcignWW91IGNhbiBnZXQgdGhlc2UgdmFsdWVzIGZyb20gdGhlIENsb3VkRm9ybWF0aW9uIHN0YWNrIG91dHB1dHM6Jyk7XG4gICAgY29uc29sZS5lcnJvcignICBhd3MgY2xvdWRmb3JtYXRpb24gZGVzY3JpYmUtc3RhY2tzIC0tc3RhY2stbmFtZSBQb2RjYXN0S25vd2xlZGdlQmFzZVN0YWNrIC0tcHJvZmlsZSBwb2RjYXN0IC0tcmVnaW9uIGV1LWNlbnRyYWwtMScpO1xuICAgIHRocm93IG5ldyBFcnJvcignTWlzc2luZyByZXF1aXJlZCBlbnZpcm9ubWVudCB2YXJpYWJsZXM6IEtOT1dMRURHRV9CQVNFX0lEIGFuZCBEQVRBX1NPVVJDRV9JRCcpO1xuICB9XG5cbiAgY29uc29sZS5sb2coYEtub3dsZWRnZSBCYXNlIElEOiAke2tub3dsZWRnZUJhc2VJZH1gKTtcbiAgY29uc29sZS5sb2coYERhdGEgU291cmNlIElEOiAke2RhdGFTb3VyY2VJZH1gKTtcblxuICBjb25zdCBtYXhSZXRyaWVzID0gMztcbiAgbGV0IGxhc3RFcnJvcjogRXJyb3IgfCBudWxsID0gbnVsbDtcblxuICBmb3IgKGxldCBhdHRlbXB0ID0gMTsgYXR0ZW1wdCA8PSBtYXhSZXRyaWVzOyBhdHRlbXB0KyspIHtcbiAgICB0cnkge1xuICAgICAgY29uc29sZS5sb2coYFN0YXJ0aW5nIGluZ2VzdGlvbiBqb2IgKGF0dGVtcHQgJHthdHRlbXB0fS8ke21heFJldHJpZXN9KS4uLmApO1xuXG4gICAgICBjb25zdCBjb21tYW5kID0gbmV3IFN0YXJ0SW5nZXN0aW9uSm9iQ29tbWFuZCh7XG4gICAgICAgIGtub3dsZWRnZUJhc2VJZCxcbiAgICAgICAgZGF0YVNvdXJjZUlkXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBiZWRyb2NrQ2xpZW50LnNlbmQoY29tbWFuZCk7XG4gICAgICBcbiAgICAgIGNvbnN0IGluZ2VzdGlvbkpvYklkID0gcmVzcG9uc2UuaW5nZXN0aW9uSm9iPy5pbmdlc3Rpb25Kb2JJZDtcbiAgICAgIFxuICAgICAgaWYgKCFpbmdlc3Rpb25Kb2JJZCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0luZ2VzdGlvbiBqb2Igc3RhcnRlZCBidXQgbm8gam9iIElEIHJldHVybmVkJyk7XG4gICAgICB9XG5cbiAgICAgIGNvbnNvbGUubG9nKGDinJMgSW5nZXN0aW9uIGpvYiBzdGFydGVkOiAke2luZ2VzdGlvbkpvYklkfWApO1xuICAgICAgcmV0dXJuIHsgaW5nZXN0aW9uSm9iSWQgfTtcblxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsYXN0RXJyb3IgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IgOiBuZXcgRXJyb3IoJ1Vua25vd24gZXJyb3InKTtcbiAgICAgIGNvbnN0IGVycm9yTWVzc2FnZSA9IGxhc3RFcnJvci5tZXNzYWdlO1xuICAgICAgXG4gICAgICBjb25zb2xlLmVycm9yKGDinJcgQXR0ZW1wdCAke2F0dGVtcHR9IGZhaWxlZDogJHtlcnJvck1lc3NhZ2V9YCk7XG5cbiAgICAgIGlmIChhdHRlbXB0IDwgbWF4UmV0cmllcykge1xuICAgICAgICBjb25zdCBkZWxheU1zID0gTWF0aC5wb3coMiwgYXR0ZW1wdCAtIDEpICogMTAwMDtcbiAgICAgICAgY29uc29sZS5sb2coYCAgUmV0cnlpbmcgaW4gJHtkZWxheU1zfW1zLi4uYCk7XG4gICAgICAgIGF3YWl0IHNsZWVwKGRlbGF5TXMpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIHN0YXJ0IGluZ2VzdGlvbiBqb2IgYWZ0ZXIgJHttYXhSZXRyaWVzfSBhdHRlbXB0czogJHtsYXN0RXJyb3I/Lm1lc3NhZ2V9YCk7XG59XG5cbi8qKlxuICogTW9uaXRvciBpbmdlc3Rpb24gam9iIHN0YXR1cyB1bnRpbCBjb21wbGV0aW9uXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIG1vbml0b3JJbmdlc3Rpb25Kb2IoaW5nZXN0aW9uSm9iSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICBjb25zdCBrbm93bGVkZ2VCYXNlSWQgPSBwcm9jZXNzLmVudi5LTk9XTEVER0VfQkFTRV9JRCB8fCAnT1Q0SlUyRlpaRic7XG4gIGNvbnN0IGRhdGFTb3VyY2VJZCA9IHByb2Nlc3MuZW52LkRBVEFfU09VUkNFX0lEIHx8ICdDVkhYQkQ2OEFZJztcblxuICBpZiAoIWtub3dsZWRnZUJhc2VJZCB8fCAhZGF0YVNvdXJjZUlkKSB7XG4gICAgY29uc29sZS5lcnJvcignRVJST1I6IE1pc3NpbmcgcmVxdWlyZWQgZW52aXJvbm1lbnQgdmFyaWFibGVzIGZvciBtb25pdG9yaW5nJyk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgbWF4UG9sbHMgPSAxMjA7IC8vIFBvbGwgZm9yIHVwIHRvIDEwIG1pbnV0ZXMgKDEyMCAqIDUgc2Vjb25kcylcbiAgY29uc3QgcG9sbEludGVydmFsTXMgPSA1MDAwOyAvLyA1IHNlY29uZHNcblxuICBjb25zb2xlLmxvZyhgTW9uaXRvcmluZyBpbmdlc3Rpb24gam9iOiAke2luZ2VzdGlvbkpvYklkfWApO1xuICBjb25zb2xlLmxvZygnVGhpcyBtYXkgdGFrZSBzZXZlcmFsIG1pbnV0ZXMuLi4nKTtcbiAgY29uc29sZS5sb2coJycpO1xuXG4gIGxldCBsYXN0U3RhdHVzID0gJyc7XG5cbiAgZm9yIChsZXQgcG9sbCA9IDE7IHBvbGwgPD0gbWF4UG9sbHM7IHBvbGwrKykge1xuICAgIHRyeSB7XG4gICAgICAvLyBXYWl0IGJlZm9yZSBwb2xsaW5nIChleGNlcHQgZmlyc3QgaXRlcmF0aW9uKVxuICAgICAgaWYgKHBvbGwgPiAxKSB7XG4gICAgICAgIGF3YWl0IHNsZWVwKHBvbGxJbnRlcnZhbE1zKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgY29tbWFuZCA9IG5ldyBHZXRJbmdlc3Rpb25Kb2JDb21tYW5kKHtcbiAgICAgICAga25vd2xlZGdlQmFzZUlkLFxuICAgICAgICBkYXRhU291cmNlSWQsXG4gICAgICAgIGluZ2VzdGlvbkpvYklkXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBiZWRyb2NrQ2xpZW50LnNlbmQoY29tbWFuZCk7XG4gICAgICBjb25zdCBzdGF0dXMgPSByZXNwb25zZS5pbmdlc3Rpb25Kb2I/LnN0YXR1cztcbiAgICAgIGNvbnN0IHN0YXRpc3RpY3MgPSByZXNwb25zZS5pbmdlc3Rpb25Kb2I/LnN0YXRpc3RpY3M7XG5cbiAgICAgIC8vIE9ubHkgbG9nIHN0YXR1cyBjaGFuZ2VzIHRvIHJlZHVjZSBub2lzZVxuICAgICAgaWYgKHN0YXR1cyAhPT0gbGFzdFN0YXR1cykge1xuICAgICAgICBjb25zdCB0aW1lc3RhbXAgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGBbJHt0aW1lc3RhbXB9XSBTdGF0dXM6ICR7c3RhdHVzfWApO1xuICAgICAgICBcbiAgICAgICAgaWYgKHN0YXRpc3RpY3MpIHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhgICBEb2N1bWVudHMgc2Nhbm5lZDogJHtzdGF0aXN0aWNzLm51bWJlck9mRG9jdW1lbnRzU2Nhbm5lZCB8fCAwfWApO1xuICAgICAgICAgIGNvbnNvbGUubG9nKGAgIERvY3VtZW50cyBmYWlsZWQ6ICR7c3RhdGlzdGljcy5udW1iZXJPZkRvY3VtZW50c0ZhaWxlZCB8fCAwfWApO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBsYXN0U3RhdHVzID0gc3RhdHVzIHx8ICcnO1xuICAgICAgfVxuXG4gICAgICAvLyBDaGVjayBpZiBqb2IgY29tcGxldGVkXG4gICAgICBpZiAoc3RhdHVzID09PSAnQ09NUExFVEUnKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCcnKTtcbiAgICAgICAgY29uc29sZS5sb2coJ+KckyBJbmdlc3Rpb24gam9iIGNvbXBsZXRlZCBzdWNjZXNzZnVsbHknKTtcbiAgICAgICAgY29uc29sZS5sb2coJycpO1xuICAgICAgICBjb25zb2xlLmxvZygnQ29tcGxldGlvbiBzdGF0aXN0aWNzOicpO1xuICAgICAgICBjb25zb2xlLmxvZyhgICBEb2N1bWVudHMgc2Nhbm5lZDogJHtzdGF0aXN0aWNzPy5udW1iZXJPZkRvY3VtZW50c1NjYW5uZWQgfHwgMH1gKTtcbiAgICAgICAgY29uc29sZS5sb2coYCAgRG9jdW1lbnRzIGZhaWxlZDogJHtzdGF0aXN0aWNzPy5udW1iZXJPZkRvY3VtZW50c0ZhaWxlZCB8fCAwfWApO1xuICAgICAgICBjb25zb2xlLmxvZyhgICBUb3RhbCBwcm9jZXNzaW5nIHRpbWU6ICR7TWF0aC5yb3VuZCgocG9sbCAqIHBvbGxJbnRlcnZhbE1zKSAvIDEwMDApfSBzZWNvbmRzYCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgLy8gQ2hlY2sgaWYgam9iIGZhaWxlZFxuICAgICAgaWYgKHN0YXR1cyA9PT0gJ0ZBSUxFRCcpIHtcbiAgICAgICAgY29uc3QgZmFpbHVyZVJlYXNvbnMgPSByZXNwb25zZS5pbmdlc3Rpb25Kb2I/LmZhaWx1cmVSZWFzb25zIHx8IFtdO1xuICAgICAgICBcbiAgICAgICAgY29uc29sZS5sb2coJycpO1xuICAgICAgICBjb25zb2xlLmVycm9yKCfinJcgSW5nZXN0aW9uIGpvYiBmYWlsZWQnKTtcbiAgICAgICAgY29uc29sZS5lcnJvcignJyk7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWx1cmUgcmVhc29uczonKTtcbiAgICAgICAgZmFpbHVyZVJlYXNvbnMuZm9yRWFjaChyZWFzb24gPT4ge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYCAgLSAke3JlYXNvbn1gKTtcbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICBpZiAoc3RhdGlzdGljcykge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJycpO1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ1N0YXRpc3RpY3M6Jyk7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihgICBEb2N1bWVudHMgc2Nhbm5lZDogJHtzdGF0aXN0aWNzLm51bWJlck9mRG9jdW1lbnRzU2Nhbm5lZCB8fCAwfWApO1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYCAgRG9jdW1lbnRzIGZhaWxlZDogJHtzdGF0aXN0aWNzLm51bWJlck9mRG9jdW1lbnRzRmFpbGVkIHx8IDB9YCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEluZ2VzdGlvbiBqb2IgZmFpbGVkOiAke2ZhaWx1cmVSZWFzb25zLmpvaW4oJywgJyl9YCk7XG4gICAgICB9XG5cbiAgICAgIC8vIFNob3cgcHJvZ3Jlc3MgaW5kaWNhdG9yIGZvciBsb25nLXJ1bm5pbmcgam9ic1xuICAgICAgaWYgKHBvbGwgJSAxMiA9PT0gMCkgeyAvLyBFdmVyeSBtaW51dGVcbiAgICAgICAgY29uc29sZS5sb2coYCAgU3RpbGwgJHtzdGF0dXN9Li4uICgke01hdGgucm91bmQoKHBvbGwgKiBwb2xsSW50ZXJ2YWxNcykgLyAxMDAwKX1zIGVsYXBzZWQpYCk7XG4gICAgICB9XG5cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc3QgZXJyb3JNZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcic7XG4gICAgICBcbiAgICAgIC8vIElmIHRoaXMgaXMgYSBmYWlsdXJlIHdlIGFscmVhZHkgbG9nZ2VkLCByZS10aHJvdyBpdFxuICAgICAgaWYgKGVycm9yIGluc3RhbmNlb2YgRXJyb3IgJiYgZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnSW5nZXN0aW9uIGpvYiBmYWlsZWQnKSkge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cblxuICAgICAgY29uc29sZS5lcnJvcignJyk7XG4gICAgICBjb25zb2xlLmVycm9yKGDinJcgRXJyb3IgcG9sbGluZyBpbmdlc3Rpb24gam9iIHN0YXR1czogJHtlcnJvck1lc3NhZ2V9YCk7XG4gICAgICBjb25zb2xlLmVycm9yKCdUaGUgaW5nZXN0aW9uIGpvYiBtYXkgc3RpbGwgYmUgcnVubmluZy4gQ2hlY2sgQVdTIGNvbnNvbGUgZm9yIHN0YXR1cy4nKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gIH1cblxuICAvLyBSZWFjaGVkIG1heCBwb2xscyB3aXRob3V0IGNvbXBsZXRpb25cbiAgY29uc29sZS5sb2coJycpO1xuICBjb25zb2xlLndhcm4oJ+KaoCBJbmdlc3Rpb24gam9iIG1vbml0b3JpbmcgdGltZWQgb3V0Jyk7XG4gIGNvbnNvbGUud2FybihgVGhlIGpvYiBtYXkgc3RpbGwgYmUgcnVubmluZy4gQ2hlY2sgc3RhdHVzIG1hbnVhbGx5OmApO1xuICBjb25zb2xlLndhcm4oYCAgYXdzIGJlZHJvY2stYWdlbnQgZ2V0LWluZ2VzdGlvbi1qb2IgXFxcXGApO1xuICBjb25zb2xlLndhcm4oYCAgICAtLWtub3dsZWRnZS1iYXNlLWlkICR7a25vd2xlZGdlQmFzZUlkfSBcXFxcYCk7XG4gIGNvbnNvbGUud2FybihgICAgIC0tZGF0YS1zb3VyY2UtaWQgJHtkYXRhU291cmNlSWR9IFxcXFxgKTtcbiAgY29uc29sZS53YXJuKGAgICAgLS1pbmdlc3Rpb24tam9iLWlkICR7aW5nZXN0aW9uSm9iSWR9IFxcXFxgKTtcbiAgY29uc29sZS53YXJuKGAgICAgLS1wcm9maWxlIHBvZGNhc3QgLS1yZWdpb24gZXUtY2VudHJhbC0xYCk7XG59XG5cbi8vIFJ1biB0aGUgc2NyaXB0XG5pZiAocmVxdWlyZS5tYWluID09PSBtb2R1bGUpIHtcbiAgbWFpbigpLmNhdGNoKGVycm9yID0+IHtcbiAgICBjb25zb2xlLmVycm9yKCdVbmhhbmRsZWQgZXJyb3I6JywgZXJyb3IpO1xuICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgfSk7XG59XG5cbi8vIEV4cG9ydCBmdW5jdGlvbnMgZm9yIHRlc3RpbmdcbmV4cG9ydCB7XG4gIGxpc3RUcmFuc2NyaXB0aW9uRmlsZXMsXG4gIGV4dHJhY3RFcGlzb2RlTnVtYmVycyxcbiAgcHJvY2Vzc0VwaXNvZGVzSW5CYXRjaGVzLFxuICBmZXRjaEFuZENhY2hlUlNTRmVlZCxcbiAgcGFyc2VSU1NGZWVkLFxuICBmb3JtYXREb2N1bWVudCxcbiAgZ2V0RGVmYXVsdE1ldGFkYXRhLFxuICB0cmlnZ2VyRnVsbEluZ2VzdGlvbixcbiAgbW9uaXRvckluZ2VzdGlvbkpvYlxufTtcbiJdfQ==