"""Configuration management for the Podcast Search MCP Server."""

import os
from dataclasses import dataclass
from typing import Optional


@dataclass
class ServerConfig:
    """Configuration for the Podcast Search MCP Server."""
    
    aws_profile: Optional[str] = None  # AWS profile name for credentials
    aws_region: str = "eu-central-1"  # AWS region
    rss_feed_url: str = "https://francais.podcast.go-aws.com/web/feed.xml"
    cache_ttl_seconds: int = 3600  # RSS cache TTL (1 hour)
    bedrock_kb_id: str = ""  # Bedrock Knowledge Base ID
    max_semantic_results: int = 10  # Max results for semantic search
    
    def validate(self) -> None:
        """
        Validate required configuration fields.
        
        Raises:
            ValueError: If required fields are missing or invalid
        """
        if not self.aws_region:
            raise ValueError("aws_region is required")
        
        if not self.rss_feed_url:
            raise ValueError("rss_feed_url is required")
        
        if self.cache_ttl_seconds <= 0:
            raise ValueError("cache_ttl_seconds must be positive")
        
        if self.max_semantic_results <= 0:
            raise ValueError("max_semantic_results must be positive")
    
    @classmethod
    def from_environment(cls) -> "ServerConfig":
        """Load configuration from environment variables."""
        config = cls(
            aws_profile=os.getenv("AWS_PROFILE", "podcast"),
            aws_region=os.getenv("AWS_REGION", "eu-central-1"),
            rss_feed_url=os.getenv(
                "RSS_FEED_URL",
                "https://francais.podcast.go-aws.com/web/feed.xml"
            ),
            cache_ttl_seconds=int(os.getenv("CACHE_TTL_SECONDS", "3600")),
            bedrock_kb_id=os.getenv("BEDROCK_KB_ID", ""),
            max_semantic_results=int(os.getenv("MAX_SEMANTIC_RESULTS", "10"))
        )
        config.validate()
        return config
