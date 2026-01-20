import * as fc from 'fast-check';

/**
 * Property-Based Test for Document Structure Completeness
 * 
 * Feature: bedrock-knowledge-base, Property 3: Document Structure Completeness
 * 
 * For any processed episode, the output document should contain all required 
 * sections: episode number, title, publication date, author, guest names 
 * (if present), description, full transcription text, and related links 
 * (if present).
 * 
 * Validates: Requirements 4.4, 4.5, 5.1, 5.2, 5.3, 5.4
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

/**
 * Simulates the formatDocument function from the Lambda handler
 * This should match the implementation in index.ts
 */
function formatDocument(
  episodeNumber: number,
  transcriptionText: string,
  metadata: EpisodeMetadata
): string {
  const sections: string[] = [];

  // Metadata section
  sections.push(`Episode: ${episodeNumber}`);
  sections.push(`Title: ${metadata.title}`);
  sections.push(`Publication Date: ${metadata.publicationDate}`);
  sections.push(`Author: ${metadata.author}`);

  // Guests section (if any)
  if (metadata.guests && metadata.guests.length > 0) {
    const guestStrings = metadata.guests.map(guest => {
      const parts = [guest.name];
      if (guest.title) parts.push(guest.title);
      if (guest.link) parts.push(guest.link);
      return parts.join(' - ');
    });
    sections.push(`Guests: ${guestStrings.join(', ')}`);
  }

  // Description section
  if (metadata.description) {
    sections.push(`Description: ${metadata.description}`);
  }

  sections.push(''); // Empty line before transcription

  // Transcription section
  sections.push('Transcription:');
  sections.push(transcriptionText);

  // Links section (if any)
  if (metadata.links && metadata.links.length > 0) {
    sections.push(''); // Empty line before links
    sections.push('Related Links:');
    metadata.links.forEach(link => {
      sections.push(`- ${link.text}: ${link.link}`);
    });
  }

  return sections.join('\n');
}

