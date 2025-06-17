import firebase_admin
from firebase_admin import credentials, firestore
from firebase_config import FIREBASE_CONFIG

# Initialize Firebase Admin SDK
cred = credentials.Certificate(FIREBASE_CONFIG)
firebase_admin.initialize_app(cred)

# Get Firestore instance
db = firestore.client()

# Export the database instance
__all__ = ['db'] 