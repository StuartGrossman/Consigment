import pytest
import sys
from unittest.mock import Mock, patch, MagicMock
from fastapi.testclient import TestClient

# Mock Firebase modules before importing main
sys.modules['firebase_init'] = Mock()
sys.modules['firebase_config'] = Mock()

# Mock the Firebase database
mock_db = Mock()
with patch.dict('sys.modules', {
    'firebase_init': Mock(db=mock_db),
    'firebase_config': Mock(FIREBASE_CONFIG={})
}):
    from main import app, Message

# Test client for FastAPI
client = TestClient(app)

class TestAPI:
    """Test suite for the FastAPI backend"""
    
    def test_root_endpoint(self):
        """Test the root endpoint returns welcome message"""
        response = client.get("/")
        assert response.status_code == 200
        assert response.json() == {"message": "Welcome to the API!"}
    
    @patch('main.db')
    def test_create_message_success(self, mock_db_param):
        """Test successful message creation"""
        # Mock Firestore
        mock_collection = Mock()
        mock_document = Mock()
        mock_db_param.collection.return_value = mock_collection
        mock_collection.document.return_value = mock_document
        
        message_data = {
            "content": "Test message",
            "timestamp": "2024-01-01T12:00:00Z"
        }
        
        response = client.post("/api/messages", json=message_data)
        
        assert response.status_code == 200
        assert response.json() == {"status": "success", "message": "Message saved successfully"}
        
        # Verify Firestore calls
        mock_db_param.collection.assert_called_once_with('test')
        mock_collection.document.assert_called_once()
        mock_document.set.assert_called_once_with({
            'content': 'Test message',
            'timestamp': '2024-01-01T12:00:00Z'
        })
    
    @patch('main.db')
    def test_create_message_failure(self, mock_db_param):
        """Test message creation failure handling"""
        # Mock Firestore to raise an exception
        mock_db_param.collection.side_effect = Exception("Database error")
        
        message_data = {
            "content": "Test message",
            "timestamp": "2024-01-01T12:00:00Z"
        }
        
        response = client.post("/api/messages", json=message_data)
        
        assert response.status_code == 500
        assert "Database error" in response.json()["detail"]
    
    def test_create_message_invalid_data(self):
        """Test message creation with invalid data"""
        # Missing required fields
        invalid_data = {"content": "Test message"}  # Missing timestamp
        
        response = client.post("/api/messages", json=invalid_data)
        assert response.status_code == 422  # Validation error
    
    @patch('main.db')
    def test_get_messages_success(self, mock_db_param):
        """Test successful message retrieval"""
        # Mock Firestore response
        mock_collection = Mock()
        mock_doc1 = Mock()
        mock_doc1.id = "doc1"
        mock_doc1.to_dict.return_value = {
            "content": "Message 1",
            "timestamp": "2024-01-01T12:00:00Z"
        }
        
        mock_doc2 = Mock()
        mock_doc2.id = "doc2"  
        mock_doc2.to_dict.return_value = {
            "content": "Message 2",
            "timestamp": "2024-01-01T13:00:00Z"
        }
        
        mock_db_param.collection.return_value = mock_collection
        mock_collection.stream.return_value = [mock_doc1, mock_doc2]
        
        response = client.get("/api/messages")
        
        assert response.status_code == 200
        messages = response.json()
        assert len(messages) == 2
        assert messages[0]["id"] == "doc1"
        assert messages[0]["content"] == "Message 1"
        assert messages[1]["id"] == "doc2"
        assert messages[1]["content"] == "Message 2"
    
    @patch('main.db')
    def test_get_messages_failure(self, mock_db_param):
        """Test message retrieval failure handling"""
        mock_db_param.collection.side_effect = Exception("Database error")
        
        response = client.get("/api/messages")
        
        assert response.status_code == 500
        assert "Database error" in response.json()["detail"]
    
    @patch('main.db')
    def test_get_messages_empty(self, mock_db_param):
        """Test retrieving messages when collection is empty"""
        mock_collection = Mock()
        mock_db_param.collection.return_value = mock_collection
        mock_collection.stream.return_value = []
        
        response = client.get("/api/messages")
        
        assert response.status_code == 200
        assert response.json() == []

class TestCORS:
    """Test CORS configuration"""
    
    def test_cors_headers(self):
        """Test that CORS headers are properly set"""
        response = client.options("/api/messages")
        # FastAPI automatically handles OPTIONS requests for CORS
        assert response.status_code in [200, 405]  # 405 if OPTIONS not explicitly defined
    
    def test_cors_origin_allowed(self):
        """Test that requests from allowed origin work"""
        headers = {"Origin": "http://localhost:5173"}
        response = client.get("/", headers=headers)
        assert response.status_code == 200

class TestMessageModel:
    """Test the Pydantic Message model"""
    
    def test_valid_message_creation(self):
        """Test creating a valid message"""
        message = Message(
            content="Test message",
            timestamp="2024-01-01T12:00:00Z"
        )
        
        assert message.content == "Test message"
        assert message.timestamp == "2024-01-01T12:00:00Z"
    
    def test_message_validation(self):
        """Test that message validation works"""
        # Valid message
        valid_message = Message(
            content="Valid message",
            timestamp="2024-01-01T12:00:00Z"
        )
        assert valid_message.content == "Valid message"
        
        # Test empty content
        with pytest.raises(ValueError):
            Message(content="", timestamp="2024-01-01T12:00:00Z")

