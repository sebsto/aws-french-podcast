"""Semantic search using Amazon Bedrock Knowledge Base."""

import logging
import time
from typing import List, Dict, Any, Optional

from botocore.exceptions import ClientError

from ..aws.client_manager import AWSClientManager
from ..models.search_result import SemanticResult
from ..utils.logging import get_logger, log_with_context


logger = get_logger("SemanticSearchEngine")


class SemanticSearchEngine:
    """
    Manages semantic search using Amazon Bedrock Knowledge Base.
    
    Implements result caching with 5-minute TTL to reduce API calls.
    Queries the Knowledge Base using the retrieve API and enriches
    results with RSS feed metadata.
    """
    
    def __init__(
        self,
        aws_client: AWSClientManager,
        kb_id: str,
        max_results: int
    ):
        """
        Initialize Semantic Search Engine.
        
        Args:
            aws_client: AWS Client Manager instance
            kb_id: Bedrock Knowledge Base ID
            max_results: Maximum number of results to return
        """
        self.aws_client = aws_client
        self.kb_id = kb_id
        self.max_results = max_results
        self._cache: Dict[str, tuple[List[SemanticResult], float]] = {}
        self._cache_ttl = 300  # 5 minutes in seconds
    
    async def search(self, query: str) -> List[SemanticResult]:
        """
        Perform semantic search using Bedrock Knowledge Base.
        
        Args:
            query: Natural language search query
            
        Returns:
            List of SemanticResult objects with relevance scores
            
        Raises:
            RuntimeError: If Bedrock API call fails
        """
        # Check cache first
        cached_result = self._get_from_cache(query)
        if cached_result is not None:
            log_with_context(
                logger,
                logging.INFO,
                "Returning cached semantic search results",
                context={"query": query, "result_count": len(cached_result)}
            )
            return cached_result
        
        try:
            log_with_context(
                logger,
                logging.INFO,
                "Performing semantic search",
                context={"query": query, "kb_id": self.kb_id}
            )
            
            # Get Bedrock client
            bedrock_client = self.aws_client.get_bedrock_client()
            
            # Call retrieve API on Knowledge Base
            start_time = time.time()
            response = bedrock_client.retrieve(
                knowledgeBaseId=self.kb_id,
                retrievalQuery={
                    'text': query
                },
                retrievalConfiguration={
                    'vectorSearchConfiguration': {
                        'numberOfResults': self.max_results
                    }
                }
            )
            execution_time_ms = (time.time() - start_time) * 1000
            
            # Parse results
            results = []
            retrieval_results = response.get('retrievalResults', [])
            
            log_with_context(
                logger,
                logging.INFO,
                "Bedrock retrieve API call successful",
                context={
                    "result_count": len(retrieval_results),
                    "kb_id": self.kb_id
                },
                execution_time_ms=execution_time_ms
            )
            
            for result in retrieval_results:
                # Stop if we've reached max_results
                if len(results) >= self.max_results:
                    break
                
                # Extract episode information from result
                semantic_result = self._parse_retrieval_result(result)
                if semantic_result:
                    results.append(semantic_result)
            
            # Cache results
            self._add_to_cache(query, results)
            
            return results
            
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "Unknown")
            error_message = e.response.get("Error", {}).get("Message", str(e))
            
            log_with_context(
                logger,
                logging.ERROR,
                "Bedrock API error",
                context={
                    "query": query,
                    "kb_id": self.kb_id,
                    "error_message": error_message
                },
                error_code=error_code
            )
            
            raise RuntimeError(
                f"Semantic search failed: {error_code} - {error_message}"
            ) from e
            
        except Exception as e:
            logger.error(
                "Unexpected error during semantic search",
                exc_info=True,
                extra={"context": {"query": query, "error": str(e)}}
            )
            
            raise RuntimeError(
                f"Semantic search failed: {str(e)}"
            ) from e
    
    def _parse_retrieval_result(self, result: Dict[str, Any]) -> Optional[SemanticResult]:
        """
        Parse a Bedrock retrieval result into a SemanticResult object.
        
        Args:
            result: Bedrock retrieval result dictionary
            
        Returns:
            SemanticResult object or None if parsing fails
        """
        try:
            # Extract content and metadata
            content = result.get('content', {})
            text = content.get('text', '')
            
            # Extract relevance score
            score = result.get('score', 0.0)
            
            # Extract metadata
            metadata = result.get('metadata', {})
            
            # Extract episode ID from metadata
            # The Knowledge Base should store episode ID in metadata
            episode_id = None
            
            # Try different metadata field names
            if 'episode_id' in metadata:
                episode_id = int(metadata['episode_id'])
            elif 'episodeId' in metadata:
                episode_id = int(metadata['episodeId'])
            elif 'id' in metadata:
                episode_id = int(metadata['id'])
            
            if episode_id is None:
                logger.warning("Retrieval result missing episode ID, skipping")
                return None
            
            # Extract title from metadata or use placeholder
            title = metadata.get('title', '') or metadata.get('episode_title', '') or f"Episode {episode_id}"
            
            # Create excerpt from text (limit to 500 characters)
            excerpt = text[:500] + "..." if len(text) > 500 else text
            
            return SemanticResult(
                episode_id=episode_id,
                title=title,
                excerpt=excerpt,
                relevance_score=score,
                metadata=metadata
            )
            
        except Exception as e:
            logger.error(
                "Failed to parse retrieval result",
                exc_info=True,
                extra={"context": {"error": str(e)}}
            )
            return None
    
    def _get_from_cache(self, query: str) -> Optional[List[SemanticResult]]:
        """
        Get cached results for a query if available and not stale.
        
        Args:
            query: Search query
            
        Returns:
            Cached results or None if not found or stale
        """
        if query not in self._cache:
            return None
        
        results, timestamp = self._cache[query]
        current_time = time.time()
        
        # Check if cache is stale
        if (current_time - timestamp) > self._cache_ttl:
            # Remove stale entry
            del self._cache[query]
            return None
        
        return results
    
    def _add_to_cache(self, query: str, results: List[SemanticResult]) -> None:
        """
        Add results to cache with current timestamp.
        
        Args:
            query: Search query
            results: Search results to cache
        """
        self._cache[query] = (results, time.time())
