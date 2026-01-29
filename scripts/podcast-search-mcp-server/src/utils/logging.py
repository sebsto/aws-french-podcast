"""Structured logging configuration for CloudWatch compatibility."""

import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any, Dict, Optional


class JSONFormatter(logging.Formatter):
    """
    Custom JSON formatter for structured logging.
    
    Formats log records as JSON objects compatible with CloudWatch Logs.
    Includes timestamp, level, component, message, and optional context.
    """
    
    def format(self, record: logging.LogRecord) -> str:
        """
        Format log record as JSON string.
        
        Args:
            record: Log record to format
            
        Returns:
            JSON string representation of log record
        """
        log_data: Dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "component": record.name,
            "message": record.getMessage(),
        }
        
        # Add exception info if present
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
        
        # Add extra context if present
        if hasattr(record, "context"):
            log_data["context"] = record.context
        
        # Add execution time if present
        if hasattr(record, "execution_time_ms"):
            log_data["execution_time_ms"] = record.execution_time_ms
        
        # Add error code if present (for AWS errors)
        if hasattr(record, "error_code"):
            log_data["error_code"] = record.error_code
        
        return json.dumps(log_data)


def configure_logging(log_level: str = "INFO") -> None:
    """
    Configure structured logging for the application.
    
    Sets up JSON logging format compatible with CloudWatch Logs.
    Configures log levels: ERROR, WARN, INFO, DEBUG.
    
    Args:
        log_level: Logging level (ERROR, WARN, INFO, DEBUG)
    """
    # Convert string level to logging constant
    numeric_level = getattr(logging, log_level.upper(), logging.INFO)
    
    # Create root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(numeric_level)
    
    # Remove existing handlers
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)
    
    # Create stderr handler with JSON formatter
    handler = logging.StreamHandler(sys.stderr)
    handler.setLevel(numeric_level)
    handler.setFormatter(JSONFormatter())
    
    root_logger.addHandler(handler)
    
    # Suppress noisy third-party loggers
    logging.getLogger("boto3").setLevel(logging.WARNING)
    logging.getLogger("botocore").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """
    Get a logger instance for a specific component.
    
    Args:
        name: Component name (e.g., "SearchRouter", "RSSFeedManager")
        
    Returns:
        Logger instance
    """
    return logging.getLogger(name)


def log_with_context(
    logger: logging.Logger,
    level: int,
    message: str,
    context: Optional[Dict[str, Any]] = None,
    execution_time_ms: Optional[float] = None,
    error_code: Optional[str] = None
) -> None:
    """
    Log message with additional context.
    
    Args:
        logger: Logger instance
        level: Log level (logging.INFO, logging.ERROR, etc.)
        message: Log message
        context: Optional context dictionary
        execution_time_ms: Optional execution time in milliseconds
        error_code: Optional error code (for AWS errors)
    """
    extra = {}
    
    if context:
        extra["context"] = context
    
    if execution_time_ms is not None:
        extra["execution_time_ms"] = execution_time_ms
    
    if error_code:
        extra["error_code"] = error_code
    
    logger.log(level, message, extra=extra)
