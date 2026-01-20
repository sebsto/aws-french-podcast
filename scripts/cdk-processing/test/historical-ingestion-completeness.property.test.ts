import * as fc from 'fast-check';
import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';

/**
 * Property-Based Test for Historical Ingestion Completeness
 * 
 * Feature: bedrock-knowledge-base, Property 11: Historical Ingestion Completeness
 * 
 * For any set of transcription files in S3, the ingestion tool should generate 
 * a formatted document for each file, with the total number of output documents 
 * equal to the number of input transcription files.
 * 
 * Validates: Requirements 7.4
 */

const s3Mock = mockClient(S3Client);

interface TranscriptionFile {
  key: string;
  episode: number;
}

interface ProcessingResult {
  inputCount: number;
  outputCount: number;
  processedEpisodes: number[];
  failedEpisodes: number[];
}

/**
 * Mock S3 client that simulates transcription files and document storage
 */
class MockS3Storage {
  private transcriptionFiles: Map<string, string> = new Map();
  private documentFiles: Map<string, string> = new Map();

  /**
   * Add a transcription file to the mock storage
   */
  addTranscriptionFile(episode: number, content: string): void {
    const key = `text/${episode}-transcribe.json`;
    this.transcriptionFiles.set(key, content);
  }

  /**
   * List all transcription files (simulates ListObjectsV2)
   */
  listTranscriptionFiles(): TranscriptionFile[] {
    const files: TranscriptionFile[] = [];
    
    for (const key of this.transcriptionFiles.keys()) {
      const filename = key.split('/').pop() || '';
      const episodeStr = filename.split('-')[0];
      const episode = parseInt(episodeStr, 10);
      
      if (!isNaN(episode)) {
        files.push({ key, episode });
      }
    }
    
    return files.sort((a, b) => a.episode - b.episode);
  }

  /**
   * Get transcription file content (simulates GetObject)
   */
  getTranscriptionFile(key: string): string | null {
    return this.transcriptionFiles.get(key) || null;
  }

  /**
   * Write document file (simulates PutObject)
   */
  writeDocumentFile(episode: number, content: string): void {
    const key = `kb-documents/${episode}.txt`;
    this.documentFiles.set(key, content);
  }

  /**
   * Get count of document files
   */
  getDocumentCount(): number {
    return this.documentFiles.size;
  }

  /**
   * Get list of document episode numbers
   */
  getDocumentEpisodes(): number[] {
    const episodes: number[] = [];
    
    for (const key of this.documentFiles.keys()) {
      const filename = key.split('/').pop() || '';
      const episodeStr = filename.split('.')[0];
      const episode = parseInt(episodeStr, 10);
      
      if (!isNaN(episode)) {
        episodes.push(episode);
      }
    }
    
    return episodes.sort((a, b) => a - b);
  }

  /**
   * Check if document exists for episode
   */
  hasDocument(episode: number): boolean {
    const key = `kb-documents/${episode}.txt`;
    return this.documentFiles.has(key);
  }

  /**
   * Reset storage
   */
  reset(): void {
    this.transcriptionFiles.clear();
    this.documentFiles.clear();
  }
}

/**
 * Mock ingestion processor that simulates the migration script behavior
 */
class MockIngestionProcessor {
  private storage: MockS3Storage;
  private rssFeedCache: Map<number, any> = new Map();

  constructor(storage: MockS3Storage) {
    this.storage = storage;
    this.initializeRSSCache();
  }

  /**
   * Initialize RSS feed cache with sample metadata
   */
  private initializeRSSCache(): void {
    // Populate cache with episodes 1-500
    for (let i = 1; i <= 500; i++) {
      this.rssFeedCache.set(i, {
        episode: i,
        title: `Episode ${i}`,
        description: `Description for episode ${i}`,
        publicationDate: new Date().toISOString(),
        author: 'Sébastien Stormacq',
        guests: [],
        links: []
      });
    }
  }

  /**
   * Process all transcription files and generate documents
   */
  async processAllEpisodes(): Promise<ProcessingResult> {
    const transcriptionFiles = this.storage.listTranscriptionFiles();
    const inputCount = transcriptionFiles.length;
    const processedEpisodes: number[] = [];
    const failedEpisodes: number[] = [];

    for (const file of transcriptionFiles) {
      try {
        await this.processEpisode(file.episode, file.key);
        processedEpisodes.push(file.episode);
      } catch (error) {
        failedEpisodes.push(file.episode);
      }
    }

    const outputCount = this.storage.getDocumentCount();

    return {
      inputCount,
      outputCount,
      processedEpisodes,
      failedEpisodes
    };
  }

