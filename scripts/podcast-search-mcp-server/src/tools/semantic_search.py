"""Tool for semantic search using Bedrock Knowledge Base."""

import json
import logging
import time
from typing import TYPE_CHECKING, Optional

from fastmcp import Context

from ..utils.logging import get_logger, log_with_context

if TYPE_CHECKING:
    from ..search.semantic import SemanticSearchEngine


logger = get_logger("SemanticSearchTool")


async def semantic_search_impl(
    query: str,
    ctx: Context,
    semantic_engine: Optional["SemanticSearchEngine"]
) -> str:
    """
    Search episodes by topic or subject using natural language.
    
    Args:
        query: Natural language query about topics or subjects
        ctx: FastMCP context for logging and progress
        semantic_engine: Semantic Search Engine instance (optional)
        
    Returns:
        JSON string with relevant episodes and relevance scores
    """
    start_time = time.time()
    
    try:
        ctx.info(f"Performing semantic search for: {query}")
        log_with_context(
            logger,
            logging.INFO,
            "semantic_search tool invoked",
            context={"query": query}
        )
        
        # Check if semantic search is available
        if not semantic_engine:
            ctx.error("Semantic search is not available (BEDROCK_KB_ID not configured)")
            logger.error(
                "Semantic search not available - BEDROCK_KB_ID not configured",
                extra={"context": {"query": query}}
            )
            return json.dumps({
                "status": "error",
                "error_type": "ConfigurationError",
                "message": "Semantic search is not available",
                "suggested_action": "Configure BEDROCK_KB_ID environment variable"
            })
        
        # Perform semantic search
        results = await semantic_engine.search(query)
        
        execution_time_ms = (time.time() - start_time) * 1000
        ctx.info(f"Semantic search returned {len(results)} results")
        log_with_context(
            logger,
            logging.INFO,
            "semantic_search tool completed successfully",
            context={"query": query, "result_count": len(results)},
            execution_time_ms=execution_time_ms
        )
        
        return json.dumps({
            "status": "success",
            "count": len(results),
            "results": [r.to_dict() for r in results],
            "message": f"Found {len(results)} relevant episode(s)"
        })
        
    except Exception as e:
        execution_time_ms = (time.time() - start_time) * 1000
        ctx.error(f"Semantic search failed: {str(e)}")
        logger.error(
            "semantic_search tool failed",
            exc_info=True,
            extra={
                "context": {"query": query, "error": str(e)},
                "execution_time_ms": execution_time_ms
            }
        )
        return json.dumps({
            "status": "error",
            "error_type": "BedrockError",
            "message": f"Semantic search failed: {str(e)}",
            "suggested_action": "Check AWS credentials and Knowledge Base configuration"
        })
