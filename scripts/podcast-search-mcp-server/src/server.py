"""MCP server initialization and tool registration."""

import logging
import sys
from typing import Optional

from fastmcp import FastMCP, Context

from .config import ServerConfig
from .aws.client_manager import AWSClientManager
from .rss.feed_manager import RSSFeedManager
from .search.semantic import SemanticSearchEngine
from .search.router import SearchRouter
from .tools.get_episode_by_id import get_episode_by_id_impl
from .tools.search_by_date_range import search_by_date_range_impl
from .tools.search_by_guest import search_by_guest_impl
from .tools.semantic_search import semantic_search_impl
from .tools.search_episodes import search_episodes_impl
from .utils.logging import configure_logging, get_logger, log_with_context


# Create FastMCP server instance
mcp = FastMCP("Podcast Search")

# Logger for server component
logger = get_logger("Server")

# Global components (initialized in initialize_server)
_config: Optional[ServerConfig] = None
_rss_manager: Optional[RSSFeedManager] = None
_aws_client: Optional[AWSClientManager] = None
_semantic_engine: Optional[SemanticSearchEngine] = None
_search_router: Optional[SearchRouter] = None


def initialize_server() -> tuple[ServerConfig, RSSFeedManager, AWSClientManager, Optional[SemanticSearchEngine], SearchRouter]:
    """
    Initialize the MCP server with configuration and components.
    
    Returns:
        Tuple of (ServerConfig, RSSFeedManager, AWSClientManager, SemanticSearchEngine, SearchRouter)
        
    Raises:
        SystemExit: If initialization fails
    """
    try:
        # Configure structured logging
        import os
        log_level = os.getenv("LOG_LEVEL", "INFO")
        configure_logging(log_level)
        
        logger.info("Starting Podcast Search MCP Server initialization")
        
        # Load configuration from environment
        config = ServerConfig.from_environment()
        log_with_context(
            logger,
            logging.INFO,
            "Configuration loaded",
            context={
                "aws_profile": config.aws_profile,
                "aws_region": config.aws_region,
                "rss_feed_url": config.rss_feed_url,
                "cache_ttl_seconds": config.cache_ttl_seconds
            }
        )
        
        # Initialize AWS Client Manager
        logger.info("Initializing AWS Client Manager")
        aws_client = AWSClientManager(config.aws_profile, config.aws_region)
        
        # Verify AWS credentials
        logger.info("Verifying AWS credentials")
        aws_client.verify_credentials()
        
        # Initialize RSS Feed Manager
        logger.info("Initializing RSS Feed Manager")
        rss_manager = RSSFeedManager(config.rss_feed_url, config.cache_ttl_seconds)
        
        # Pre-populate cache
        logger.info("Pre-populating RSS feed cache")
        episodes = rss_manager.get_cached_episodes()
        log_with_context(
            logger,
            logging.INFO,
            "RSS feed cache populated",
            context={"episode_count": len(episodes)}
        )
        
        # Initialize Semantic Search Engine
        semantic_engine = None
        if config.bedrock_kb_id:
            logger.info("Initializing Semantic Search Engine")
            semantic_engine = SemanticSearchEngine(
                aws_client,
                config.bedrock_kb_id,
                config.max_semantic_results
            )
            log_with_context(
                logger,
                logging.INFO,
                "Semantic Search Engine initialized",
                context={"kb_id": config.bedrock_kb_id}
            )
        else:
            logger.warning("BEDROCK_KB_ID not set, semantic search will not be available")
        
        # Initialize SearchRouter
        logger.info("Initializing Search Router")
        search_router = SearchRouter(rss_manager, semantic_engine)
        logger.info("Search Router initialized")
        
        logger.info("Podcast Search MCP Server initialization complete")
        
        return config, rss_manager, aws_client, semantic_engine, search_router
        
    except Exception as e:
        logger.error(
            "Failed to initialize server",
            exc_info=True,
            extra={"context": {"error": str(e)}}
        )
        sys.exit(1)


# MCP Tool Implementations

@mcp.tool()
async def get_episode_by_id(episode_id: int) -> str:
    """
    Get detailed information about a specific episode by ID.
    
    Args:
        episode_id: Episode number (e.g., 341)
        
    Returns:
        JSON string with episode details or error message
    """
    return await get_episode_by_id_impl(episode_id, _rss_manager)


@mcp.tool()
async def search_by_date_range(start_date: str, end_date: str) -> str:
    """
    Find episodes published within a date range.
    
    Args:
        start_date: Start date in ISO format (YYYY-MM-DD)
        end_date: End date in ISO format (YYYY-MM-DD)
        
    Returns:
        JSON string with matching episodes sorted by date (descending)
    """
    return await search_by_date_range_impl(start_date, end_date, _rss_manager)


@mcp.tool()
async def search_by_guest(guest_name: str) -> str:
    """
    Find episodes featuring a specific guest.
    
    Args:
        guest_name: Guest name or partial name
        
    Returns:
        JSON string with matching episodes sorted by date (descending)
    """
    return await search_by_guest_impl(guest_name, _rss_manager)


@mcp.tool()
async def semantic_search(query: str, ctx: Context) -> str:
    """
    Search episodes by topic or subject using natural language.
    
    Args:
        query: Natural language query about topics or subjects
        ctx: FastMCP context for logging and progress
        
    Returns:
        JSON string with relevant episodes and relevance scores
    """
    return await semantic_search_impl(query, ctx, _semantic_engine)


@mcp.tool()
async def search_episodes(query: str, search_type: Optional[str] = None) -> str:
    """
    Search podcast episodes using various criteria.
    
    This is a unified search interface that automatically routes queries to the
    appropriate search backend based on query patterns:
    - Episode ID patterns (e.g., "episode 341", "#341") → Episode ID search
    - Date patterns (e.g., "2024-01-01 to 2024-12-31") → Date range search
    - Guest indicators (e.g., "with John", "featuring Jane") → Guest search
    - Natural language queries → Semantic search
    
    Args:
        query: Search query (episode ID, date range, guest name, or natural language)
        search_type: Optional hint ("id", "date", "guest", "semantic") to override auto-detection
        
    Returns:
        JSON string with search results
    """
    return await search_episodes_impl(query, _search_router, search_type)


def get_server():
    """Get the FastMCP server instance."""
    return mcp


def set_components(
    config: ServerConfig,
    rss_manager: RSSFeedManager,
    aws_client: AWSClientManager,
    semantic_engine: Optional[SemanticSearchEngine],
    search_router: SearchRouter
):
    """
    Set global component references.
    
    Args:
        config: Server configuration
        rss_manager: RSS Feed Manager instance
        aws_client: AWS Client Manager instance
        semantic_engine: Semantic Search Engine instance (optional)
        search_router: Search Router instance
    """
    global _config, _rss_manager, _aws_client, _semantic_engine, _search_router
    _config = config
    _rss_manager = rss_manager
    _aws_client = aws_client
    _semantic_engine = semantic_engine
    _search_router = search_router