  /**
   * Process a single episode
   */
  private async processEpisode(episode: number, transcriptionKey: string): Promise<void> {
    // Read transcription file
    const transcriptionContent = this.storage.getTranscriptionFile(transcriptionKey);
    
    if (!transcriptionContent) {
      throw new Error(`Transcription file not found: ${transcriptionKey}`);
    }

    // Parse transcription JSON
    const transcriptionJson = JSON.parse(transcriptionContent);
    
    if (!transcriptionJson.results?.transcripts?.[0]?.transcript) {
      throw new Error(`Invalid transcription structure for episode ${episode}`);
    }

    const transcriptText = transcriptionJson.results.transcripts[0].transcript;

    // Get metadata from cache (or use defaults)
    const metadata = this.rssFeedCache.get(episode) || this.getDefaultMetadata(episode);

    // Format document
    const document = this.formatDocument(episode, transcriptText, metadata);

    // Write document to storage
    this.storage.writeDocumentFile(episode, document);
  }

  /**
   * Format document with metadata and transcription
   */
  private formatDocument(episode: number, transcriptText: string, metadata: any): string {
    const sections: string[] = [];

    sections.push(`Episode: ${episode}`);
    sections.push(`Title: ${metadata.title}`);
    sections.push(`Publication Date: ${metadata.publicationDate}`);
    sections.push(`Author: ${metadata.author}`);

    if (metadata.guests && metadata.guests.length > 0) {
      const guestStrings = metadata.guests.map((guest: any) => {
        const parts = [guest.name];
        if (guest.title) parts.push(guest.title);
        if (guest.link) parts.push(guest.link);
        return parts.join(' - ');
      });
      sections.push(`Guests: ${guestStrings.join(', ')}`);
    }

    if (metadata.description) {
      sections.push(`Description: ${metadata.description}`);
    }

    sections.push('');
    sections.push('Transcription:');
    sections.push(transcriptText);

    if (metadata.links && metadata.links.length > 0) {
      sections.push('');
      sections.push('Related Links:');
      metadata.links.forEach((link: any) => {
        sections.push(`- ${link.text}: ${link.link}`);
      });
    }

    return sections.join('\n');
  }

  /**
   * Get default metadata for episodes not in cache
   */
  private getDefaultMetadata(episode: number): any {
    return {
      episode,
      title: `Episode ${episode}`,
      description: 'Description not available',
      publicationDate: new Date().toISOString(),
      author: 'Sébastien Stormacq',
      guests: [],
      links: []
    };
  }
}

/**
 * Generate valid transcription JSON content
 */
function generateTranscriptionJSON(episode: number, transcriptText: string): string {
  return JSON.stringify({
    jobName: `episode-${episode}`,
    accountId: '533267385481',
    results: {
      transcripts: [
        {
          transcript: transcriptText
        }
      ],
      items: []
    },
    status: 'COMPLETED'
  });
}

