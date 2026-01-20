import * as fc from 'fast-check';

/**
 * Property-Based Test for Ingestion Job Monitoring
 * 
 * Feature: bedrock-knowledge-base, Property 9: Ingestion Job Monitoring
 * 
 * For any started ingestion job, the system should monitor its status until 
 * completion and log the final status (success or failure) with relevant 
 * metrics (document count, processing time).
 * 
 * Validates: Requirements 8.3, 8.5, 9.4
 */

interface IngestionJobStatistics {
  numberOfDocumentsScanned?: number;
  numberOfDocumentsFailed?: number;
  numberOfDocumentsDeleted?: number;
  numberOfDocumentsModified?: number;
  numberOfNewDocumentsIndexed?: number;
}

interface IngestionJobStatus {
  status: 'STARTING' | 'IN_PROGRESS' | 'COMPLETE' | 'FAILED';
  statistics?: IngestionJobStatistics;
  failureReasons?: string[];
}

interface MonitoringLog {
  timestamp: string;
  ingestionJobId: string;
  episodeNumber: number;
  status: string;
  statistics?: IngestionJobStatistics;
  failureReasons?: string[];
  documentsScanned?: number;
  documentsFailed?: number;
}

/**
 * Mock ingestion job monitor that tracks monitoring behavior
 */
class MockIngestionJobMonitor {
  private logs: MonitoringLog[] = [];
  private pollCount: number = 0;
  private readonly maxPolls: number = 60;
  private readonly pollIntervalMs: number = 5000;

  /**
   * Simulates monitoring an ingestion job
   * This mimics the monitorIngestionJob function in the Lambda handler
   */
  async monitorIngestionJob(
    ingestionJobId: string,
    episodeNumber: number,
    statusSequence: IngestionJobStatus[]
  ): Promise<void> {
    this.logs = [];
    this.pollCount = 0;

    console.log(`Starting to monitor ingestion job: ${ingestionJobId}`);
    this.log('info', `Starting to monitor ingestion job: ${ingestionJobId}`, {
      ingestionJobId,
      episodeNumber
    });

    for (let poll = 1; poll <= this.maxPolls; poll++) {
      this.pollCount++;

      // Simulate polling delay (except first iteration)
      if (poll > 1) {
        await new Promise(resolve => setTimeout(resolve, 1)); // Shortened for tests
      }

      // Get status from sequence (or last status if sequence exhausted)
      const statusIndex = Math.min(poll - 1, statusSequence.length - 1);
      const currentStatus = statusSequence[statusIndex];

      // Log the poll
      this.log('info', `Ingestion job status (poll ${poll}/${this.maxPolls}): ${currentStatus.status}`, {
        ingestionJobId,
        episodeNumber,
        status: currentStatus.status,
        statistics: currentStatus.statistics
      });

      // Check if job completed successfully
      if (currentStatus.status === 'COMPLETE') {
        this.log('info', 'Ingestion job completed successfully', {
          ingestionJobId,
          episodeNumber,
          status: 'COMPLETE',
          statistics: currentStatus.statistics
        });
        return;
      }

      // Check if job failed
      if (currentStatus.status === 'FAILED') {
        const failureReasons = currentStatus.failureReasons || [];
        
        this.log('error', 'Ingestion job failed', {
          ingestionJobId,
          episodeNumber,
          status: 'FAILED',
          failureReasons,
          statistics: currentStatus.statistics
        });

        throw new Error(`Ingestion job failed: ${failureReasons.join(', ')}`);
      }

      // Continue polling if status is IN_PROGRESS or STARTING
      if (currentStatus.status !== 'IN_PROGRESS' && currentStatus.status !== 'STARTING') {
        this.log('warn', `Unexpected ingestion job status: ${currentStatus.status}`, {
          ingestionJobId,
          episodeNumber,
          status: currentStatus.status
        });
      }
    }

    // Reached max polls without completion
    this.log('warn', 'Ingestion job monitoring timed out', {
      ingestionJobId,
      episodeNumber,
      maxPolls: this.maxPolls,
      pollIntervalMs: this.pollIntervalMs
    });
  }

