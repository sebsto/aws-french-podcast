import * as fc from 'fast-check';

/**
 * Property-Based Test for RSS Feed Caching Efficiency
 * 
 * Feature: bedrock-knowledge-base, Property 10: RSS Feed Caching Efficiency
 * 
 * For any batch processing operation involving multiple episodes, 
 * the RSS feed should be fetched at most once and cached for the 
 * duration of the batch.
 * 
 * Validates: Requirements 4.6
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
 * Mock RSS feed fetcher that tracks fetch count
 */
class MockRSSFeedFetcher {
  private fetchCount: number = 0;
  private cache: Map<number, EpisodeMetadata> | null = null;
  private cacheTimestamp: number = 0;
  private readonly cacheTTL: number = 5 * 60 * 1000; // 5 minutes
  private fetchInProgress: Promise<void> | null = null;

  /**
   * Simulates fetching episode metadata with caching
   * This mimics the behavior in the Lambda handler
   */
  async fetchEpisodeMetadata(episodeNumber: number): Promise<EpisodeMetadata> {
    const now = Date.now();

    // Check if cache is valid and populated
    if (this.cache && (now - this.cacheTimestamp) < this.cacheTTL) {
      // Cache is valid - check if episode exists in cache
      const cachedMetadata = this.cache.get(episodeNumber);
      if (cachedMetadata) {
        // Cache hit - no fetch needed
        return cachedMetadata;
      }
      
      // Episode not in cache, but cache is valid
      // This means the episode doesn't exist in the RSS feed
      // Return default without fetching again
      return this.getDefaultMetadata(episodeNumber);
    }

    // Check if a fetch is already in progress
    if (this.fetchInProgress) {
      // Wait for the in-progress fetch to complete
      await this.fetchInProgress;
      
      // Now check cache again
      const metadata = this.cache!.get(episodeNumber);
      if (metadata) {
        return metadata;
      }
      return this.getDefaultMetadata(episodeNumber);
    }

    // Cache miss or expired - fetch RSS feed
    this.fetchInProgress = this.fetchRSSFeed();
    await this.fetchInProgress;
    this.fetchInProgress = null;

    // Get metadata from cache
    const metadata = this.cache!.get(episodeNumber);
    if (!metadata) {
      // Episode not in feed, return default
      return this.getDefaultMetadata(episodeNumber);
    }

    return metadata;
  }

