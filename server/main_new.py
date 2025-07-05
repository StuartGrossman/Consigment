"""
Summit Gear Exchange API - Modular Main Application

This is the refactored main application file that imports and organizes
all the modular components for better maintainability.
"""

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging
import os
from datetime import datetime, timezone

# Import our modular components
from routes import user, admin
from auth import verify_firebase_token, verify_admin_access
from models import CartItem, PaymentRequest, PaymentResponse
from utils import get_timestamp
from firebase_init import db

# Configure logging
log_level = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, log_level),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('app.log') if os.getenv("ENVIRONMENT") == "production" else logging.NullHandler()
    ]
)
logger = logging.getLogger(__name__)

# Environment configuration
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
PORT = int(os.getenv("PORT", 8080))
DEBUG = ENVIRONMENT == "development"

# Create FastAPI application
app = FastAPI(
    title="Summit Gear Exchange API",
    version="2.0.0",
    description="Modular Consignment Store API with separated concerns",
    docs_url="/docs" if DEBUG else None,
    redoc_url="/redoc" if DEBUG else None
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", 
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:5176",
        "http://localhost:6330",
        "http://localhost:7359",
        "http://localhost:9498",
        "https://consignment-store-4a564.web.app",
        "https://consignment-store-4a564.firebaseapp.com"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler for unhandled errors"""
    logger.error(f"Unhandled error on {request.method} {request.url}: {exc}")
    
    if DEBUG:
        # In development, return detailed error info
        return JSONResponse(
            status_code=500,
            content={
                "error": "Internal Server Error",
                "detail": str(exc),
                "path": str(request.url),
                "timestamp": get_timestamp()
            }
        )
    else:
        # In production, return generic error
        return JSONResponse(
            status_code=500,
            content={
                "error": "Internal Server Error",
                "message": "An unexpected error occurred",
                "timestamp": get_timestamp()
            }
        )


# Include route modules
app.include_router(user.router)
app.include_router(admin.router)


# Core API endpoints
@app.get("/")
async def read_root():
    """Root endpoint with API information"""
    return {
        "message": "Summit Gear Exchange API",
        "version": "2.0.0",
        "status": "running",
        "environment": ENVIRONMENT,
        "timestamp": get_timestamp()
    }


@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": get_timestamp(),
        "environment": ENVIRONMENT,
        "services": {
            "database": "connected",
            "authentication": "configured"
        }
    }


@app.get("/api/test-status")
async def get_test_status():
    """Get API test status"""
    return {
        "status": "operational",
        "timestamp": get_timestamp(),
        "tests_available": True,
        "environment": ENVIRONMENT
    }


@app.get("/api/status")
async def get_detailed_status():
    """Get detailed system status"""
    try:
        # Test database connection
        db_status = "connected"
        try:
            # Simple query to test connection
            test_query = db.collection('_health_check').limit(1).get()
            db_status = "connected"
        except Exception:
            db_status = "error"
        
        return {
            "status": "running",
            "version": "2.0.0",
            "environment": ENVIRONMENT,
            "timestamp": get_timestamp(),
            "services": {
                "database": db_status,
                "authentication": "configured",
                "api": "operational"
            },
            "modules": {
                "user_routes": "loaded",
                "admin_routes": "loaded",
                "auth": "configured",
                "models": "loaded",
                "utils": "loaded"
            }
        }
    except Exception as e:
        logger.error(f"Error in status check: {e}")
        return {
            "status": "error",
            "error": str(e),
            "timestamp": get_timestamp()
        }


@app.post("/api/test-simple")
async def test_simple_post():
    """Simple POST test endpoint"""
    return {
        "message": "Simple POST test successful",
        "timestamp": get_timestamp(),
        "status": "ok"
    }


@app.post("/api/messages")
async def create_message(message: dict):
    """Create a test message"""
    try:
        # Add timestamp if not provided
        if 'timestamp' not in message:
            message['timestamp'] = get_timestamp()
        
        # Save to database
        doc_ref = db.collection('test').add(message)
        
        return {
            "status": "success",
            "message": "Message saved successfully",
            "id": doc_ref[1].id,
            "timestamp": get_timestamp()
        }
    except Exception as e:
        logger.error(f"Error creating message: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/messages")
async def get_messages():
    """Get test messages"""
    try:
        messages = []
        docs = db.collection('test').stream()
        for doc in docs:
            message_data = doc.to_dict()
            message_data['id'] = doc.id
            messages.append(message_data)
        
        return {
            "messages": messages,
            "count": len(messages),
            "timestamp": get_timestamp()
        }
    except Exception as e:
        logger.error(f"Error getting messages: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Middleware for request logging (development only)
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log requests in development mode"""
    if DEBUG:
        start_time = datetime.now()
        logger.info(f"Request: {request.method} {request.url}")
        
        response = await call_next(request)
        
        process_time = datetime.now() - start_time
        logger.info(f"Response: {response.status_code} in {process_time.total_seconds():.3f}s")
        
        return response
    else:
        return await call_next(request)


# Startup event
@app.on_event("startup")
async def startup_event():
    """Application startup tasks"""
    logger.info(f"🚀 Starting Summit Gear Exchange API v2.0.0")
    logger.info(f"📊 Environment: {ENVIRONMENT}")
    logger.info(f"🌐 Port: {PORT}")
    logger.info(f"🔐 Debug mode: {DEBUG}")
    logger.info(f"📦 Modules loaded: auth, models, utils, user routes, admin routes")


# Shutdown event
@app.on_event("shutdown")
async def shutdown_event():
    """Application shutdown tasks"""
    logger.info("📊 Shutting down Summit Gear Exchange API")


# Run the application
if __name__ == "__main__":
    import uvicorn
    
    logger.info(f"Starting server in {ENVIRONMENT} mode on port {PORT}")
    
    uvicorn.run(
        "main_new:app",
        host="0.0.0.0",
        port=PORT,
        reload=DEBUG,
        log_level=log_level.lower(),
        access_log=DEBUG
    ) 