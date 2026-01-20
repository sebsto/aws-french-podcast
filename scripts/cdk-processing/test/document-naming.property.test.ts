import * as fc from 'fast-check';

/**
 * Property-Based Test for S3 Document Naming Consistency
 * 
 * Feature: bedrock-knowledge-base, Property 5: S3 Document Naming Consistency
 * 
 * For any episode number, the generated document filename should follow 
 * the pattern `{episode}.txt` where episode is an integer.
 * 
 * Validates: Requirements 5.6
 */

/**
 * Simulates the document key generation logic from the Lambda handler
 * This should match the implementation in index.ts
 */
function generateDocumentKey(episodeNumber: number): string {
  return `kb-documents/${episodeNumber}.txt`;
}

/**
 * Extracts the episode number from a document key
 */
function extractEpisodeFromKey(key: string): number | null {
  const match = key.match(/kb-documents\/(\d+)\.txt$/);
  return match ? parseInt(match[1], 10) : null;
}

describe('Property Test: S3 Document Naming Consistency', () => {
  /**
   * Property 5: S3 Document Naming Consistency
   * 
   * For any episode number, the generated document filename must follow
   * the pattern `kb-documents/{episode}.txt` where episode is an integer.
   */
  test('should generate consistent filename pattern for any episode number', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100000 }),
        (episodeNumber) => {
          // Act: Generate document key
          const documentKey = generateDocumentKey(episodeNumber);

          // Assert: Key follows the expected pattern
          expect(documentKey).toMatch(/^kb-documents\/\d+\.txt$/);

          // Assert: Key contains the episode number
          expect(documentKey).toContain(`${episodeNumber}.txt`);

          // Assert: Key starts with kb-documents/ prefix
          expect(documentKey.startsWith('kb-documents/')).toBe(true);

          // Assert: Key ends with .txt extension
          expect(documentKey.endsWith('.txt')).toBe(true);

          // Assert: Episode number can be extracted back from key
          const extractedEpisode = extractEpisodeFromKey(documentKey);
          expect(extractedEpisode).toBe(episodeNumber);
        }
      ),
      { numRuns: 100 } // Run 100 iterations as specified in design doc
    );
  });

  /**
   * Property 5 (continued): Filename uniqueness
   * 
   * For any two different episode numbers, the generated filenames
   * must be different (one-to-one mapping).
   */
  test('should generate unique filenames for different episode numbers', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100000 }),
        fc.integer({ min: 1, max: 100000 }),
        (episode1, episode2) => {
          // Skip if episodes are the same
          fc.pre(episode1 !== episode2);

          // Act: Generate document keys
          const key1 = generateDocumentKey(episode1);
          const key2 = generateDocumentKey(episode2);

          // Assert: Keys are different
          expect(key1).not.toBe(key2);

          // Assert: Each key maps to its correct episode
          expect(extractEpisodeFromKey(key1)).toBe(episode1);
          expect(extractEpisodeFromKey(key2)).toBe(episode2);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5 (continued): Filename format validation
   * 
   * For any episode number, the filename must contain only valid
   * characters and follow S3 key naming conventions.
   */
  test('should generate valid S3 key names', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100000 }),
        (episodeNumber) => {
          // Act: Generate document key
          const documentKey = generateDocumentKey(episodeNumber);

          // Assert: Key contains only valid S3 characters
          // S3 keys can contain alphanumeric, /, -, _, and .
          expect(documentKey).toMatch(/^[a-zA-Z0-9\/\-_.]+$/);

          // Assert: No spaces in key
          expect(documentKey).not.toContain(' ');

          // Assert: No special characters that need URL encoding
          expect(documentKey).not.toContain('?');
          expect(documentKey).not.toContain('&');
          expect(documentKey).not.toContain('=');
          expect(documentKey).not.toContain('#');

          // Assert: Key is not empty
          expect(documentKey.length).toBeGreaterThan(0);

          // Assert: Key has reasonable length (S3 max is 1024 bytes)
          expect(documentKey.length).toBeLessThan(1024);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5 (continued): Episode number preservation
   * 
   * For any episode number, extracting the episode from the generated
   * key must return the original episode number (round-trip property).
   */
  test('should preserve episode number in round-trip conversion', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100000 }),
        (originalEpisode) => {
          // Act: Generate key and extract episode
          const documentKey = generateDocumentKey(originalEpisode);
          const extractedEpisode = extractEpisodeFromKey(documentKey);

          // Assert: Extracted episode matches original
          expect(extractedEpisode).toBe(originalEpisode);

          // Assert: No data loss in conversion
          expect(extractedEpisode).not.toBeNull();
          expect(typeof extractedEpisode).toBe('number');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5 (continued): Consistent prefix
   * 
   * For any episode number, the generated key must always use
   * the same prefix (kb-documents/).
   */
  test('should always use kb-documents prefix', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100000 }),
        (episodeNumber) => {
          // Act: Generate document key
          const documentKey = generateDocumentKey(episodeNumber);

          // Assert: Key starts with kb-documents/
          expect(documentKey.startsWith('kb-documents/')).toBe(true);

          // Assert: Prefix is exactly kb-documents/ (no variations)
          const prefix = documentKey.split('/')[0];
          expect(prefix).toBe('kb-documents');

          // Assert: Only one directory level (no nested folders)
          const parts = documentKey.split('/');
          expect(parts.length).toBe(2);
          expect(parts[0]).toBe('kb-documents');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5 (continued): Consistent extension
   * 
   * For any episode number, the generated key must always use
   * the .txt extension.
   */
  test('should always use .txt extension', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100000 }),
        (episodeNumber) => {
          // Act: Generate document key
          const documentKey = generateDocumentKey(episodeNumber);

          // Assert: Key ends with .txt
          expect(documentKey.endsWith('.txt')).toBe(true);

          // Assert: Extension is exactly .txt (no variations)
          const extension = documentKey.split('.').pop();
          expect(extension).toBe('txt');

          // Assert: Only one extension (no double extensions like .txt.bak)
          const parts = documentKey.split('.');
          expect(parts.length).toBe(2);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5 (continued): No leading zeros
   * 
   * For any episode number, the filename should not contain
   * leading zeros (e.g., 341.txt not 0341.txt).
   */
  test('should not include leading zeros in episode number', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100000 }),
        (episodeNumber) => {
          // Act: Generate document key
          const documentKey = generateDocumentKey(episodeNumber);

          // Extract the filename part
          const filename = documentKey.split('/').pop() || '';
          const episodeStr = filename.replace('.txt', '');

          // Assert: Episode string matches the number (no leading zeros)
          expect(episodeStr).toBe(episodeNumber.toString());

          // Assert: No leading zeros (unless episode is 0, which is outside our range)
          if (episodeNumber > 0) {
            expect(episodeStr).not.toMatch(/^0+\d/);
          }

          // Assert: Episode string is the minimal representation
          expect(parseInt(episodeStr, 10)).toBe(episodeNumber);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5 (continued): Filename structure consistency
   * 
   * For any episode number, the filename structure must be
   * consistent: prefix + episode + extension, with no extra parts.
   */
  test('should have consistent three-part structure', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100000 }),
        (episodeNumber) => {
          // Act: Generate document key
          const documentKey = generateDocumentKey(episodeNumber);

          // Assert: Key has exactly three parts: prefix, episode, extension
          // Format: kb-documents/{episode}.txt
          const pathParts = documentKey.split('/');
          expect(pathParts.length).toBe(2);
          expect(pathParts[0]).toBe('kb-documents');

          const filenameParts = pathParts[1].split('.');
          expect(filenameParts.length).toBe(2);
          expect(filenameParts[1]).toBe('txt');

          // Assert: Episode part is numeric
          const episodePart = filenameParts[0];
          expect(episodePart).toMatch(/^\d+$/);
          expect(parseInt(episodePart, 10)).toBe(episodeNumber);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5 (continued): Case sensitivity
   * 
   * For any episode number, the generated key should use
   * consistent casing (lowercase for prefix and extension).
   */
  test('should use consistent lowercase for prefix and extension', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100000 }),
        (episodeNumber) => {
          // Act: Generate document key
          const documentKey = generateDocumentKey(episodeNumber);

          // Assert: Prefix is lowercase
          expect(documentKey.startsWith('kb-documents/')).toBe(true);
          expect(documentKey.startsWith('KB-DOCUMENTS/')).toBe(false);
          expect(documentKey.startsWith('Kb-Documents/')).toBe(false);

          // Assert: Extension is lowercase
          expect(documentKey.endsWith('.txt')).toBe(true);
          expect(documentKey.endsWith('.TXT')).toBe(false);
          expect(documentKey.endsWith('.Txt')).toBe(false);

          // Assert: No uppercase characters in prefix or extension
          const prefix = documentKey.split('/')[0];
          expect(prefix).toBe(prefix.toLowerCase());

          const extension = documentKey.split('.').pop() || '';
          expect(extension).toBe(extension.toLowerCase());
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5 (continued): Idempotency
   * 
   * For any episode number, generating the key multiple times
   * should always produce the same result.
   */
  test('should generate identical keys for same episode number', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100000 }),
        (episodeNumber) => {
          // Act: Generate key multiple times
          const key1 = generateDocumentKey(episodeNumber);
          const key2 = generateDocumentKey(episodeNumber);
          const key3 = generateDocumentKey(episodeNumber);

          // Assert: All keys are identical
          expect(key1).toBe(key2);
          expect(key2).toBe(key3);
          expect(key1).toBe(key3);

          // Assert: Keys are deterministic (no randomness)
          expect(key1).toBe(`kb-documents/${episodeNumber}.txt`);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5 (continued): Edge cases for episode numbers
   * 
   * For edge case episode numbers (very small, very large),
   * the naming convention should still be consistent.
   */
  test('should handle edge case episode numbers correctly', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(1),           // Minimum episode
          fc.constant(999999),      // Large episode
          fc.integer({ min: 1, max: 10 }),      // Small episodes
          fc.integer({ min: 10000, max: 99999 }) // Large episodes
        ),
        (episodeNumber) => {
          // Act: Generate document key
          const documentKey = generateDocumentKey(episodeNumber);

          // Assert: Key follows pattern regardless of episode size
          expect(documentKey).toMatch(/^kb-documents\/\d+\.txt$/);

          // Assert: Episode can be extracted correctly
          const extracted = extractEpisodeFromKey(documentKey);
          expect(extracted).toBe(episodeNumber);

          // Assert: Key is valid S3 key
          expect(documentKey.length).toBeGreaterThan(0);
          expect(documentKey.length).toBeLessThan(1024);
        }
      ),
      { numRuns: 100 }
    );
  });
});
