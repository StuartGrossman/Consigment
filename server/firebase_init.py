import firebase_admin
from firebase_admin import credentials, firestore
from firebase_config import FIREBASE_CONFIG
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

try:
    # Initialize Firebase Admin SDK
    cred = credentials.Certificate(FIREBASE_CONFIG)
    firebase_admin.initialize_app(cred)
    
    # Get Firestore instance
    db = firestore.client()
    logger.info("Firebase initialized successfully")
    
except Exception as e:
    logger.error(f"Failed to initialize Firebase: {e}")
    logger.info("Running in mock mode - Firebase features will be disabled")
    
    # Create a mock database object for development
    class MockFirestore:
        def collection(self, name):
            return MockCollection()
    
    class MockCollection:
        def document(self, doc_id=None):
            return MockDocument()
        
        def add(self, data):
            return MockDocument(), "mock_id"
        
        def get(self):
            return []
        
        def where(self, *args):
            return self
        
        def order_by(self, *args):
            return self
        
        def limit(self, count):
            return self
    
    class MockDocument:
        def set(self, data):
            pass
        
        def update(self, data):
            pass
        
        def delete(self):
            pass
        
        def get(self):
            return MockDocumentSnapshot()
    
    class MockDocumentSnapshot:
        def exists(self):
            return False
        
        def to_dict(self):
            return {}
    
    db = MockFirestore()

# Export the database instance
__all__ = ['db'] 