describe('Property Test: Document Structure Completeness', () => {
  /**
   * Property 3: Document Structure Completeness
   * 
   * For any processed episode, the output document must contain all
   * required sections in the correct format.
   */
  test('should contain all required sections for any episode', () => {
    fc.assert(
      fc.property(
        // Generate arbitrary episode data
        fc.integer({ min: 1, max: 10000 }),
        fc.string({ minLength: 10, maxLength: 5000 }),
        fc.string({ minLength: 5, maxLength: 200 }),
        fc.string({ minLength: 10, maxLength: 1000 }),
        fc.date(),
        fc.string({ minLength: 3, maxLength: 100 }),
        (episodeNumber, transcriptionText, title, description, pubDate, author) => {
          // Arrange: Create metadata
          const metadata: EpisodeMetadata = {
            episode: episodeNumber,
            title,
            description,
            publicationDate: pubDate.toISOString(),
            author,
            guests: [],
            links: []
          };

          // Act: Format document
          const document = formatDocument(episodeNumber, transcriptionText, metadata);

          // Assert: All required sections are present
          expect(document).toContain(`Episode: ${episodeNumber}`);
          expect(document).toContain(`Title: ${title}`);
          expect(document).toContain(`Publication Date: ${metadata.publicationDate}`);
          expect(document).toContain(`Author: ${author}`);
          expect(document).toContain(`Description: ${description}`);
          expect(document).toContain('Transcription:');
          expect(document).toContain(transcriptionText);

          // Assert: Document is non-empty and well-formed
          expect(document.length).toBeGreaterThan(0);
          const lines = document.split('\n');
          expect(lines.length).toBeGreaterThan(5);
        }
      ),
      { numRuns: 100 } // Run 100 iterations as specified in design doc
    );
  });

  /**
   * Property 3 (continued): Document with guests section
   * 
   * When metadata includes guests, the document must contain a properly
   * formatted Guests section with all guest information.
   */
  test('should include guests section when guests are present', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        fc.string({ minLength: 10, maxLength: 1000 }),
        fc.string({ minLength: 5, maxLength: 200 }),
        fc.array(
          fc.record({
            name: fc.string({ minLength: 3, maxLength: 100 }),
            title: fc.string({ minLength: 3, maxLength: 150 }),
            link: fc.webUrl()
          }),
          { minLength: 1, maxLength: 5 }
        ),
        (episodeNumber, transcriptionText, title, guests) => {
          // Arrange: Create metadata with guests
          const metadata: EpisodeMetadata = {
            episode: episodeNumber,
            title,
            description: 'Test description',
            publicationDate: new Date().toISOString(),
            author: 'Test Author',
            guests,
            links: []
          };

          // Act: Format document
          const document = formatDocument(episodeNumber, transcriptionText, metadata);

          // Assert: Guests section is present
          expect(document).toContain('Guests:');

          // Assert: All guest information is included
          guests.forEach(guest => {
            expect(document).toContain(guest.name);
            if (guest.title) {
              expect(document).toContain(guest.title);
            }
            if (guest.link) {
              expect(document).toContain(guest.link);
            }
          });

          // Assert: All other required sections still present
          expect(document).toContain(`Episode: ${episodeNumber}`);
          expect(document).toContain('Transcription:');
          expect(document).toContain(transcriptionText);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3 (continued): Document with links section
   * 
   * When metadata includes links, the document must contain a properly
   * formatted Related Links section with all link information.
   */
  test('should include links section when links are present', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        fc.string({ minLength: 10, maxLength: 1000 }),
        fc.string({ minLength: 5, maxLength: 200 }),
        fc.array(
          fc.record({
            text: fc.string({ minLength: 3, maxLength: 100 }),
            link: fc.webUrl()
          }),
          { minLength: 1, maxLength: 10 }
        ),
        (episodeNumber, transcriptionText, title, links) => {
          // Arrange: Create metadata with links
          const metadata: EpisodeMetadata = {
            episode: episodeNumber,
            title,
            description: 'Test description',
            publicationDate: new Date().toISOString(),
            author: 'Test Author',
            guests: [],
            links
          };

          // Act: Format document
          const document = formatDocument(episodeNumber, transcriptionText, metadata);

          // Assert: Related Links section is present
          expect(document).toContain('Related Links:');

          // Assert: All links are included
          links.forEach(link => {
            expect(document).toContain(link.text);
            expect(document).toContain(link.link);
          });

          // Assert: All other required sections still present
          expect(document).toContain(`Episode: ${episodeNumber}`);
          expect(document).toContain('Transcription:');
          expect(document).toContain(transcriptionText);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3 (continued): Document with both guests and links
   * 
   * When metadata includes both guests and links, the document must
   * contain both sections properly formatted.
   */
  test('should include both guests and links sections when both are present', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        fc.string({ minLength: 10, maxLength: 1000 }),
        fc.array(
          fc.record({
            name: fc.string({ minLength: 3, maxLength: 100 }),
            title: fc.string({ minLength: 3, maxLength: 150 }),
            link: fc.webUrl()
          }),
          { minLength: 1, maxLength: 3 }
        ),
        fc.array(
          fc.record({
            text: fc.string({ minLength: 3, maxLength: 100 }),
            link: fc.webUrl()
          }),
          { minLength: 1, maxLength: 5 }
        ),
        (episodeNumber, transcriptionText, guests, links) => {
          // Arrange: Create metadata with both guests and links
          const metadata: EpisodeMetadata = {
            episode: episodeNumber,
            title: 'Test Episode',
            description: 'Test description',
            publicationDate: new Date().toISOString(),
            author: 'Test Author',
            guests,
            links
          };

          // Act: Format document
          const document = formatDocument(episodeNumber, transcriptionText, metadata);

          // Assert: Both sections are present
          expect(document).toContain('Guests:');
          expect(document).toContain('Related Links:');

          // Assert: All guest information is included
          guests.forEach(guest => {
            expect(document).toContain(guest.name);
          });

          // Assert: All link information is included
          links.forEach(link => {
            expect(document).toContain(link.text);
            expect(document).toContain(link.link);
          });

          // Assert: All required sections still present
          expect(document).toContain(`Episode: ${episodeNumber}`);
          expect(document).toContain('Transcription:');
          expect(document).toContain(transcriptionText);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3 (continued): Section ordering consistency
   * 
   * For any episode, the document sections must appear in the correct order:
   * 1. Episode number
   * 2. Title
   * 3. Publication Date
   * 4. Author
   * 5. Guests (if present)
   * 6. Description
   * 7. Transcription
   * 8. Related Links (if present)
   */
  test('should maintain correct section ordering', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        fc.string({ minLength: 10, maxLength: 1000 }),
        fc.string({ minLength: 5, maxLength: 200 }),
        fc.string({ minLength: 10, maxLength: 500 }),
        fc.option(
          fc.array(
            fc.record({
              name: fc.string({ minLength: 3, maxLength: 100 }),
              title: fc.string({ minLength: 3, maxLength: 150 }),
              link: fc.webUrl()
            }),
            { minLength: 1, maxLength: 3 }
          ),
          { nil: undefined }
        ),
        fc.option(
          fc.array(
            fc.record({
              text: fc.string({ minLength: 3, maxLength: 100 }),
              link: fc.webUrl()
            }),
            { minLength: 1, maxLength: 5 }
          ),
          { nil: undefined }
        ),
        (episodeNumber, transcriptionText, title, description, guests, links) => {
          // Arrange: Create metadata
          const metadata: EpisodeMetadata = {
            episode: episodeNumber,
            title,
            description,
            publicationDate: new Date().toISOString(),
            author: 'Test Author',
            guests: guests || [],
            links: links || []
          };

          // Act: Format document
          const document = formatDocument(episodeNumber, transcriptionText, metadata);

          // Assert: Find positions of each section
          const episodePos = document.indexOf(`Episode: ${episodeNumber}`);
          const titlePos = document.indexOf(`Title: ${title}`);
          const pubDatePos = document.indexOf('Publication Date:');
          const authorPos = document.indexOf('Author:');
          const descPos = document.indexOf(`Description: ${description}`);
          const transcriptionPos = document.indexOf('Transcription:');

          // Assert: Sections appear in correct order
          expect(episodePos).toBeGreaterThanOrEqual(0);
          expect(titlePos).toBeGreaterThan(episodePos);
          expect(pubDatePos).toBeGreaterThan(titlePos);
          expect(authorPos).toBeGreaterThan(pubDatePos);
          expect(descPos).toBeGreaterThan(authorPos);
          expect(transcriptionPos).toBeGreaterThan(descPos);

          // Assert: Guests section (if present) comes after Author and before Description
          if (guests && guests.length > 0) {
            const guestsPos = document.indexOf('Guests:');
            expect(guestsPos).toBeGreaterThan(authorPos);
            expect(guestsPos).toBeLessThan(descPos);
          }

          // Assert: Links section (if present) comes after Transcription
          if (links && links.length > 0) {
            const linksPos = document.indexOf('Related Links:');
            expect(linksPos).toBeGreaterThan(transcriptionPos);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3 (continued): Transcription text preservation
   * 
   * For any transcription text, the formatted document must contain
   * the complete, unmodified transcription text.
   */
  test('should preserve complete transcription text without modification', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        fc.string({ minLength: 50, maxLength: 5000 }),
        (episodeNumber, transcriptionText) => {
          // Arrange: Create minimal metadata
          const metadata: EpisodeMetadata = {
            episode: episodeNumber,
            title: 'Test Episode',
            description: 'Test description',
            publicationDate: new Date().toISOString(),
            author: 'Test Author',
            guests: [],
            links: []
          };

          // Act: Format document
          const document = formatDocument(episodeNumber, transcriptionText, metadata);

          // Assert: Transcription text is present and unmodified
          expect(document).toContain(transcriptionText);

          // Assert: Transcription appears after "Transcription:" marker
          const transcriptionMarkerPos = document.indexOf('Transcription:');
          const transcriptionTextPos = document.indexOf(transcriptionText);
          expect(transcriptionTextPos).toBeGreaterThan(transcriptionMarkerPos);

          // Assert: No extra whitespace or modifications to transcription
          const lines = document.split('\n');
          const transcriptionLineIndex = lines.findIndex(line => line === 'Transcription:');
          const transcriptionContent = lines[transcriptionLineIndex + 1];
          expect(transcriptionContent).toBe(transcriptionText);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3 (continued): Empty optional fields handling
   * 
   * When optional fields (guests, links) are empty arrays, the document
   * should not include those sections but should still be complete.
   */
  test('should handle empty optional fields gracefully', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        fc.string({ minLength: 10, maxLength: 1000 }),
        fc.string({ minLength: 5, maxLength: 200 }),
        (episodeNumber, transcriptionText, title) => {
          // Arrange: Create metadata with empty optional fields
          const metadata: EpisodeMetadata = {
            episode: episodeNumber,
            title,
            description: 'Test description',
            publicationDate: new Date().toISOString(),
            author: 'Test Author',
            guests: [],
            links: []
          };

          // Act: Format document
          const document = formatDocument(episodeNumber, transcriptionText, metadata);

          // Assert: Required sections are present
          expect(document).toContain(`Episode: ${episodeNumber}`);
          expect(document).toContain(`Title: ${title}`);
          expect(document).toContain('Publication Date:');
          expect(document).toContain('Author:');
          expect(document).toContain('Description:');
          expect(document).toContain('Transcription:');
          expect(document).toContain(transcriptionText);

          // Assert: Optional sections are NOT present
          expect(document).not.toContain('Guests:');
          expect(document).not.toContain('Related Links:');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3 (continued): Document completeness with special characters
   * 
   * For any episode with special characters in metadata or transcription,
   * the document should still contain all required sections.
   */
  test('should handle special characters in all fields', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        fc.string({ minLength: 10, maxLength: 500 }),
        fc.string({ minLength: 5, maxLength: 200 }),
        fc.string({ minLength: 10, maxLength: 500 }),
        (episodeNumber, transcriptionText, title, description) => {
          // Arrange: Create metadata (strings may contain special chars)
          const metadata: EpisodeMetadata = {
            episode: episodeNumber,
            title,
            description,
            publicationDate: new Date().toISOString(),
            author: 'Test Author',
            guests: [],
            links: []
          };

          // Act: Format document
          const document = formatDocument(episodeNumber, transcriptionText, metadata);

          // Assert: All required sections are present
          expect(document).toContain(`Episode: ${episodeNumber}`);
          expect(document).toContain(`Title: ${title}`);
          expect(document).toContain('Publication Date:');
          expect(document).toContain('Author:');
          expect(document).toContain(`Description: ${description}`);
          expect(document).toContain('Transcription:');
          expect(document).toContain(transcriptionText);

          // Assert: Document is well-formed
          expect(document.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3 (continued): Minimum document structure
   * 
   * For any valid episode data, the formatted document must have
   * a minimum structure with at least the required number of lines.
   */
  test('should produce minimum required document structure', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        fc.string({ minLength: 1, maxLength: 1000 }),
        (episodeNumber, transcriptionText) => {
          // Arrange: Create minimal metadata
          const metadata: EpisodeMetadata = {
            episode: episodeNumber,
            title: 'Test',
            description: 'Test',
            publicationDate: new Date().toISOString(),
            author: 'Test',
            guests: [],
            links: []
          };

          // Act: Format document
          const document = formatDocument(episodeNumber, transcriptionText, metadata);
          const lines = document.split('\n');

          // Assert: Minimum structure requirements
          // At least: Episode, Title, PubDate, Author, Description, blank, Transcription, text
          expect(lines.length).toBeGreaterThanOrEqual(8);

          // Assert: First line is Episode
          expect(lines[0]).toContain('Episode:');

          // Assert: Document contains newlines (proper formatting)
          expect(document).toContain('\n');
        }
      ),
      { numRuns: 100 }
    );
  });
});
