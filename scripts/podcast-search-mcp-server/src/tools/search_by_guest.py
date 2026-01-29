"""Tool for searching episodes by guest name."""

import json
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..rss.feed_manager import RSSFeedManager


async def search_by_guest_impl(guest_name: str, rss_manager: "RSSFeedManager") -> str:
    """
    Find episodes featuring a specific guest.
    
    Args:
        guest_name: Guest name or partial name
        rss_manager: RSS Feed Manager instance
        
    Returns:
        JSON string with matching episodes sorted by date (descending)
    """
    try:
        # Search for episodes
        episodes = rss_manager.search_by_guest(guest_name)
        
        return json.dumps({
            "status": "success",
            "count": len(episodes),
            "results": [ep.to_dict() for ep in episodes],
            "message": f"Found {len(episodes)} episode(s) featuring '{guest_name}'" if episodes else f"No episodes found featuring '{guest_name}'"
        })
        
    except Exception as e:
        return json.dumps({
            "status": "error",
            "error_type": "ServerError",
            "message": f"Failed to search by guest: {str(e)}",
            "suggested_action": "Check server logs for details"
        })