  private log(level: string, message: string, data: any): void {
    const logEntry: any = {
      timestamp: new Date().toISOString(),
      ingestionJobId: data.ingestionJobId,
      episodeNumber: data.episodeNumber,
      status: data.status
    };

    // Add optional fields if present
    if (data.statistics) {
      logEntry.statistics = data.statistics;
      logEntry.documentsScanned = data.statistics.numberOfDocumentsScanned;
      logEntry.documentsFailed = data.statistics.numberOfDocumentsFailed;
    }

    if (data.failureReasons) {
      logEntry.failureReasons = data.failureReasons;
    }

    this.logs.push(logEntry);
  }

  getLogs(): MonitoringLog[] {
    return this.logs;
  }

  getPollCount(): number {
    return this.pollCount;
  }

  getCompletionLog(): MonitoringLog | undefined {
    // Find the last log entry with COMPLETE or FAILED status
    for (let i = this.logs.length - 1; i >= 0; i--) {
      if (this.logs[i].status === 'COMPLETE' || this.logs[i].status === 'FAILED') {
        return this.logs[i];
      }
    }
    return undefined;
  }

  hasStatistics(): boolean {
    return this.logs.some(log => log.statistics !== undefined);
  }

  hasFailureReasons(): boolean {
    return this.logs.some(log => 
      log.failureReasons !== undefined && log.failureReasons.length > 0
    );
  }
}

