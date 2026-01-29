"""
Unit tests for AWSClientManager class.

Tests credential loading, client creation, and error handling.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from botocore.exceptions import ClientError, NoCredentialsError, ProfileNotFound

import sys
import os

# Add parent directory to path to import the server module
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.aws.client_manager import AWSClientManager


class TestAWSClientManagerInitialization:
    """Test AWS Client Manager initialization and session creation."""
    
    def test_initialization_with_profile(self):
        """Test initialization with a valid AWS profile."""
        with patch('boto3.Session') as mock_session:
            manager = AWSClientManager(profile="podcast", region="eu-central-1")
            
            assert manager.profile == "podcast"
            assert manager.region == "eu-central-1"
            mock_session.assert_called_once_with(
                profile_name="podcast",
                region_name="eu-central-1"
            )
    
    def test_initialization_without_profile(self):
        """Test initialization without profile (default credential chain)."""
        with patch('boto3.Session') as mock_session:
            manager = AWSClientManager(profile=None, region="eu-central-1")
            
            assert manager.profile is None
            assert manager.region == "eu-central-1"
            mock_session.assert_called_once_with(region_name="eu-central-1")
    
    def test_initialization_with_invalid_profile(self):
        """Test initialization fails gracefully with invalid profile."""
        with patch('boto3.Session', side_effect=ProfileNotFound(profile="invalid")):
            with pytest.raises(ValueError) as exc_info:
                AWSClientManager(profile="invalid", region="eu-central-1")
            
            assert "AWS profile 'invalid' not found" in str(exc_info.value)
    
    def test_initialization_with_session_error(self):
        """Test initialization handles unexpected session errors."""
        with patch('boto3.Session', side_effect=Exception("Unexpected error")):
            with pytest.raises(RuntimeError) as exc_info:
                AWSClientManager(profile="test", region="eu-central-1")
            
            assert "Failed to initialize AWS session" in str(exc_info.value)


class TestBedrockClientCreation:
    """Test Bedrock client creation."""
    
    def test_get_bedrock_client_success(self):
        """Test successful Bedrock client creation."""
        with patch('boto3.Session') as mock_session_class:
            mock_session = Mock()
            mock_bedrock_client = Mock()
            mock_session.client.return_value = mock_bedrock_client
            mock_session_class.return_value = mock_session
            
            manager = AWSClientManager(profile="podcast", region="eu-central-1")
            client = manager.get_bedrock_client()
            
            assert client == mock_bedrock_client
            mock_session.client.assert_called_once_with(
                "bedrock-agent-runtime",
                region_name="eu-central-1"
            )
    
    def test_get_bedrock_client_caching(self):
        """Test Bedrock client is cached after first creation."""
        with patch('boto3.Session') as mock_session_class:
            mock_session = Mock()
            mock_bedrock_client = Mock()
            mock_session.client.return_value = mock_bedrock_client
            mock_session_class.return_value = mock_session
            
            manager = AWSClientManager(profile="podcast", region="eu-central-1")
            
            # Call twice
            client1 = manager.get_bedrock_client()
            client2 = manager.get_bedrock_client()
            
            # Should be the same instance
            assert client1 is client2
            # Client should only be created once
            assert mock_session.client.call_count == 1
    
    def test_get_bedrock_client_failure(self):
        """Test Bedrock client creation handles errors."""
        with patch('boto3.Session') as mock_session_class:
            mock_session = Mock()
            mock_session.client.side_effect = Exception("Client creation failed")
            mock_session_class.return_value = mock_session
            
            manager = AWSClientManager(profile="podcast", region="eu-central-1")
            
            with pytest.raises(RuntimeError) as exc_info:
                manager.get_bedrock_client()
            
            assert "Failed to create Bedrock client" in str(exc_info.value)


class TestCredentialVerification:
    """Test AWS credential verification."""
    
    def test_verify_credentials_success(self):
        """Test successful credential verification."""
        with patch('boto3.Session') as mock_session_class:
            mock_session = Mock()
            mock_sts_client = Mock()
            mock_sts_client.get_caller_identity.return_value = {
                "Account": "533267385481",
                "Arn": "arn:aws:iam::533267385481:user/test-user"
            }
            mock_session.client.return_value = mock_sts_client
            mock_session_class.return_value = mock_session
            
            manager = AWSClientManager(profile="podcast", region="eu-central-1")
            result = manager.verify_credentials()
            
            assert result is True
            mock_sts_client.get_caller_identity.assert_called_once()
    
    def test_verify_credentials_no_credentials(self):
        """Test verification fails when no credentials are found."""
        with patch('boto3.Session') as mock_session_class:
            mock_session = Mock()
            mock_sts_client = Mock()
            mock_sts_client.get_caller_identity.side_effect = NoCredentialsError()
            mock_session.client.return_value = mock_sts_client
            mock_session_class.return_value = mock_session
            
            manager = AWSClientManager(profile="podcast", region="eu-central-1")
            
            with pytest.raises(NoCredentialsError):
                manager.verify_credentials()
    
    def test_verify_credentials_invalid_token(self):
        """Test verification fails with invalid credentials."""
        with patch('boto3.Session') as mock_session_class:
            mock_session = Mock()
            mock_sts_client = Mock()
            
            # Simulate invalid token error
            error_response = {
                "Error": {
                    "Code": "InvalidClientTokenId",
                    "Message": "The security token included in the request is invalid."
                }
            }
            mock_sts_client.get_caller_identity.side_effect = ClientError(
                error_response,
                "GetCallerIdentity"
            )
            mock_session.client.return_value = mock_sts_client
            mock_session_class.return_value = mock_session
            
            manager = AWSClientManager(profile="podcast", region="eu-central-1")
            
            with pytest.raises(ClientError) as exc_info:
                manager.verify_credentials()
            
            error = exc_info.value
            assert error.response["Error"]["Code"] == "InvalidClientTokenId"
            assert "invalid or expired" in error.response["Error"]["Message"]
    
    def test_verify_credentials_signature_mismatch(self):
        """Test verification fails with signature mismatch."""
        with patch('boto3.Session') as mock_session_class:
            mock_session = Mock()
            mock_sts_client = Mock()
            
            # Simulate signature mismatch error
            error_response = {
                "Error": {
                    "Code": "SignatureDoesNotMatch",
                    "Message": "The request signature we calculated does not match."
                }
            }
            mock_sts_client.get_caller_identity.side_effect = ClientError(
                error_response,
                "GetCallerIdentity"
            )
            mock_session.client.return_value = mock_sts_client
            mock_session_class.return_value = mock_session
            
            manager = AWSClientManager(profile="podcast", region="eu-central-1")
            
            with pytest.raises(ClientError) as exc_info:
                manager.verify_credentials()
            
            error = exc_info.value
            assert error.response["Error"]["Code"] == "SignatureDoesNotMatch"
            assert "invalid or expired" in error.response["Error"]["Message"]
    
    def test_verify_credentials_other_client_error(self):
        """Test verification handles other AWS client errors."""
        with patch('boto3.Session') as mock_session_class:
            mock_session = Mock()
            mock_sts_client = Mock()
            
            # Simulate other AWS error
            error_response = {
                "Error": {
                    "Code": "ServiceUnavailable",
                    "Message": "Service is temporarily unavailable."
                }
            }
            mock_sts_client.get_caller_identity.side_effect = ClientError(
                error_response,
                "GetCallerIdentity"
            )
            mock_session.client.return_value = mock_sts_client
            mock_session_class.return_value = mock_session
            
            manager = AWSClientManager(profile="podcast", region="eu-central-1")
            
            with pytest.raises(ClientError) as exc_info:
                manager.verify_credentials()
            
            error = exc_info.value
            assert error.response["Error"]["Code"] == "ServiceUnavailable"
            assert "Failed to verify credentials" in error.response["Error"]["Message"]
    
    def test_verify_credentials_unexpected_error(self):
        """Test verification handles unexpected errors."""
        with patch('boto3.Session') as mock_session_class:
            mock_session = Mock()
            mock_sts_client = Mock()
            mock_sts_client.get_caller_identity.side_effect = Exception("Unexpected error")
            mock_session.client.return_value = mock_sts_client
            mock_session_class.return_value = mock_session
            
            manager = AWSClientManager(profile="podcast", region="eu-central-1")
            
            with pytest.raises(RuntimeError) as exc_info:
                manager.verify_credentials()
            
            assert "Unexpected error during credential verification" in str(exc_info.value)


class TestDefaultCredentialChain:
    """Test fallback to default credential chain."""
    
    def test_fallback_to_default_chain(self):
        """Test manager falls back to default credential chain when no profile."""
        with patch('boto3.Session') as mock_session_class:
            mock_session = Mock()
            mock_session_class.return_value = mock_session
            
            manager = AWSClientManager(profile=None, region="us-east-1")
            
            # Should create session without profile_name
            mock_session_class.assert_called_once_with(region_name="us-east-1")
            assert manager.profile is None
            assert manager.region == "us-east-1"
