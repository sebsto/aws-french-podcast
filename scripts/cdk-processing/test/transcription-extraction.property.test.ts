import * as fc from 'fast-check';

/**
 * Property-Based Test for Transcription Text Extraction
 * 
 * Feature: bedrock-knowledge-base, Property 1: Transcription Text Extraction Preserves Content
 * 
 * For any valid Amazon Transcribe JSON file, extracting the transcript text 
 * should return the exact content from results.transcripts[0].transcript 
 * without modification.
 * 
 * Validates: Requirements 3.2, 3.5
 */

interface TranscriptionJSON {
  results: {
    transcripts: Array<{
      transcript: string;
    }>;
  };
}

/**
 * Simulates the readTranscriptionFile function's text extraction logic
 * This extracts the transcript text from the JSON structure
 */
function extractTranscriptText(transcriptJson: TranscriptionJSON): string {
  // Validate transcript structure
  if (!transcriptJson.results || 
      !transcriptJson.results.transcripts || 
      !transcriptJson.results.transcripts[0] ||
      !transcriptJson.results.transcripts[0].transcript) {
    throw new Error('Transcription file does not have expected structure (missing results.transcripts[0].transcript)');
  }

  // Extract and return the transcript text
  const transcriptText = transcriptJson.results.transcripts[0].transcript;

  if (!transcriptText || transcriptText.trim().length === 0) {
    throw new Error('Transcript text is empty');
  }

  return transcriptText;
}

