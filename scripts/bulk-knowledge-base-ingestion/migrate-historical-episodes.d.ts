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
interface ProcessingStats {
    total: number;
    successful: number;
    failed: number;
    skipped: number;
    failedEpisodes: Array<{
        episode: number;
        error: string;
    }>;
}
/**
 * List all transcription files in S3
 * Filters for files ending with -transcribe.json
 */
declare function listTranscriptionFiles(): Promise<string[]>;
/**
 * Extract episode numbers from S3 keys
 * Example: text/341-transcribe.json -> 341
 */
declare function extractEpisodeNumbers(keys: string[]): number[];
/**
 * Process episodes in batches
 */
declare function processEpisodesInBatches(episodeNumbers: number[]): Promise<ProcessingStats>;
/**
 * Fetch and cache RSS feed
 */
declare function fetchAndCacheRSSFeed(): Promise<Map<number, EpisodeMetadata>>;
/**
 * Parse RSS feed XML and extract episode metadata
 */
declare function parseRSSFeed(xmlText: string): Map<number, EpisodeMetadata>;
/**
 * Format document with metadata and transcription
 *
 * NOTE: Transcription comes FIRST to avoid Bedrock extracting too much metadata.
 * S3 Vectors has a 2048 byte limit for filterable metadata, and Bedrock extracts
 * everything before the main content as metadata.
 */
declare function formatDocument(episodeNumber: number, transcriptionText: string, metadata: EpisodeMetadata): string;
/**
 * Get default metadata when RSS feed is unavailable
 */
declare function getDefaultMetadata(episodeNumber: number): EpisodeMetadata;
/**
 * Trigger full Knowledge Base ingestion job
 */
declare function triggerFullIngestion(): Promise<{
    ingestionJobId: string;
}>;
/**
 * Monitor ingestion job status until completion
 */
declare function monitorIngestionJob(ingestionJobId: string): Promise<void>;
export { listTranscriptionFiles, extractEpisodeNumbers, processEpisodesInBatches, fetchAndCacheRSSFeed, parseRSSFeed, formatDocument, getDefaultMetadata, triggerFullIngestion, monitorIngestionJob };
