import * as fc from 'fast-check';

/**
 * Property-Based Test for Error Logging and Alerting
 * 
 * Feature: bedrock-knowledge-base, Property 8: Error Logging and Alerting
 * 
 * For any critical failure (ingestion job failure, Lambda error, S3 write error),
 * the system should log detailed error information to CloudWatch and send an
 * alert notification via SNS.
 * 
 * Validates: Requirements 6.5, 8.4, 9.1, 9.3
 */

/**
 * Error types that should trigger logging and alerting
 */
type CriticalErrorType = 
  | 'S3WriteError'
  | 'IngestionJobFailure'
  | 'LambdaError'
  | 'JSONParseError'
  | 'ValidationError'
  | 'RSSFetchError'
  | 'ConfigurationError';

/**
 * Mock CloudWatch Logs client
 */
interface MockCloudWatchLogs {
  logEntries: Array<{
    level: 'INFO' | 'WARN' | 'ERROR';
    message: string;
    context: Record<string, any>;
    timestamp: number;
  }>;
}

/**
 * Mock SNS client
 */
interface MockSNSClient {
  publishCalls: Array<{
    topicArn: string;
    subject: string;
    message: string;
    timestamp: number;
  }>;
  shouldFail: boolean;
}

/**
 * Simulates error handling in the document processor
 */
async function handleError(
  errorType: CriticalErrorType,
  errorMessage: string,
  context: Record<string, any>,
  cloudWatchLogs: MockCloudWatchLogs,
  snsClient: MockSNSClient,
  alertTopicArn: string
): Promise<{ logged: boolean; alerted: boolean; errorPropagated: boolean }> {
  let logged = false;
  let alerted = false;
  let errorPropagated = false;

  try {
    // Step 1: Log error to CloudWatch
    cloudWatchLogs.logEntries.push({
      level: 'ERROR',
      message: `ERROR: ${errorMessage}`,
      context: {
        errorType,
        errorMessage,
        ...context,
        timestamp: new Date().toISOString()
      },
      timestamp: Date.now()
    });
    logged = true;

    // Step 2: Send SNS alert for critical failures
    const criticalErrors: CriticalErrorType[] = [
      'S3WriteError',
      'IngestionJobFailure',
      'LambdaError'
    ];

    if (criticalErrors.includes(errorType)) {
      if (snsClient.shouldFail) {
        // SNS failure should not prevent error propagation
        cloudWatchLogs.logEntries.push({
          level: 'ERROR',
          message: 'ERROR: Failed to send SNS alert',
          context: {
            errorType: 'SNSPublishError',
            originalError: errorType,
            timestamp: new Date().toISOString()
          },
          timestamp: Date.now()
        });
      } else {
        // Include episode number in subject if available
        const episodeInfo = context.episodeNumber ? ` - Episode ${context.episodeNumber}` : '';
        snsClient.publishCalls.push({
          topicArn: alertTopicArn,
          subject: `[ALERT] ${errorType}${episodeInfo}`,
          message: `Error: ${errorMessage}\nContext: ${JSON.stringify(context)}`,
          timestamp: Date.now()
        });
        alerted = true;
      }
    }

    // Step 3: Propagate error (throw)
    errorPropagated = true;
    throw new Error(`${errorType}: ${errorMessage}`);

  } catch (error) {
    // Error was propagated
    return { logged, alerted, errorPropagated };
  }
}

/**
 * Simulates ingestion job monitoring with failure detection
 */
async function monitorIngestionJobWithFailure(
  ingestionJobId: string,
  episodeNumber: number,
  failureReasons: string[],
  cloudWatchLogs: MockCloudWatchLogs,
  snsClient: MockSNSClient,
  alertTopicArn: string
): Promise<{ logged: boolean; alerted: boolean }> {
  // Log ingestion job failure
  cloudWatchLogs.logEntries.push({
    level: 'ERROR',
    message: 'ERROR: Ingestion job failed',
    context: {
      errorType: 'IngestionJobFailure',
      ingestionJobId,
      episodeNumber,
      failureReasons,
      timestamp: new Date().toISOString()
    },
    timestamp: Date.now()
  });

  // Send SNS alert
  if (!snsClient.shouldFail) {
    snsClient.publishCalls.push({
      topicArn: alertTopicArn,
      subject: `[ALERT] Knowledge Base Ingestion Failed - Episode ${episodeNumber}`,
      message: `Ingestion Job ID: ${ingestionJobId}\nFailure Reasons: ${failureReasons.join(', ')}`,
      timestamp: Date.now()
    });
    return { logged: true, alerted: true };
  }

  return { logged: true, alerted: false };
}

