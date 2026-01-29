"""AWS client management and authentication."""

import logging
from typing import Optional

import boto3
from botocore.exceptions import ClientError, NoCredentialsError, ProfileNotFound

from ..utils.logging import get_logger, log_with_context


logger = get_logger("AWSClientManager")


class AWSClientManager:
    """
    Manages AWS credentials and client initialization.
    
    Handles both local AWS profiles (for stdio transport) and IAM roles
    (for AgentCore HTTP transport). Provides methods to create AWS service
    clients and verify credentials.
    """
    
    def __init__(self, profile: Optional[str], region: str):
        """
        Initialize AWS Client Manager.
        
        Args:
            profile: AWS profile name (None to use default credential chain)
            region: AWS region (e.g., "eu-central-1")
        """
        self.profile = profile
        self.region = region
        self._session: Optional[boto3.Session] = None
        self._bedrock_client = None
        
        # Initialize session
        self._initialize_session()
    
    def _initialize_session(self) -> None:
        """
        Initialize boto3 session with appropriate credentials.
        
        Uses AWS profile if provided, otherwise falls back to default
        credential chain (environment variables, IAM role, etc.).
        """
        try:
            if self.profile:
                # Use specified AWS profile
                logger.info(f"Initializing AWS session with profile: {self.profile}")
                self._session = boto3.Session(
                    profile_name=self.profile,
                    region_name=self.region
                )
            else:
                # Use default credential chain
                logger.info("Initializing AWS session with default credential chain")
                self._session = boto3.Session(region_name=self.region)
                
        except ProfileNotFound as e:
            logger.error(
                f"AWS profile '{self.profile}' not found",
                exc_info=True,
                extra={"context": {"profile": self.profile}}
            )
            raise ValueError(
                f"AWS profile '{self.profile}' not found. "
                f"Check your ~/.aws/credentials file."
            ) from e
        except Exception as e:
            logger.error(
                "Failed to initialize AWS session",
                exc_info=True,
                extra={"context": {"error": str(e)}}
            )
            raise RuntimeError(
                f"Failed to initialize AWS session: {str(e)}"
            ) from e
    
    def get_bedrock_client(self):
        """
        Get boto3 client for Bedrock Agent Runtime.
        
        Returns:
            boto3 client for bedrock-agent-runtime service
            
        Raises:
            RuntimeError: If client creation fails
        """
        if self._bedrock_client is None:
            try:
                logger.info("Creating Bedrock Agent Runtime client")
                self._bedrock_client = self._session.client(
                    "bedrock-agent-runtime",
                    region_name=self.region
                )
                logger.info("Bedrock Agent Runtime client created successfully")
            except Exception as e:
                logger.error(
                    "Failed to create Bedrock client",
                    exc_info=True,
                    extra={"context": {"region": self.region, "error": str(e)}}
                )
                raise RuntimeError(
                    f"Failed to create Bedrock client: {str(e)}"
                ) from e
        
        return self._bedrock_client
    
    def verify_credentials(self) -> bool:
        """
        Verify AWS credentials are valid by calling STS GetCallerIdentity.
        
        Returns:
            True if credentials are valid
            
        Raises:
            NoCredentialsError: If no credentials are found
            ClientError: If credentials are invalid or expired
            RuntimeError: If verification fails for other reasons
        """
        try:
            logger.info("Verifying AWS credentials")
            sts_client = self._session.client("sts")
            response = sts_client.get_caller_identity()
            
            # Log successful verification
            account_id = response.get("Account")
            arn = response.get("Arn")
            log_with_context(
                logger,
                logging.INFO,
                "AWS credentials verified successfully",
                context={
                    "account_id": account_id,
                    "arn": arn
                }
            )
            
            return True
            
        except NoCredentialsError as e:
            logger.error("No AWS credentials found", exc_info=True)
            # Re-raise with more context (NoCredentialsError doesn't accept message)
            raise
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "Unknown")
            error_message = e.response.get("Error", {}).get("Message", str(e))
            
            log_with_context(
                logger,
                logging.ERROR,
                "AWS credential verification failed",
                context={
                    "error_code": error_code,
                    "error_message": error_message
                },
                error_code=error_code
            )
            
            if error_code in ["InvalidClientTokenId", "SignatureDoesNotMatch"]:
                raise ClientError(
                    {
                        "Error": {
                            "Code": error_code,
                            "Message": "AWS credentials are invalid or expired. "
                                     f"Original error: {error_message}"
                        }
                    },
                    "GetCallerIdentity"
                ) from e
            else:
                raise ClientError(
                    {
                        "Error": {
                            "Code": error_code,
                            "Message": f"Failed to verify credentials: {error_message}"
                        }
                    },
                    "GetCallerIdentity"
                ) from e
        except Exception as e:
            logger.error(
                "Unexpected error during credential verification",
                exc_info=True,
                extra={"context": {"error": str(e)}}
            )
            raise RuntimeError(
                f"Unexpected error during credential verification: {str(e)}"
            ) from e
