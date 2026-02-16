import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { BedrockAgentClient, StartIngestionJobCommand, GetIngestionJobCommand } from '@aws-sdk/client-bedrock-agent';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const s3Client = new S3Client({ region: process.env.AWS_REGION });
const bedrockClient = new BedrockAgentClient({ region: process.env.AWS_REGION });
const snsClient = new SNSClient({ region: process.env.AWS_REGION });

interface EventBridgeEvent {
  // When invoked via EventBridge with InputPath: $.detail,
  // the Lambda receives the detail content directly (no wrapper).
  // Support both shapes for resilience.
  bucket?: {
    name: string;
  };
  object?: {
    key: string;
  };
  detail?: {
    bucket?: {
      name: string;
    };
    object?: {
      key: string;
    };
  };
}

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

/**
 * Lambda handler for processing transcription files and creating Knowledge Base documents
 */
export const handler = async (event: EventBridgeEvent): Promise<any> => {
  console.log('Processing document processor event:', JSON.stringify(event, null, 2));

  let episodeNumber: number | undefined;

  try {
    // Parse S3 event - support both direct detail content (InputPath: $.detail)
    // and full EventBridge event shapes
    const bucket = event.bucket?.name || event.detail?.bucket?.name || 'aws-french-podcast-media';
    const key = event.object?.key || event.detail?.object?.key;

    if (!key) {
      throw new Error('Missing object key in event');
    }

    console.log(`Processing file: s3://${bucket}/${key}`);

    // Validate that the file is a transcription file
    if (!key.endsWith('-transcribe.json')) {
      console.log('Skipping non-transcription file:', key);
      return {
        skipped: true,
        reason: 'Not a transcription file',
        key: key,
        success: true
      };
    }

    // Validate that the file is in the text/ folder
    if (!key.startsWith('text/')) {
      console.log('Skipping file outside text/ folder:', key);
      return {
        skipped: true,
        reason: 'File not in text/ folder',
        key: key,
        success: true
      };
    }

    // Extract episode number from S3 key
    episodeNumber = extractEpisodeNumber(key);
    console.log(`Extracted episode number: ${episodeNumber}`);

    // Read transcription file from S3
    const transcriptionText = await readTranscriptionFile(bucket, key);
    console.log(`Successfully extracted transcription text, length: ${transcriptionText.length}`);

    // Fetch episode metadata from RSS feed
    const metadata = await fetchEpisodeMetadata(episodeNumber);
    console.log(`Successfully fetched metadata for episode ${episodeNumber}`);

    // Format document with transcription and metadata
    const formattedDocument = formatDocument(episodeNumber, transcriptionText, metadata);
    console.log(`Formatted document, length: ${formattedDocument.length}`);

    // Write document to S3 kb-documents/ prefix
    const documentKey = await writeDocumentToS3(bucket, episodeNumber, formattedDocument);
    console.log(`Successfully wrote document to: ${documentKey}`);

    // Trigger Bedrock Knowledge Base ingestion job
    const ingestionJobId = await triggerIngestionJob();
    console.log(`Successfully triggered ingestion job: ${ingestionJobId}`);

    // Monitor ingestion job status
    await monitorIngestionJob(ingestionJobId, episodeNumber);

    return {
      success: true,
      episodeNumber,
      documentKey,
      ingestionJobId,
      transcriptionKey: key
    };

  } catch (error) {
    // Log detailed error information with context
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    const errorType = error instanceof Error ? error.constructor.name : 'UnknownError';

    console.error('ERROR: Failed to process document', {
      episodeNumber: episodeNumber || 'unknown',
      errorType,
      errorMessage,
      errorStack,
      timestamp: new Date().toISOString()
    });

    throw new Error(`Failed to process document: ${errorMessage}`);
  }
};

/**
 * Extract episode number from S3 key
 * Example: text/341-transcribe.json -> 341
 */
function extractEpisodeNumber(key: string): number {
  const filename = key.split('/').pop() || '';
  const episodeStr = filename.split('-')[0];
  const episode = parseInt(episodeStr, 10);

  if (isNaN(episode)) {
    throw new Error(`Could not extract valid episode number from key: ${key}`);
  }

  return episode;
}

/**
 * Read and parse transcription JSON file from S3
 * Note: The key parameter should already include the correct zero-padding if needed
 */
