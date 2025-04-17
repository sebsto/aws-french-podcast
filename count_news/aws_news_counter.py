#!/usr/bin/env python3

import feedparser
import datetime
import re
from dateutil import parser as date_parser
from dateutil.tz import tzutc
import sys

def is_regional_expansion(entry_title, entry_summary):
    """Check if an entry is about regional expansion."""
    # Common patterns for regional expansion announcements
    region_patterns = [
        r"now available in",
        r"expands to",
        r"launches in",
        r"available in the .* region",
        r"available in .* region",
        r"expands to .* region",
        r"now in",
        r"adds .* region",
        r"adds support for .* region"
    ]
    
    # Check title and summary for region expansion patterns
    for pattern in region_patterns:
        if re.search(pattern, entry_title.lower()) or re.search(pattern, entry_summary.lower()):
            return True
    
    return False

def count_recent_entries():
    """Count entries in the AWS news feed from the last two weeks, excluding regional expansions."""
    # Parse the RSS feed
    feed_url = "https://aws.amazon.com/about-aws/whats-new/recent/feed/"
    try:
        feed = feedparser.parse(feed_url)
    except Exception as e:
        print(f"Error fetching or parsing the feed: {e}")
        return
    
    # Calculate the date two weeks ago with timezone info (UTC)
    two_weeks_ago = datetime.datetime.now(tzutc()) - datetime.timedelta(weeks=2)
    
    # Count entries
    total_entries = 0
    regional_expansions = 0
    recent_entries = []
    
    for entry in feed.entries:
        try:
            # Parse the publication date (will include timezone info)
            pub_date = date_parser.parse(entry.published)
            
            # Check if the entry is within the last two weeks
            if pub_date >= two_weeks_ago:
                # print(f"Processing entry: pub_date={pub_date}, title={entry.title}")
                total_entries += 1
                
                # Check if it's a regional expansion
                if is_regional_expansion(entry.title, entry.summary):
                    regional_expansions += 1
                else:
                    recent_entries.append(entry.title)
        except Exception as e:
            print(f"Error processing entry {entry.title}: {e}")
    
    # Print results
    print(f"Total entries in the last two weeks: {total_entries}")
    print(f"Regional expansion entries: {regional_expansions}")
    print(f"Non-regional expansion entries: {total_entries - regional_expansions}")
    
    return total_entries, regional_expansions, total_entries - regional_expansions

if __name__ == "__main__":
    print("Analyzing AWS news feed for the last two weeks...")
    count_recent_entries()