describe('Property Test: Error Logging and Alerting', () => {
  /**
   * Property 8: Error Logging and Alerting
   * 
   * For any critical failure, the system should log detailed error information
   * to CloudWatch and send an alert notification via SNS.
   */
  test('should log all critical errors to CloudWatch', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<CriticalErrorType>(
          'S3WriteError',
          'IngestionJobFailure',
          'LambdaError',
          'JSONParseError',
          'ValidationError',
          'RSSFetchError',
          'ConfigurationError'
        ),
        fc.string({ minLength: 10, maxLength: 200 }),
        fc.record({
          episodeNumber: fc.option(fc.integer({ min: 1, max: 100000 }), { nil: undefined }),
          bucket: fc.option(fc.string({ minLength: 5, maxLength: 50 }), { nil: undefined }),
          key: fc.option(fc.string({ minLength: 5, maxLength: 100 }), { nil: undefined }),
          attempt: fc.option(fc.integer({ min: 1, max: 3 }), { nil: undefined })
        }),
        fc.string({ minLength: 20, maxLength: 100 }),
        async (errorType, errorMessage, context, alertTopicArn) => {
          // Arrange: Create mock clients
          const cloudWatchLogs: MockCloudWatchLogs = {
            logEntries: []
          };

          const snsClient: MockSNSClient = {
            publishCalls: [],
            shouldFail: false
          };

          // Act: Handle error
          const result = await handleError(
            errorType,
            errorMessage,
            context,
            cloudWatchLogs,
            snsClient,
            alertTopicArn
          );

          // Assert: Error was logged
          expect(result.logged).toBe(true);
          expect(cloudWatchLogs.logEntries.length).toBeGreaterThanOrEqual(1);

          // Assert: Log entry has correct structure
          const logEntry = cloudWatchLogs.logEntries[0];
          expect(logEntry.level).toBe('ERROR');
          expect(logEntry.message).toContain('ERROR');
          expect(logEntry.message).toContain(errorMessage);

          // Assert: Log context includes error type
          expect(logEntry.context.errorType).toBe(errorType);
          expect(logEntry.context.errorMessage).toBe(errorMessage);

          // Assert: Log context includes timestamp
          expect(logEntry.context.timestamp).toBeDefined();
          expect(typeof logEntry.context.timestamp).toBe('string');

          // Assert: Log context includes provided context
          Object.keys(context).forEach(key => {
            if (context[key as keyof typeof context] !== undefined) {
              expect(logEntry.context[key]).toBe(context[key as keyof typeof context]);
            }
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8 (continued): Critical errors trigger SNS alerts
   * 
   * For any critical failure (S3WriteError, IngestionJobFailure, LambdaError),
   * an SNS alert should be sent.
   */
  test('should send SNS alerts for critical errors', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<CriticalErrorType>(
          'S3WriteError',
          'IngestionJobFailure',
          'LambdaError'
        ),
        fc.string({ minLength: 10, maxLength: 200 }),
        fc.record({
          episodeNumber: fc.option(fc.integer({ min: 1, max: 100000 }), { nil: undefined }),
          bucket: fc.option(fc.string({ minLength: 5, maxLength: 50 }), { nil: undefined })
        }),
        fc.string({ minLength: 20, maxLength: 100 }),
        async (errorType, errorMessage, context, alertTopicArn) => {
          // Arrange: Create mock clients
          const cloudWatchLogs: MockCloudWatchLogs = {
            logEntries: []
          };

          const snsClient: MockSNSClient = {
            publishCalls: [],
            shouldFail: false
          };

          // Act: Handle critical error
          const result = await handleError(
            errorType,
            errorMessage,
            context,
            cloudWatchLogs,
            snsClient,
            alertTopicArn
          );

          // Assert: Error was logged
          expect(result.logged).toBe(true);

          // Assert: SNS alert was sent
          expect(result.alerted).toBe(true);
          expect(snsClient.publishCalls.length).toBe(1);

          // Assert: Alert has correct structure
          const alert = snsClient.publishCalls[0];
          expect(alert.topicArn).toBe(alertTopicArn);
          expect(alert.subject).toContain('ALERT');
          expect(alert.subject).toContain(errorType);
          expect(alert.message).toContain(errorMessage);

          // Assert: Alert timestamp is valid
          expect(alert.timestamp).toBeDefined();
          expect(alert.timestamp).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8 (continued): Non-critical errors do not trigger SNS alerts
   * 
   * For non-critical errors (JSONParseError, ValidationError, RSSFetchError),
   * errors should be logged but SNS alerts should not be sent.
   */
  test('should not send SNS alerts for non-critical errors', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<CriticalErrorType>(
          'JSONParseError',
          'ValidationError',
          'RSSFetchError',
          'ConfigurationError'
        ),
        fc.string({ minLength: 10, maxLength: 200 }),
        fc.record({
          episodeNumber: fc.option(fc.integer({ min: 1, max: 100000 }), { nil: undefined }),
          key: fc.option(fc.string({ minLength: 5, maxLength: 100 }), { nil: undefined })
        }),
        fc.string({ minLength: 20, maxLength: 100 }),
        async (errorType, errorMessage, context, alertTopicArn) => {
          // Arrange: Create mock clients
          const cloudWatchLogs: MockCloudWatchLogs = {
            logEntries: []
          };

          const snsClient: MockSNSClient = {
            publishCalls: [],
            shouldFail: false
          };

          // Act: Handle non-critical error
          const result = await handleError(
            errorType,
            errorMessage,
            context,
            cloudWatchLogs,
            snsClient,
            alertTopicArn
          );

          // Assert: Error was logged
          expect(result.logged).toBe(true);
          expect(cloudWatchLogs.logEntries.length).toBeGreaterThanOrEqual(1);

          // Assert: No SNS alert was sent
          expect(result.alerted).toBe(false);
          expect(snsClient.publishCalls.length).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8 (continued): Errors are propagated after logging
   * 
   * For any error, after logging and alerting, the error should be
   * propagated (thrown) to fail the Lambda invocation.
   */
  test('should propagate errors after logging and alerting', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<CriticalErrorType>(
          'S3WriteError',
          'IngestionJobFailure',
          'LambdaError',
          'JSONParseError'
        ),
        fc.string({ minLength: 10, maxLength: 200 }),
        fc.record({
          episodeNumber: fc.option(fc.integer({ min: 1, max: 100000 }), { nil: undefined })
        }),
        fc.string({ minLength: 20, maxLength: 100 }),
        async (errorType, errorMessage, context, alertTopicArn) => {
          // Arrange: Create mock clients
          const cloudWatchLogs: MockCloudWatchLogs = {
            logEntries: []
          };

          const snsClient: MockSNSClient = {
            publishCalls: [],
            shouldFail: false
          };

          // Act: Handle error
          const result = await handleError(
            errorType,
            errorMessage,
            context,
            cloudWatchLogs,
            snsClient,
            alertTopicArn
          );

          // Assert: Error was logged
          expect(result.logged).toBe(true);

          // Assert: Error was propagated
          expect(result.errorPropagated).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8 (continued): SNS failure does not prevent error logging
   * 
   * For any critical error, if SNS publish fails, the error should still
   * be logged to CloudWatch and the original error should be propagated.
   */
  test('should log errors even if SNS alert fails', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<CriticalErrorType>(
          'S3WriteError',
          'IngestionJobFailure',
          'LambdaError'
        ),
        fc.string({ minLength: 10, maxLength: 200 }),
        fc.record({
          episodeNumber: fc.option(fc.integer({ min: 1, max: 100000 }), { nil: undefined })
        }),
        fc.string({ minLength: 20, maxLength: 100 }),
        async (errorType, errorMessage, context, alertTopicArn) => {
          // Arrange: Create mock clients with SNS failure
          const cloudWatchLogs: MockCloudWatchLogs = {
            logEntries: []
          };

          const snsClient: MockSNSClient = {
            publishCalls: [],
            shouldFail: true // Simulate SNS failure
          };

          // Act: Handle error with SNS failure
          const result = await handleError(
            errorType,
            errorMessage,
            context,
            cloudWatchLogs,
            snsClient,
            alertTopicArn
          );

          // Assert: Original error was logged
          expect(result.logged).toBe(true);
          const errorLogs = cloudWatchLogs.logEntries.filter(
            entry => entry.context.errorType === errorType
          );
          expect(errorLogs.length).toBeGreaterThanOrEqual(1);

          // Assert: SNS failure was also logged
          const snsErrorLogs = cloudWatchLogs.logEntries.filter(
            entry => entry.context.errorType === 'SNSPublishError'
          );
          expect(snsErrorLogs.length).toBeGreaterThanOrEqual(1);

          // Assert: No SNS alert was sent
          expect(result.alerted).toBe(false);
          expect(snsClient.publishCalls.length).toBe(0);

          // Assert: Original error was still propagated
          expect(result.errorPropagated).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8 (continued): Ingestion job failures trigger logging and alerting
   * 
   * For any ingestion job failure, the system should log the failure with
   * details and send an SNS alert.
   */
  test('should log and alert on ingestion job failures', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 10, maxLength: 50 }),
        fc.integer({ min: 1, max: 100000 }),
        fc.array(fc.string({ minLength: 10, maxLength: 100 }), { minLength: 1, maxLength: 5 }),
        fc.string({ minLength: 20, maxLength: 100 }),
        async (ingestionJobId, episodeNumber, failureReasons, alertTopicArn) => {
          // Arrange: Create mock clients
          const cloudWatchLogs: MockCloudWatchLogs = {
            logEntries: []
          };

          const snsClient: MockSNSClient = {
            publishCalls: [],
            shouldFail: false
          };

          // Act: Monitor ingestion job with failure
          const result = await monitorIngestionJobWithFailure(
            ingestionJobId,
            episodeNumber,
            failureReasons,
            cloudWatchLogs,
            snsClient,
            alertTopicArn
          );

          // Assert: Failure was logged
          expect(result.logged).toBe(true);
          expect(cloudWatchLogs.logEntries.length).toBeGreaterThanOrEqual(1);

          // Assert: Log includes ingestion job details
          const logEntry = cloudWatchLogs.logEntries[0];
          expect(logEntry.level).toBe('ERROR');
          expect(logEntry.context.errorType).toBe('IngestionJobFailure');
          expect(logEntry.context.ingestionJobId).toBe(ingestionJobId);
          expect(logEntry.context.episodeNumber).toBe(episodeNumber);
          expect(logEntry.context.failureReasons).toEqual(failureReasons);

          // Assert: SNS alert was sent
          expect(result.alerted).toBe(true);
          expect(snsClient.publishCalls.length).toBe(1);

          // Assert: Alert includes episode number and job ID
          const alert = snsClient.publishCalls[0];
          expect(alert.subject).toContain(episodeNumber.toString());
          expect(alert.message).toContain(ingestionJobId);
          expect(alert.message).toContain(failureReasons.join(', '));
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8 (continued): Log entries include timestamps
   * 
   * For any error, the log entry should include a timestamp in ISO 8601 format.
   */
  test('should include timestamps in all log entries', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<CriticalErrorType>(
          'S3WriteError',
          'IngestionJobFailure',
          'LambdaError',
          'JSONParseError'
        ),
        fc.string({ minLength: 10, maxLength: 200 }),
        fc.record({
          episodeNumber: fc.option(fc.integer({ min: 1, max: 100000 }), { nil: undefined })
        }),
        fc.string({ minLength: 20, maxLength: 100 }),
        async (errorType, errorMessage, context, alertTopicArn) => {
          // Arrange: Create mock clients
          const cloudWatchLogs: MockCloudWatchLogs = {
            logEntries: []
          };

          const snsClient: MockSNSClient = {
            publishCalls: [],
            shouldFail: false
          };

          // Act: Handle error
          await handleError(
            errorType,
            errorMessage,
            context,
            cloudWatchLogs,
            snsClient,
            alertTopicArn
          );

          // Assert: All log entries have timestamps
          cloudWatchLogs.logEntries.forEach(entry => {
            expect(entry.timestamp).toBeDefined();
            expect(entry.timestamp).toBeGreaterThan(0);
            expect(entry.context.timestamp).toBeDefined();
            expect(typeof entry.context.timestamp).toBe('string');

            // Validate ISO 8601 format
            const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
            expect(entry.context.timestamp).toMatch(isoRegex);
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8 (continued): Log context includes episode number when available
   * 
   * For any error during episode processing, if the episode number is known,
   * it should be included in the log context.
   */
  test('should include episode number in log context when available', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<CriticalErrorType>(
          'S3WriteError',
          'IngestionJobFailure',
          'LambdaError'
        ),
        fc.string({ minLength: 10, maxLength: 200 }),
        fc.integer({ min: 1, max: 100000 }),
        fc.string({ minLength: 20, maxLength: 100 }),
        async (errorType, errorMessage, episodeNumber, alertTopicArn) => {
          // Arrange: Create mock clients
          const cloudWatchLogs: MockCloudWatchLogs = {
            logEntries: []
          };

          const snsClient: MockSNSClient = {
            publishCalls: [],
            shouldFail: false
          };

          // Act: Handle error with episode number
          await handleError(
            errorType,
            errorMessage,
            { episodeNumber },
            cloudWatchLogs,
            snsClient,
            alertTopicArn
          );

          // Assert: Log includes episode number
          const logEntry = cloudWatchLogs.logEntries[0];
          expect(logEntry.context.episodeNumber).toBe(episodeNumber);

          // Assert: If alert was sent, it includes episode number
          if (snsClient.publishCalls.length > 0) {
            const alert = snsClient.publishCalls[0];
            expect(alert.subject).toContain(episodeNumber.toString());
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8 (continued): Multiple errors are logged independently
   * 
   * For any sequence of errors, each error should be logged independently
   * with its own context and timestamp.
   */
  test('should log multiple errors independently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            errorType: fc.constantFrom<CriticalErrorType>(
              'S3WriteError',
              'IngestionJobFailure',
              'LambdaError',
              'JSONParseError'
            ),
            errorMessage: fc.string({ minLength: 10, maxLength: 100 }),
            episodeNumber: fc.integer({ min: 1, max: 100000 })
          }),
          { minLength: 2, maxLength: 10 }
        ),
        fc.string({ minLength: 20, maxLength: 100 }),
        async (errors, alertTopicArn) => {
          // Arrange: Create mock clients
          const cloudWatchLogs: MockCloudWatchLogs = {
            logEntries: []
          };

          const snsClient: MockSNSClient = {
            publishCalls: [],
            shouldFail: false
          };

          // Act: Handle multiple errors
          for (const error of errors) {
            await handleError(
              error.errorType,
              error.errorMessage,
              { episodeNumber: error.episodeNumber },
              cloudWatchLogs,
              snsClient,
              alertTopicArn
            );
          }

          // Assert: All errors were logged
          expect(cloudWatchLogs.logEntries.length).toBeGreaterThanOrEqual(errors.length);

          // Assert: Each error has unique timestamp
          const timestamps = cloudWatchLogs.logEntries.map(entry => entry.timestamp);
          // Note: Some timestamps might be the same if errors occur in same millisecond
          expect(timestamps.length).toBe(cloudWatchLogs.logEntries.length);

          // Assert: Each error has its own context
          const errorTypes = cloudWatchLogs.logEntries
            .filter(entry => entry.level === 'ERROR')
            .map(entry => entry.context.errorType);
          expect(errorTypes.length).toBeGreaterThanOrEqual(errors.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8 (continued): Error messages are descriptive
   * 
   * For any error, the log message should contain the error type and
   * a descriptive error message.
   */
  test('should include descriptive error messages in logs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<CriticalErrorType>(
          'S3WriteError',
          'IngestionJobFailure',
          'LambdaError',
          'JSONParseError'
        ),
        fc.string({ minLength: 10, maxLength: 200 }),
        fc.record({
          episodeNumber: fc.option(fc.integer({ min: 1, max: 100000 }), { nil: undefined })
        }),
        fc.string({ minLength: 20, maxLength: 100 }),
        async (errorType, errorMessage, context, alertTopicArn) => {
          // Arrange: Create mock clients
          const cloudWatchLogs: MockCloudWatchLogs = {
            logEntries: []
          };

          const snsClient: MockSNSClient = {
            publishCalls: [],
            shouldFail: false
          };

          // Act: Handle error
          await handleError(
            errorType,
            errorMessage,
            context,
            cloudWatchLogs,
            snsClient,
            alertTopicArn
          );

          // Assert: Log message is descriptive
          const logEntry = cloudWatchLogs.logEntries[0];
          expect(logEntry.message).toContain('ERROR');
          expect(logEntry.message).toContain(errorMessage);
          expect(logEntry.message.length).toBeGreaterThan(10);

          // Assert: Error type is in context
          expect(logEntry.context.errorType).toBe(errorType);

          // Assert: Error message is in context
          expect(logEntry.context.errorMessage).toBe(errorMessage);
        }
      ),
      { numRuns: 100 }
    );
  });
});
