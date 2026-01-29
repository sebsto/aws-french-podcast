"""Data models for podcast episodes and search results."""

from .episode import Episode, Guest, Link
from .search_result import SemanticResult

__all__ = ["Episode", "Guest", "Link", "SemanticResult"]