async function readTranscriptionFile(bucket: string, key: string): Promise<string> {
  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key
    });

    const response = await s3Client.send(command);
    const content = await response.Body!.transformToString();

    // Parse JSON structure
    let transcriptJson: TranscriptionJSON;
    try {
      transcriptJson = JSON.parse(content);
    } catch (parseError) {
      const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown error';
      console.error('ERROR: Malformed JSON in transcription file', {
        errorType: 'JSONParseError',
        errorMessage,
        key,
        timestamp: new Date().toISOString()
      });
      throw new Error(`Malformed JSON in transcription file: ${errorMessage}`);
    }

    // Validate transcript structure
    if (!transcriptJson.results || 
        !transcriptJson.results.transcripts || 
        !transcriptJson.results.transcripts[0] ||
        !transcriptJson.results.transcripts[0].transcript) {
      console.error('ERROR: Invalid transcription structure', {
        errorType: 'ValidationError',
        errorMessage: 'Missing results.transcripts[0].transcript',
        key,
        timestamp: new Date().toISOString()
      });
      throw new Error('Transcription file does not have expected structure (missing results.transcripts[0].transcript)');
    }

    // Extract and return the transcript text
    const transcriptText = transcriptJson.results.transcripts[0].transcript;

    if (!transcriptText || transcriptText.trim().length === 0) {
      console.error('ERROR: Empty transcript text', {
        errorType: 'ValidationError',
        errorMessage: 'Transcript text is empty',
        key,
        timestamp: new Date().toISOString()
      });
      throw new Error('Transcript text is empty');
    }

    return transcriptText;

  } catch (error) {
    if (error instanceof Error && error.message.includes('Malformed JSON')) {
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('ERROR: Failed to read transcription file from S3', {
      errorType: 'S3ReadError',
      errorMessage,
      bucket,
      key,
      timestamp: new Date().toISOString()
    });
    throw new Error(`Failed to read transcription file from S3: ${errorMessage}`);
  }
}

// Cache for RSS feed data (in-memory for Lambda execution)
let rssFeedCache: Map<number, EpisodeMetadata> | null = null;
let rssFeedCacheTimestamp: number = 0;
const RSS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch episode metadata from RSS feed
 */
async function fetchEpisodeMetadata(episodeNumber: number): Promise<EpisodeMetadata> {
  try {
    // Check if cache is valid
    const now = Date.now();
    if (rssFeedCache && (now - rssFeedCacheTimestamp) < RSS_CACHE_TTL) {
      const cachedMetadata = rssFeedCache.get(episodeNumber);
      if (cachedMetadata) {
        console.log(`Using cached metadata for episode ${episodeNumber}`);
        return cachedMetadata;
      }
    }

    // Fetch and parse RSS feed
    console.log('Fetching RSS feed from https://francais.podcast.go-aws.com/web/feed.xml');
    const response = await fetch('https://francais.podcast.go-aws.com/web/feed.xml');
    
    if (!response.ok) {
      throw new Error(`Failed to fetch RSS feed: ${response.status} ${response.statusText}`);
    }

    const xmlText = await response.text();
    
    // Parse RSS feed and build cache
    rssFeedCache = parseRSSFeed(xmlText);
    rssFeedCacheTimestamp = now;

    // Get metadata for requested episode
    const metadata = rssFeedCache.get(episodeNumber);
    
    if (!metadata) {
      console.warn('WARNING: Episode not found in RSS feed, using defaults', {
        episodeNumber,
        timestamp: new Date().toISOString()
      });
      return getDefaultMetadata(episodeNumber);
    }

    return metadata;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('ERROR: Failed to fetch RSS feed, using defaults', {
      errorType: 'RSSFetchError',
      errorMessage,
      episodeNumber,
      timestamp: new Date().toISOString()
    });
    return getDefaultMetadata(episodeNumber);
  }
}

/**
 * Parse RSS feed XML and extract episode metadata
 */