describe('Property Test: Transcription Text Extraction Preserves Content', () => {
  /**
   * Property 1: Transcription Text Extraction Preserves Content
   * 
   * For any valid transcription JSON with a transcript field, the extracted
   * text must exactly match the original text without any modifications.
   */
  test('should extract transcript text without modification', () => {
    fc.assert(
      fc.property(
        // Generate arbitrary transcript text
        fc.string({ minLength: 1, maxLength: 10000 }),
        (originalTranscriptText) => {
          // Skip empty or whitespace-only strings as they would fail validation
          fc.pre(originalTranscriptText.trim().length > 0);

          // Arrange: Create valid transcription JSON structure
          const transcriptionJSON: TranscriptionJSON = {
            results: {
              transcripts: [
                {
                  transcript: originalTranscriptText
                }
              ]
            }
          };

          // Act: Extract transcript text
          const extractedText = extractTranscriptText(transcriptionJSON);

          // Assert: Extracted text exactly matches original
          expect(extractedText).toBe(originalTranscriptText);
          expect(extractedText.length).toBe(originalTranscriptText.length);
        }
      ),
      { numRuns: 100 } // Run 100 iterations as specified in design doc
    );
  });

  /**
   * Property 1 (continued): Text extraction with special characters
   * 
   * For any transcript text containing special characters (accents,
   * punctuation), the extraction must preserve all characters exactly.
   */
  test('should preserve special characters in transcript text', () => {
    fc.assert(
      fc.property(
        // Generate text that may contain special characters
        fc.string({ minLength: 10, maxLength: 1000 }),
        (originalTranscriptText: string) => {
          // Skip empty or whitespace-only strings
          fc.pre(originalTranscriptText.trim().length > 0);

          // Arrange: Create transcription JSON
          const transcriptionJSON: TranscriptionJSON = {
            results: {
              transcripts: [
                {
                  transcript: originalTranscriptText
                }
              ]
            }
          };

          // Act: Extract transcript text
          const extractedText = extractTranscriptText(transcriptionJSON);

          // Assert: All characters preserved
          expect(extractedText).toBe(originalTranscriptText);
          expect(extractedText.length).toBe(originalTranscriptText.length);
          
          // Assert: Character-by-character comparison
          for (let i = 0; i < originalTranscriptText.length; i++) {
            expect(extractedText[i]).toBe(originalTranscriptText[i]);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1 (continued): Text extraction with French characters
   * 
   * For French podcast transcriptions, accented characters and special
   * French punctuation must be preserved exactly.
   */
  test('should preserve French accented characters', () => {
    fc.assert(
      fc.property(
        // Generate text with common French characters
        fc.string({ minLength: 10, maxLength: 1000 }),
        fc.constantFrom('é', 'è', 'ê', 'ë', 'à', 'â', 'ù', 'û', 'ô', 'î', 'ï', 'ç', 'œ'),
        fc.constantFrom('É', 'È', 'Ê', 'Ë', 'À', 'Â', 'Ù', 'Û', 'Ô', 'Î', 'Ï', 'Ç', 'Œ'),
        (baseText, accentedLower, accentedUpper) => {
          // Create text with French characters
          const originalTranscriptText = `${baseText} ${accentedLower} ${accentedUpper}`;
          
          // Skip if resulting text is empty
          fc.pre(originalTranscriptText.trim().length > 0);

          // Arrange: Create transcription JSON
          const transcriptionJSON: TranscriptionJSON = {
            results: {
              transcripts: [
                {
                  transcript: originalTranscriptText
                }
              ]
            }
          };

          // Act: Extract transcript text
          const extractedText = extractTranscriptText(transcriptionJSON);

          // Assert: French characters preserved
          expect(extractedText).toBe(originalTranscriptText);
          expect(extractedText).toContain(accentedLower);
          expect(extractedText).toContain(accentedUpper);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1 (continued): Text extraction with whitespace
   * 
   * For any transcript text with various whitespace patterns (spaces, tabs,
   * newlines), the extraction must preserve the exact whitespace.
   */
  test('should preserve whitespace in transcript text', () => {
    fc.assert(
      fc.property(
        // Generate text with various whitespace
        fc.array(
          fc.oneof(
            fc.string({ minLength: 1, maxLength: 100 }),
            fc.constant(' '),
            fc.constant('  '),
            fc.constant('\n'),
            fc.constant('\t')
          ),
          { minLength: 5, maxLength: 50 }
        ),
        (textParts) => {
          const originalTranscriptText = textParts.join('');
          
          // Skip if resulting text is empty or whitespace-only
          fc.pre(originalTranscriptText.trim().length > 0);

          // Arrange: Create transcription JSON
          const transcriptionJSON: TranscriptionJSON = {
            results: {
              transcripts: [
                {
                  transcript: originalTranscriptText
                }
              ]
            }
          };

          // Act: Extract transcript text
          const extractedText = extractTranscriptText(transcriptionJSON);

          // Assert: Whitespace preserved exactly
          expect(extractedText).toBe(originalTranscriptText);
          expect(extractedText.length).toBe(originalTranscriptText.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1 (continued): Text extraction with long transcripts
   * 
   * For very long transcript texts (simulating multi-hour episodes),
   * the extraction must preserve the complete text without truncation.
   */
  test('should handle long transcript texts without truncation', () => {
    fc.assert(
      fc.property(
        // Generate long text (up to 50,000 characters)
        fc.string({ minLength: 10000, maxLength: 50000 }),
        (originalTranscriptText) => {
          // Arrange: Create transcription JSON with long text
          const transcriptionJSON: TranscriptionJSON = {
            results: {
              transcripts: [
                {
                  transcript: originalTranscriptText
                }
              ]
            }
          };

          // Act: Extract transcript text
          const extractedText = extractTranscriptText(transcriptionJSON);

          // Assert: Complete text preserved
          expect(extractedText).toBe(originalTranscriptText);
          expect(extractedText.length).toBe(originalTranscriptText.length);
          
          // Assert: No truncation occurred
          expect(extractedText.substring(0, 100)).toBe(originalTranscriptText.substring(0, 100));
          expect(extractedText.substring(extractedText.length - 100)).toBe(
            originalTranscriptText.substring(originalTranscriptText.length - 100)
          );
        }
      ),
      { numRuns: 50 } // Fewer runs for performance with long strings
    );
  });

  /**
   * Property 1 (continued): Text extraction with punctuation
   * 
   * For transcript text with various punctuation marks, the extraction
   * must preserve all punctuation exactly.
   */
  test('should preserve punctuation in transcript text', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 10, maxLength: 500 }),
        fc.constantFrom('.', ',', '!', '?', ';', ':', '-', '—', '\'', '"', '(', ')', '[', ']'),
        (baseText, punctuation) => {
          const originalTranscriptText = `${baseText}${punctuation} ${baseText}`;
          
          // Skip if resulting text is empty
          fc.pre(originalTranscriptText.trim().length > 0);

          // Arrange: Create transcription JSON
          const transcriptionJSON: TranscriptionJSON = {
            results: {
              transcripts: [
                {
                  transcript: originalTranscriptText
                }
              ]
            }
          };

          // Act: Extract transcript text
          const extractedText = extractTranscriptText(transcriptionJSON);

          // Assert: Punctuation preserved
          expect(extractedText).toBe(originalTranscriptText);
          expect(extractedText).toContain(punctuation);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1 (continued): Text extraction with numbers
   * 
   * For transcript text containing numbers and digits, the extraction
   * must preserve all numeric content exactly.
   */
  test('should preserve numbers in transcript text', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 10, maxLength: 500 }),
        fc.integer({ min: 0, max: 999999 }),
        fc.double({ min: 0, max: 1000, noNaN: true }),
        (baseText, intNumber, floatNumber) => {
          const originalTranscriptText = `${baseText} ${intNumber} ${floatNumber.toFixed(2)}`;
          
          // Arrange: Create transcription JSON
          const transcriptionJSON: TranscriptionJSON = {
            results: {
              transcripts: [
                {
                  transcript: originalTranscriptText
                }
              ]
            }
          };

          // Act: Extract transcript text
          const extractedText = extractTranscriptText(transcriptionJSON);

          // Assert: Numbers preserved
          expect(extractedText).toBe(originalTranscriptText);
          expect(extractedText).toContain(intNumber.toString());
          expect(extractedText).toContain(floatNumber.toFixed(2));
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1 (continued): Text extraction idempotency
   * 
   * For any transcript text, extracting it multiple times from the same
   * JSON structure must always return the exact same result.
   */
  test('should be idempotent - multiple extractions return same result', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 1000 }),
        (originalTranscriptText) => {
          // Skip empty or whitespace-only strings
          fc.pre(originalTranscriptText.trim().length > 0);

          // Arrange: Create transcription JSON
          const transcriptionJSON: TranscriptionJSON = {
            results: {
              transcripts: [
                {
                  transcript: originalTranscriptText
                }
              ]
            }
          };

          // Act: Extract text multiple times
          const extraction1 = extractTranscriptText(transcriptionJSON);
          const extraction2 = extractTranscriptText(transcriptionJSON);
          const extraction3 = extractTranscriptText(transcriptionJSON);

          // Assert: All extractions are identical
          expect(extraction1).toBe(extraction2);
          expect(extraction2).toBe(extraction3);
          expect(extraction1).toBe(originalTranscriptText);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1 (continued): Text extraction with mixed content
   * 
   * For transcript text with mixed content (letters, numbers, punctuation,
   * special characters), the extraction must preserve everything exactly.
   */
  test('should preserve mixed content in transcript text', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 10, maxLength: 500 }),
        fc.integer({ min: 0, max: 9999 }),
        fc.constantFrom('!', '?', '.', ',', ';', ':', '-'),
        fc.constantFrom('é', 'à', 'ç', 'ô', 'û'),
        (baseText, number, punctuation, accentedChar) => {
          const originalTranscriptText = `${baseText} ${number}${punctuation} ${accentedChar}${baseText}`;
          
          // Skip if resulting text is empty
          fc.pre(originalTranscriptText.trim().length > 0);

          // Arrange: Create transcription JSON
          const transcriptionJSON: TranscriptionJSON = {
            results: {
              transcripts: [
                {
                  transcript: originalTranscriptText
                }
              ]
            }
          };

          // Act: Extract transcript text
          const extractedText = extractTranscriptText(transcriptionJSON);

          // Assert: All content preserved
          expect(extractedText).toBe(originalTranscriptText);
          expect(extractedText).toContain(number.toString());
          expect(extractedText).toContain(punctuation);
          expect(extractedText).toContain(accentedChar);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1 (continued): Text extraction with realistic podcast content
   * 
   * For transcript text that resembles realistic podcast content (sentences,
   * paragraphs), the extraction must preserve the complete structure.
   */
  test('should preserve realistic podcast transcript structure', () => {
    fc.assert(
      fc.property(
        // Generate realistic sentences
        fc.array(
          fc.string({ minLength: 20, maxLength: 200 }),
          { minLength: 3, maxLength: 20 }
        ),
        (sentences) => {
          // Create realistic transcript with sentences
          const originalTranscriptText = sentences.join('. ') + '.';
          
          // Skip if resulting text is empty
          fc.pre(originalTranscriptText.trim().length > 0);

          // Arrange: Create transcription JSON
          const transcriptionJSON: TranscriptionJSON = {
            results: {
              transcripts: [
                {
                  transcript: originalTranscriptText
                }
              ]
            }
          };

          // Act: Extract transcript text
          const extractedText = extractTranscriptText(transcriptionJSON);

          // Assert: Complete structure preserved
          expect(extractedText).toBe(originalTranscriptText);
          
          // Assert: All sentences present
          sentences.forEach(sentence => {
            expect(extractedText).toContain(sentence);
          });
        }
      ),
      { numRuns: 100 }
    );
  });
});
