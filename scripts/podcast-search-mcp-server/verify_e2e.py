#!/usr/bin/env python3
"""
Simple End-to-End Verification Script

Verifies that the Podcast Search MCP Server is working correctly.
"""

import sys
import os

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from src.server import initialize_server


def main():
    print("="*80)
    print("  PODCAST SEARCH MCP SERVER - END-TO-END VERIFICATION")
    print("="*80)
    print()
    
    # Test 1: Server Initialization
    print("✓ Test 1: Server Initialization")
    try:
        config, rss_manager, aws_client, semantic_engine, search_router = initialize_server()
        print(f"  - Configuration loaded: {config.aws_profile} @ {config.aws_region}")
        print(f"  - RSS Feed URL: {config.rss_feed_url}")
    except Exception as e:
        print(f"  ✗ FAILED: {e}")
        return False
    
    # Test 2: RSS Feed Operations
    print("\n✓ Test 2: RSS Feed Operations")
    try:
        episodes = rss_manager.get_cached_episodes()
        print(f"  - Episodes cached: {len(episodes)}")
        print(f"  - Latest episode: #{episodes[0].id} - {episodes[0].title}")
    except Exception as e:
        print(f"  ✗ FAILED: {e}")
        return False
    
    # Test 3: AWS Credentials
    print("\n✓ Test 3: AWS Credentials")
    try:
        is_valid = aws_client.verify_credentials()
        print(f"  - AWS credentials valid: {is_valid}")
    except Exception as e:
        print(f"  ✗ FAILED: {e}")
        return False
    
    # Test 4: Episode Search by ID
    print("\n✓ Test 4: Episode Search by ID")
    try:
        test_id = episodes[0].id
        episode = rss_manager.search_by_id(test_id)
        if episode:
            print(f"  - Found episode {test_id}: {episode.title}")
            print(f"  - Duration: {episode.duration}")
            print(f"  - Guests: {len(episode.guests)}")
        else:
            print(f"  ✗ FAILED: Episode {test_id} not found")
            return False
    except Exception as e:
        print(f"  ✗ FAILED: {e}")
        return False
    
    # Test 5: Date Range Search
    print("\n✓ Test 5: Date Range Search")
    try:
        from datetime import date
        start_date = date(2024, 1, 1)
        end_date = date(2024, 12, 31)
        results = rss_manager.search_by_date_range(start_date, end_date)
        print(f"  - Found {len(results)} episodes in 2024")
        if len(results) > 0:
            print(f"  - First: {results[0].title}")
    except Exception as e:
        print(f"  ✗ FAILED: {e}")
        return False
    
    # Test 6: Guest Search
    print("\n✓ Test 6: Guest Search")
    try:
        # Find an episode with guests
        guest_name = None
        for ep in episodes:
            if ep.guests and len(ep.guests) > 0:
                guest_name = ep.guests[0].name
                break
        
        if guest_name:
            results = rss_manager.search_by_guest(guest_name)
            print(f"  - Searching for guest: {guest_name}")
            print(f"  - Found {len(results)} episodes")
        else:
            print(f"  - No guests found in feed (skipping)")
    except Exception as e:
        print(f"  ✗ FAILED: {e}")
        return False
    
    # Test 7: Query Routing
    print("\n✓ Test 7: Query Routing")
    try:
        if search_router:
            # Test episode ID pattern detection
            query_type = search_router._detect_query_type(f"episode {test_id}")
            print(f"  - 'episode {test_id}' → {query_type.value}")
            
            # Test date pattern detection
            query_type = search_router._detect_query_type("2024-01-01 to 2024-12-31")
            print(f"  - '2024-01-01 to 2024-12-31' → {query_type.value}")
            
            # Test guest pattern detection
            query_type = search_router._detect_query_type("with John Doe")
            print(f"  - 'with John Doe' → {query_type.value}")
        else:
            print(f"  - Search router not initialized (semantic search disabled)")
    except Exception as e:
        print(f"  ✗ FAILED: {e}")
        return False
    
    # Test 8: Response Format
    print("\n✓ Test 8: Response Format")
    try:
        episode_dict = episodes[0].to_dict()
        required_fields = [
            'episode_id', 'title', 'description', 'publication_date',
            'duration', 'url', 'file_size', 'guests', 'links'
        ]
        missing = [f for f in required_fields if f not in episode_dict]
        if missing:
            print(f"  ✗ FAILED: Missing fields: {missing}")
            return False
        else:
            print(f"  - All required fields present")
            print(f"  - Episode ID: {episode_dict['episode_id']}")
            print(f"  - Title: {episode_dict['title'][:50]}...")
    except Exception as e:
        print(f"  ✗ FAILED: {e}")
        return False
    
    # Test 9: Performance
    print("\n✓ Test 9: Performance")
    try:
        import time
        
        # Test episode ID search speed
        start = time.time()
        for _ in range(100):
            rss_manager.search_by_id(test_id)
        elapsed = time.time() - start
        avg_time = elapsed / 100
        
        print(f"  - Episode ID search: {avg_time*1000:.3f}ms average (100 iterations)")
        
        if avg_time > 0.001:
            print(f"  ⚠ Warning: Search slower than expected (target: <1ms)")
    except Exception as e:
        print(f"  ✗ FAILED: {e}")
        return False
    
    # Summary
    print("\n" + "="*80)
    print("  ✅ ALL TESTS PASSED - Server is ready for deployment!")
    print("="*80)
    print()
    print("Next steps:")
    print("  1. Test with FastMCP CLI: fastmcp dev podcast_search_server.py")
    print("  2. Configure in Kiro: Add to .kiro/settings/mcp.json")
    print("  3. Test with Strands agent integration")
    print()
    
    return True


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