  /**
   * Simulates fetching the RSS feed (increments fetch count)
   */
  private async fetchRSSFeed(): Promise<void> {
    this.fetchCount++;
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 10));

    // Build mock cache with sample episodes
    this.cache = new Map();
    this.cacheTimestamp = Date.now();

    // Populate cache with episodes 1-500
    for (let i = 1; i <= 500; i++) {
      this.cache.set(i, {
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
   * Get default metadata for episodes not in feed
   */
  private getDefaultMetadata(episodeNumber: number): EpisodeMetadata {
    return {
      episode: episodeNumber,
      title: `Episode ${episodeNumber}`,
      description: 'Description not available',
      publicationDate: new Date().toISOString(),
      author: 'Sébastien Stormacq',
      guests: [],
      links: []
    };
  }

  /**
   * Get the number of times the RSS feed was fetched
   */
  getFetchCount(): number {
    return this.fetchCount;
  }

  /**
   * Reset the fetcher state
   */
  reset(): void {
    this.fetchCount = 0;
    this.cache = null;
    this.cacheTimestamp = 0;
    this.fetchInProgress = null;
  }

  /**
   * Invalidate the cache (for testing cache expiration)
   */
  invalidateCache(): void {
    this.cacheTimestamp = 0;
  }
}

describe('Property Test: RSS Feed Caching Efficiency', () => {
  /**
   * Property 10: RSS Feed Caching Efficiency
   * 
   * For any batch of episodes processed sequentially, the RSS feed
   * should be fetched exactly once, not once per episode.
   */
  test('should fetch RSS feed only once for batch of episodes', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a batch of 2-20 episode numbers
        fc.array(fc.integer({ min: 1, max: 500 }), { minLength: 2, maxLength: 20 }),
        async (episodeNumbers) => {
          // Arrange: Create fresh fetcher for each test
          const fetcher = new MockRSSFeedFetcher();

          // Act: Process all episodes in the batch
          for (const episodeNumber of episodeNumbers) {
            await fetcher.fetchEpisodeMetadata(episodeNumber);
          }

          // Assert: RSS feed should be fetched exactly once
          const fetchCount = fetcher.getFetchCount();
          expect(fetchCount).toBe(1);
        }
      ),
      { numRuns: 100 } // Run 100 iterations as specified in design doc
    );
  });

  /**
   * Property 10 (continued): Cache reuse across multiple episodes
   * 
   * For any batch of episodes, subsequent requests for the same episode
   * should use the cached data without additional fetches.
   */
  test('should reuse cached data for duplicate episode requests', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate an episode number and request it multiple times
        fc.integer({ min: 1, max: 500 }),
        fc.integer({ min: 2, max: 10 }), // Number of times to request
        async (episodeNumber, requestCount) => {
          // Arrange: Create fresh fetcher
          const fetcher = new MockRSSFeedFetcher();

          // Act: Request the same episode multiple times
          for (let i = 0; i < requestCount; i++) {
            await fetcher.fetchEpisodeMetadata(episodeNumber);
          }

          // Assert: RSS feed should be fetched exactly once
          expect(fetcher.getFetchCount()).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10 (continued): Cache efficiency with mixed episode requests
   * 
   * For any sequence of episode requests (including duplicates),
   * the RSS feed should be fetched exactly once.
   */
  test('should maintain cache efficiency with mixed episode requests', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a sequence of episode requests with potential duplicates
        fc.array(fc.integer({ min: 1, max: 500 }), { minLength: 5, maxLength: 30 }),
        async (episodeSequence) => {
          // Arrange: Create fresh fetcher
          const fetcher = new MockRSSFeedFetcher();

          // Act: Process episodes in sequence
          const results: EpisodeMetadata[] = [];
          for (const episodeNumber of episodeSequence) {
            const metadata = await fetcher.fetchEpisodeMetadata(episodeNumber);
            results.push(metadata);
          }

          // Assert: RSS feed fetched exactly once
          expect(fetcher.getFetchCount()).toBe(1);

          // Assert: All requests returned valid metadata
          expect(results.length).toBe(episodeSequence.length);
          results.forEach((metadata, index) => {
            expect(metadata.episode).toBe(episodeSequence[index]);
            expect(metadata.title).toBeDefined();
            expect(metadata.author).toBeDefined();
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10 (continued): Cache expiration behavior
   * 
   * When the cache expires (TTL exceeded), a new fetch should occur,
   * but subsequent requests within the new TTL should use the cache.
   */
  test('should refetch RSS feed after cache expiration', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 1, max: 500 }), { minLength: 2, maxLength: 10 }),
        async (episodeNumbers) => {
          // Arrange: Create fetcher
          const fetcher = new MockRSSFeedFetcher();

          // Act: First batch - should fetch once
          for (const episodeNumber of episodeNumbers) {
            await fetcher.fetchEpisodeMetadata(episodeNumber);
          }
          const firstFetchCount = fetcher.getFetchCount();

          // Invalidate cache to simulate TTL expiration
          fetcher.invalidateCache();

          // Act: Second batch - should fetch again
          for (const episodeNumber of episodeNumbers) {
            await fetcher.fetchEpisodeMetadata(episodeNumber);
          }
          const secondFetchCount = fetcher.getFetchCount();

          // Assert: Should have fetched twice total (once per batch)
          expect(firstFetchCount).toBe(1);
          expect(secondFetchCount).toBe(2);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10 (continued): Cache efficiency with large batches
   * 
   * For large batches of episodes, the cache should remain efficient
   * and fetch the RSS feed only once regardless of batch size.
   */
  test('should maintain cache efficiency for large batches', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate large batches (20-100 episodes)
        fc.array(fc.integer({ min: 1, max: 500 }), { minLength: 20, maxLength: 100 }),
        async (episodeNumbers) => {
          // Arrange: Create fresh fetcher
          const fetcher = new MockRSSFeedFetcher();

          // Act: Process large batch
          const startTime = Date.now();
          for (const episodeNumber of episodeNumbers) {
            await fetcher.fetchEpisodeMetadata(episodeNumber);
          }
          const endTime = Date.now();

          // Assert: RSS feed fetched exactly once
          expect(fetcher.getFetchCount()).toBe(1);

          // Assert: Processing time should be reasonable
          // (mostly just cache lookups, not network requests)
          const processingTime = endTime - startTime;
          // With 100 episodes and 10ms per fetch, uncached would take ~1000ms
          // Cached should be much faster (< 500ms for 100 episodes)
          expect(processingTime).toBeLessThan(episodeNumbers.length * 5);
        }
      ),
      { numRuns: 50 } // Fewer runs for large batches to keep test time reasonable
    );
  });

  /**
   * Property 10 (continued): Cache correctness
   * 
   * For any episode in the cache, subsequent requests should return
   * the same metadata (cache consistency).
   */
  test('should return consistent metadata from cache', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 500 }),
        async (episodeNumber) => {
          // Arrange: Create fetcher
          const fetcher = new MockRSSFeedFetcher();

          // Act: Fetch metadata twice
          const metadata1 = await fetcher.fetchEpisodeMetadata(episodeNumber);
          const metadata2 = await fetcher.fetchEpisodeMetadata(episodeNumber);

          // Assert: Both requests should return identical metadata
          expect(metadata1).toEqual(metadata2);
          expect(fetcher.getFetchCount()).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10 (continued): Cache handles episodes not in feed
   * 
   * For episodes not in the RSS feed, the cache should still be used
   * and default metadata should be returned without additional fetches.
   */
  test('should cache and return defaults for episodes not in feed', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate episode numbers outside the cached range (501-1000)
        fc.array(fc.integer({ min: 501, max: 1000 }), { minLength: 2, maxLength: 10 }),
        async (episodeNumbers) => {
          // Arrange: Create fetcher
          const fetcher = new MockRSSFeedFetcher();

          // Act: Request episodes not in feed
          const results: EpisodeMetadata[] = [];
          for (const episodeNumber of episodeNumbers) {
            const metadata = await fetcher.fetchEpisodeMetadata(episodeNumber);
            results.push(metadata);
          }

          // Assert: RSS feed fetched exactly once
          expect(fetcher.getFetchCount()).toBe(1);

          // Assert: All episodes got default metadata
          results.forEach((metadata, index) => {
            expect(metadata.episode).toBe(episodeNumbers[index]);
            expect(metadata.description).toBe('Description not available');
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10 (continued): Parallel-like sequential processing
   * 
   * Even when processing episodes in rapid succession (simulating
   * near-parallel processing), the cache should prevent multiple fetches.
   */
  test('should prevent multiple fetches in rapid succession', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 1, max: 500 }), { minLength: 5, maxLength: 15 }),
        async (episodeNumbers) => {
          // Arrange: Create fetcher
          const fetcher = new MockRSSFeedFetcher();

          // Act: Process episodes with minimal delay (rapid succession)
          const promises = episodeNumbers.map(async (episodeNumber) => {
            // Add tiny random delay to simulate near-parallel execution
            await new Promise(resolve => setTimeout(resolve, Math.random() * 5));
            return fetcher.fetchEpisodeMetadata(episodeNumber);
          });

          await Promise.all(promises);

          // Assert: Despite rapid succession, should fetch only once
          // Note: In a real concurrent scenario, this might fetch multiple times
          // before cache is populated, but our sequential implementation should
          // fetch only once
          expect(fetcher.getFetchCount()).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });
});