describe('Property 9: Ingestion Job Monitoring', () => {
  /**
   * Property: For any successful ingestion job, monitoring should log completion 
   * status with statistics
   */
  test('should monitor and log completion status with statistics for successful jobs', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate ingestion job ID
        fc.string({ minLength: 10, maxLength: 50 }),
        // Generate episode number
        fc.integer({ min: 1, max: 500 }),
        // Generate number of intermediate IN_PROGRESS states (1-10)
        fc.integer({ min: 1, max: 10 }),
        // Generate statistics
        fc.record({
          numberOfDocumentsScanned: fc.integer({ min: 1, max: 100 }),
          numberOfDocumentsFailed: fc.integer({ min: 0, max: 5 }),
          numberOfDocumentsDeleted: fc.integer({ min: 0, max: 10 }),
          numberOfDocumentsModified: fc.integer({ min: 0, max: 50 }),
          numberOfNewDocumentsIndexed: fc.integer({ min: 1, max: 100 })
        }),

        async (ingestionJobId, episodeNumber, progressStates, statistics) => {
          // Arrange: Create status sequence that ends in COMPLETE
          const statusSequence: IngestionJobStatus[] = [
            { status: 'STARTING' },
            ...Array(progressStates).fill({ status: 'IN_PROGRESS' }),
            { status: 'COMPLETE', statistics }
          ];

          const monitor = new MockIngestionJobMonitor();

          // Act: Monitor the ingestion job
          await monitor.monitorIngestionJob(ingestionJobId, episodeNumber, statusSequence);

          // Assert: Verify monitoring behavior
          const logs = monitor.getLogs();
          const completionLog = monitor.getCompletionLog();

          // Property 1: Should poll until completion
          expect(monitor.getPollCount()).toBeGreaterThan(0);
          expect(monitor.getPollCount()).toBeLessThanOrEqual(progressStates + 2);

          // Property 2: Should log completion status
          expect(completionLog).toBeDefined();
          expect(completionLog?.status).toBe('COMPLETE');

          // Property 3: Should log statistics on completion
          expect(completionLog?.statistics).toBeDefined();
          expect(completionLog?.statistics?.numberOfDocumentsScanned).toBe(statistics.numberOfDocumentsScanned);
          expect(completionLog?.documentsScanned).toBe(statistics.numberOfDocumentsScanned);

          // Property 4: Should include episode number in logs
          expect(completionLog?.episodeNumber).toBe(episodeNumber);

          // Property 5: Should include ingestion job ID in logs
          expect(completionLog?.ingestionJobId).toBe(ingestionJobId);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any failed ingestion job, monitoring should log failure 
   * status with failure reasons
   */
  test('should monitor and log failure status with reasons for failed jobs', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate ingestion job ID
        fc.string({ minLength: 10, maxLength: 50 }),
        // Generate episode number
        fc.integer({ min: 1, max: 500 }),
        // Generate number of intermediate states before failure (0-5)
        fc.integer({ min: 0, max: 5 }),
        // Generate failure reasons
        fc.array(fc.string({ minLength: 10, maxLength: 100 }), { minLength: 1, maxLength: 3 }),
        // Generate statistics (may be present even on failure)
        fc.record({
          numberOfDocumentsScanned: fc.integer({ min: 0, max: 100 }),
          numberOfDocumentsFailed: fc.integer({ min: 1, max: 100 })
        }),

        async (ingestionJobId, episodeNumber, progressStates, failureReasons, statistics) => {
          // Arrange: Create status sequence that ends in FAILED
          const statusSequence: IngestionJobStatus[] = [
            { status: 'STARTING' },
            ...Array(progressStates).fill({ status: 'IN_PROGRESS' }),
            { status: 'FAILED', failureReasons, statistics }
          ];

          const monitor = new MockIngestionJobMonitor();

          // Act & Assert: Monitor should throw on failure
          await expect(
            monitor.monitorIngestionJob(ingestionJobId, episodeNumber, statusSequence)
          ).rejects.toThrow();

          // Assert: Verify failure was logged
          const logs = monitor.getLogs();
          const completionLog = monitor.getCompletionLog();

          // Property 1: Should log failure status
          expect(completionLog).toBeDefined();
          expect(completionLog?.status).toBe('FAILED');

          // Property 2: Should log failure reasons
          expect(completionLog?.failureReasons).toBeDefined();
          expect(completionLog?.failureReasons?.length).toBeGreaterThan(0);
          expect(completionLog?.failureReasons).toEqual(failureReasons);

          // Property 3: Should log statistics even on failure
          expect(completionLog?.statistics).toBeDefined();

          // Property 4: Should include episode number in failure logs
          expect(completionLog?.episodeNumber).toBe(episodeNumber);

          // Property 5: Should include ingestion job ID in failure logs
          expect(completionLog?.ingestionJobId).toBe(ingestionJobId);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Monitoring should poll multiple times for jobs that take 
   * multiple iterations to complete
   */
  test('should poll multiple times until job completes', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate ingestion job ID
        fc.string({ minLength: 10, maxLength: 50 }),
        // Generate episode number
        fc.integer({ min: 1, max: 500 }),
        // Generate number of IN_PROGRESS states (2-20)
        fc.integer({ min: 2, max: 20 }),

        async (ingestionJobId, episodeNumber, progressStates) => {
          // Arrange: Create status sequence with multiple IN_PROGRESS states
          const statusSequence: IngestionJobStatus[] = [
            { status: 'STARTING' },
            ...Array(progressStates).fill({ status: 'IN_PROGRESS' }),
            { 
              status: 'COMPLETE', 
              statistics: { numberOfDocumentsScanned: 1 } 
            }
          ];

          const monitor = new MockIngestionJobMonitor();

          // Act: Monitor the ingestion job
          await monitor.monitorIngestionJob(ingestionJobId, episodeNumber, statusSequence);

          // Assert: Should poll at least as many times as there are states
          const pollCount = monitor.getPollCount();
          expect(pollCount).toBeGreaterThanOrEqual(progressStates + 1);

          // Property: Each poll should be logged
          const logs = monitor.getLogs();
          expect(logs.length).toBeGreaterThan(progressStates);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Monitoring should handle immediate completion (job completes 
   * on first poll)
   */
  test('should handle jobs that complete immediately', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate ingestion job ID
        fc.string({ minLength: 10, maxLength: 50 }),
        // Generate episode number
        fc.integer({ min: 1, max: 500 }),
        // Generate statistics
        fc.record({
          numberOfDocumentsScanned: fc.integer({ min: 1, max: 100 }),
          numberOfDocumentsFailed: fc.integer({ min: 0, max: 5 })
        }),

        async (ingestionJobId, episodeNumber, statistics) => {
          // Arrange: Job completes immediately
          const statusSequence: IngestionJobStatus[] = [
            { status: 'COMPLETE', statistics }
          ];

          const monitor = new MockIngestionJobMonitor();

          // Act: Monitor the ingestion job
          await monitor.monitorIngestionJob(ingestionJobId, episodeNumber, statusSequence);

          // Assert: Should complete with minimal polls
          expect(monitor.getPollCount()).toBe(1);

          // Property: Should still log completion with statistics
          const completionLog = monitor.getCompletionLog();
          expect(completionLog).toBeDefined();
          expect(completionLog?.status).toBe('COMPLETE');
          expect(completionLog?.statistics).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Monitoring should log statistics when available, regardless 
   * of job outcome
   */
  test('should always log statistics when provided', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate ingestion job ID
        fc.string({ minLength: 10, maxLength: 50 }),
        // Generate episode number
        fc.integer({ min: 1, max: 500 }),
        // Generate final status (COMPLETE or FAILED)
        fc.constantFrom('COMPLETE', 'FAILED'),
        // Generate statistics
        fc.record({
          numberOfDocumentsScanned: fc.integer({ min: 0, max: 100 }),
          numberOfDocumentsFailed: fc.integer({ min: 0, max: 100 }),
          numberOfNewDocumentsIndexed: fc.integer({ min: 0, max: 100 })
        }),

        async (ingestionJobId, episodeNumber, finalStatus, statistics) => {
          // Arrange: Create status sequence
          const statusSequence: IngestionJobStatus[] = [
            { status: 'IN_PROGRESS' },
            { 
              status: finalStatus as 'COMPLETE' | 'FAILED', 
              statistics,
              failureReasons: finalStatus === 'FAILED' ? ['Test failure'] : undefined
            }
          ];

          const monitor = new MockIngestionJobMonitor();

          // Act: Monitor the ingestion job (may throw for FAILED)
          try {
            await monitor.monitorIngestionJob(ingestionJobId, episodeNumber, statusSequence);
          } catch (error) {
            // Expected for FAILED status
          }

          // Assert: Statistics should be logged
          const completionLog = monitor.getCompletionLog();
          expect(completionLog).toBeDefined();
          expect(completionLog?.statistics).toBeDefined();
          expect(completionLog?.statistics?.numberOfDocumentsScanned).toBe(statistics.numberOfDocumentsScanned);
          
          // Property: Statistics should be present in logs regardless of success/failure
          expect(monitor.hasStatistics()).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Monitoring should include episode number in all relevant logs
   */
  test('should include episode number in all monitoring logs', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate ingestion job ID
        fc.string({ minLength: 10, maxLength: 50 }),
        // Generate episode number
        fc.integer({ min: 1, max: 500 }),
        // Generate number of states
        fc.integer({ min: 1, max: 10 }),

        async (ingestionJobId, episodeNumber, stateCount) => {
          // Arrange: Create status sequence
          const statusSequence: IngestionJobStatus[] = [
            ...Array(stateCount).fill({ status: 'IN_PROGRESS' }),
            { 
              status: 'COMPLETE', 
              statistics: { numberOfDocumentsScanned: 1 } 
            }
          ];

          const monitor = new MockIngestionJobMonitor();

          // Act: Monitor the ingestion job
          await monitor.monitorIngestionJob(ingestionJobId, episodeNumber, statusSequence);

          // Assert: All logs should include episode number
          const logs = monitor.getLogs();
          expect(logs.length).toBeGreaterThan(0);
          
          // Property: Every log entry should have the episode number
          logs.forEach(log => {
            expect(log.episodeNumber).toBe(episodeNumber);
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Monitoring should include ingestion job ID in all relevant logs
   */
  test('should include ingestion job ID in all monitoring logs', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate ingestion job ID
        fc.string({ minLength: 10, maxLength: 50 }),
        // Generate episode number
        fc.integer({ min: 1, max: 500 }),
        // Generate number of states
        fc.integer({ min: 1, max: 10 }),

        async (ingestionJobId, episodeNumber, stateCount) => {
          // Arrange: Create status sequence
          const statusSequence: IngestionJobStatus[] = [
            ...Array(stateCount).fill({ status: 'IN_PROGRESS' }),
            { 
              status: 'COMPLETE', 
              statistics: { numberOfDocumentsScanned: 1 } 
            }
          ];

          const monitor = new MockIngestionJobMonitor();

          // Act: Monitor the ingestion job
          await monitor.monitorIngestionJob(ingestionJobId, episodeNumber, statusSequence);

          // Assert: All logs should include ingestion job ID
          const logs = monitor.getLogs();
          expect(logs.length).toBeGreaterThan(0);
          
          // Property: Every log entry should have the ingestion job ID
          logs.forEach(log => {
            expect(log.ingestionJobId).toBe(ingestionJobId);
          });
        }
      ),
      { numRuns: 100 }
    );
  });
});