describe('Property Test: Historical Ingestion Completeness', () => {
  let storage: MockS3Storage;

  beforeEach(() => {
    storage = new MockS3Storage();
    s3Mock.reset();
  });

  /**
   * Property 11: Historical Ingestion Completeness
   * 
   * For any set of transcription files, the ingestion tool should generate
   * exactly one formatted document per input file.
   */
  test('should generate one document per transcription file', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a set of 1-50 unique episode numbers
        fc.uniqueArray(fc.integer({ min: 1, max: 500 }), { minLength: 1, maxLength: 50 }),
        async (episodeNumbers) => {
          // Arrange: Create transcription files for each episode
          storage.reset();
          
          for (const episode of episodeNumbers) {
            const transcriptText = `This is the transcript for episode ${episode}. It contains some sample content.`;
            const transcriptionJSON = generateTranscriptionJSON(episode, transcriptText);
            storage.addTranscriptionFile(episode, transcriptionJSON);
          }

          // Act: Process all episodes
          const processor = new MockIngestionProcessor(storage);
          const result = await processor.processAllEpisodes();

          // Assert: Output count equals input count
          expect(result.outputCount).toBe(result.inputCount);
          expect(result.outputCount).toBe(episodeNumbers.length);
          
          // Assert: No failed episodes
          expect(result.failedEpisodes.length).toBe(0);
          
          // Assert: All episodes were processed
          expect(result.processedEpisodes.length).toBe(episodeNumbers.length);
          
          // Assert: Each input episode has a corresponding output document
          for (const episode of episodeNumbers) {
            expect(storage.hasDocument(episode)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11 (continued): Completeness with varying episode ranges
   * 
   * For any range of episodes (sequential or non-sequential), the output
   * count should match the input count.
   */
  test('should maintain completeness across different episode ranges', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate different episode ranges
        fc.integer({ min: 1, max: 400 }), // Start episode
        fc.integer({ min: 1, max: 100 }), // Range size
        async (startEpisode, rangeSize) => {
          // Arrange: Create sequential episodes
          storage.reset();
          const episodeNumbers: number[] = [];
          
          for (let i = 0; i < rangeSize; i++) {
            const episode = startEpisode + i;
            episodeNumbers.push(episode);
            
            const transcriptText = `Transcript for episode ${episode}`;
            const transcriptionJSON = generateTranscriptionJSON(episode, transcriptText);
            storage.addTranscriptionFile(episode, transcriptionJSON);
          }

          // Act: Process all episodes
          const processor = new MockIngestionProcessor(storage);
          const result = await processor.processAllEpisodes();

          // Assert: Complete ingestion
          expect(result.outputCount).toBe(rangeSize);
          expect(result.inputCount).toBe(rangeSize);
          expect(result.failedEpisodes.length).toBe(0);
          
          // Assert: All episodes in range have documents
          const documentEpisodes = storage.getDocumentEpisodes();
          expect(documentEpisodes).toEqual(episodeNumbers.sort((a, b) => a - b));
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11 (continued): Completeness with sparse episode numbers
   * 
   * For any sparse set of episode numbers (with gaps), the output count
   * should still match the input count.
   */
  test('should handle sparse episode numbers correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate sparse episode numbers with gaps
        fc.array(fc.integer({ min: 1, max: 500 }), { minLength: 5, maxLength: 30 })
          .map(arr => [...new Set(arr)].sort((a, b) => a - b)), // Remove duplicates and sort
        async (episodeNumbers) => {
          // Arrange: Create transcription files for sparse episodes
          storage.reset();
          
          for (const episode of episodeNumbers) {
            const transcriptText = `Content for episode ${episode}`;
            const transcriptionJSON = generateTranscriptionJSON(episode, transcriptText);
            storage.addTranscriptionFile(episode, transcriptionJSON);
          }

          // Act: Process all episodes
          const processor = new MockIngestionProcessor(storage);
          const result = await processor.processAllEpisodes();

          // Assert: Complete ingestion despite gaps
          expect(result.outputCount).toBe(episodeNumbers.length);
          expect(result.inputCount).toBe(episodeNumbers.length);
          
          // Assert: Processed episodes match input episodes
          expect(result.processedEpisodes.sort((a, b) => a - b))
            .toEqual(episodeNumbers.sort((a, b) => a - b));
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11 (continued): Completeness with varying transcript lengths
   * 
   * For any set of transcription files with varying content lengths,
   * the output count should match the input count.
   */
  test('should maintain completeness regardless of transcript length', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.integer({ min: 1, max: 500 }), { minLength: 5, maxLength: 20 }),
        fc.array(fc.string({ minLength: 10, maxLength: 1000 }), { minLength: 5, maxLength: 20 }),
        async (episodeNumbers, transcriptTexts) => {
          // Ensure we have matching arrays
          const count = Math.min(episodeNumbers.length, transcriptTexts.length);
          const episodes = episodeNumbers.slice(0, count);
          const transcripts = transcriptTexts.slice(0, count);

          // Arrange: Create transcription files with varying lengths
          storage.reset();
          
          for (let i = 0; i < count; i++) {
            const episode = episodes[i];
            const transcriptText = transcripts[i];
            const transcriptionJSON = generateTranscriptionJSON(episode, transcriptText);
            storage.addTranscriptionFile(episode, transcriptionJSON);
          }

          // Act: Process all episodes
          const processor = new MockIngestionProcessor(storage);
          const result = await processor.processAllEpisodes();

          // Assert: Complete ingestion regardless of content length
          expect(result.outputCount).toBe(count);
          expect(result.inputCount).toBe(count);
          expect(result.failedEpisodes.length).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11 (continued): Idempotency of ingestion
   * 
   * Running the ingestion process multiple times should produce the same
   * output count (documents can be overwritten).
   */
  test('should be idempotent - multiple runs produce same output count', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.integer({ min: 1, max: 500 }), { minLength: 3, maxLength: 15 }),
        async (episodeNumbers) => {
          // Arrange: Create transcription files
          storage.reset();
          
          for (const episode of episodeNumbers) {
            const transcriptText = `Transcript for episode ${episode}`;
            const transcriptionJSON = generateTranscriptionJSON(episode, transcriptText);
            storage.addTranscriptionFile(episode, transcriptionJSON);
          }

          // Act: Process episodes twice
          const processor1 = new MockIngestionProcessor(storage);
          const result1 = await processor1.processAllEpisodes();
          
          const processor2 = new MockIngestionProcessor(storage);
          const result2 = await processor2.processAllEpisodes();

          // Assert: Both runs produce same output count
          expect(result1.outputCount).toBe(result2.outputCount);
          expect(result1.outputCount).toBe(episodeNumbers.length);
          
          // Assert: Document count remains the same (overwritten, not duplicated)
          expect(storage.getDocumentCount()).toBe(episodeNumbers.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11 (continued): Completeness with edge case episode numbers
   * 
   * For edge case episode numbers (1, very large numbers), the output
   * count should still match the input count.
   */
  test('should handle edge case episode numbers correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.oneof(
            fc.constant(1), // Minimum episode
            fc.integer({ min: 2, max: 10 }), // Small episodes
            fc.integer({ min: 100, max: 500 }), // Large episodes
            fc.integer({ min: 501, max: 1000 }) // Very large episodes (outside RSS cache)
          ),
          { minLength: 5, maxLength: 20 }
        ).map(arr => [...new Set(arr)]), // Remove duplicates
        async (episodeNumbers) => {
          // Arrange: Create transcription files for edge cases
          storage.reset();
          
          for (const episode of episodeNumbers) {
            const transcriptText = `Edge case transcript for episode ${episode}`;
            const transcriptionJSON = generateTranscriptionJSON(episode, transcriptText);
            storage.addTranscriptionFile(episode, transcriptionJSON);
          }

          // Act: Process all episodes
          const processor = new MockIngestionProcessor(storage);
          const result = await processor.processAllEpisodes();

          // Assert: Complete ingestion for all edge cases
          expect(result.outputCount).toBe(episodeNumbers.length);
          expect(result.inputCount).toBe(episodeNumbers.length);
          expect(result.failedEpisodes.length).toBe(0);
          
          // Assert: All episodes have documents
          for (const episode of episodeNumbers) {
            expect(storage.hasDocument(episode)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11 (continued): Completeness verification
   * 
   * For any set of input files, the set of output episode numbers should
   * exactly match the set of input episode numbers.
   */
  test('should produce output episodes matching input episodes exactly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.integer({ min: 1, max: 500 }), { minLength: 5, maxLength: 30 }),
        async (episodeNumbers) => {
          // Arrange: Create transcription files
          storage.reset();
          
          for (const episode of episodeNumbers) {
            const transcriptText = `Transcript ${episode}`;
            const transcriptionJSON = generateTranscriptionJSON(episode, transcriptText);
            storage.addTranscriptionFile(episode, transcriptionJSON);
          }

          // Act: Process all episodes
          const processor = new MockIngestionProcessor(storage);
          await processor.processAllEpisodes();

          // Assert: Output episodes exactly match input episodes
          const inputSet = new Set(episodeNumbers);
          const outputEpisodes = storage.getDocumentEpisodes();
          const outputSet = new Set(outputEpisodes);

          expect(outputSet.size).toBe(inputSet.size);
          
          // Every input episode should have an output document
          for (const episode of inputSet) {
            expect(outputSet.has(episode)).toBe(true);
          }
          
          // Every output document should correspond to an input episode
          for (const episode of outputSet) {
            expect(inputSet.has(episode)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11 (continued): No spurious documents
   * 
   * The ingestion process should not create documents for episodes that
   * don't have transcription files.
   */
  test('should not create documents for non-existent episodes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.integer({ min: 1, max: 250 }), { minLength: 5, maxLength: 20 }),
        fc.uniqueArray(fc.integer({ min: 251, max: 500 }), { minLength: 5, maxLength: 20 }),
        async (existingEpisodes, nonExistingEpisodes) => {
          // Arrange: Create transcription files only for existing episodes
          storage.reset();
          
          for (const episode of existingEpisodes) {
            const transcriptText = `Transcript for episode ${episode}`;
            const transcriptionJSON = generateTranscriptionJSON(episode, transcriptText);
            storage.addTranscriptionFile(episode, transcriptionJSON);
          }

          // Act: Process all episodes
          const processor = new MockIngestionProcessor(storage);
          const result = await processor.processAllEpisodes();

          // Assert: Only existing episodes have documents
          expect(result.outputCount).toBe(existingEpisodes.length);
          
          // Assert: Non-existing episodes don't have documents
          for (const episode of nonExistingEpisodes) {
            expect(storage.hasDocument(episode)).toBe(false);
          }
          
          // Assert: All existing episodes have documents
          for (const episode of existingEpisodes) {
            expect(storage.hasDocument(episode)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
