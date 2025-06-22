import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Project ID from the Firebase config
PROJECT_ID = "consignment-store-4a564"

# Get private key and ensure proper formatting
private_key = os.getenv("FIREBASE_PRIVATE_KEY")
if private_key:
    # Remove any existing newlines and add proper ones
    private_key = private_key.replace("\\n", "").replace("\n", "")
    private_key = f"-----BEGIN PRIVATE KEY-----\n{private_key}\n-----END PRIVATE KEY-----"

# Firebase Admin SDK configuration
FIREBASE_CONFIG = {
    "type": os.getenv("FIREBASE_TYPE", "service_account"),
    "project_id": PROJECT_ID,
    "private_key_id": os.getenv("FIREBASE_PRIVATE_KEY_ID", ""),
    "private_key": private_key or "",
    "client_email": os.getenv("FIREBASE_CLIENT_EMAIL", ""),
    "client_id": os.getenv("FIREBASE_CLIENT_ID", ""),
    "auth_uri": os.getenv("FIREBASE_AUTH_URI", "https://accounts.google.com/o/oauth2/auth"),
    "token_uri": os.getenv("FIREBASE_TOKEN_URI", "https://oauth2.googleapis.com/token"),
    "auth_provider_x509_cert_url": os.getenv("FIREBASE_AUTH_PROVIDER_CERT_URL", "https://www.googleapis.com/oauth2/v1/certs"),
    "client_x509_cert_url": os.getenv("FIREBASE_CLIENT_CERT_URL", "")
} 