function parseRSSFeed(xmlText: string): Map<number, EpisodeMetadata> {
  const episodeMap = new Map<number, EpisodeMetadata>();

  try {
    // Simple XML parsing using regex (for production, consider using a proper XML parser)
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
        console.error('Error parsing RSS item:', itemError);
        // Continue processing other items
      }
    }

    console.log(`Successfully parsed ${episodeMap.size} episodes from RSS feed`);
    return episodeMap;

  } catch (error) {
    console.error('Error parsing RSS feed XML:', error);
    return new Map();
  }
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
  bucket: string,
  episodeNumber: number,
  document: string
): Promise<string> {
  const documentKey = `kb-documents/${episodeNumber}.txt`;
  
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Writing document to S3 (attempt ${attempt}/${maxRetries}): ${documentKey}`);

      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: documentKey,
        Body: document,
        ContentType: 'text/plain; charset=utf-8'
      });

      await s3Client.send(command);
      
      console.log(`Successfully wrote document to: s3://${bucket}/${documentKey}`);
      return documentKey;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      const errorMessage = lastError.message;
      
      console.error(`ERROR: S3 write attempt ${attempt} failed`, {
        errorType: 'S3WriteError',
        errorMessage,
        bucket,
        documentKey,
        episodeNumber,
        attempt,
        maxRetries,
        timestamp: new Date().toISOString()
      });

      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const delayMs = Math.pow(2, attempt - 1) * 1000;
        console.log(`Retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  console.error('ERROR: Failed to write document to S3 after all retries', {
    errorType: 'S3WriteError',
    errorMessage: lastError?.message,
    bucket,
    documentKey,
    episodeNumber,
    maxRetries,
    timestamp: new Date().toISOString()
  });

  throw new Error(`Failed to write document to S3 after ${maxRetries} attempts: ${lastError?.message}`);
}

/**
 * Trigger Bedrock Knowledge Base ingestion job
 */
async function triggerIngestionJob(): Promise<string> {
  const knowledgeBaseId = process.env.KNOWLEDGE_BASE_ID;
  const dataSourceId = process.env.DATA_SOURCE_ID;

  if (!knowledgeBaseId || !dataSourceId) {
    console.error('ERROR: Missing required environment variables', {
      errorType: 'ConfigurationError',
      errorMessage: 'KNOWLEDGE_BASE_ID and DATA_SOURCE_ID must be set',
      timestamp: new Date().toISOString()
    });
    throw new Error('Missing required environment variables: KNOWLEDGE_BASE_ID and DATA_SOURCE_ID');
  }

  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Starting ingestion job (attempt ${attempt}/${maxRetries})`);

      const command = new StartIngestionJobCommand({
        knowledgeBaseId,
        dataSourceId
      });

      const response = await bedrockClient.send(command);
      
      const ingestionJobId = response.ingestionJob?.ingestionJobId;
      
      if (!ingestionJobId) {
        throw new Error('Ingestion job started but no job ID returned');
      }

      console.log(`Successfully started ingestion job: ${ingestionJobId}`);
      return ingestionJobId;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      const errorMessage = lastError.message;
      
      console.error(`ERROR: Ingestion job start attempt ${attempt} failed`, {
        errorType: 'IngestionJobError',
        errorMessage,
        knowledgeBaseId,
        dataSourceId,
        attempt,
        maxRetries,
        timestamp: new Date().toISOString()
      });

      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const delayMs = Math.pow(2, attempt - 1) * 1000;
        console.log(`Retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  console.error('ERROR: Failed to start ingestion job after all retries', {
    errorType: 'IngestionJobError',
    errorMessage: lastError?.message,
    knowledgeBaseId,
    dataSourceId,
    maxRetries,
    timestamp: new Date().toISOString()
  });

  throw new Error(`Failed to start ingestion job after ${maxRetries} attempts: ${lastError?.message}`);
}

/**
 * Monitor ingestion job status until completion
 */
async function monitorIngestionJob(ingestionJobId: string, episodeNumber: number): Promise<void> {
  const knowledgeBaseId = process.env.KNOWLEDGE_BASE_ID;
  const dataSourceId = process.env.DATA_SOURCE_ID;
  const alertTopicArn = process.env.ALERT_TOPIC_ARN;

  if (!knowledgeBaseId || !dataSourceId) {
    console.error('ERROR: Missing required environment variables for monitoring', {
      errorType: 'ConfigurationError',
      timestamp: new Date().toISOString()
    });
    return;
  }

  const maxPolls = 60; // Poll for up to 5 minutes (60 * 5 seconds)
  const pollIntervalMs = 5000; // 5 seconds

  console.log(`Starting to monitor ingestion job: ${ingestionJobId}`);

  for (let poll = 1; poll <= maxPolls; poll++) {
    try {
      // Wait before polling (except first iteration)
      if (poll > 1) {
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      }

      const command = new GetIngestionJobCommand({
        knowledgeBaseId,
        dataSourceId,
        ingestionJobId
      });

      const response = await bedrockClient.send(command);
      const status = response.ingestionJob?.status;
      const statistics = response.ingestionJob?.statistics;

      console.log(`Ingestion job status (poll ${poll}/${maxPolls}): ${status}`, {
        ingestionJobId,
        status,
        statistics,
        timestamp: new Date().toISOString()
      });

      // Check if job completed
      if (status === 'COMPLETE') {
        console.log('Ingestion job completed successfully', {
          ingestionJobId,
          episodeNumber,
          statistics,
          documentsScanned: statistics?.numberOfDocumentsScanned,
          documentsFailed: statistics?.numberOfDocumentsFailed,
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Check if job failed
      if (status === 'FAILED') {
        const failureReasons = response.ingestionJob?.failureReasons || [];
        
        console.error('ERROR: Ingestion job failed', {
          errorType: 'IngestionJobFailure',
          ingestionJobId,
          episodeNumber,
          failureReasons,
          statistics,
          timestamp: new Date().toISOString()
        });

        // Send SNS notification on failure
        if (alertTopicArn) {
          await sendIngestionFailureAlert(ingestionJobId, episodeNumber, failureReasons);
        }

        throw new Error(`Ingestion job failed: ${failureReasons.join(', ')}`);
      }

      // Continue polling if status is IN_PROGRESS or STARTING
      if (status !== 'IN_PROGRESS' && status !== 'STARTING') {
        console.warn(`WARNING: Unexpected ingestion job status: ${status}`, {
          ingestionJobId,
          episodeNumber,
          status,
          timestamp: new Date().toISOString()
        });
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // If this is a failure we already logged, re-throw it
      if (error instanceof Error && error.message.includes('Ingestion job failed')) {
        throw error;
      }

      console.error('ERROR: Failed to poll ingestion job status', {
        errorType: 'IngestionJobMonitoringError',
        errorMessage,
        ingestionJobId,
        episodeNumber,
        poll,
        timestamp: new Date().toISOString()
      });

      // Don't fail the entire Lambda on monitoring errors
      // The ingestion job may still succeed
      return;
    }
  }

  // Reached max polls without completion
  console.warn('WARNING: Ingestion job monitoring timed out', {
    ingestionJobId,
    episodeNumber,
    maxPolls,
    pollIntervalMs,
    timestamp: new Date().toISOString()
  });
}

/**
 * Send SNS alert for ingestion job failure
 */
async function sendIngestionFailureAlert(
  ingestionJobId: string,
  episodeNumber: number,
  failureReasons: string[]
): Promise<void> {
  const alertTopicArn = process.env.ALERT_TOPIC_ARN;

  if (!alertTopicArn) {
    console.warn('WARNING: ALERT_TOPIC_ARN not set, skipping SNS notification');
    return;
  }

  try {
    const message = `
Bedrock Knowledge Base Ingestion Job Failed

Episode Number: ${episodeNumber}
Ingestion Job ID: ${ingestionJobId}
Failure Reasons: ${failureReasons.join(', ')}
Timestamp: ${new Date().toISOString()}

Please investigate the failure and retry if necessary.
    `.trim();

    const command = new PublishCommand({
      TopicArn: alertTopicArn,
      Subject: `[ALERT] Knowledge Base Ingestion Failed - Episode ${episodeNumber}`,
      Message: message
    });

    await snsClient.send(command);
    
    console.log('Successfully sent ingestion failure alert to SNS', {
      ingestionJobId,
      episodeNumber,
      alertTopicArn,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('ERROR: Failed to send SNS alert', {
      errorType: 'SNSPublishError',
      errorMessage,
      ingestionJobId,
      episodeNumber,
      timestamp: new Date().toISOString()
    });
    // Don't throw - SNS failure shouldn't fail the Lambda
  }
}
