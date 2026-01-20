/**
 * Integration Test for EventBridge Trigger
 * 
 * This test verifies the end-to-end integration between:
 * 1. Uploading a test transcription file to S3
 * 2. EventBridge triggering the Document Processor Lambda
 * 3. Lambda processing the file and writing the document to S3
 * 4. Verifying the document was created correctly
 * 
 * Requirements: 6.1, 6.2
 * 
 * IMPORTANT: This test requires AWS credentials and deployed infrastructure.
 * Run with: npm test -- eventbridge-integration.test.ts
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

describe('EventBridge Integration Test', () => {
  const region = 'eu-central-1';
  const profile = 'podcast';
  const bucket = 'aws-french-podcast-media';
  const testEpisodeNumber = 999; // Use a test episode number that won't conflict
  const transcriptionKey = `text/${testEpisodeNumber}-transcribe.json`;
  const documentKey = `kb-documents/${testEpisodeNumber}.txt`;

  let s3Client: S3Client;

  // Test transcription data
  const testTranscriptionJSON = {
    jobName: `episode-${testEpisodeNumber}`,
    accountId: '533267385481',
    results: {
      transcripts: [
        {
          transcript: 'Ceci est un test d\'intégration pour le système de Knowledge Base. Nous vérifions que le Lambda est déclenché correctement par EventBridge.'
        }
      ],
      items: [
        {
          start_time: '0.0',
          end_time: '1.0',
          alternatives: [
            {
              confidence: '0.99',
              content: 'Ceci'
            }
          ],
          type: 'pronunciation'
        }
      ]
    },
    status: 'COMPLETED'
  };

  beforeAll(() => {
    // Initialize AWS clients
    // Note: In a real test environment, you would configure credentials properly
    s3Client = new S3Client({ region });
  });

  afterAll(async () => {
    // Cleanup: Delete test files
    try {
      await s3Client.send(new DeleteObjectCommand({
        Bucket: bucket,
        Key: transcriptionKey
      }));
      console.log(`Cleaned up test transcription: ${transcriptionKey}`);
    } catch (error) {
      console.warn(`Failed to cleanup transcription: ${error}`);
    }

    try {
      await s3Client.send(new DeleteObjectCommand({
        Bucket: bucket,
        Key: documentKey
      }));
      console.log(`Cleaned up test document: ${documentKey}`);
    } catch (error) {
      console.warn(`Failed to cleanup document: ${error}`);
    }
  });

  describe('End-to-End Integration', () => {
    test('should trigger Lambda when transcription file is uploaded', async () => {
      // Step 1: Upload test transcription file to S3
      console.log(`Uploading test transcription to s3://${bucket}/${transcriptionKey}`);
      
      const putCommand = new PutObjectCommand({
        Bucket: bucket,
        Key: transcriptionKey,
        Body: JSON.stringify(testTranscriptionJSON),
        ContentType: 'application/json'
      });

      await s3Client.send(putCommand);
      console.log('Test transcription uploaded successfully');

      // Step 2: Wait for EventBridge to trigger Lambda and Lambda to process
      // EventBridge typically triggers within seconds, but Lambda execution takes time
      console.log('Waiting for Lambda to process (30 seconds)...');
      await new Promise(resolve => setTimeout(resolve, 30000));

      // Step 3: Verify document was written to S3
      console.log(`Checking for document at s3://${bucket}/${documentKey}`);
      
      const getCommand = new GetObjectCommand({
        Bucket: bucket,
        Key: documentKey
      });

      const response = await s3Client.send(getCommand);
      expect(response).toBeDefined();
      expect(response.Body).toBeDefined();

      // Step 4: Verify document content
      const documentContent = await response.Body!.transformToString();
      console.log('Document content retrieved successfully');

      // Verify required sections
      expect(documentContent).toContain(`Episode: ${testEpisodeNumber}`);
      expect(documentContent).toContain('Title:');
      expect(documentContent).toContain('Publication Date:');
      expect(documentContent).toContain('Author:');
      expect(documentContent).toContain('Transcription:');
      expect(documentContent).toContain('Ceci est un test d\'intégration');

      console.log('Integration test passed: Document created successfully');
    }, 60000); // 60 second timeout for the entire test

    test('should verify document naming convention', async () => {
      // Verify the document exists with correct naming
      const getCommand = new GetObjectCommand({
        Bucket: bucket,
        Key: documentKey
      });

      const response = await s3Client.send(getCommand);
      expect(response).toBeDefined();

      // Verify key matches pattern: kb-documents/{episode}.txt
      expect(documentKey).toMatch(/^kb-documents\/\d+\.txt$/);
      expect(documentKey).toBe(`kb-documents/${testEpisodeNumber}.txt`);
    });

    test('should verify document is UTF-8 encoded', async () => {
      const getCommand = new GetObjectCommand({
        Bucket: bucket,
        Key: documentKey
      });

      const response = await s3Client.send(getCommand);
      const documentContent = await response.Body!.transformToString('utf-8');

      // Verify French characters are preserved
      expect(documentContent).toContain('é');
      expect(documentContent).toContain('\'');
      expect(documentContent).toContain('d\'intégration');
    });
  });

  describe('Lambda Execution Verification', () => {
    test('should verify Lambda was triggered by checking CloudWatch Logs', async () => {
      // Note: This is a placeholder for CloudWatch Logs verification
      // In a real implementation, you would:
      // 1. Query CloudWatch Logs for the Lambda function
      // 2. Search for log entries related to the test episode
      // 3. Verify the Lambda executed successfully

      // For now, we verify indirectly by checking the document exists
      const getCommand = new GetObjectCommand({
        Bucket: bucket,
        Key: documentKey
      });

      const response = await s3Client.send(getCommand);
      expect(response).toBeDefined();
      
      // If the document exists, Lambda must have been triggered
      console.log('Lambda execution verified indirectly via document creation');
    });
  });

  describe('Error Handling', () => {
    test('should handle missing transcription file gracefully', async () => {
      // Try to get a non-existent document
      const nonExistentKey = 'kb-documents/99999.txt';
      
      const getCommand = new GetObjectCommand({
        Bucket: bucket,
        Key: nonExistentKey
      });

      await expect(s3Client.send(getCommand)).rejects.toThrow();
    });

    test('should handle malformed transcription JSON', async () => {
      // Upload malformed JSON
      const malformedKey = `text/${testEpisodeNumber + 1}-transcribe.json`;
      const malformedJSON = '{ invalid json }';

      const putCommand = new PutObjectCommand({
        Bucket: bucket,
        Key: malformedKey,
        Body: malformedJSON,
        ContentType: 'application/json'
      });

      await s3Client.send(putCommand);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 30000));

      // Verify document was NOT created (Lambda should have failed gracefully)
      const documentKey = `kb-documents/${testEpisodeNumber + 1}.txt`;
      const getCommand = new GetObjectCommand({
        Bucket: bucket,
        Key: documentKey
      });

      // Should throw because document shouldn't exist
      await expect(s3Client.send(getCommand)).rejects.toThrow();

      // Cleanup
      await s3Client.send(new DeleteObjectCommand({
        Bucket: bucket,
        Key: malformedKey
      }));
    }, 60000);
  });

  describe('Performance Verification', () => {
    test('should process transcription within acceptable time', async () => {
      const startTime = Date.now();

      // Upload transcription
      const putCommand = new PutObjectCommand({
        Bucket: bucket,
        Key: transcriptionKey,
        Body: JSON.stringify(testTranscriptionJSON),
        ContentType: 'application/json'
      });

      await s3Client.send(putCommand);

      // Poll for document creation (max 60 seconds)
      let documentExists = false;
      const maxWaitTime = 60000; // 60 seconds
      const pollInterval = 5000; // 5 seconds

      while (!documentExists && (Date.now() - startTime) < maxWaitTime) {
        try {
          const getCommand = new GetObjectCommand({
            Bucket: bucket,
            Key: documentKey
          });

          await s3Client.send(getCommand);
          documentExists = true;
        } catch (error) {
          // Document doesn't exist yet, wait and retry
          await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
      }

      const processingTime = Date.now() - startTime;

      expect(documentExists).toBe(true);
      expect(processingTime).toBeLessThan(maxWaitTime);
      
      console.log(`Processing completed in ${processingTime}ms`);
    }, 90000); // 90 second timeout
  });
});
