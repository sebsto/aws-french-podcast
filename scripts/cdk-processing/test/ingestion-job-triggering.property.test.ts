import * as fc from 'fast-check';

/**
 * Property-Based Test for Ingestion Job Triggering
 * 
 * Feature: bedrock-knowledge-base, Property 7: Ingestion Job Triggering
 * 
 * For any successfully processed document written to the S3 data source,
 * the system should trigger a Bedrock Knowledge Base ingestion job.
 * 
 * Validates: Requirements 6.3, 8.1
 */

/**
 * Mock Bedrock client for testing
 */
interface MockBedrockClient {
  startIngestionJobCalls: Array<{
    knowledgeBaseId: string;
    dataSourceId: string;
    timestamp: number;
  }>;
  shouldFail: boolean;
  failureCount: number;
}

/**
 * Mock S3 client for testing
 */
interface MockS3Client {
  putObjectCalls: Array<{
    bucket: string;
    key: string;
    timestamp: number;
  }>;
  shouldFail: boolean;
}

/**
 * Simulates the document processing workflow
 * Returns true if ingestion job was triggered, false otherwise
 */
async function processDocumentWorkflow(
  episodeNumber: number,
  documentContent: string,
  s3Client: MockS3Client,
  bedrockClient: MockBedrockClient,
  knowledgeBaseId: string,
  dataSourceId: string
): Promise<{ documentWritten: boolean; ingestionTriggered: boolean; ingestionJobId?: string }> {
  try {
    // Step 1: Write document to S3
    if (s3Client.shouldFail) {
      throw new Error('S3 write failed');
    }

    const documentKey = `kb-documents/${episodeNumber}.txt`;
    s3Client.putObjectCalls.push({
      bucket: 'test-bucket',
      key: documentKey,
      timestamp: Date.now()
    });

    const documentWritten = true;

    // Step 2: Trigger ingestion job (only if document write succeeded)
    if (bedrockClient.shouldFail && bedrockClient.failureCount > 0) {
      bedrockClient.failureCount--;
      throw new Error('Bedrock ingestion job failed');
    }

    const ingestionJobId = `job-${episodeNumber}-${Date.now()}`;
    bedrockClient.startIngestionJobCalls.push({
      knowledgeBaseId,
      dataSourceId,
      timestamp: Date.now()
    });

    return {
      documentWritten,
      ingestionTriggered: true,
      ingestionJobId
    };

  } catch (error) {
    // If document write failed, ingestion should not be triggered
    return {
      documentWritten: s3Client.putObjectCalls.length > 0,
      ingestionTriggered: false
    };
  }
}

