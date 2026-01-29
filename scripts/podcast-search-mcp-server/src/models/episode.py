"""Data models for podcast episodes."""

from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Dict, Any, Optional


@dataclass
class Link:
    """Represents a related link for a podcast episode."""
    
    text: str
    url: str
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert Link to dictionary for JSON serialization."""
        return {
            "text": self.text,
            "url": self.url
        }


@dataclass
class Guest:
    """Represents a guest on a podcast episode."""
    
    name: str
    title: Optional[str] = None
    linkedin_url: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert Guest to dictionary for JSON serialization."""
        return {
            "name": self.name,
            "title": self.title,
            "linkedin_url": self.linkedin_url
        }


@dataclass
class Episode:
    """Represents a podcast episode with complete metadata."""
    
    id: int
    title: str
    description: str
    publication_date: datetime
    duration: str  # Format: "HH:MM:SS"
    url: str
    file_size: int  # bytes
    guests: List[Guest] = field(default_factory=list)
    links: List[Link] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert Episode to dictionary for JSON serialization."""
        return {
            "episode_id": self.id,
            "title": self.title,
            "description": self.description,
            "publication_date": self.publication_date.isoformat(),
            "duration": self.duration,
            "url": self.url,
            "file_size": self.file_size,
            "guests": [guest.to_dict() for guest in self.guests],
            "links": [link.to_dict() for link in self.links]
        }
