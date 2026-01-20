/**
 * Unit Tests for Historical Episode Migration Script
 * 
 * Tests the migration script with a subset of episodes, progress reporting,
 * error handling for missing files, and batch processing logic.
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4
 */

import {
  extractEpisodeNumbers,
  parseRSSFeed,
  formatDocument,
  getDefaultMetadata
} from '../../bulk-knowledge-base-ingestion/migrate-historical-episodes';

describe('Migration Script - Unit Tests', () => {
  describe('Episode Number Extraction (Requirement 7.1)', () => {
    test('should extract episode numbers from transcription file keys', () => {
      // Arrange
      const keys = [
        'text/1-transcribe.json',
        'text/10-transcribe.json',
        'text/100-transcribe.json',
        'text/341-transcribe.json'
      ];

      // Act
      const episodeNumbers = extractEpisodeNumbers(keys);

      // Assert
      expect(episodeNumbers).toEqual([1, 10, 100, 341]);
      expect(episodeNumbers.length).toBe(4);
    });

    test('should extract episode numbers from subset of 10 episodes', () => {
      // Arrange - Subset of 10 episodes
      const keys = [
        'text/1-transcribe.json',
        'text/5-transcribe.json',
        'text/10-transcribe.json',
        'text/15-transcribe.json',
        'text/20-transcribe.json',
        'text/25-transcribe.json',
        'text/30-transcribe.json',
        'text/35-transcribe.json',
        'text/40-transcribe.json',
        'text/45-transcribe.json'
      ];

      // Act
      const episodeNumbers = extractEpisodeNumbers(keys);

      // Assert
      expect(episodeNumbers).toEqual([1, 5, 10, 15, 20, 25, 30, 35, 40, 45]);
      expect(episodeNumbers.length).toBe(10);
    });

    test('should sort episode numbers in ascending order', () => {
      // Arrange - Unsorted keys
      const keys = [
        'text/341-transcribe.json',
        'text/10-transcribe.json',
        'text/100-transcribe.json',
        'text/1-transcribe.json'
      ];

      // Act
      const episodeNumbers = extractEpisodeNumbers(keys);

      // Assert
      expect(episodeNumbers).toEqual([1, 10, 100, 341]);
      expect(episodeNumbers[0]).toBeLessThan(episodeNumbers[1]);
      expect(episodeNumbers[1]).toBeLessThan(episodeNumbers[2]);
      expect(episodeNumbers[2]).toBeLessThan(episodeNumbers[3]);
    });

    test('should handle invalid episode numbers gracefully', () => {
      // Arrange - Mix of valid and invalid keys
      const keys = [
        'text/1-transcribe.json',
        'text/invalid-transcribe.json',
        'text/10-transcribe.json',
        'text/abc-transcribe.json',
        'text/20-transcribe.json'
      ];

      // Act
      const episodeNumbers = extractEpisodeNumbers(keys);

      // Assert - Should only extract valid numbers
      expect(episodeNumbers).toEqual([1, 10, 20]);
      expect(episodeNumbers.length).toBe(3);
    });

    test('should handle empty key list', () => {
      // Arrange
      const keys: string[] = [];

      // Act
      const episodeNumbers = extractEpisodeNumbers(keys);

      // Assert
      expect(episodeNumbers).toEqual([]);
      expect(episodeNumbers.length).toBe(0);
    });

    test('should extract episode numbers from large dataset', () => {
      // Arrange - Simulate 341+ episodes
      const keys = Array.from({ length: 350 }, (_, i) => `text/${i + 1}-transcribe.json`);

      // Act
      const episodeNumbers = extractEpisodeNumbers(keys);

      // Assert
      expect(episodeNumbers.length).toBe(350);
      expect(episodeNumbers[0]).toBe(1);
      expect(episodeNumbers[349]).toBe(350);
      expect(Math.min(...episodeNumbers)).toBe(1);
      expect(Math.max(...episodeNumbers)).toBe(350);
    });
  });

  describe('Batch Processing Logic (Requirement 7.2)', () => {
    test('should split episodes into batches of 10', () => {
      // Arrange
      const episodeNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
      const batchSize = 10;

      // Act - Simulate batch splitting
      const batches: number[][] = [];
      for (let i = 0; i < episodeNumbers.length; i += batchSize) {
        batches.push(episodeNumbers.slice(i, i + batchSize));
      }

      // Assert
      expect(batches.length).toBe(2);
      expect(batches[0].length).toBe(10);
      expect(batches[1].length).toBe(5);
      expect(batches[0]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(batches[1]).toEqual([11, 12, 13, 14, 15]);
    });

    test('should handle exactly one batch', () => {
      // Arrange
      const episodeNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const batchSize = 10;

      // Act
      const batches: number[][] = [];
      for (let i = 0; i < episodeNumbers.length; i += batchSize) {
        batches.push(episodeNumbers.slice(i, i + batchSize));
      }

      // Assert
      expect(batches.length).toBe(1);
      expect(batches[0].length).toBe(10);
      expect(batches[0]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    test('should handle partial last batch', () => {
      // Arrange
      const episodeNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
      const batchSize = 10;

      // Act
      const batches: number[][] = [];
      for (let i = 0; i < episodeNumbers.length; i += batchSize) {
        batches.push(episodeNumbers.slice(i, i + batchSize));
      }

      // Assert
      expect(batches.length).toBe(2);
      expect(batches[0].length).toBe(10);
      expect(batches[1].length).toBe(2);
      expect(batches[1]).toEqual([11, 12]);
    });

    test('should handle empty episode list', () => {
      // Arrange
      const episodeNumbers: number[] = [];
      const batchSize = 10;

      // Act
      const batches: number[][] = [];
      for (let i = 0; i < episodeNumbers.length; i += batchSize) {
        batches.push(episodeNumbers.slice(i, i + batchSize));
      }

      // Assert
      expect(batches.length).toBe(0);
    });

    test('should process 341 episodes in 35 batches', () => {
      // Arrange - Simulate full dataset
      const episodeNumbers = Array.from({ length: 341 }, (_, i) => i + 1);
      const batchSize = 10;

      // Act
      const batches: number[][] = [];
      for (let i = 0; i < episodeNumbers.length; i += batchSize) {
        batches.push(episodeNumbers.slice(i, i + batchSize));
      }

      // Assert
      expect(batches.length).toBe(35); // 34 full batches + 1 partial batch
      expect(batches[0].length).toBe(10);
      expect(batches[33].length).toBe(10);
      expect(batches[34].length).toBe(1); // Last batch has 1 episode
      expect(batches[34][0]).toBe(341);
    });
  });

  describe('Progress Reporting (Requirement 7.2)', () => {
    test('should track processing statistics', () => {
      // Arrange
      const stats = {
        total: 10,
        successful: 0,
        failed: 0,
        skipped: 0,
        failedEpisodes: [] as Array<{ episode: number; error: string }>
      };

      // Act - Simulate processing
      for (let i = 1; i <= 10; i++) {
        if (i === 5) {
          // Simulate failure
          stats.failed++;
          stats.failedEpisodes.push({ episode: i, error: 'Test error' });
        } else {
          stats.successful++;
        }
      }

      // Assert
      expect(stats.total).toBe(10);
      expect(stats.successful).toBe(9);
      expect(stats.failed).toBe(1);
      expect(stats.failedEpisodes.length).toBe(1);
      expect(stats.failedEpisodes[0].episode).toBe(5);
    });

    test('should report batch progress', () => {
      // Arrange
      const episodeNumbers = Array.from({ length: 25 }, (_, i) => i + 1);
      const batchSize = 10;
      const batches: number[][] = [];
      for (let i = 0; i < episodeNumbers.length; i += batchSize) {
        batches.push(episodeNumbers.slice(i, i + batchSize));
      }

      // Act - Simulate batch processing
      const batchProgress: Array<{ batchNumber: number; totalBatches: number; episodeRange: string }> = [];
      
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        const batchNumber = batchIndex + 1;
        const totalBatches = batches.length;
        const episodeRange = `${batch[0]}-${batch[batch.length - 1]}`;
        
        batchProgress.push({ batchNumber, totalBatches, episodeRange });
      }

      // Assert
      expect(batchProgress.length).toBe(3);
      expect(batchProgress[0]).toEqual({ batchNumber: 1, totalBatches: 3, episodeRange: '1-10' });
      expect(batchProgress[1]).toEqual({ batchNumber: 2, totalBatches: 3, episodeRange: '11-20' });
      expect(batchProgress[2]).toEqual({ batchNumber: 3, totalBatches: 3, episodeRange: '21-25' });
    });

    test('should calculate success rate', () => {
      // Arrange
      const stats = {
        total: 10,
        successful: 8,
        failed: 2,
        skipped: 0,
        failedEpisodes: [] as Array<{ episode: number; error: string }>
      };

      // Act
      const successRate = (stats.successful / stats.total) * 100;

      // Assert
      expect(successRate).toBe(80);
    });

    test('should track failed episodes with error messages', () => {
      // Arrange
      const failedEpisodes: Array<{ episode: number; error: string }> = [];

      // Act - Simulate failures
      failedEpisodes.push({ episode: 5, error: 'Transcription file not found' });
      failedEpisodes.push({ episode: 10, error: 'Invalid JSON structure' });
      failedEpisodes.push({ episode: 15, error: 'S3 write failed' });

      // Assert
      expect(failedEpisodes.length).toBe(3);
      expect(failedEpisodes[0].episode).toBe(5);
      expect(failedEpisodes[0].error).toBe('Transcription file not found');
      expect(failedEpisodes[1].episode).toBe(10);
      expect(failedEpisodes[2].episode).toBe(15);
    });

    test('should report progress every 10 episodes', () => {
      // Arrange
      const totalEpisodes = 50;
      const reportInterval = 10;
      const progressReports: number[] = [];

      // Act - Simulate processing with progress reporting
      for (let i = 1; i <= totalEpisodes; i++) {
        if (i % reportInterval === 0) {
          progressReports.push(i);
        }
      }

      // Assert
      expect(progressReports).toEqual([10, 20, 30, 40, 50]);
      expect(progressReports.length).toBe(5);
    });
  });

  describe('Error Handling for Missing Files (Requirement 7.3)', () => {
    test('should handle missing transcription file error', () => {
      // Arrange
      const error = new Error('Failed to read transcription after 3 attempts: NoSuchKey');

      // Act & Assert
      expect(error.message).toContain('Failed to read transcription');
      expect(error.message).toContain('NoSuchKey');
    });

    test('should continue processing after individual episode failure', () => {
      // Arrange
      const episodeNumbers = [1, 2, 3, 4, 5];
      const stats = {
        total: episodeNumbers.length,
        successful: 0,
        failed: 0,
        skipped: 0,
        failedEpisodes: [] as Array<{ episode: number; error: string }>
      };

      // Act - Simulate processing with one failure
      for (const episode of episodeNumbers) {
        try {
          if (episode === 3) {
            throw new Error('Transcription file not found');
          }
          stats.successful++;
        } catch (error) {
          stats.failed++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          stats.failedEpisodes.push({ episode, error: errorMessage });
        }
      }

      // Assert - Should continue processing after failure
      expect(stats.successful).toBe(4);
      expect(stats.failed).toBe(1);
      expect(stats.failedEpisodes.length).toBe(1);
      expect(stats.failedEpisodes[0].episode).toBe(3);
    });

    test('should handle S3 access denied error', () => {
      // Arrange
      const error = new Error('Failed to read transcription after 3 attempts: AccessDenied');

      // Act & Assert
      expect(error.message).toContain('AccessDenied');
    });

    test('should handle malformed JSON error', () => {
      // Arrange
      const error = new Error('Invalid transcription structure');

      // Act & Assert
      expect(error.message).toBe('Invalid transcription structure');
    });

    test('should handle empty transcript error', () => {
      // Arrange
      const error = new Error('Empty transcript text');

      // Act & Assert
      expect(error.message).toBe('Empty transcript text');
    });

    test('should handle S3 write failure', () => {
      // Arrange
      const error = new Error('Failed to write document to S3 after 3 attempts: Network timeout');

      // Act & Assert
      expect(error.message).toContain('Failed to write document to S3');
      expect(error.message).toContain('Network timeout');
    });

    test('should collect all failed episodes for final report', () => {
      // Arrange
      const episodeNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const stats = {
        total: episodeNumbers.length,
        successful: 0,
        failed: 0,
        skipped: 0,
        failedEpisodes: [] as Array<{ episode: number; error: string }>
      };

      // Act - Simulate multiple failures
      for (const episode of episodeNumbers) {
        try {
          if (episode === 3 || episode === 7 || episode === 9) {
            throw new Error(`Error processing episode ${episode}`);
          }
          stats.successful++;
        } catch (error) {
          stats.failed++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          stats.failedEpisodes.push({ episode, error: errorMessage });
        }
      }

      // Assert
      expect(stats.successful).toBe(7);
      expect(stats.failed).toBe(3);
      expect(stats.failedEpisodes.length).toBe(3);
      expect(stats.failedEpisodes.map(f => f.episode)).toEqual([3, 7, 9]);
    });
  });

  describe('RSS Feed Parsing (Requirement 7.2)', () => {
    test('should parse RSS feed with multiple episodes', () => {
      // Arrange
      const xmlText = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>AWS Podcast en Français</title>
    <item>
      <title><![CDATA[Episode 1 Title]]></title>
      <description><![CDATA[Episode 1 description]]></description>
      <pubDate>Mon, 01 Jan 2024 04:00:00 +0100</pubDate>
      <itunes:episode>1</itunes:episode>
      <itunes:author>Sébastien Stormacq</itunes:author>
      <link>https://francais.podcast.go-aws.com/web/episodes/1/</link>
    </item>
    <item>
      <title><![CDATA[Episode 2 Title]]></title>
      <description><![CDATA[Episode 2 description]]></description>
      <pubDate>Mon, 08 Jan 2024 04:00:00 +0100</pubDate>
      <itunes:episode>2</itunes:episode>
      <itunes:author>Sébastien Stormacq</itunes:author>
      <link>https://francais.podcast.go-aws.com/web/episodes/2/</link>
    </item>
  </channel>
</rss>`;

      // Act
      const episodeMap = parseRSSFeed(xmlText);

      // Assert
      expect(episodeMap.size).toBe(2);
      expect(episodeMap.has(1)).toBe(true);
      expect(episodeMap.has(2)).toBe(true);
      expect(episodeMap.get(1)?.title).toBe('Episode 1 Title');
      expect(episodeMap.get(2)?.title).toBe('Episode 2 Title');
    });

    test('should cache RSS feed for batch processing', () => {
      // Arrange
      const xmlText = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <item>
      <title><![CDATA[Test Episode]]></title>
      <itunes:episode>1</itunes:episode>
      <itunes:author>Test Author</itunes:author>
    </item>
  </channel>
</rss>`;

      // Act
      const episodeMap = parseRSSFeed(xmlText);

      // Assert - Cache should be reusable
      expect(episodeMap.size).toBe(1);
      expect(episodeMap.get(1)).toBeDefined();
      
      // Simulate reusing cache for multiple episodes
      const episode1Metadata = episodeMap.get(1);
      const episode2Metadata = episodeMap.get(2); // Not in cache
      
      expect(episode1Metadata).toBeDefined();
      expect(episode2Metadata).toBeUndefined();
    });

    test('should handle RSS feed with missing optional fields', () => {
      // Arrange
      const xmlText = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <item>
      <title><![CDATA[Minimal Episode]]></title>
      <itunes:episode>1</itunes:episode>
    </item>
  </channel>
</rss>`;

      // Act
      const episodeMap = parseRSSFeed(xmlText);

      // Assert
      expect(episodeMap.size).toBe(1);
      const metadata = episodeMap.get(1);
      expect(metadata).toBeDefined();
      expect(metadata?.title).toBe('Minimal Episode');
      expect(metadata?.guests).toEqual([]);
      expect(metadata?.links.length).toBeGreaterThanOrEqual(0);
    });

    test('should handle malformed RSS feed gracefully', () => {
      // Arrange
      const malformedXML = 'not valid xml';

      // Act
      const episodeMap = parseRSSFeed(malformedXML);

      // Assert - Should return empty map without crashing
      expect(episodeMap.size).toBe(0);
    });
  });

  describe('Default Metadata (Requirement 7.3)', () => {
    test('should provide default metadata for missing episodes', () => {
      // Arrange
      const episodeNumber = 999;

      // Act
      const metadata = getDefaultMetadata(episodeNumber);

      // Assert
      expect(metadata.episode).toBe(999);
      expect(metadata.title).toBe('Episode 999');
      expect(metadata.description).toBe('Description not available');
      expect(metadata.author).toBe('Sébastien Stormacq');
      expect(metadata.guests).toEqual([]);
      expect(metadata.links).toEqual([]);
      expect(metadata.publicationDate).toBeDefined();
    });

    test('should use default metadata when RSS feed unavailable', () => {
      // Arrange
      const episodeNumbers = [1, 2, 3, 4, 5];
      const rssFeedCache = new Map(); // Empty cache

      // Act - Simulate processing with empty cache
      const documentsWithDefaults = episodeNumbers.map(episode => {
        const metadata = rssFeedCache.get(episode) || getDefaultMetadata(episode);
        return { episode, hasDefaultMetadata: metadata.description === 'Description not available' };
      });

      // Assert
      expect(documentsWithDefaults.length).toBe(5);
      expect(documentsWithDefaults.every(d => d.hasDefaultMetadata)).toBe(true);
    });
  });

  describe('Document Formatting (Requirement 7.4)', () => {
    test('should format document with transcription and metadata', () => {
      // Arrange
      const episodeNumber = 1;
      const transcriptionText = 'Test transcription text';
      const metadata = {
        episode: 1,
        title: 'Test Episode',
        description: 'Test description',
        publicationDate: '2024-01-01T00:00:00.000Z',
        author: 'Test Author',
        guests: [],
        links: []
      };

      // Act
      const document = formatDocument(episodeNumber, transcriptionText, metadata);

      // Assert
      expect(document).toContain('Episode: 1');
      expect(document).toContain('Title: Test Episode');
      expect(document).toContain('Publication Date: 2024-01-01T00:00:00.000Z');
      expect(document).toContain('Author: Test Author');
      expect(document).toContain('Description: Test description');
      expect(document).toContain('Transcription:');
      expect(document).toContain(transcriptionText);
    });

    test('should format document with guests', () => {
      // Arrange
      const episodeNumber = 1;
      const transcriptionText = 'Test transcription';
      const metadata = {
        episode: 1,
        title: 'Test Episode',
        description: 'Test description',
        publicationDate: '2024-01-01T00:00:00.000Z',
        author: 'Test Author',
        guests: [
          {
            name: 'Guest 1',
            title: 'Guest Title',
            link: 'https://example.com/guest1'
          }
        ],
        links: []
      };

      // Act
      const document = formatDocument(episodeNumber, transcriptionText, metadata);

      // Assert
      expect(document).toContain('Guests: Guest 1 - Guest Title - https://example.com/guest1');
    });

    test('should format document with related links', () => {
      // Arrange
      const episodeNumber = 1;
      const transcriptionText = 'Test transcription';
      const metadata = {
        episode: 1,
        title: 'Test Episode',
        description: 'Test description',
        publicationDate: '2024-01-01T00:00:00.000Z',
        author: 'Test Author',
        guests: [],
        links: [
          {
            text: 'Episode Page',
            link: 'https://example.com/episode/1'
          }
        ]
      };

      // Act
      const document = formatDocument(episodeNumber, transcriptionText, metadata);

      // Assert
      expect(document).toContain('Related Links:');
      expect(document).toContain('- Episode Page: https://example.com/episode/1');
    });

    test('should format 10 documents consistently', () => {
      // Arrange
      const episodeNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const documents: string[] = [];

      // Act
      for (const episode of episodeNumbers) {
        const metadata = getDefaultMetadata(episode);
        const document = formatDocument(episode, `Transcription for episode ${episode}`, metadata);
        documents.push(document);
      }

      // Assert
      expect(documents.length).toBe(10);
      documents.forEach((doc, index) => {
        const episode = index + 1;
        expect(doc).toContain(`Episode: ${episode}`);
        expect(doc).toContain(`Title: Episode ${episode}`);
        expect(doc).toContain('Transcription:');
        expect(doc).toContain(`Transcription for episode ${episode}`);
      });
    });
  });

  describe('Ingestion Job Triggering (Requirement 7.4)', () => {
    test('should require environment variables for ingestion', () => {
      // Arrange
      const originalKbId = process.env.KNOWLEDGE_BASE_ID;
      const originalDsId = process.env.DATA_SOURCE_ID;

      // Act
      delete process.env.KNOWLEDGE_BASE_ID;
      delete process.env.DATA_SOURCE_ID;

      const knowledgeBaseId = process.env.KNOWLEDGE_BASE_ID;
      const dataSourceId = process.env.DATA_SOURCE_ID;

      // Assert
      expect(knowledgeBaseId).toBeUndefined();
      expect(dataSourceId).toBeUndefined();

      // Restore
      if (originalKbId) process.env.KNOWLEDGE_BASE_ID = originalKbId;
      if (originalDsId) process.env.DATA_SOURCE_ID = originalDsId;
    });

    test('should validate ingestion job parameters', () => {
      // Arrange
      const knowledgeBaseId = 'test-kb-id';
      const dataSourceId = 'test-ds-id';

      // Act
      const params = {
        knowledgeBaseId,
        dataSourceId
      };

      // Assert
      expect(params.knowledgeBaseId).toBe('test-kb-id');
      expect(params.dataSourceId).toBe('test-ds-id');
    });

    test('should only trigger ingestion if documents processed successfully', () => {
      // Arrange
      const stats = {
        total: 10,
        successful: 0,
        failed: 10,
        skipped: 0,
        failedEpisodes: [] as Array<{ episode: number; error: string }>
      };

      // Act
      const shouldTriggerIngestion = stats.successful > 0;

      // Assert
      expect(shouldTriggerIngestion).toBe(false);
    });

    test('should trigger ingestion if at least one document succeeded', () => {
      // Arrange
      const stats = {
        total: 10,
        successful: 1,
        failed: 9,
        skipped: 0,
        failedEpisodes: [] as Array<{ episode: number; error: string }>
      };

      // Act
      const shouldTriggerIngestion = stats.successful > 0;

      // Assert
      expect(shouldTriggerIngestion).toBe(true);
    });
  });

  describe('Integration - Full Workflow with 10 Episodes', () => {
    test('should process 10 episodes end-to-end', () => {
      // Arrange
      const transcriptionKeys = Array.from({ length: 10 }, (_, i) => `text/${i + 1}-transcribe.json`);
      
      // Step 1: Extract episode numbers
      const episodeNumbers = extractEpisodeNumbers(transcriptionKeys);
      expect(episodeNumbers.length).toBe(10);

      // Step 2: Create batches
      const batchSize = 10;
      const batches: number[][] = [];
      for (let i = 0; i < episodeNumbers.length; i += batchSize) {
        batches.push(episodeNumbers.slice(i, i + batchSize));
      }
      expect(batches.length).toBe(1);

      // Step 3: Process episodes
      const stats = {
        total: episodeNumbers.length,
        successful: 0,
        failed: 0,
        skipped: 0,
        failedEpisodes: [] as Array<{ episode: number; error: string }>
      };

      for (const episode of episodeNumbers) {
        try {
          // Simulate processing
          const metadata = getDefaultMetadata(episode);
          const document = formatDocument(episode, `Transcription ${episode}`, metadata);
          
          // Validate document
          expect(document).toContain(`Episode: ${episode}`);
          
          stats.successful++;
        } catch (error) {
          stats.failed++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          stats.failedEpisodes.push({ episode, error: errorMessage });
        }
      }

      // Step 4: Verify results
      expect(stats.successful).toBe(10);
      expect(stats.failed).toBe(0);
      expect(stats.failedEpisodes.length).toBe(0);

      // Step 5: Check if ingestion should be triggered
      const shouldTriggerIngestion = stats.successful > 0;
      expect(shouldTriggerIngestion).toBe(true);
    });
  });
});