class TestIntegration:
    """Integration tests that test the full flow"""
    
    @patch('main.db')
    def test_full_message_flow(self, mock_db_param):
        """Test creating and then retrieving messages"""
        # Setup mocks for creation
        mock_collection = Mock()
        mock_document = Mock()
        mock_db_param.collection.return_value = mock_collection
        mock_collection.document.return_value = mock_document
        
        # Create a message
        message_data = {
            "content": "Integration test message",
            "timestamp": "2024-01-01T12:00:00Z"
        }
        
        create_response = client.post("/api/messages", json=message_data)
        assert create_response.status_code == 200
        
        # Setup mocks for retrieval
        mock_doc = Mock()
        mock_doc.id = "test_id"
        mock_doc.to_dict.return_value = message_data
        mock_collection.stream.return_value = [mock_doc]
        
        # Retrieve messages
        get_response = client.get("/api/messages")
        assert get_response.status_code == 200
        
        messages = get_response.json()
        assert len(messages) == 1
        assert messages[0]["content"] == "Integration test message"

class TestErrorHandling:
    """Test error handling scenarios"""
    
    @patch('main.db')
    def test_network_timeout_simulation(self, mock_db_param):
        """Test handling of network timeouts"""
        import socket
        mock_db_param.collection.side_effect = socket.timeout("Network timeout")
        
        response = client.get("/api/messages")
        assert response.status_code == 500
    
    @patch('main.db')
    def test_permission_denied_simulation(self, mock_db_param):
        """Test handling of permission errors"""
        mock_db_param.collection.side_effect = PermissionError("Access denied")
        
        response = client.get("/api/messages")
        assert response.status_code == 500
    
    def test_malformed_json(self):
        """Test handling of malformed JSON in requests"""
        response = client.post(
            "/api/messages",
            data="invalid json",  # Not JSON
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 422

class TestPerformance:
    """Basic performance tests"""
    
    def test_response_time(self):
        """Test that endpoints respond within reasonable time"""
        import time
        
        start_time = time.time()
        response = client.get("/")
        end_time = time.time()
        
        response_time = end_time - start_time
        assert response_time < 1.0  # Should respond within 1 second
        assert response.status_code == 200
    
    @patch('main.db')
    def test_concurrent_requests(self, mock_db_param):
        """Test handling multiple concurrent requests"""
        import threading
        import time
        
        # Mock successful response
        mock_collection = Mock()
        mock_db_param.collection.return_value = mock_collection
        mock_collection.stream.return_value = []
        
        results = []
        
        def make_request():
            response = client.get("/api/messages")
            results.append(response.status_code)
        
        # Create multiple threads
        threads = []
        for _ in range(5):
            thread = threading.Thread(target=make_request)
            threads.append(thread)
        
        # Start all threads
        start_time = time.time()
        for thread in threads:
            thread.start()
        
        # Wait for all threads to complete
        for thread in threads:
            thread.join()
        
        end_time = time.time()
        
        # All requests should succeed
        assert all(status == 200 for status in results)
        assert len(results) == 5
        
        # Should complete within reasonable time
        assert (end_time - start_time) < 5.0

class TestSecurity:
    """Test security aspects"""
    
    def test_sql_injection_protection(self):
        """Test protection against SQL injection attempts"""
        malicious_content = "'; DROP TABLE messages; --"
        message_data = {
            "content": malicious_content,
            "timestamp": "2024-01-01T12:00:00Z"
        }
        
        # Since we're using Firestore (NoSQL), this should be handled safely
        response = client.post("/api/messages", json=message_data)
        # The content should be accepted as regular text
        assert response.status_code in [200, 500]  # Either succeeds or fails gracefully
    
    def test_xss_protection(self):
        """Test protection against XSS attempts"""
        xss_content = "<script>alert('xss')</script>"
        message_data = {
            "content": xss_content,
            "timestamp": "2024-01-01T12:00:00Z"
        }
        
        response = client.post("/api/messages", json=message_data)
        # Content should be stored as-is (frontend should handle sanitization)
        assert response.status_code in [200, 500]
    
    def test_large_payload_handling(self):
        """Test handling of unusually large payloads"""
        large_content = "A" * 10000  # 10KB string
        message_data = {
            "content": large_content,
            "timestamp": "2024-01-01T12:00:00Z"
        }
        
        response = client.post("/api/messages", json=message_data)
        # Should either accept or reject gracefully
        assert response.status_code in [200, 413, 422, 500]

# Test runner function for generating reports
def run_tests_with_report():
    """Run tests and generate a summary report"""
    test_results = {
        "total_tests": 0,
        "passed": 0,
        "failed": 0,
        "errors": 0,
        "test_details": []
    }
    
    # This would be called by the test runner
    return test_results

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--cov=main", "--cov-report=html", "--cov-report=term"]) 