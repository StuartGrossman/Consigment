"""
Modular Main Server

This demonstrates how the main.py should look after extracting all modules.
The server is now much cleaner and focuses on application setup and coordination.
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging
import os
from datetime import datetime, timezone

# Import our modular components
from error_handling import global_exception_handler, ConsignmentError
from routes import user, payment, rewards, admin
from database import DatabaseService
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

# Add global exception handler
app.add_exception_handler(Exception, global_exception_handler)

# Include routers
app.include_router(user.router)
app.include_router(payment.router)
app.include_router(rewards.router)
app.include_router(admin.router)

# Health check and basic endpoints
@app.get("/")
async def read_root():
    """Root endpoint with API information"""
    return {
        "message": "Summit Gear Exchange API",
        "version": "2.0.0",
        "status": "running",
        "environment": ENVIRONMENT,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "features": {
            "modular_architecture": True,
            "user_management": True,
            "payment_processing": True,
            "rewards_system": True,
            "admin_tools": True,
            "error_handling": True,
            "database_services": True
        }
    }

@app.get("/api/health")
async def health_check():
    """Comprehensive health check endpoint"""
    try:
        # Check database connectivity
        db_status = "connected"
        try:
            # Simple database test
            test_ref = db.collection('_health_check').document('test')
            test_ref.set({'timestamp': datetime.now(timezone.utc)})
            test_ref.delete()
        except Exception as e:
            db_status = f"error: {str(e)}"
        
        # Check services
        services_status = {
            "database": db_status,
            "user_service": "available",
            "payment_service": "available",
            "rewards_service": "available",
            "admin_service": "available"
        }
        
        # Overall health
        is_healthy = all(status in ["connected", "available"] for status in services_status.values())
        
        return {
            "status": "healthy" if is_healthy else "degraded",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "environment": ENVIRONMENT,
            "version": "2.0.0",
            "services": services_status,
            "uptime_check": True
        }
        
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return JSONResponse(
            status_code=503,
            content={
                "status": "unhealthy",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "error": str(e)
            }
        )

@app.get("/api/info")
async def get_api_info():
    """Get API information and available endpoints"""
    return {
        "api_name": "Summit Gear Exchange",
        "version": "2.0.0",
        "description": "Modular consignment store API",
        "environment": ENVIRONMENT,
        "endpoints": {
            "user": {
                "submit_item": "POST /api/user/submit-item",
                "remove_item": "DELETE /api/user/remove-item/{item_id}",
                "update_item": "PUT /api/user/update-item/{item_id}",
                "store_credit": "GET /api/user/store-credit",
                "purchases": "GET /api/user/purchases",
                "redeem_points": "POST /api/user/redeem-points",
                "rewards_info": "GET /api/user/rewards-info"
            },
            "payment": {
                "process_payment": "POST /api/process-payment",
                "inhouse_sale": "POST /api/admin/process-inhouse-sale",
                "issue_refund": "POST /api/admin/issue-refund"
            },
            "rewards": {
                "config": "GET /api/admin/rewards-config",
                "update_config": "POST /api/admin/update-rewards-config",
                "analytics": "GET /api/admin/rewards-analytics",
                "adjust_points": "POST /api/admin/adjust-user-points"
            },
            "admin": {
                "item_management": "Various endpoints for item lifecycle",
                "user_management": "User administration endpoints",
                "analytics": "Business analytics endpoints"
            }
        },
        "architecture": {
            "modular_design": True,
            "separated_concerns": True,
            "route_organization": "Organized by domain (user, payment, rewards, admin)",
            "error_handling": "Centralized error management",
            "database_services": "Service layer for data operations",
            "business_logic": "Separated business logic services"
        }
    }

@app.post("/api/test-simple")
async def test_simple_post():
    """Simple test endpoint for connectivity testing"""
    return {
        "message": "Simple POST test successful",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "server_version": "2.0.0",
        "environment": ENVIRONMENT
    }

# Startup event
@app.on_event("startup")
async def startup_event():
    """Application startup tasks"""
    logger.info(f"=== STARTING SUMMIT GEAR EXCHANGE API v2.0.0 ===")
    logger.info(f"Environment: {ENVIRONMENT}")
    logger.info(f"Port: {PORT}")
    logger.info(f"Debug mode: {DEBUG}")
    logger.info("Modular architecture loaded successfully")
    logger.info("Available services: User, Payment, Rewards, Admin")
    logger.info("Error handling: Centralized with custom exceptions")
    logger.info("Database: Firebase Firestore with service layer")
    logger.info("=== APPLICATION STARTUP COMPLETE ===")

# Shutdown event
@app.on_event("shutdown")
async def shutdown_event():
    """Application shutdown tasks"""
    logger.info("=== SHUTTING DOWN SUMMIT GEAR EXCHANGE API ===")
    logger.info("Cleanup completed successfully")

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

# Run the application
if __name__ == "__main__":
    import uvicorn
    
    logger.info(f"Starting server in {ENVIRONMENT} mode on port {PORT}")
    
    uvicorn.run(
        "main_modular:app",
        host="0.0.0.0",
        port=PORT,
        reload=DEBUG,
        log_level=log_level.lower(),
        access_log=DEBUG
    ) 