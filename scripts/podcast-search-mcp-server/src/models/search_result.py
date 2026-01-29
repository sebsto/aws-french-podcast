"""Data models for search results."""

from dataclasses import dataclass, field
from typing import Dict, Any


@dataclass
class SemanticResult:
    """Represents a semantic search result from Bedrock Knowledge Base."""
    
    episode_id: int
    title: str
    excerpt: str  # Relevant text snippet
    relevance_score: float  # 0.0 to 1.0
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert SemanticResult to dictionary for JSON serialization."""
        return {
            "episode_id": self.episode_id,
            "title": self.title,
            "excerpt": self.excerpt,
            "relevance_score": self.relevance_score,
            "metadata": self.metadata
        }