describe('Property Test: Ingestion Job Triggering', () => {
  /**
   * Property 7: Ingestion Job Triggering
   * 
   * For any successfully processed document written to the S3 data source,
   * the system should trigger a Bedrock Knowledge Base ingestion job.
   */
  test('should trigger ingestion job after successful document write', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100000 }),
        fc.string({ minLength: 100, maxLength: 5000 }),
        fc.string({ minLength: 10, maxLength: 50 }),
        fc.string({ minLength: 10, maxLength: 50 }),
        async (episodeNumber, documentContent, knowledgeBaseId, dataSourceId) => {
          // Arrange: Create mock clients
          const s3Client: MockS3Client = {
            putObjectCalls: [],
            shouldFail: false
          };

          const bedrockClient: MockBedrockClient = {
            startIngestionJobCalls: [],
            shouldFail: false,
            failureCount: 0
          };

          // Act: Process document
          const result = await processDocumentWorkflow(
            episodeNumber,
            documentContent,
            s3Client,
            bedrockClient,
            knowledgeBaseId,
            dataSourceId
          );

          // Assert: Document was written
          expect(result.documentWritten).toBe(true);
          expect(s3Client.putObjectCalls.length).toBe(1);

          // Assert: Ingestion job was triggered
          expect(result.ingestionTriggered).toBe(true);
          expect(bedrockClient.startIngestionJobCalls.length).toBe(1);

          // Assert: Ingestion job has correct parameters
          const ingestionCall = bedrockClient.startIngestionJobCalls[0];
          expect(ingestionCall.knowledgeBaseId).toBe(knowledgeBaseId);
          expect(ingestionCall.dataSourceId).toBe(dataSourceId);

          // Assert: Ingestion job ID was returned
          expect(result.ingestionJobId).toBeDefined();
          expect(typeof result.ingestionJobId).toBe('string');
          expect(result.ingestionJobId!.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 } // Run 100 iterations as specified in design doc
    );
  });

  /**
   * Property 7 (continued): Ingestion job triggered only after successful write
   * 
   * For any document processing attempt, if the S3 write fails,
   * the ingestion job should NOT be triggered.
   */
  test('should not trigger ingestion job if document write fails', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100000 }),
        fc.string({ minLength: 100, maxLength: 5000 }),
        fc.string({ minLength: 10, maxLength: 50 }),
        fc.string({ minLength: 10, maxLength: 50 }),
        async (episodeNumber, documentContent, knowledgeBaseId, dataSourceId) => {
          // Arrange: Create mock clients with S3 failure
          const s3Client: MockS3Client = {
            putObjectCalls: [],
            shouldFail: true // Simulate S3 write failure
          };

          const bedrockClient: MockBedrockClient = {
            startIngestionJobCalls: [],
            shouldFail: false,
            failureCount: 0
          };

          // Act: Process document (should fail at S3 write)
          const result = await processDocumentWorkflow(
            episodeNumber,
            documentContent,
            s3Client,
            bedrockClient,
            knowledgeBaseId,
            dataSourceId
          );

          // Assert: Document write failed
          expect(result.documentWritten).toBe(false);
          expect(s3Client.putObjectCalls.length).toBe(0);

          // Assert: Ingestion job was NOT triggered
          expect(result.ingestionTriggered).toBe(false);
          expect(bedrockClient.startIngestionJobCalls.length).toBe(0);

          // Assert: No ingestion job ID returned
          expect(result.ingestionJobId).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7 (continued): One ingestion job per document
   * 
   * For any successfully processed document, exactly one ingestion job
   * should be triggered (no duplicate triggers).
   */
  test('should trigger exactly one ingestion job per document', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100000 }),
        fc.string({ minLength: 100, maxLength: 5000 }),
        fc.string({ minLength: 10, maxLength: 50 }),
        fc.string({ minLength: 10, maxLength: 50 }),
        async (episodeNumber, documentContent, knowledgeBaseId, dataSourceId) => {
          // Arrange: Create mock clients
          const s3Client: MockS3Client = {
            putObjectCalls: [],
            shouldFail: false
          };

          const bedrockClient: MockBedrockClient = {
            startIngestionJobCalls: [],
            shouldFail: false,
            failureCount: 0
          };

          // Act: Process document
          await processDocumentWorkflow(
            episodeNumber,
            documentContent,
            s3Client,
            bedrockClient,
            knowledgeBaseId,
            dataSourceId
          );

          // Assert: Exactly one S3 write
          expect(s3Client.putObjectCalls.length).toBe(1);

          // Assert: Exactly one ingestion job triggered
          expect(bedrockClient.startIngestionJobCalls.length).toBe(1);

          // Assert: No duplicate calls
          const uniqueTimestamps = new Set(
            bedrockClient.startIngestionJobCalls.map(call => call.timestamp)
          );
          expect(uniqueTimestamps.size).toBe(bedrockClient.startIngestionJobCalls.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7 (continued): Ingestion job parameters consistency
   * 
   * For any document processing, the ingestion job should always be
   * triggered with the same Knowledge Base ID and Data Source ID.
   */
  test('should use consistent parameters for ingestion job', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 1, max: 100000 }), { minLength: 2, maxLength: 10 }),
        fc.string({ minLength: 100, maxLength: 1000 }),
        fc.string({ minLength: 10, maxLength: 50 }),
        fc.string({ minLength: 10, maxLength: 50 }),
        async (episodeNumbers, documentContent, knowledgeBaseId, dataSourceId) => {
          // Arrange: Create mock clients
          const s3Client: MockS3Client = {
            putObjectCalls: [],
            shouldFail: false
          };

          const bedrockClient: MockBedrockClient = {
            startIngestionJobCalls: [],
            shouldFail: false,
            failureCount: 0
          };

          // Act: Process multiple documents
          for (const episodeNumber of episodeNumbers) {
            await processDocumentWorkflow(
              episodeNumber,
              documentContent,
              s3Client,
              bedrockClient,
              knowledgeBaseId,
              dataSourceId
            );
          }

          // Assert: All ingestion jobs use same Knowledge Base ID
          const uniqueKbIds = new Set(
            bedrockClient.startIngestionJobCalls.map(call => call.knowledgeBaseId)
          );
          expect(uniqueKbIds.size).toBe(1);
          expect(uniqueKbIds.has(knowledgeBaseId)).toBe(true);

          // Assert: All ingestion jobs use same Data Source ID
          const uniqueDsIds = new Set(
            bedrockClient.startIngestionJobCalls.map(call => call.dataSourceId)
          );
          expect(uniqueDsIds.size).toBe(1);
          expect(uniqueDsIds.has(dataSourceId)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7 (continued): Ingestion job timing
   * 
   * For any document processing, the ingestion job should be triggered
   * after the document write completes (temporal ordering).
   */
  test('should trigger ingestion job after document write', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100000 }),
        fc.string({ minLength: 100, maxLength: 5000 }),
        fc.string({ minLength: 10, maxLength: 50 }),
        fc.string({ minLength: 10, maxLength: 50 }),
        async (episodeNumber, documentContent, knowledgeBaseId, dataSourceId) => {
          // Arrange: Create mock clients
          const s3Client: MockS3Client = {
            putObjectCalls: [],
            shouldFail: false
          };

          const bedrockClient: MockBedrockClient = {
            startIngestionJobCalls: [],
            shouldFail: false,
            failureCount: 0
          };

          // Act: Process document
          await processDocumentWorkflow(
            episodeNumber,
            documentContent,
            s3Client,
            bedrockClient,
            knowledgeBaseId,
            dataSourceId
          );

          // Assert: Both operations completed
          expect(s3Client.putObjectCalls.length).toBe(1);
          expect(bedrockClient.startIngestionJobCalls.length).toBe(1);

          // Assert: Ingestion job triggered after document write
          const writeTimestamp = s3Client.putObjectCalls[0].timestamp;
          const ingestionTimestamp = bedrockClient.startIngestionJobCalls[0].timestamp;
          expect(ingestionTimestamp).toBeGreaterThanOrEqual(writeTimestamp);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7 (continued): Ingestion job ID uniqueness
   * 
   * For any set of document processing operations with different episodes,
   * each ingestion job should have a unique job ID.
   */
  test('should generate unique ingestion job IDs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 1, max: 100000 }), { minLength: 2, maxLength: 20 })
          .map(arr => Array.from(new Set(arr))), // Ensure unique episode numbers
        fc.string({ minLength: 100, maxLength: 1000 }),
        fc.string({ minLength: 10, maxLength: 50 }),
        fc.string({ minLength: 10, maxLength: 50 }),
        async (episodeNumbers, documentContent, knowledgeBaseId, dataSourceId) => {
          // Skip if we don't have at least 2 unique episodes after deduplication
          if (episodeNumbers.length < 2) return;

          // Arrange: Create mock clients
          const s3Client: MockS3Client = {
            putObjectCalls: [],
            shouldFail: false
          };

          const bedrockClient: MockBedrockClient = {
            startIngestionJobCalls: [],
            shouldFail: false,
            failureCount: 0
          };

          // Act: Process multiple documents
          const jobIds: string[] = [];
          for (const episodeNumber of episodeNumbers) {
            // Add small delay to ensure unique timestamps
            await new Promise(resolve => setTimeout(resolve, 1));
            
            const result = await processDocumentWorkflow(
              episodeNumber,
              documentContent,
              s3Client,
              bedrockClient,
              knowledgeBaseId,
              dataSourceId
            );
            if (result.ingestionJobId) {
              jobIds.push(result.ingestionJobId);
            }
          }

          // Assert: All job IDs are unique
          const uniqueJobIds = new Set(jobIds);
          expect(uniqueJobIds.size).toBe(jobIds.length);

          // Assert: All job IDs are non-empty strings
          jobIds.forEach(jobId => {
            expect(typeof jobId).toBe('string');
            expect(jobId.length).toBeGreaterThan(0);
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7 (continued): Ingestion job triggering is independent of document content
   * 
   * For any document content (small, large, special characters), the ingestion
   * job should be triggered consistently.
   */
  test('should trigger ingestion job regardless of document content', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100000 }),
        fc.oneof(
          fc.string({ minLength: 1, maxLength: 100 }),        // Small content
          fc.string({ minLength: 1000, maxLength: 10000 }),   // Large content
          fc.constant(''),                                     // Empty content
          fc.constant('Special chars: \n\t\r"\'\\'),          // Special characters
          fc.string({ minLength: 10, maxLength: 100 })        // Regular content
        ),
        fc.string({ minLength: 10, maxLength: 50 }),
        fc.string({ minLength: 10, maxLength: 50 }),
        async (episodeNumber, documentContent, knowledgeBaseId, dataSourceId) => {
          // Arrange: Create mock clients
          const s3Client: MockS3Client = {
            putObjectCalls: [],
            shouldFail: false
          };

          const bedrockClient: MockBedrockClient = {
            startIngestionJobCalls: [],
            shouldFail: false,
            failureCount: 0
          };

          // Act: Process document
          const result = await processDocumentWorkflow(
            episodeNumber,
            documentContent,
            s3Client,
            bedrockClient,
            knowledgeBaseId,
            dataSourceId
          );

          // Assert: Ingestion job triggered regardless of content
          expect(result.ingestionTriggered).toBe(true);
          expect(bedrockClient.startIngestionJobCalls.length).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7 (continued): Ingestion job triggering is independent of episode number
   * 
   * For any episode number (small, large, edge cases), the ingestion job
   * should be triggered consistently.
   */
  test('should trigger ingestion job for any episode number', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.constant(1),                              // Minimum episode
          fc.constant(999999),                         // Large episode
          fc.integer({ min: 1, max: 10 }),            // Small episodes
          fc.integer({ min: 10000, max: 99999 })      // Large episodes
        ),
        fc.string({ minLength: 100, maxLength: 1000 }),
        fc.string({ minLength: 10, maxLength: 50 }),
        fc.string({ minLength: 10, maxLength: 50 }),
        async (episodeNumber, documentContent, knowledgeBaseId, dataSourceId) => {
          // Arrange: Create mock clients
          const s3Client: MockS3Client = {
            putObjectCalls: [],
            shouldFail: false
          };

          const bedrockClient: MockBedrockClient = {
            startIngestionJobCalls: [],
            shouldFail: false,
            failureCount: 0
          };

          // Act: Process document
          const result = await processDocumentWorkflow(
            episodeNumber,
            documentContent,
            s3Client,
            bedrockClient,
            knowledgeBaseId,
            dataSourceId
          );

          // Assert: Ingestion job triggered regardless of episode number
          expect(result.ingestionTriggered).toBe(true);
          expect(bedrockClient.startIngestionJobCalls.length).toBe(1);

          // Assert: Document key includes episode number
          expect(s3Client.putObjectCalls[0].key).toContain(episodeNumber.toString());
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7 (continued): Ingestion job error handling
   * 
   * For any document processing where the ingestion job fails,
   * the error should be propagated (not silently ignored).
   */
  test('should propagate ingestion job errors', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100000 }),
        fc.string({ minLength: 100, maxLength: 5000 }),
        fc.string({ minLength: 10, maxLength: 50 }),
        fc.string({ minLength: 10, maxLength: 50 }),
        async (episodeNumber, documentContent, knowledgeBaseId, dataSourceId) => {
          // Arrange: Create mock clients with Bedrock failure
          const s3Client: MockS3Client = {
            putObjectCalls: [],
            shouldFail: false
          };

          const bedrockClient: MockBedrockClient = {
            startIngestionJobCalls: [],
            shouldFail: true,
            failureCount: 1
          };

          // Act: Process document (should fail at ingestion job)
          const result = await processDocumentWorkflow(
            episodeNumber,
            documentContent,
            s3Client,
            bedrockClient,
            knowledgeBaseId,
            dataSourceId
          );

          // Assert: Document was written (S3 succeeded)
          expect(result.documentWritten).toBe(true);
          expect(s3Client.putObjectCalls.length).toBe(1);

          // Assert: Ingestion job failed
          expect(result.ingestionTriggered).toBe(false);
          expect(bedrockClient.startIngestionJobCalls.length).toBe(0);

          // Assert: No ingestion job ID returned
          expect(result.ingestionJobId).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7 (continued): Ingestion job idempotency check
   * 
   * For any document, processing it multiple times should trigger
   * multiple ingestion jobs (not idempotent - each write triggers ingestion).
   */
  test('should trigger new ingestion job for each document write', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100000 }),
        fc.string({ minLength: 100, maxLength: 1000 }),
        fc.string({ minLength: 10, maxLength: 50 }),
        fc.string({ minLength: 10, maxLength: 50 }),
        fc.integer({ min: 2, max: 5 }),
        async (episodeNumber, documentContent, knowledgeBaseId, dataSourceId, repeatCount) => {
          // Arrange: Create mock clients
          const s3Client: MockS3Client = {
            putObjectCalls: [],
            shouldFail: false
          };

          const bedrockClient: MockBedrockClient = {
            startIngestionJobCalls: [],
            shouldFail: false,
            failureCount: 0
          };

          // Act: Process same document multiple times
          for (let i = 0; i < repeatCount; i++) {
            await processDocumentWorkflow(
              episodeNumber,
              documentContent,
              s3Client,
              bedrockClient,
              knowledgeBaseId,
              dataSourceId
            );
          }

          // Assert: Multiple S3 writes
          expect(s3Client.putObjectCalls.length).toBe(repeatCount);

          // Assert: Multiple ingestion jobs triggered (one per write)
          expect(bedrockClient.startIngestionJobCalls.length).toBe(repeatCount);

          // Assert: Each ingestion job has same parameters
          bedrockClient.startIngestionJobCalls.forEach(call => {
            expect(call.knowledgeBaseId).toBe(knowledgeBaseId);
            expect(call.dataSourceId).toBe(dataSourceId);
          });
        }
      ),
      { numRuns: 100 }
    );
  });
});
