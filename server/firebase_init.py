import firebase_admin
from firebase_admin import credentials, firestore
import logging
import os

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

try:
    # Try to initialize Firebase Admin SDK
    # First try with service account key file if it exists
    service_account_path = os.path.join(os.path.dirname(__file__), 'serviceAccountKey.json')
    
    if os.path.exists(service_account_path):
        cred = credentials.Certificate(service_account_path)
        firebase_admin.initialize_app(cred)
        logger.info("Firebase initialized with service account key")
    else:
        # For development, initialize with default credentials
        # This works when using the same project as the frontend
        firebase_admin.initialize_app(credentials.ApplicationDefault(), {
            'projectId': 'consignment-store-4a564'
        })
        logger.info("Firebase initialized with application default credentials")
    
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