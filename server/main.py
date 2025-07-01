from fastapi import FastAPI, HTTPException, Depends, status, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, field_validator
from firebase_init import db
from firebase_admin import auth
from typing import Dict, Any, List, Optional
import stripe
import json
import os
import time
import logging
import requests
from datetime import datetime, timedelta, timezone
import uuid

# Configure logging for production
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

app = FastAPI(title="Summit Gear Exchange API", version="1.0.0")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", 
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:5176",
        "http://localhost:6330",  # Server port
        "http://localhost:7359",  # Previous app port
        "http://localhost:9498",  # Current app port
        "https://consignment-store-4a564.web.app",
        "https://consignment-store-4a564.firebaseapp.com"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure Stripe (use environment variable in production)
stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "sk_test_your_secret_key_here")

# Environment configuration
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
PORT = int(os.getenv("PORT", 8080))
DEBUG = ENVIRONMENT == "development"

logger.info(f"Starting server in {ENVIRONMENT} mode on port {PORT}")

# Security 
security = HTTPBearer()

# Pydantic Models
class CartItem(BaseModel):
    item_id: str
    title: str
    price: float = Field(..., gt=0)
    quantity: int = Field(..., gt=0)
    seller_id: str
    seller_name: str

class CustomerInfo(BaseModel):
    name: str = Field(..., min_length=1)
    email: str = Field(..., pattern=r'^[^@]+@[^@]+\.[^@]+$')
    phone: str = Field(..., min_length=10)
    address: Optional[str] = None
    city: Optional[str] = None
    zip_code: Optional[str] = None

class PaymentRequest(BaseModel):
    cart_items: List[CartItem]
    customer_info: CustomerInfo
    fulfillment_method: str = Field(..., pattern='^(pickup|shipping)$')
    payment_method_id: str
    
    @field_validator('cart_items')
    @classmethod
    def validate_cart_not_empty(cls, v):
        if not v:
            raise ValueError('Cart cannot be empty')
        return v

class PaymentResponse(BaseModel):
    success: bool
    order_id: str
    transaction_id: str
    total_amount: float
    message: str

class ItemStatusUpdate(BaseModel):
    item_id: str
    new_status: str = Field(..., pattern='^(pending|approved|live|sold|rejected)$')
    admin_notes: Optional[str] = None

class Message(BaseModel):
    content: str = Field(..., min_length=1, description="Message content cannot be empty")
    timestamp: str

class TestResult(BaseModel):
    test_name: str
    status: str
    duration: float
    error_message: str = None

class TestSummary(BaseModel):
    total_tests: int
    passed: int
    failed: int
    errors: int
    duration: float
    coverage_percentage: float = None
    test_details: List[TestResult]
    timestamp: str

# Authentication helper - now using Firebase Admin SDK
async def verify_firebase_token(credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer(auto_error=False))):
    """Verify Firebase token from Authorization header"""
    if not credentials:
        # For payment processing, we'll use server-side admin credentials
        # This allows the server to process payments on behalf of users
        logger.info("No token provided - using server admin context for payment processing")
        return {
            'uid': 'server_admin',
            'email': 'server@consignment-store.com',
            'name': 'Server Admin',
            'is_server': True
        }
    
    try:
        # Verify the token using Firebase Admin SDK
        decoded_token = auth.verify_id_token(credentials.credentials)
        logger.info(f"Token verified for user: {decoded_token.get('uid')}")
        return {
            'uid': decoded_token.get('uid'),
            'email': decoded_token.get('email'),
            'name': decoded_token.get('name', 'Unknown'),
            'is_server': False
        }
    except Exception as e:
        logger.error(f"Token verification failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token"
        )

# Admin verification helper - checks if user is admin
async def verify_admin_access(user_data: dict = Depends(verify_firebase_token)):
    """Verify user has admin privileges"""
    # Server admin always has access
    if user_data.get('is_server'):
        return user_data
    
    try:
        # Check if user is admin in the database
        user_uid = user_data.get('uid')
        user_doc = db.collection('users').document(user_uid).get()
        
        if user_doc.exists and user_doc.to_dict().get('isAdmin'):
            logger.info(f"Admin access granted for user: {user_uid}")
            return user_data
        else:
            logger.warning(f"Admin access denied for user: {user_uid}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin access required"
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error verifying admin access: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to verify admin access"
        )

# Utility functions
def calculate_earnings(price: float) -> dict:
    """Calculate seller and store earnings"""
    seller_earnings = price * 0.75
    store_commission = price * 0.25
    return {
        'seller_earnings': round(seller_earnings, 2),
        'store_commission': round(store_commission, 2)
    }

def generate_order_number() -> str:
    """Generate a unique order number"""
    return f"ORD-{int(time.time())}-{str(uuid.uuid4())[:8].upper()}"

def generate_transaction_id() -> str:
    """Generate a unique transaction ID"""
    return f"TXN-{int(time.time())}-{str(uuid.uuid4())[:8].upper()}"

# API Endpoints
@app.get("/")
async def read_root():
    return {"message": "Summit Gear Exchange API", "version": "1.0.0", "status": "running"}

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "services": {
            "database": "connected",
            "stripe": "configured" if stripe.api_key else "not_configured"
        }
    }

@app.post("/api/test-simple")
async def test_simple_post():
    return {"message": "Simple POST test successful", "timestamp": datetime.now(timezone.utc).isoformat()}

@app.post("/api/admin/import-processed-items")
async def import_processed_items(request: Request, admin_data: dict = Depends(verify_admin_access)):
    """Import processed items to database with barcode generation"""
    try:
        logger.info("=== STARTING PROCESSED ITEMS IMPORT ===")
        
        data = await request.json()
        items_to_import = data.get('items', [])
        import_source = data.get('import_source', 'manual_import')
        
        if not items_to_import:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No items provided for import"
            )
        
        logger.info(f"Importing {len(items_to_import)} items to database")
        
        imported_items = []
        batch = db.batch()
        
        for i, item in enumerate(items_to_import):
            try:
                # Generate a unique item ID if not present
                item_id = item.get('id', str(uuid.uuid4()))
                
                # Generate barcode data
                barcode_data = f"CSG{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}{str(i).zfill(3)}"
                
                # Prepare item data for database
                item_doc_data = {
                    'id': item_id,
                    'title': item.get('title', 'Imported Item'),
                    'brand': item.get('brand', 'Unknown'),
                    'category': item.get('category', 'Accessories'),
                    'size': item.get('size', ''),
                    'color': item.get('color', ''),
                    'condition': item.get('condition', 'Good'),
                    'originalPrice': float(item.get('originalPrice', item.get('price', 0))),
                    'price': float(item.get('price', 0)),
                    'description': item.get('description', 'Imported item'),
                    'material': item.get('material', ''),
                    'gender': item.get('gender', ''),
                    'sellerEmail': item.get('sellerEmail', ''),
                    'sellerPhone': item.get('sellerPhone', ''),
                    'sellerId': admin_data.get('uid', 'imported'),
                    'sellerName': admin_data.get('name', 'Admin Import'),
                    'status': 'approved',  # Import as approved items
                    'images': item.get('images', []),  # Default to empty array for imported items
                    'tags': item.get('tags', []),  # Default to empty array
                    'createdAt': datetime.now(timezone.utc),
                    'approvedAt': datetime.now(timezone.utc),
                    'importedAt': datetime.now(timezone.utc),
                    'importSource': import_source,
                    'barcodeData': barcode_data,
                    'barcodeGeneratedAt': datetime.now(timezone.utc),
                    'adminNotes': f'Imported via {import_source} on {datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")}'
                }
                
                # Add to batch
                doc_ref = db.collection('items').document(item_id)
                batch.set(doc_ref, item_doc_data)
                
                imported_items.append({
                    'id': item_id,
                    'title': item_doc_data['title'],
                    'barcode_data': barcode_data,
                    'status': 'approved'
                })
                
                logger.info(f"Prepared item {i+1}/{len(items_to_import)}: {item_doc_data['title']} with barcode {barcode_data}")
                
            except Exception as e:
                logger.error(f"Failed to prepare item {i+1}: {e}")
                continue
        
        # Commit the batch
        try:
            batch.commit()
            logger.info(f"Successfully imported {len(imported_items)} items to database")
            
            return {
                "success": True,
                "message": f"Successfully imported {len(imported_items)} items with barcodes generated",
                "imported_count": len(imported_items),
                "items": imported_items,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
            
        except Exception as e:
            logger.error(f"Batch commit failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to save items to database: {str(e)}"
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in import process: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Import process failed: {str(e)}"
        )

@app.post("/api/admin/analyze-data")
async def analyze_data_with_deepseek(request: Request, admin_data: dict = Depends(verify_admin_access)):
    """Use DeepSeek AI to analyze and reformat CSV/JSON/SQL data into our ConsignmentItem format with comprehensive logging and fallback"""
    
    # Initialize detailed logging structure for frontend
    log_entries = []
    
    def add_log(level, message, data=None):
        """Add detailed log entry for both server and frontend"""
        timestamp = datetime.now(timezone.utc).isoformat()
        log_entry = {
            "timestamp": timestamp,
            "level": level,
            "message": message,
            "data": data
        }
        log_entries.append(log_entry)
        
        # Also log to server
        if level == "ERROR":
            logger.error(f"[FRONTEND LOG] {message} | Data: {data}")
        elif level == "WARNING":
            logger.warning(f"[FRONTEND LOG] {message} | Data: {data}")
        else:
            logger.info(f"[FRONTEND LOG] {message} | Data: {data}")
    
    try:
        add_log("INFO", "🚀 Starting comprehensive data analysis process")
        logger.info("=== STARTING ENHANCED DATA ANALYSIS PROCESS ===")
        
        data = await request.json()
        raw_data = data.get('raw_data', '')
        data_type = data.get('data_type', 'csv').lower()  # Support 'csv', 'json', 'sql'
        
        add_log("INFO", f"📥 Request received and parsed", {
            "data_type": data_type,
            "data_length": len(raw_data),
            "admin_user": admin_data.get('email', 'unknown')
        })
        
        logger.info(f"Step 1: Enhanced request processing")
        logger.info(f"  - Data type: {data_type}")
        logger.info(f"  - Data length: {len(raw_data)} characters")
        logger.info(f"  - Admin user: {admin_data.get('email', 'unknown')}")
        logger.info(f"  - First 300 chars: {raw_data[:300]}...")
        logger.info(f"  - Last 100 chars: ...{raw_data[-100:] if len(raw_data) > 100 else raw_data}")
        
        if not raw_data or len(raw_data.strip()) == 0:
            add_log("ERROR", "❌ No data provided for analysis")
            logger.error("Step 1 FAILED: No data provided")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No data provided for analysis"
            )
        
        if data_type not in ['csv', 'json', 'sql']:
            add_log("WARNING", f"⚠️ Unsupported data type '{data_type}', defaulting to CSV")
            data_type = 'csv'
        
        add_log("INFO", "✅ Step 1 completed: Data validation successful", {
            "validated_data_type": data_type,
            "data_preview": raw_data[:100] + "..." if len(raw_data) > 100 else raw_data
        })
        logger.info("Step 1 SUCCESS: Enhanced data received and validated")
        
        # Step 2: Prepare DeepSeek API configuration
        add_log("INFO", "🔧 Configuring DeepSeek AI API connection")
        logger.info("Step 2: Preparing enhanced DeepSeek API configuration")
        
        deepseek_api_key = os.getenv("DEEPSEEK_API_KEY", "")
        deepseek_api_url = os.getenv("DEEPSEEK_API_URL", "https://api.deepseek.com/v1/chat/completions")
        
        if not deepseek_api_key:
            deepseek_api_key = "sk-0bd6e4c111cc4568b6b0806235bcfd28"  # Use provided key as fallback
            add_log("INFO", "🔑 Using fallback API key for DeepSeek")
            logger.info("  - Using fallback API key")
        else:
            add_log("INFO", "🔑 Using environment API key for DeepSeek")
            logger.info("  - Using environment API key")
        
        add_log("INFO", "🌐 API configuration completed", {
            "api_url": deepseek_api_url,
            "has_api_key": bool(deepseek_api_key),
            "key_length": len(deepseek_api_key) if deepseek_api_key else 0
        })
        
        logger.info(f"  - API URL: {deepseek_api_url}")
        logger.info(f"  - API key configured: {bool(deepseek_api_key)}")
        logger.info("Step 2 SUCCESS: Enhanced API configuration prepared")
        
        # Step 3: Create the enhanced prompt for DeepSeek
        add_log("INFO", f"📝 Creating specialized AI prompt for {data_type.upper()} data")
        logger.info("Step 3: Creating enhanced AI prompt with SQL support")
        
        system_prompt = f"""You are a data analyst specialized in e-commerce inventory management. 
        Your task is to analyze {data_type.upper()} data and convert it into a standardized format for a consignment store that sells outdoor gear.

        DATA TYPE SPECIFIC INSTRUCTIONS:
        {f'''
        For SQL data:
        - Extract INSERT statements and CREATE TABLE schemas
        - Parse column names and values from INSERT statements
        - Ignore CREATE TABLE, DROP TABLE, and comment lines
        - Focus on actual data rows from INSERT statements
        ''' if data_type == 'sql' else f'''
        For {data_type.upper()} data:
        - Parse the provided {data_type.upper()} structure carefully
        - Handle nested objects and arrays appropriately
        - Map varying field names to standard format
        '''}

        The target data structure should be an array of objects with the following fields:
        - title: string (product name/title)
        - brand: string (manufacturer/brand name)
        - category: string (standardized categories: 'Jackets', 'Pants', 'Shirts', 'Footwear', 'Backpacks', 'Climbing Gear', 'Sleep Systems', 'Cooking Gear', 'Base Layers', 'Socks', 'Vests', 'Outerwear', 'Accessories')
        - size: string (size information)
        - color: string (primary color)
        - condition: string (standardized: 'Excellent', 'Very Good', 'Good', 'Fair')
        - originalPrice: number (retail/original price)
        - price: number (listing/asking price)
        - description: string (item description)
        - sellerEmail: string (seller's email)
        - sellerPhone: string (seller's phone, optional)
        - gender: string ('Men', 'Women', 'Unisex', 'Kids')
        - material: string (fabric/material type, optional)

        FIELD MAPPING GUIDANCE:
        - title: product_name, item_title, name, item_name, gear_name, equipment_name, article_title, merchandise_name
        - brand: manufacturer, brand_name, company, make, producer, creator, manufacturing_brand
        - category: product_category, gear_type, item_type, classification, equipment_type, item_category
        - size: dimensions, size_spec, garment_size, measurement_info, capacity
        - color: primary_color, color_way, hue, shade, colorway, fabric_color
        - condition: wear_condition, condition_rating, state, usage_level, current_condition
        - originalPrice: retail_value, original_price, msrp, list_price, retail_cost, factory_price
        - price: asking_price, sale_price, current_price, listed_price, offer_price, market_price
        - description: item_notes, details, notes, product_description, condition_notes, item_description
        - sellerEmail: owner_email, contact_email, seller_email, email_address, electronic_mail
        - sellerPhone: owner_phone, contact_phone, seller_phone, phone_number, telephone

        Instructions:
        1. Analyze the provided {data_type.upper()} data and map fields to the target structure
        2. Standardize category names to match our predefined categories
        3. Normalize condition values to our standards
        4. Extract prices as numbers (remove currency symbols like $, €, £)
        5. Ensure all required fields are present (use reasonable defaults if missing)
        6. Return ONLY valid JSON array format
        7. If data cannot be mapped, return an error explanation

        CRITICAL: Respond with properly formatted JSON only. No explanations, no markdown formatting."""

        user_prompt = f"""Please analyze and convert this {data_type.upper()} data into our standardized consignment item format:

        {raw_data}
        
        Convert this data to match our inventory structure and return as a JSON array."""

        add_log("INFO", "📋 AI prompt configuration completed", {
            "system_prompt_length": len(system_prompt),
            "user_prompt_length": len(user_prompt),
            "data_type_specific": data_type,
            "supports_field_mapping": True
        })
        
        logger.info(f"  - System prompt length: {len(system_prompt)} characters")
        logger.info(f"  - User prompt length: {len(user_prompt)} characters")
        logger.info(f"  - Data type specific handling: {data_type}")
        logger.info("Step 3 SUCCESS: Enhanced AI prompt created with SQL support")
        
        # Step 4: Prepare API request
        add_log("INFO", "⚙️ Preparing DeepSeek API request")
        logger.info("Step 4: Preparing enhanced API request")
        
        headers = {
            "Authorization": f"Bearer {deepseek_api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": "deepseek-chat",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.1,
            "max_tokens": 6000,  # Increased for larger datasets
            "stream": False
        }
        
        add_log("INFO", "🔧 API request configured", {
            "model": payload['model'],
            "temperature": payload['temperature'],
            "max_tokens": payload['max_tokens'],
            "payload_size_bytes": len(str(payload)),
            "message_count": len(payload['messages'])
        })
        
        logger.info(f"  - Model: {payload['model']}")
        logger.info(f"  - Temperature: {payload['temperature']}")
        logger.info(f"  - Max tokens: {payload['max_tokens']}")
        logger.info(f"  - Total payload size: {len(str(payload))} characters")
        logger.info(f"  - Messages in payload: {len(payload['messages'])}")
        logger.info("Step 4 SUCCESS: Enhanced API request prepared")
        
        # Step 5: Make request to DeepSeek API
        add_log("INFO", "🌐 Sending request to DeepSeek AI")
        logger.info("Step 5: Sending enhanced request to DeepSeek API")
        logger.info("  - Starting HTTP request with detailed monitoring...")
        
        try:
            import time
            start_time = time.time()
            
            add_log("INFO", "⏳ HTTP request in progress...", {
                "start_time": datetime.now(timezone.utc).isoformat(),
                "timeout_seconds": 150,
                "endpoint": deepseek_api_url
            })
            
            response = requests.post(deepseek_api_url, headers=headers, json=payload, timeout=150)  # Increased timeout
            end_time = time.time()
            request_duration = end_time - start_time
            
            add_log("INFO", f"✅ HTTP request completed in {request_duration:.2f}s", {
                "duration_seconds": request_duration,
                "status_code": response.status_code,
                "response_size": len(response.content) if response.content else 0,
                "headers": dict(response.headers)
            })
            
            logger.info(f"  - Request completed in {request_duration:.2f} seconds")
            logger.info(f"  - Response status code: {response.status_code}")
            logger.info(f"  - Response size: {len(response.content)} bytes")
            logger.info(f"  - Response headers: {dict(response.headers)}")
            
            if response.status_code != 200:
                add_log("ERROR", f"❌ DeepSeek API error: {response.status_code}", {
                    "status_code": response.status_code,
                    "response_text": response.text[:500],
                    "fallback_triggered": True
                })
                
                logger.error(f"Step 5 FAILED: DeepSeek API error")
                logger.error(f"  - Status code: {response.status_code}")
                logger.error(f"  - Response text: {response.text}")
                
                # Step 5.1: Fallback to basic parsing
                add_log("WARNING", "🔄 Attempting fallback parsing due to API error")
                logger.info("Step 5.1: Attempting fallback parsing")
                fallback_result = await fallback_data_parsing(raw_data, data_type, log_entries)
                return {**fallback_result, "logs": log_entries}
            
            response_data = response.json()
            
            add_log("INFO", "📨 DeepSeek API response received", {
                "response_keys": list(response_data.keys()),
                "has_choices": "choices" in response_data,
                "choices_count": len(response_data.get("choices", []))
            })
            
            logger.info("Step 5 SUCCESS: Received response from DeepSeek API")
            logger.info(f"  - Response data keys: {list(response_data.keys())}")
            
            if "choices" in response_data and len(response_data["choices"]) > 0:
                ai_response = response_data["choices"][0]["message"]["content"]
                
                add_log("INFO", "🤖 AI response extracted", {
                    "response_length": len(ai_response),
                    "preview": ai_response[:200] + "..." if len(ai_response) > 200 else ai_response,
                    "ends_with": ai_response[-100:] if len(ai_response) > 100 else ai_response
                })
                
                logger.info(f"  - AI response length: {len(ai_response)} characters")
                logger.info(f"  - AI response preview: {ai_response[:300]}...")
                logger.info(f"  - AI response ending: ...{ai_response[-100:]}")
                
                # Log usage information if available
                if "usage" in response_data:
                    usage = response_data["usage"]
                    add_log("INFO", "📊 Token usage statistics", usage)
                    logger.info(f"  - Token usage: {usage}")
            else:
                add_log("ERROR", "❌ No AI response choices found", {
                    "full_response": response_data,
                    "fallback_triggered": True
                })
                
                logger.error("Step 5 FAILED: No choices in API response")
                logger.error(f"  - Full response: {response_data}")
                fallback_result = await fallback_data_parsing(raw_data, data_type, log_entries)
                return {**fallback_result, "logs": log_entries}
            
        except requests.exceptions.Timeout:
            add_log("ERROR", "⏰ DeepSeek API request timeout after 150 seconds", {
                "timeout_duration": 150,
                "fallback_triggered": True
            })
            
            logger.error("Step 5 FAILED: Request timeout after 150 seconds")
            logger.info("Step 5.1: Attempting fallback parsing due to timeout")
            fallback_result = await fallback_data_parsing(raw_data, data_type, log_entries)
            return {**fallback_result, "logs": log_entries}
            
        except requests.exceptions.RequestException as e:
            add_log("ERROR", f"🔌 Network/connection error: {str(e)}", {
                "error_type": type(e).__name__,
                "error_details": str(e),
                "fallback_triggered": True
            })
            
            logger.error(f"Step 5 FAILED: Request exception: {e}")
            logger.info("Step 5.1: Attempting fallback parsing due to request error")
            fallback_result = await fallback_data_parsing(raw_data, data_type, log_entries)
            return {**fallback_result, "logs": log_entries}
        
        # Step 6: Parse AI response
        logger.info("Step 6: Parsing AI response")
        try:
            # Clean up the response (remove markdown formatting if present)
            clean_response = ai_response.strip()
            logger.info(f"  - Original response starts with: {clean_response[:50]}...")
            
            if clean_response.startswith("```json"):
                clean_response = clean_response[7:-3]
                logger.info("  - Removed JSON markdown formatting")
            elif clean_response.startswith("```"):
                clean_response = clean_response[3:-3]
                logger.info("  - Removed generic markdown formatting")
            
            logger.info(f"  - Clean response starts with: {clean_response[:50]}...")
            logger.info("  - Attempting JSON parse...")
            
            parsed_items = json.loads(clean_response)
            logger.info("Step 6 SUCCESS: JSON parsing successful")
            
            # Validate that it's an array
            if not isinstance(parsed_items, list):
                logger.error("Step 6 FAILED: Response is not an array")
                logger.error(f"  - Response type: {type(parsed_items)}")
                logger.error(f"  - Response value: {parsed_items}")
                fallback_result = await fallback_data_parsing(raw_data, data_type)
                return fallback_result
            
            logger.info(f"  - Parsed {len(parsed_items)} items from AI response")
            
            # Log details about each parsed item
            for i, item in enumerate(parsed_items[:3]):  # Log first 3 items for debugging
                logger.info(f"  - Item {i+1} keys: {list(item.keys()) if isinstance(item, dict) else 'Not a dict'}")
            
        except json.JSONDecodeError as e:
            logger.error(f"Step 6 FAILED: JSON parsing error: {e}")
            logger.error(f"  - Error position: {e.pos if hasattr(e, 'pos') else 'Unknown'}")
            logger.error(f"  - Clean response: {clean_response}")
            logger.info("Step 6.1: Attempting fallback parsing due to JSON error")
            fallback_result = await fallback_data_parsing(raw_data, data_type)
            return fallback_result
        except Exception as e:
            logger.error(f"Step 6 FAILED: Unexpected parsing error: {e}")
            logger.info("Step 6.1: Attempting fallback parsing due to unexpected error")
            fallback_result = await fallback_data_parsing(raw_data, data_type)
            return fallback_result
        
        # Step 7: Process and enrich items
        logger.info("Step 7: Processing and enriching parsed items")
        processed_items = []
        for i, item in enumerate(parsed_items):
            try:
                processed_item = {
                    **item,
                    'id': str(uuid.uuid4()),
                    'status': 'pending',
                    'createdAt': datetime.now(timezone.utc).isoformat(),
                    'sellerId': admin_data.get('uid', 'imported'),
                    'importedAt': datetime.now(timezone.utc).isoformat(),
                    'importSource': 'deepseek_ai'
                }
                processed_items.append(processed_item)
                logger.info(f"  - Processed item {i+1}: {item.get('title', 'Unknown title')}")
            except Exception as e:
                logger.error(f"  - Failed to process item {i+1}: {e}")
                logger.error(f"  - Item data: {item}")
        
        logger.info(f"Step 7 SUCCESS: Processed {len(processed_items)} items")
        
        # Step 8: Return successful result
        add_log("INFO", f"🎉 Analysis completed successfully! Processed {len(processed_items)} items", {
            "total_items": len(processed_items),
            "processing_method": "deepseek_ai",
            "ai_confidence": "high",
            "token_usage": response_data.get("usage", {}).get("total_tokens", 0)
        })
        
        logger.info("Step 8: Preparing successful response")
        result = {
            "success": True,
            "message": f"Successfully processed {len(processed_items)} items using AI analysis",
            "items": processed_items,
            "ai_confidence": "high",
            "processing_method": "deepseek_ai",
            "processing_time": response_data.get("usage", {}).get("total_tokens", 0),
            "status_color": "green",
            "logs": log_entries,  # Include detailed logs for frontend
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        logger.info("=== ENHANCED DATA ANALYSIS PROCESS COMPLETED SUCCESSFULLY ===")
        logger.info(f"Final result: {len(processed_items)} items processed via AI")
        logger.info(f"Total log entries for frontend: {len(log_entries)}")
        
        return result
        
    except HTTPException:
        add_log("ERROR", "❌ HTTP Exception occurred during processing")
        logger.error("=== DATA ANALYSIS PROCESS FAILED WITH HTTP EXCEPTION ===")
        raise
    except Exception as e:
        add_log("ERROR", f"💥 Unexpected error: {str(e)}", {
            "error_type": type(e).__name__,
            "error_details": str(e)
        })
        
        logger.error(f"=== DATA ANALYSIS PROCESS FAILED WITH UNEXPECTED ERROR ===")
        logger.error(f"Unexpected error in data analysis: {e}")
        logger.error(f"Error type: {type(e)}")
        
        # Last resort fallback
        try:
            add_log("WARNING", "🔄 Attempting final emergency fallback")
            data = await request.json()
            raw_data = data.get('raw_data', '')
            data_type = data.get('data_type', 'csv')
            logger.info("Attempting final fallback parsing...")
            fallback_result = await fallback_data_parsing(raw_data, data_type, log_entries)
            return {**fallback_result, "logs": log_entries}
        except Exception as fallback_error:
            add_log("ERROR", f"💀 Final fallback failed: {str(fallback_error)}")
            logger.error(f"Final fallback also failed: {fallback_error}")
            
            # Return error with logs
            return {
                "success": False,
                "message": f"All processing methods failed: {str(e)}",
                "items": [],
                "ai_confidence": "failed",
                "processing_method": "none",
                "processing_time": 0,
                "status_color": "red",
                "logs": log_entries,
                "error": str(e),
                "timestamp": datetime.now(timezone.utc).isoformat()
            }

async def fallback_data_parsing(raw_data: str, data_type: str, log_entries: list = None):
    """Enhanced fallback parsing when AI analysis fails, with comprehensive logging"""
    if log_entries is None:
        log_entries = []
    
    def add_fallback_log(level, message, data=None):
        """Add log entry for fallback process"""
        timestamp = datetime.now(timezone.utc).isoformat()
        log_entry = {
            "timestamp": timestamp,
            "level": level,
            "message": f"[FALLBACK] {message}",
            "data": data
        }
        log_entries.append(log_entry)
        
        if level == "ERROR":
            logger.error(f"[FALLBACK] {message} | Data: {data}")
        elif level == "WARNING":
            logger.warning(f"[FALLBACK] {message} | Data: {data}")
        else:
            logger.info(f"[FALLBACK] {message} | Data: {data}")
    
    add_fallback_log("INFO", "🔄 Starting fallback data parsing")
    logger.info("=== STARTING ENHANCED FALLBACK DATA PARSING ===")
    
    try:
        import csv
        import io
        
        parsed_items = []
        
        if data_type.lower() == 'csv':
            add_fallback_log("INFO", "📊 Parsing CSV data using fallback method")
            logger.info("Fallback Step 1: Parsing CSV data")
            
            # Parse CSV data
            csv_reader = csv.DictReader(io.StringIO(raw_data))
            rows = list(csv_reader)
            
            add_fallback_log("INFO", f"CSV structure detected", {
                "row_count": len(rows),
                "headers": csv_reader.fieldnames,
                "sample_row": rows[0] if rows else None
            })
            
            logger.info(f"  - Found {len(rows)} CSV rows")
            logger.info(f"  - CSV headers: {csv_reader.fieldnames}")
            
            for i, row in enumerate(rows):
                logger.info(f"  - Processing row {i+1}: {list(row.keys())}")
                
                # Map common field variations to our standard format
                mapped_item = map_csv_fields_to_standard(row)
                parsed_items.append(mapped_item)
                
                if i < 3:  # Log first 3 items for debugging
                    add_fallback_log("INFO", f"Processed CSV row {i+1}", {
                        "original_keys": list(row.keys()),
                        "mapped_title": mapped_item.get('title', 'N/A'),
                        "mapped_brand": mapped_item.get('brand', 'N/A')
                    })
                
        elif data_type.lower() == 'json':
            add_fallback_log("INFO", "🔗 Parsing JSON data using fallback method")
            logger.info("Fallback Step 1: Parsing JSON data")
            
            try:
                json_data = json.loads(raw_data)
                
                add_fallback_log("INFO", f"JSON structure analyzed", {
                    "data_type": type(json_data).__name__,
                    "is_array": isinstance(json_data, list),
                    "is_object": isinstance(json_data, dict),
                    "item_count": len(json_data) if isinstance(json_data, (list, dict)) else 0
                })
                
                logger.info(f"  - JSON data type: {type(json_data)}")
                
                if isinstance(json_data, list):
                    logger.info(f"  - Found {len(json_data)} JSON items")
                    for i, item in enumerate(json_data):
                        logger.info(f"  - Processing item {i+1}: {list(item.keys()) if isinstance(item, dict) else 'Not a dict'}")
                        mapped_item = map_json_fields_to_standard(item)
                        parsed_items.append(mapped_item)
                        
                        if i < 3:  # Log first 3 items for debugging
                            add_fallback_log("INFO", f"Processed JSON item {i+1}", {
                                "original_keys": list(item.keys()) if isinstance(item, dict) else "Not a dict",
                                "mapped_title": mapped_item.get('title', 'N/A'),
                                "mapped_brand": mapped_item.get('brand', 'N/A')
                            })
                            
                elif isinstance(json_data, dict):
                    add_fallback_log("INFO", "Single JSON object detected, converting to array")
                    logger.info("  - Single JSON object, converting to array")
                    mapped_item = map_json_fields_to_standard(json_data)
                    parsed_items.append(mapped_item)
                else:
                    add_fallback_log("ERROR", f"Unexpected JSON structure: {type(json_data)}")
                    logger.error(f"  - Unexpected JSON structure: {type(json_data)}")
                    raise ValueError("JSON data is not an array or object")
                    
            except json.JSONDecodeError as e:
                add_fallback_log("ERROR", f"JSON parsing failed: {str(e)}")
                logger.error(f"Fallback Step 1 FAILED: JSON parsing error: {e}")
                raise
                
        elif data_type.lower() == 'sql':
            add_fallback_log("INFO", "🗄️ Parsing SQL data using fallback method")
            logger.info("Fallback Step 1: Parsing SQL data")
            
            # Parse SQL INSERT statements
            parsed_items = await parse_sql_data(raw_data, log_entries)
            
            add_fallback_log("INFO", f"SQL parsing completed", {
                "items_extracted": len(parsed_items),
                "sample_item": parsed_items[0] if parsed_items else None
            })
        
        add_fallback_log("INFO", f"Fallback parsing completed", {
            "total_items_parsed": len(parsed_items),
            "data_type": data_type
        })
        
        logger.info(f"Fallback Step 1 SUCCESS: Parsed {len(parsed_items)} items")
        
        # Step 2: Enrich items with required fields
        add_fallback_log("INFO", "🔧 Enriching items with required fields")
        logger.info("Fallback Step 2: Enriching items with required fields")
        processed_items = []
        
        for i, item in enumerate(parsed_items):
            try:
                processed_item = {
                    **item,
                    'id': str(uuid.uuid4()),
                    'status': 'pending',
                    'images': item.get('images', []),  # Default to empty array
                    'tags': item.get('tags', []),  # Default to empty array
                    'createdAt': datetime.now(timezone.utc).isoformat(),
                    'sellerId': 'fallback_import',
                    'importedAt': datetime.now(timezone.utc).isoformat(),
                    'importSource': 'fallback_parser'
                }
                processed_items.append(processed_item)
                logger.info(f"  - Enriched item {i+1}: {item.get('title', 'Unknown title')}")
                
                if i < 3:  # Log first 3 enriched items
                    add_fallback_log("INFO", f"Enriched item {i+1}", {
                        "title": processed_item.get('title', 'N/A'),
                        "brand": processed_item.get('brand', 'N/A'),
                        "price": processed_item.get('price', 'N/A'),
                        "id": processed_item['id']
                    })
                    
            except Exception as e:
                add_fallback_log("ERROR", f"Failed to enrich item {i+1}: {str(e)}")
                logger.error(f"  - Failed to enrich item {i+1}: {e}")
        
        add_fallback_log("INFO", f"✅ Fallback processing completed successfully", {
            "total_processed": len(processed_items),
            "success_rate": f"{len(processed_items)}/{len(parsed_items)}"
        })
        
        logger.info(f"Fallback Step 2 SUCCESS: Enriched {len(processed_items)} items")
        
        result = {
            "success": True,
            "message": f"Successfully processed {len(processed_items)} items using fallback parsing (AI analysis failed)",
            "items": processed_items,
            "ai_confidence": "fallback",
            "processing_method": "fallback_parser",
            "processing_time": 0,
            "status_color": "yellow",
            "warning": "AI analysis failed, used basic field mapping",
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        logger.info("=== ENHANCED FALLBACK DATA PARSING COMPLETED SUCCESSFULLY ===")
        return result
        
    except Exception as e:
        add_fallback_log("ERROR", f"💀 Fallback parsing failed completely: {str(e)}")
        logger.error(f"=== FALLBACK DATA PARSING FAILED ===")
        logger.error(f"Fallback parsing error: {e}")
        
        return {
            "success": False,
            "message": f"Both AI analysis and fallback parsing failed: {str(e)}",
            "items": [],
            "ai_confidence": "failed",
            "processing_method": "none",
            "processing_time": 0,
            "status_color": "red",
            "error": str(e),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

async def parse_sql_data(raw_data: str, log_entries: list = None):
    """Enhanced SQL parser that handles multiple INSERT patterns and complex SQL structures"""
    if log_entries is None:
        log_entries = []
    
    def add_sql_log(level, message, data=None):
        timestamp = datetime.now(timezone.utc).isoformat()
        log_entry = {
            "timestamp": timestamp,
            "level": level,
            "message": f"[SQL PARSER] {message}",
            "data": data
        }
        log_entries.append(log_entry)
        logger.info(f"[SQL PARSER] {message} | Data: {data}")
    
    import re
    
    add_sql_log("INFO", "🔍 Starting enhanced SQL data parsing")
    
    parsed_items = []
    
    # Enhanced patterns for different SQL INSERT formats
    patterns = [
        # Standard INSERT INTO table (col1, col2) VALUES (val1, val2);
        r'INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\);?',
        # INSERT INTO table VALUES (val1, val2); (without column names)
        r'INSERT\s+INTO\s+(\w+)\s+VALUES\s*\(([^)]+)\);?',
        # Multi-row INSERT INTO table (col1, col2) VALUES (val1, val2), (val3, val4);
        r'INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*(.+?);',
    ]
    
    # Track table schemas from CREATE TABLE statements
    table_schemas = {}
    create_table_pattern = r'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(([^;]+)\)'
    for match in re.finditer(create_table_pattern, raw_data, re.IGNORECASE | re.MULTILINE | re.DOTALL):
        table_name = match.group(1)
        columns_def = match.group(2)
        
        # Extract column names from CREATE TABLE
        column_names = []
        for line in columns_def.split(','):
            line = line.strip()
            if line and not line.upper().startswith(('PRIMARY', 'FOREIGN', 'UNIQUE', 'CHECK', 'CONSTRAINT')):
                col_name = line.split()[0].strip()
                if col_name:
                    column_names.append(col_name)
        
        table_schemas[table_name.lower()] = column_names
        add_sql_log("INFO", f"Extracted schema for table {table_name}", {
            "columns": column_names
        })
    
    # Process each pattern
    for pattern_idx, pattern in enumerate(patterns):
        matches = re.finditer(pattern, raw_data, re.IGNORECASE | re.MULTILINE | re.DOTALL)
        
        for match_idx, match in enumerate(matches):
            try:
                table_name = match.group(1)
                
                if pattern_idx == 0:  # Standard INSERT with columns
                    columns_str = match.group(2)
                    values_str = match.group(3)
                    columns = [col.strip().strip('"').strip("'").strip('`') for col in columns_str.split(',')]
                    
                elif pattern_idx == 1:  # INSERT without column names
                    values_str = match.group(2)
                    # Use schema from CREATE TABLE if available
                    columns = table_schemas.get(table_name.lower(), [])
                    
                elif pattern_idx == 2:  # Multi-row INSERT
                    columns_str = match.group(2)
                    all_values_str = match.group(3)
                    columns = [col.strip().strip('"').strip("'").strip('`') for col in columns_str.split(',')]
                    
                    # Parse multiple value sets
                    value_sets = re.findall(r'\(([^)]+)\)', all_values_str)
                    for value_set in value_sets:
                        item_data = parse_sql_values(value_set, columns)
                        if item_data:
                            mapped_item = map_sql_fields_to_standard(item_data)
                            parsed_items.append(mapped_item)
                    continue
                
                # Parse single value set for patterns 0 and 1
                item_data = parse_sql_values(values_str, columns)
                if item_data:
                    mapped_item = map_sql_fields_to_standard(item_data)
                    parsed_items.append(mapped_item)
                    
                    if len(parsed_items) <= 3:
                        add_sql_log("INFO", f"Parsed SQL item {len(parsed_items)}", {
                            "table": table_name,
                            "columns": columns,
                            "mapped_title": mapped_item.get('title', 'N/A'),
                            "pattern_used": pattern_idx
                        })
            
            except Exception as e:
                add_sql_log("ERROR", f"Failed to parse SQL match {match_idx+1} for pattern {pattern_idx}: {str(e)}")
    
    add_sql_log("INFO", f"Enhanced SQL parsing completed: {len(parsed_items)} items extracted")
    return parsed_items

def parse_sql_values(values_str: str, columns: list) -> dict:
    """Parse SQL VALUES string and return dictionary with column mappings"""
    try:
        values = []
        current_value = ""
        in_quotes = False
        quote_char = None
        escape_next = False
        
        # Enhanced value parsing that handles escaped quotes
        for i, char in enumerate(values_str):
            if escape_next:
                current_value += char
                escape_next = False
                continue
                
            if char == '\\':
                escape_next = True
                current_value += char
                continue
                
            if char in ["'", '"'] and not in_quotes:
                in_quotes = True
                quote_char = char
            elif char == quote_char and in_quotes:
                # Check if it's an escaped quote
                if i + 1 < len(values_str) and values_str[i + 1] == quote_char:
                    current_value += char
                    continue
                in_quotes = False
                quote_char = None
            elif char == ',' and not in_quotes:
                values.append(current_value.strip().strip('"').strip("'"))
                current_value = ""
                continue
            else:
                current_value += char
        
        if current_value.strip():
            values.append(current_value.strip().strip('"').strip("'"))
        
        # Handle NULL values and data type conversion
        processed_values = []
        for value in values:
            if value.upper() in ['NULL', 'null']:
                processed_values.append('')
            elif value.replace('.', '').replace('-', '').isdigit():
                processed_values.append(value)
            else:
                processed_values.append(value)
        
        # Create item dictionary
        if len(columns) == len(processed_values):
            return dict(zip(columns, processed_values))
        
        return {}
        
    except Exception as e:
        logger.error(f"Error parsing SQL values: {e}")
        return {}

def map_sql_fields_to_standard(item):
    """Enhanced SQL field mapping with comprehensive field variations and data cleaning"""
    logger.info(f"Mapping SQL item: {list(item.keys())}")
    
    # Comprehensive field mappings including common database naming conventions
    field_mappings = {
        'title': [
            'item_title', 'product_name', 'name_of_item', 'item_name', 'gear_name', 'equipment_name',
            'name', 'title', 'product_title', 'article_name', 'merchandise_name', 'item_description',
            'product', 'item', 'gear', 'equipment'
        ],
        'brand': [
            'manufacturer', 'brand_name', 'company_brand', 'make', 'producer', 'brand', 'company',
            'mfg', 'vendor', 'supplier', 'maker', 'manufacturing_brand', 'product_brand'
        ],
        'category': [
            'product_category', 'gear_type', 'item_classification', 'classification', 'category',
            'type', 'product_type', 'item_type', 'equipment_type', 'gear_category', 'class',
            'subcategory', 'product_class', 'item_category'
        ],
        'size': [
            'dimensions', 'size_spec', 'measurement_info', 'size', 'sizing', 'garment_size',
            'capacity', 'volume', 'length', 'width', 'height', 'measurements'
        ],
        'color': [
            'primary_color', 'color_way', 'main_color', 'color', 'hue', 'shade', 'colorway',
            'fabric_color', 'product_color', 'item_color', 'colour'
        ],
        'condition': [
            'wear_condition', 'condition_rating', 'current_state', 'condition', 'state',
            'usage_level', 'wear_level', 'quality', 'condition_status', 'item_condition'
        ],
        'originalPrice': [
            'retail_value', 'original_price', 'msrp_value', 'list_price', 'originalPrice',
            'msrp', 'retail_price', 'factory_price', 'original_cost', 'retail_cost',
            'suggested_retail_price', 'srp'
        ],
        'price': [
            'asking_price', 'sale_price', 'listed_amount', 'price', 'current_price',
            'offer_price', 'market_price', 'selling_price', 'consignment_price', 'listed_price'
        ],
        'description': [
            'item_notes', 'description', 'additional_notes', 'notes', 'details',
            'product_description', 'condition_notes', 'item_description', 'comments',
            'remarks', 'specifications', 'features'
        ],
        'sellerEmail': [
            'owner_email', 'seller_email', 'contact_email', 'sellerEmail', 'email_address',
            'electronic_mail', 'email', 'consigner_email', 'seller_contact'
        ],
        'sellerPhone': [
            'owner_phone', 'seller_phone', 'contact_phone', 'sellerPhone', 'phone_number',
            'telephone', 'phone', 'mobile', 'cell', 'contact_number'
        ],
        'gender': [
            'target_gender', 'gender', 'sex', 'demographic', 'intended_gender',
            'for_gender', 'gender_target'
        ],
        'material': [
            'fabric_material', 'material', 'materials', 'fabric', 'construction',
            'textile', 'composition', 'fabric_type', 'material_type'
        ]
    }
    
    mapped = {}
    
    # Case-insensitive field matching with data cleaning
    for standard_field, possible_fields in field_mappings.items():
        for field in possible_fields:
            # Try exact match first
            if field in item:
                value = item[field]
            else:
                # Try case-insensitive match
                matching_key = None
                for key in item.keys():
                    if key.lower() == field.lower():
                        matching_key = key
                        break
                
                if matching_key:
                    value = item[matching_key]
                else:
                    continue
            
            # Clean and validate the value
            if value and str(value).strip() and str(value).strip().upper() not in ['NULL', 'NONE', 'N/A', '']:
                cleaned_value = str(value).strip()
                
                # Special handling for numeric fields
                if standard_field in ['price', 'originalPrice']:
                    try:
                        # Remove currency symbols and convert to float
                        numeric_value = cleaned_value.replace('$', '').replace('€', '').replace('£', '').replace(',', '')
                        mapped[standard_field] = float(numeric_value)
                        break
                    except ValueError:
                        # If conversion fails, use 0.0
                        mapped[standard_field] = 0.0
                        break
                
                # Standardize condition values
                elif standard_field == 'condition':
                    condition_mapping = {
                        'excellent': 'Excellent',
                        'very good': 'Very Good',
                        'good': 'Good',
                        'fair': 'Fair',
                        'poor': 'Poor',
                        'like new': 'Excellent',
                        'mint': 'Excellent',
                        'new': 'Excellent',
                        'used': 'Good',
                        'worn': 'Fair'
                    }
                    standardized_condition = condition_mapping.get(cleaned_value.lower(), cleaned_value)
                    mapped[standard_field] = standardized_condition
                    break
                
                # Standardize gender values
                elif standard_field == 'gender':
                    gender_mapping = {
                        'm': 'Men',
                        'male': 'Men',
                        'men': 'Men',
                        'mens': 'Men',
                        'f': 'Women',
                        'female': 'Women',
                        'women': 'Women',
                        'womens': 'Women',
                        'u': 'Unisex',
                        'unisex': 'Unisex',
                        'universal': 'Unisex',
                        'both': 'Unisex',
                        'all': 'Unisex',
                        'kids': 'Kids',
                        'children': 'Kids',
                        'youth': 'Kids'
                    }
                    standardized_gender = gender_mapping.get(cleaned_value.lower(), cleaned_value)
                    mapped[standard_field] = standardized_gender
                    break
                
                # Standardize category values  
                elif standard_field == 'category':
                    category_mapping = {
                        'jacket': 'Jackets',
                        'jackets': 'Jackets',
                        'coat': 'Jackets',
                        'pant': 'Pants',
                        'pants': 'Pants',
                        'trousers': 'Pants',
                        'shirt': 'Shirts',
                        'shirts': 'Shirts',
                        'top': 'Shirts',
                        'shoe': 'Footwear',
                        'shoes': 'Footwear',
                        'boots': 'Footwear',
                        'footwear': 'Footwear',
                        'pack': 'Backpacks',
                        'backpack': 'Backpacks',
                        'backpacks': 'Backpacks',
                        'bag': 'Backpacks',
                        'climb': 'Climbing Gear',
                        'climbing': 'Climbing Gear',
                        'rope': 'Climbing Gear',
                        'harness': 'Climbing Gear',
                        'sleeping': 'Sleep Systems',
                        'sleep': 'Sleep Systems',
                        'tent': 'Sleep Systems',
                        'bag': 'Sleep Systems',
                        'cooking': 'Cooking Gear',
                        'stove': 'Cooking Gear',
                        'base layer': 'Base Layers',
                        'baselayer': 'Base Layers',
                        'sock': 'Socks',
                        'socks': 'Socks',
                        'vest': 'Vests',
                        'vests': 'Vests'
                    }
                    standardized_category = category_mapping.get(cleaned_value.lower(), cleaned_value)
                    mapped[standard_field] = standardized_category
                    break
                
                else:
                    mapped[standard_field] = cleaned_value
                    break
    
    # Set defaults for required fields with better defaults
    mapped.setdefault('title', 'Imported SQL Item')
    mapped.setdefault('brand', 'Unknown')
    mapped.setdefault('category', 'Accessories')
    mapped.setdefault('condition', 'Good')
    
    # Handle price fields with proper defaults
    if 'price' not in mapped:
        mapped['price'] = 0.0
    if 'originalPrice' not in mapped:
        mapped['originalPrice'] = mapped.get('price', 0.0)
    
    mapped.setdefault('description', 'Imported from SQL database')
    mapped.setdefault('sellerEmail', '')
    mapped.setdefault('sellerPhone', '')
    mapped.setdefault('gender', 'Unisex')
    mapped.setdefault('material', '')
    mapped.setdefault('size', '')
    mapped.setdefault('color', '')
    
    # Ensure arrays are included for frontend compatibility
    mapped.setdefault('images', [])
    mapped.setdefault('tags', [])
    
    logger.info(f"Mapped SQL item to: {mapped.get('title', 'Unknown')} - ${mapped.get('price', 0)}")
    return mapped

def map_csv_fields_to_standard(row):
    """Map CSV fields to our standard format"""
    logger.info(f"Mapping CSV row: {list(row.keys())}")
    
    # Common field mappings
    field_mappings = {
        # Title variations
        'title': ['title', 'name', 'product_name', 'item_name', 'product', 'item_title'],
        'brand': ['brand', 'manufacturer', 'make', 'company'],
        'category': ['category', 'type', 'product_type', 'gear_type'],
        'size': ['size', 'product_size', 'item_size'],
        'color': ['color', 'colour', 'primary_color'],
        'condition': ['condition', 'item_condition', 'state'],
        'originalPrice': ['original_price', 'retail_price', 'msrp', 'original', 'retail'],
        'price': ['price', 'asking_price', 'sale_price', 'current_price'],
        'description': ['description', 'details', 'notes', 'item_description'],
        'sellerEmail': ['seller_email', 'email', 'contact_email'],
        'sellerPhone': ['seller_phone', 'phone', 'contact_phone'],
        'gender': ['gender', 'sex', 'target_gender'],
        'material': ['material', 'fabric', 'materials']
    }
    
    mapped_item = {}
    
    for standard_field, possible_fields in field_mappings.items():
        value = None
        for possible_field in possible_fields:
            # Try exact match first
            if possible_field in row:
                value = row[possible_field]
                break
            # Try case-insensitive match
            for key in row.keys():
                if key.lower() == possible_field.lower():
                    value = row[key]
                    break
            if value:
                break
        
        if value:
            # Clean and convert the value
            if standard_field in ['originalPrice', 'price']:
                # Convert price fields to numbers
                try:
                    # Remove currency symbols and convert to float
                    clean_value = str(value).replace('$', '').replace(',', '').strip()
                    mapped_item[standard_field] = float(clean_value)
                except:
                    mapped_item[standard_field] = 0.0
            else:
                mapped_item[standard_field] = str(value).strip()
    
    # Set defaults for missing required fields
    if 'title' not in mapped_item or not mapped_item['title']:
        mapped_item['title'] = 'Imported Item'
    if 'brand' not in mapped_item or not mapped_item['brand']:
        mapped_item['brand'] = 'Unknown'
    if 'category' not in mapped_item or not mapped_item['category']:
        mapped_item['category'] = 'Accessories'
    if 'condition' not in mapped_item or not mapped_item['condition']:
        mapped_item['condition'] = 'Good'
    if 'price' not in mapped_item or not mapped_item['price']:
        mapped_item['price'] = 0.0
    if 'description' not in mapped_item or not mapped_item['description']:
        mapped_item['description'] = 'Imported item - details to be added'
    if 'images' not in mapped_item:
        mapped_item['images'] = []  # Default to empty array
    if 'tags' not in mapped_item:
        mapped_item['tags'] = []  # Default to empty array
    
    logger.info(f"Mapped to: {list(mapped_item.keys())}")
    return mapped_item

def map_json_fields_to_standard(item):
    """Map JSON fields to our standard format"""
    if not isinstance(item, dict):
        logger.error(f"Expected dict, got {type(item)}")
        return {}
        
    logger.info(f"Mapping JSON item: {list(item.keys())}")
    
    # For JSON, we can do more flexible mapping
    mapped_item = {}
    
    # Try to map fields intelligently
    for key, value in item.items():
        key_lower = key.lower()
        
        # Map based on key patterns
        if any(pattern in key_lower for pattern in ['title', 'name', 'product']):
            if 'title' not in mapped_item:
                mapped_item['title'] = str(value).strip()
        elif any(pattern in key_lower for pattern in ['brand', 'manufacturer', 'make']):
            if 'brand' not in mapped_item:
                mapped_item['brand'] = str(value).strip()
        elif any(pattern in key_lower for pattern in ['category', 'type']):
            if 'category' not in mapped_item:
                mapped_item['category'] = str(value).strip()
        elif 'size' in key_lower:
            if 'size' not in mapped_item:
                mapped_item['size'] = str(value).strip()
        elif 'color' in key_lower:
            if 'color' not in mapped_item:
                mapped_item['color'] = str(value).strip()
        elif 'condition' in key_lower:
            if 'condition' not in mapped_item:
                mapped_item['condition'] = str(value).strip()
        elif any(pattern in key_lower for pattern in ['original_price', 'retail', 'msrp']):
            if 'originalPrice' not in mapped_item:
                try:
                    clean_value = str(value).replace('$', '').replace(',', '').strip()
                    mapped_item['originalPrice'] = float(clean_value)
                except:
                    mapped_item['originalPrice'] = 0.0
        elif 'price' in key_lower and 'original' not in key_lower:
            if 'price' not in mapped_item:
                try:
                    clean_value = str(value).replace('$', '').replace(',', '').strip()
                    mapped_item['price'] = float(clean_value)
                except:
                    mapped_item['price'] = 0.0
        elif any(pattern in key_lower for pattern in ['description', 'details', 'notes']):
            if 'description' not in mapped_item:
                mapped_item['description'] = str(value).strip()
        elif 'email' in key_lower:
            if 'sellerEmail' not in mapped_item:
                mapped_item['sellerEmail'] = str(value).strip()
        elif 'phone' in key_lower:
            if 'sellerPhone' not in mapped_item:
                mapped_item['sellerPhone'] = str(value).strip()
        elif 'gender' in key_lower:
            if 'gender' not in mapped_item:
                mapped_item['gender'] = str(value).strip()
        elif 'material' in key_lower or 'fabric' in key_lower:
            if 'material' not in mapped_item:
                mapped_item['material'] = str(value).strip()
    
    # Set defaults for missing required fields (same as CSV)
    if 'title' not in mapped_item or not mapped_item['title']:
        mapped_item['title'] = 'Imported Item'
    if 'brand' not in mapped_item or not mapped_item['brand']:
        mapped_item['brand'] = 'Unknown'
    if 'category' not in mapped_item or not mapped_item['category']:
        mapped_item['category'] = 'Accessories'
    if 'condition' not in mapped_item or not mapped_item['condition']:
        mapped_item['condition'] = 'Good'
    if 'price' not in mapped_item or not mapped_item['price']:
        mapped_item['price'] = 0.0
    if 'description' not in mapped_item or not mapped_item['description']:
        mapped_item['description'] = 'Imported item - details to be added'
    if 'images' not in mapped_item:
        mapped_item['images'] = []  # Default to empty array
    if 'tags' not in mapped_item:
        mapped_item['tags'] = []  # Default to empty array
    
    logger.info(f"Mapped to: {list(mapped_item.keys())}")
    return mapped_item

@app.post("/api/process-payment")
async def process_payment(payment_request: PaymentRequest, user_data: dict = Depends(verify_firebase_token)):
    """Process payment and update inventory securely on server-side"""
    try:
        # Use authenticated user or server admin for payment processing
        user_id = user_data.get('uid')
        is_server_processing = user_data.get('is_server', False)
        
        if is_server_processing:
            # For server-side processing, we'll get the actual user ID from the payment request
            # In a real implementation, you'd get this from the authenticated session
            user_id = f"user_{int(time.time())}"  # Generate a temporary user ID for demo
            logger.info(f"Processing payment via server admin for generated user {user_id}")
        else:
            logger.info(f"Processing payment for authenticated user {user_id}")
        
        # Validate cart items exist and are available
        validated_items = []
        total_amount = 0
        
        for cart_item in payment_request.cart_items:
            item_doc = db.collection('items').document(cart_item.item_id).get()
            if not item_doc.exists:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Item {cart_item.item_id} not found"
                )
            
            item_data = item_doc.to_dict()
            
            if item_data.get('status') != 'live':
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Item {cart_item.title} is no longer available"
                )
            
            if abs(item_data.get('price', 0) - cart_item.price) > 0.01:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Price for {cart_item.title} has changed. Please refresh your cart."
                )
            
            validated_items.append({
                'cart_item': cart_item,
                'item_data': item_data
            })
            total_amount += cart_item.price * cart_item.quantity
        
        # Add shipping if applicable
        if payment_request.fulfillment_method == 'shipping':
            total_amount += 5.99
        
        # For demo purposes, simulate payment processing
        # In production, use real Stripe payment processing
        await simulate_payment_processing()
        
        # Generate order identifiers
        order_id = generate_order_number()
        transaction_id = generate_transaction_id()
        
        # Update inventory and create records in a transaction
        batch = db.batch()
        
        try:
            # Process each item
            for validated_item in validated_items:
                cart_item = validated_item['cart_item']
                item_data = validated_item['item_data']
                earnings = calculate_earnings(cart_item.price)
                
                # Update item status to sold
                item_ref = db.collection('items').document(cart_item.item_id)
                batch.update(item_ref, {
                    'status': 'sold',
                    'soldAt': datetime.now(timezone.utc),
                    'soldPrice': cart_item.price,
                    'buyerId': user_id,
                    'buyerInfo': payment_request.customer_info.dict(),
                    'saleTransactionId': transaction_id,
                    'saleType': 'online',
                    'fulfillmentMethod': payment_request.fulfillment_method,
                    'trackingNumber': f"TRK{int(time.time())}" if payment_request.fulfillment_method == 'shipping' else None,
                    'shippingLabelGenerated': False,
                    'userEarnings': earnings['seller_earnings'],
                    'adminEarnings': earnings['store_commission'],
                    'lastUpdated': datetime.now(timezone.utc),
                    'orderNumber': order_id,
                    'paymentMethod': 'Credit Card'
                })
                
                # Create sales record
                sales_ref = db.collection('sales').document()
                batch.set(sales_ref, {
                    'itemId': cart_item.item_id,
                    'itemTitle': cart_item.title,
                    'itemCategory': item_data.get('category', 'Unknown'),
                    'itemBrand': item_data.get('brand', 'N/A'),
                    'itemSize': item_data.get('size', 'N/A'),
                    'sellerId': cart_item.seller_id,
                    'sellerName': cart_item.seller_name,
                    'buyerId': user_id,
                    'buyerName': payment_request.customer_info.name,
                    'salePrice': cart_item.price,
                    'sellerEarnings': earnings['seller_earnings'],
                    'storeCommission': earnings['store_commission'],
                    'soldAt': datetime.now(timezone.utc),
                    'transactionId': transaction_id,
                    'orderNumber': order_id,
                    'paymentMethod': 'Credit Card',
                    'fulfillmentMethod': payment_request.fulfillment_method,
                    'saleType': 'online',
                    'shippingAddress': payment_request.customer_info.dict() if payment_request.fulfillment_method == 'shipping' else None
                })
                
                # Create store credit for seller
                if cart_item.seller_id and not cart_item.seller_id.startswith('phone_'):
                    credit_ref = db.collection('store_credits').document()
                    batch.set(credit_ref, {
                        'userId': cart_item.seller_id,
                        'amount': earnings['seller_earnings'],
                        'source': 'item_sale',
                        'itemId': cart_item.item_id,
                        'itemTitle': cart_item.title,
                        'salePrice': cart_item.price,
                        'transactionId': transaction_id,
                        'createdAt': datetime.now(timezone.utc),
                        'description': f"Sale of \"{cart_item.title}\""
                    })
            
            # Create order record
            order_ref = db.collection('orders').document(order_id)
            batch.set(order_ref, {
                'orderId': order_id,
                'userId': user_id,
                'customerInfo': payment_request.customer_info.dict(),
                'items': [item.dict() for item in payment_request.cart_items],
                'totalAmount': total_amount,
                'fulfillmentMethod': payment_request.fulfillment_method,
                'paymentMethod': 'Credit Card',
                'transactionId': transaction_id,
                'status': 'completed',
                'orderStatus': 'processing',
                'createdAt': datetime.now(timezone.utc),
                'estimatedDelivery': datetime.now(timezone.utc) + timedelta(days=7) if payment_request.fulfillment_method == 'shipping' else None
            })
            
            # Commit all changes
            batch.commit()
            logger.info(f"Successfully processed order {order_id} for user {user_id}")
            
            # Award rewards points for the purchase (if user is authenticated)
            if not is_server_processing and user_id:
                try:
                    award_purchase_points(user_id, total_amount)
                except Exception as e:
                    logger.error(f"Failed to award points for purchase {order_id}: {e}")
                    # Don't fail the whole payment for points issues
            
            return PaymentResponse(
                success=True,
                order_id=order_id,
                transaction_id=transaction_id,
                total_amount=total_amount,
                message="Payment processed successfully"
            )
            
        except Exception as e:
            logger.error(f"Database transaction failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Order processing failed"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error processing payment: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred"
        )

async def simulate_payment_processing():
    """Simulate payment processing delay"""
    import asyncio
    await asyncio.sleep(2)  # Simulate processing time



@app.get("/api/admin/sales-summary")
async def get_sales_summary(
    admin_data: dict = Depends(verify_admin_access)
):
    """Get sales summary for admin dashboard"""
    try:
        thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
        
        sales_query = db.collection('sales').where('soldAt', '>=', thirty_days_ago)
        sales_docs = sales_query.get()
        
        total_sales = 0
        total_commission = 0
        total_items = len(sales_docs)
        
        for sale_doc in sales_docs:
            sale_data = sale_doc.to_dict()
            total_sales += sale_data.get('salePrice', 0)
            total_commission += sale_data.get('storeCommission', 0)
        
        return {
            "total_items_sold": total_items,
            "total_sales_amount": round(total_sales, 2),
            "total_commission": round(total_commission, 2),
            "period_days": 30
        }
        
    except Exception as e:
        logger.error(f"Error getting sales summary: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get sales summary"
        )

# Legacy test endpoints
@app.post("/api/messages")
async def create_message(message: dict):
    try:
        doc_ref = db.collection('test').document()
        doc_ref.set(message)
        return {"status": "success", "message": "Message saved successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/messages")
async def get_messages():
    try:
        messages = []
        docs = db.collection('test').stream()
        for doc in docs:
            messages.append({
                'id': doc.id,
                **doc.to_dict()
            })
        return messages
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/user/submit-item")
async def submit_user_item(
    item_submission: dict,
    user_data: dict = Depends(verify_firebase_token)
):
    """Submit a user's draft item for admin review"""
    try:
        user_id = user_data.get('uid')
        item_id = item_submission.get('item_id')
        
        if not item_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Item ID is required"
            )
        
        # Get the item from user's personal collection
        user_item_ref = db.collection('userItems').document(user_id).collection('items').document(item_id)
        user_item_doc = user_item_ref.get()
        
        if not user_item_doc.exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Item not found in user collection"
            )
        
        item_data = user_item_doc.to_dict()
        
        # Move item to pending collection for admin review
        pending_item_data = {
            **item_data,
            'submittedAt': datetime.now(timezone.utc),
            'status': 'pending',
            'originalUserId': user_id,
            'originalItemId': item_id
        }
        
        # Create in pending collection
        pending_ref = db.collection('pendingItems').document()
        pending_ref.set(pending_item_data)
        
        # Update the user's item to indicate it's been submitted
        user_item_ref.update({
            'status': 'submitted',
            'submittedAt': datetime.now(timezone.utc),
            'pendingItemId': pending_ref.id
        })
        
        logger.info(f"User {user_id} submitted item {item_id} for review")
        
        return {
            "success": True,
            "message": "Item submitted for review",
            "pending_item_id": pending_ref.id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error submitting user item: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to submit item for review"
        )

@app.post("/api/admin/approve-item")
async def approve_pending_item(
    approval_data: dict,
    admin_data: dict = Depends(verify_admin_access)
):
    """Admin endpoint to approve a pending item and make it live"""
    try:
        admin_id = admin_data.get('uid')
        pending_item_id = approval_data.get('pending_item_id')
        
        if not pending_item_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Pending item ID is required"
            )
        
        # Get the pending item
        pending_ref = db.collection('pendingItems').document(pending_item_id)
        pending_doc = pending_ref.get()
        
        if not pending_doc.exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pending item not found"
            )
        
        item_data = pending_doc.to_dict()
        
        # Create live item in main items collection
        live_item_data = {
            **item_data,
            'status': 'live',
            'approvedAt': datetime.now(timezone.utc),
            'approvedBy': admin_id,
            'liveAt': datetime.now(timezone.utc)
        }
        
        # Remove internal tracking fields
        live_item_data.pop('originalUserId', None)
        live_item_data.pop('originalItemId', None)
        live_item_data.pop('pendingItemId', None)
        
        # Create in main items collection
        items_ref = db.collection('items').document()
        items_ref.set(live_item_data)
        
        # Update user's original item
        if item_data.get('originalUserId') and item_data.get('originalItemId'):
            user_item_ref = db.collection('userItems').document(item_data['originalUserId']).collection('items').document(item_data['originalItemId'])
            user_item_ref.update({
                'status': 'approved',
                'approvedAt': datetime.now(timezone.utc),
                'liveItemId': items_ref.id
            })
        
        # Remove from pending collection
        pending_ref.delete()
        
        logger.info(f"Admin {admin_id} approved item {pending_item_id}, now live as {items_ref.id}")
        
        return {
            "success": True,
            "message": "Item approved and made live",
            "live_item_id": items_ref.id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error approving item: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to approve item"
        )

@app.get("/api/test-status")
async def get_test_status():
    """Get a quick test status"""
    return {
        "server_status": "running",
        "database_status": "connected",
        "payment_processor": "configured",
        "last_test_run": time.strftime("%Y-%m-%d %H:%M:%S"),
        "secure_endpoints": [
            "/api/process-payment",
            "/api/admin/sales-summary",
            "/api/user/submit-item",
            "/api/admin/approve-item"
        ]
    }

@app.get("/api/status")
async def get_detailed_status():
    """Detailed status endpoint for monitoring"""
    try:
        # Test database connection
        test_doc = db.collection('_health_check').document('test')
        test_doc.set({'timestamp': datetime.now(timezone.utc)})
        test_doc.delete()
        db_status = "healthy"
    except Exception as e:
        db_status = f"error: {str(e)}"
        logger.error(f"Database health check failed: {e}")

    return {
        "service": "consignment-api",
        "version": "1.0.0",
        "environment": ENVIRONMENT,
        "status": "healthy" if db_status == "healthy" else "unhealthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "checks": {
            "database": db_status,
            "stripe": "configured" if stripe.api_key else "not_configured"
        },
        "uptime": time.time()
    }

# Admin item management endpoints
@app.post("/api/admin/bulk-update-status")
async def bulk_update_item_status(request: Request):
    """Update status of multiple items (admin only)"""
    try:
        # Get token from header
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = auth_header.split("Bearer ")[1]
        
        # Verify token and admin status
        decoded_token = auth.verify_id_token(token)
        user_id = decoded_token['uid']
        
        # Check if user is admin
        user_doc = db.collection('users').document(user_id).get()
        if not user_doc.exists or not user_doc.to_dict().get('isAdmin', False):
            raise HTTPException(status_code=403, detail="Admin access required")
        
        # Get request data
        data = await request.json()
        item_ids = data.get('itemIds', [])
        new_status = data.get('status', '')
        
        if not item_ids or not new_status:
            raise HTTPException(status_code=400, detail="Missing itemIds or status")
        
        logger.info(f"Admin {user_id} bulk updating {len(item_ids)} items to status: {new_status}")
        
        # Update items
        batch = db.batch()
        update_data = {'status': new_status}
        
        if new_status == 'live':
            update_data['liveAt'] = datetime.now(timezone.utc)
        elif new_status == 'approved':
            update_data['approvedAt'] = datetime.now(timezone.utc)
        elif new_status == 'archived':
            update_data['archivedAt'] = datetime.now(timezone.utc)
        elif new_status == 'pending':
            update_data['pendingAt'] = datetime.now(timezone.utc)
        
        for item_id in item_ids:
            item_ref = db.collection('items').document(item_id)
            batch.update(item_ref, update_data)
        
        # Commit batch update
        batch.commit()
        
        # Log admin action
        admin_action = {
            'adminId': user_id,
            'action': 'bulk_status_update',
            'details': f'Updated {len(item_ids)} items to {new_status}',
            'itemIds': item_ids,
            'timestamp': datetime.now(timezone.utc),
            'newStatus': new_status
        }
        db.collection('adminActions').add(admin_action)
        
        return {
            "success": True,
            "message": f"Successfully updated {len(item_ids)} items to {new_status}",
            "updatedCount": len(item_ids)
        }
        
    except Exception as e:
        logger.error(f"Error in bulk status update: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.post("/api/admin/update-item-status")
async def update_single_item_status(request: Request):
    """Update status of a single item (admin only)"""
    try:
        # Get token from header
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = auth_header.split("Bearer ")[1]
        
        # Verify token and admin status
        decoded_token = auth.verify_id_token(token)
        user_id = decoded_token['uid']
        
        # Check if user is admin
        user_doc = db.collection('users').document(user_id).get()
        if not user_doc.exists or not user_doc.to_dict().get('isAdmin', False):
            raise HTTPException(status_code=403, detail="Admin access required")
        
        # Get request data
        data = await request.json()
        item_id = data.get('itemId', '')
        new_status = data.get('status', '')
        
        if not item_id or not new_status:
            raise HTTPException(status_code=400, detail="Missing itemId or status")
        
        logger.info(f"Admin {user_id} updating item {item_id} to status: {new_status}")
        
        # Update item
        update_data = {'status': new_status}
        
        if new_status == 'live':
            update_data['liveAt'] = datetime.now(timezone.utc)
        elif new_status == 'approved':
            update_data['approvedAt'] = datetime.now(timezone.utc)
        elif new_status == 'archived':
            update_data['archivedAt'] = datetime.now(timezone.utc)
        elif new_status == 'pending':
            update_data['pendingAt'] = datetime.now(timezone.utc)
        
        # Get item details for logging
        item_ref = db.collection('items').document(item_id)
        item_doc = item_ref.get()
        if not item_doc.exists:
            raise HTTPException(status_code=404, detail="Item not found")
        
        item_data = item_doc.to_dict()
        item_ref.update(update_data)
        
        # Log admin action
        admin_action = {
            'adminId': user_id,
            'action': 'item_status_update',
            'details': f'Updated item "{item_data.get("title", "Unknown")}" to {new_status}',
            'itemId': item_id,
            'timestamp': datetime.now(timezone.utc),
            'oldStatus': item_data.get('status', 'unknown'),
            'newStatus': new_status
        }
        db.collection('adminActions').add(admin_action)
        
        return {
            "success": True,
            "message": f"Successfully updated item to {new_status}",
            "itemId": item_id,
            "newStatus": new_status
        }
        
    except Exception as e:
        logger.error(f"Error in single item status update: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.post("/api/admin/update-item-with-barcode")
async def update_item_with_barcode(request: Request):
    """Update item with barcode data and status (admin only)"""
    try:
        # Get token from header
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = auth_header.split("Bearer ")[1]
        
        # Verify token and admin status
        decoded_token = auth.verify_id_token(token)
        user_id = decoded_token['uid']
        
        # Check if user is admin
        user_doc = db.collection('users').document(user_id).get()
        if not user_doc.exists or not user_doc.to_dict().get('isAdmin', False):
            raise HTTPException(status_code=403, detail="Admin access required")
        
        # Get request data
        data = await request.json()
        item_id = data.get('itemId', '')
        barcode_data = data.get('barcodeData', '')
        barcode_image_url = data.get('barcodeImageUrl', '')
        new_status = data.get('status', 'approved')
        
        if not item_id or not barcode_data:
            raise HTTPException(status_code=400, detail="Missing itemId or barcodeData")
        
        logger.info(f"Admin {user_id} updating item {item_id} with barcode and status: {new_status}")
        
        # Update item with barcode data
        update_data = {
            'barcodeData': barcode_data,
            'barcodeGeneratedAt': datetime.now(timezone.utc),
            'barcodeImageUrl': barcode_image_url,
            'printConfirmedAt': datetime.now(timezone.utc),
            'status': new_status,
            'lastUpdated': datetime.now(timezone.utc),
            'updatedBy': user_id
        }
        
        if new_status == 'approved':
            update_data['approvedAt'] = datetime.now(timezone.utc)
        elif new_status == 'live':
            update_data['liveAt'] = datetime.now(timezone.utc)
        
        # Get item details for logging
        item_ref = db.collection('items').document(item_id)
        item_doc = item_ref.get()
        if not item_doc.exists:
            raise HTTPException(status_code=404, detail="Item not found")
        
        item_data = item_doc.to_dict()
        item_ref.update(update_data)
        
        # Log admin action
        admin_action = {
            'adminId': user_id,
            'action': 'item_barcode_update',
            'details': f'Updated item "{item_data.get("title", "Unknown")}" with barcode and status {new_status}',
            'itemId': item_id,
            'timestamp': datetime.now(timezone.utc),
            'oldStatus': item_data.get('status', 'unknown'),
            'newStatus': new_status,
            'barcodeData': barcode_data
        }
        db.collection('adminActions').add(admin_action)
        
        return {
            "success": True,
            "message": f"Successfully updated item with barcode and status {new_status}",
            "itemId": item_id,
            "newStatus": new_status,
            "barcodeData": barcode_data
        }
        
    except Exception as e:
        logger.error(f"Error in barcode item update: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.post("/api/admin/reject-item")
async def reject_item(request: Request):
    """Admin endpoint to reject an item"""
    try:
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = auth_header.split("Bearer ")[1]
        decoded_token = auth.verify_id_token(token)
        user_id = decoded_token['uid']
        
        user_doc = db.collection('users').document(user_id).get()
        if not user_doc.exists or not user_doc.to_dict().get('isAdmin', False):
            raise HTTPException(status_code=403, detail="Admin access required")
        
        data = await request.json()
        item_id = data.get('itemId', '')
        rejection_reason = data.get('rejectionReason', 'No reason provided')
        
        if not item_id:
            raise HTTPException(status_code=400, detail="Missing itemId")
        
        # Update item
        item_ref = db.collection('items').document(item_id)
        item_ref.update({
            'status': 'rejected',
            'rejectedAt': datetime.now(timezone.utc),
            'rejectionReason': rejection_reason,
            'rejectedBy': user_id
        })
        
        # Log admin action
        db.collection('adminActions').add({
            'adminId': user_id,
            'action': 'item_rejected',
            'itemId': item_id,
            'details': f'Rejected item. Reason: {rejection_reason}',
            'timestamp': datetime.now(timezone.utc)
        })
        
        return {"success": True, "message": "Item rejected successfully"}
        
    except Exception as e:
        logger.error(f"Error rejecting item: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.post("/api/admin/edit-item")
async def edit_item(request: Request):
    """Admin endpoint to edit item details"""
    try:
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = auth_header.split("Bearer ")[1]
        decoded_token = auth.verify_id_token(token)
        user_id = decoded_token['uid']
        
        user_doc = db.collection('users').document(user_id).get()
        if not user_doc.exists or not user_doc.to_dict().get('isAdmin', False):
            raise HTTPException(status_code=403, detail="Admin access required")
        
        data = await request.json()
        item_id = data.get('itemId', '')
        
        if not item_id:
            raise HTTPException(status_code=400, detail="Missing itemId")
        
        # Update item
        item_ref = db.collection('items').document(item_id)
        update_data = {
            'title': data.get('title'),
            'description': data.get('description'),
            'price': data.get('price'),
            'category': data.get('category'),
            'gender': data.get('gender'),
            'size': data.get('size'),
            'brand': data.get('brand'),
            'condition': data.get('condition'),
            'material': data.get('material'),
            'lastUpdated': datetime.now(timezone.utc),
            'editedBy': user_id
        }
        
        # Remove None values
        update_data = {k: v for k, v in update_data.items() if v is not None}
        
        item_ref.update(update_data)
        
        # Log admin action
        db.collection('adminActions').add({
            'adminId': user_id,
            'action': 'item_edited',
            'itemId': item_id,
            'details': f'Edited item details',
            'timestamp': datetime.now(timezone.utc)
        })
        
        return {"success": True, "message": "Item updated successfully"}
        
    except Exception as e:
        logger.error(f"Error editing item: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.post("/api/admin/make-item-live")
async def make_item_live(request: Request):
    """Admin endpoint to make an item live"""
    try:
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = auth_header.split("Bearer ")[1]
        decoded_token = auth.verify_id_token(token)
        user_id = decoded_token['uid']
        
        user_doc = db.collection('users').document(user_id).get()
        if not user_doc.exists or not user_doc.to_dict().get('isAdmin', False):
            raise HTTPException(status_code=403, detail="Admin access required")
        
        data = await request.json()
        item_id = data.get('itemId', '')
        
        if not item_id:
            raise HTTPException(status_code=400, detail="Missing itemId")
        
        # Update item to live status
        item_ref = db.collection('items').document(item_id)
        item_ref.update({
            'status': 'live',
            'liveAt': datetime.now(timezone.utc),
            'madeBy': user_id
        })
        
        # Log admin action
        db.collection('adminActions').add({
            'adminId': user_id,
            'action': 'item_made_live',
            'itemId': item_id,
            'details': 'Made item live',
            'timestamp': datetime.now(timezone.utc)
        })
        
        return {"success": True, "message": "Item made live successfully"}
        
    except Exception as e:
        logger.error(f"Error making item live: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.post("/api/admin/send-back-to-pending")
async def send_back_to_pending(request: Request):
    """Admin endpoint to send item back to pending"""
    try:
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = auth_header.split("Bearer ")[1]
        decoded_token = auth.verify_id_token(token)
        user_id = decoded_token['uid']
        
        user_doc = db.collection('users').document(user_id).get()
        if not user_doc.exists or not user_doc.to_dict().get('isAdmin', False):
            raise HTTPException(status_code=403, detail="Admin access required")
        
        data = await request.json()
        item_id = data.get('itemId', '')
        
        if not item_id:
            raise HTTPException(status_code=400, detail="Missing itemId")
        
        # Update item back to pending
        item_ref = db.collection('items').document(item_id)
        item_ref.update({
            'status': 'pending',
            'liveAt': None,
            'sentBackBy': user_id,
            'sentBackAt': datetime.now(timezone.utc)
        })
        
        # Log admin action
        db.collection('adminActions').add({
            'adminId': user_id,
            'action': 'item_sent_back_to_pending',
            'itemId': item_id,
            'details': 'Sent item back to pending',
            'timestamp': datetime.now(timezone.utc)
        })
        
        return {"success": True, "message": "Item sent back to pending successfully"}
        
    except Exception as e:
        logger.error(f"Error sending item back to pending: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.post("/api/admin/mark-shipped")
async def mark_item_shipped(request: Request):
    """Admin endpoint to mark an item as shipped"""
    try:
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = auth_header.split("Bearer ")[1]
        decoded_token = auth.verify_id_token(token)
        user_id = decoded_token['uid']
        
        # Check if user is admin
        user_doc = db.collection('users').document(user_id).get()
        if not user_doc.exists or not user_doc.to_dict().get('isAdmin', False):
            raise HTTPException(status_code=403, detail="Admin access required")
        
        data = await request.json()
        item_id = data.get('itemId', '')
        tracking_number = data.get('trackingNumber', '')
        
        if not item_id:
            raise HTTPException(status_code=400, detail="Missing itemId")
        
        # Get item details for logging
        item_ref = db.collection('items').document(item_id)
        item_doc = item_ref.get()
        if not item_doc.exists:
            raise HTTPException(status_code=404, detail="Item not found")
        
        item_data = item_doc.to_dict()
        
        # Verify the item is sold and ready for shipping
        if item_data.get('status') != 'sold':
            raise HTTPException(status_code=400, detail="Item must be sold before it can be shipped")
        
        if item_data.get('saleType') != 'online':
            raise HTTPException(status_code=400, detail="Only online sales can be marked as shipped")
        
        if item_data.get('fulfillmentMethod') != 'shipping':
            raise HTTPException(status_code=400, detail="Item fulfillment method must be shipping")
        
        if item_data.get('shippedAt'):
            raise HTTPException(status_code=400, detail="Item has already been shipped")
        
        # Generate tracking number if not provided
        if not tracking_number:
            tracking_number = f"TRK{int(time.time())}{str(uuid.uuid4())[:4].upper()}"
        
        logger.info(f"Admin {user_id} marking item {item_id} as shipped with tracking {tracking_number}")
        
        # Update item with shipping information
        update_data = {
            'shippedAt': datetime.now(timezone.utc),
            'trackingNumber': tracking_number,
            'shippingLabelGenerated': True,
            'shippedBy': user_id,
            'lastUpdated': datetime.now(timezone.utc)
        }
        
        item_ref.update(update_data)
        
        # Log admin action
        admin_action = {
            'adminId': user_id,
            'action': 'item_shipped',
            'details': f'Marked item "{item_data.get("title", "Unknown")}" as shipped with tracking {tracking_number}',
            'itemId': item_id,
            'timestamp': datetime.now(timezone.utc),
            'trackingNumber': tracking_number
        }
        db.collection('adminActions').add(admin_action)
        
        logger.info(f"Successfully marked item {item_id} as shipped")
        
        return {
            "success": True,
            "message": "Item marked as shipped successfully",
            "itemId": item_id,
            "trackingNumber": tracking_number,
            "shippedAt": datetime.now(timezone.utc).isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error marking item as shipped: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.post("/api/create-item")
async def create_item(request: Request):
    """Endpoint for all users to create items that go to pending queue"""
    try:
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = auth_header.split("Bearer ")[1]
        decoded_token = auth.verify_id_token(token)
        user_id = decoded_token['uid']
        
        # All authenticated users can create items
        data = await request.json()
        
        # Validate required fields
        required_fields = ['title', 'description', 'price', 'sellerId', 'sellerName', 'sellerEmail']
        for field in required_fields:
            if not data.get(field):
                raise HTTPException(status_code=400, detail=f"Missing required field: {field}")
        
        # Validate price is a positive number
        try:
            price = float(data.get('price'))
            if price <= 0:
                raise ValueError("Price must be positive")
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid price format")
        
        logger.info(f"User {user_id} creating item: {data.get('title')}")
        
        # Prepare item data for items collection
        item_data = {
            'title': data.get('title').strip(),
            'description': data.get('description').strip(),
            'price': price,
            'images': data.get('images', []),
            'sellerId': data.get('sellerId'),
            'sellerName': data.get('sellerName'),
            'sellerEmail': data.get('sellerEmail'),
            'status': 'pending',
            'createdAt': datetime.now(timezone.utc),
            'submittedBy': user_id,  # Track who submitted it
            'lastUpdated': datetime.now(timezone.utc)
        }
        
        # Add optional fields if provided
        optional_fields = ['category', 'gender', 'size', 'brand', 'condition', 'material', 'color']
        for field in optional_fields:
            if data.get(field) and data.get(field).strip():
                item_data[field] = data.get(field).strip()
        
        # Create item in main items collection
        items_ref = db.collection('items')
        doc_ref = items_ref.add(item_data)
        item_id = doc_ref[1].id
        
        # Log the action
        action_log = {
            'userId': user_id,
            'action': 'item_created',
            'details': f'Created item "{data.get("title")}" for pending review',
            'itemId': item_id,
            'timestamp': datetime.now(timezone.utc)
        }
        db.collection('actionLogs').add(action_log)
        
        logger.info(f"Successfully created item {item_id} for pending review")
        
        return {
            "success": True,
            "message": "Item created successfully and added to pending review",
            "itemId": item_id,
            "status": "pending"
        }
        
    except Exception as e:
        logger.error(f"Error creating item: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.post("/api/admin/approve-item")
async def approve_single_item(request: Request):
    """Admin endpoint to approve a single item"""
    try:
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = auth_header.split("Bearer ")[1]
        decoded_token = auth.verify_id_token(token)
        user_id = decoded_token['uid']
        
        user_doc = db.collection('users').document(user_id).get()
        if not user_doc.exists or not user_doc.to_dict().get('isAdmin', False):
            raise HTTPException(status_code=403, detail="Admin access required")
        
        data = await request.json()
        item_id = data.get('itemId', '')
        
        if not item_id:
            raise HTTPException(status_code=400, detail="Missing itemId")
        
        # Update item to approved status
        item_ref = db.collection('items').document(item_id)
        item_ref.update({
            'status': 'approved',
            'approvedAt': datetime.now(timezone.utc),
            'approvedBy': user_id
        })
        
        # Log admin action
        db.collection('adminActions').add({
            'adminId': user_id,
            'action': 'item_approved',
            'itemId': item_id,
            'details': 'Approved item',
            'timestamp': datetime.now(timezone.utc)
        })
        
        return {"success": True, "message": "Item approved successfully"}
        
    except Exception as e:
        logger.error(f"Error approving item: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.post("/api/admin/bulk-approve")
async def bulk_approve_items(request: Request):
    """Admin endpoint to approve multiple items"""
    try:
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = auth_header.split("Bearer ")[1]
        decoded_token = auth.verify_id_token(token)
        user_id = decoded_token['uid']
        
        user_doc = db.collection('users').document(user_id).get()
        if not user_doc.exists or not user_doc.to_dict().get('isAdmin', False):
            raise HTTPException(status_code=403, detail="Admin access required")
        
        data = await request.json()
        item_ids = data.get('itemIds', [])
        
        if not item_ids or not isinstance(item_ids, list):
            raise HTTPException(status_code=400, detail="Missing or invalid itemIds array")
        
        success_count = 0
        error_count = 0
        
        for item_id in item_ids:
            try:
                # Update item to approved status
                item_ref = db.collection('items').document(item_id)
                item_ref.update({
                    'status': 'approved',
                    'approvedAt': datetime.now(timezone.utc),
                    'approvedBy': user_id
                })
                success_count += 1
                
                # Log admin action
                db.collection('adminActions').add({
                    'adminId': user_id,
                    'action': 'item_approved',
                    'itemId': item_id,
                    'details': 'Approved item via bulk action',
                    'timestamp': datetime.now(timezone.utc)
                })
                
            except Exception as item_error:
                logger.error(f"Error approving item {item_id}: {item_error}")
                error_count += 1
        
        return {
            "success": True, 
            "message": f"Bulk approval completed. {success_count} items approved, {error_count} failed.",
            "successCount": success_count,
            "errorCount": error_count
        }
        
    except Exception as e:
        logger.error(f"Error in bulk approve: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.post("/api/admin/bulk-reject")
async def bulk_reject_items(request: Request):
    """Admin endpoint to reject multiple items"""
    try:
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = auth_header.split("Bearer ")[1]
        decoded_token = auth.verify_id_token(token)
        user_id = decoded_token['uid']
        
        user_doc = db.collection('users').document(user_id).get()
        if not user_doc.exists or not user_doc.to_dict().get('isAdmin', False):
            raise HTTPException(status_code=403, detail="Admin access required")
        
        data = await request.json()
        item_ids = data.get('itemIds', [])
        reason = data.get('reason', 'No reason provided')
        
        if not item_ids or not isinstance(item_ids, list):
            raise HTTPException(status_code=400, detail="Missing or invalid itemIds array")
        
        success_count = 0
        error_count = 0
        
        for item_id in item_ids:
            try:
                # Update item to rejected status
                item_ref = db.collection('items').document(item_id)
                item_ref.update({
                    'status': 'rejected',
                    'rejectedAt': datetime.now(timezone.utc),
                    'rejectedBy': user_id,
                    'rejectionReason': reason
                })
                success_count += 1
                
                # Log admin action
                db.collection('adminActions').add({
                    'adminId': user_id,
                    'action': 'item_rejected',
                    'itemId': item_id,
                    'details': f'Rejected item via bulk action. Reason: {reason}',
                    'timestamp': datetime.now(timezone.utc)
                })
                
            except Exception as item_error:
                logger.error(f"Error rejecting item {item_id}: {item_error}")
                error_count += 1
        
        return {
            "success": True, 
            "message": f"Bulk rejection completed. {success_count} items rejected, {error_count} failed.",
            "successCount": success_count,
            "errorCount": error_count
        }
        
    except Exception as e:
        logger.error(f"Error in bulk reject: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.post("/api/admin/toggle-admin-status")
async def toggle_admin_status(request: Request):
    """Admin endpoint to toggle admin status of a user"""
    try:
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = auth_header.split("Bearer ")[1]
        decoded_token = auth.verify_id_token(token)
        admin_user_id = decoded_token['uid']
        
        # Verify admin status
        admin_doc = db.collection('users').document(admin_user_id).get()
        if not admin_doc.exists or not admin_doc.to_dict().get('isAdmin', False):
            raise HTTPException(status_code=403, detail="Admin access required")
        
        data = await request.json()
        target_user_id = data.get('userId')
        new_admin_status = data.get('isAdmin')
        
        if not target_user_id:
            raise HTTPException(status_code=400, detail="Missing userId")
        
        if target_user_id == admin_user_id:
            raise HTTPException(status_code=400, detail="Cannot modify your own admin status")
        
        # Update user admin status
        user_ref = db.collection('users').document(target_user_id)
        user_ref.update({
            'isAdmin': new_admin_status,
            'adminStatusChangedAt': datetime.now(timezone.utc),
            'adminStatusChangedBy': admin_user_id
        })
        
        # Log the action
        db.collection('action_logs').add({
            'userId': admin_user_id,
            'action': 'admin_action',
            'details': f"{'Granted' if new_admin_status else 'Removed'} admin privileges for user {target_user_id}",
            'timestamp': datetime.now(timezone.utc),
            'userAgent': request.headers.get('user-agent', ''),
            'ip': request.client.host
        })
        
        return {"success": True, "message": f"Admin status {'granted' if new_admin_status else 'removed'} successfully"}
        
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.get("/api/admin/get-all-users")
async def get_all_users(request: Request):
    """Admin endpoint to get all users with their details"""
    try:
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = auth_header.split("Bearer ")[1]
        decoded_token = auth.verify_id_token(token)
        admin_user_id = decoded_token['uid']
        
        # Verify admin status
        admin_doc = db.collection('users').document(admin_user_id).get()
        if not admin_doc.exists or not admin_doc.to_dict().get('isAdmin', False):
            raise HTTPException(status_code=403, detail="Admin access required")
        
        # Get all users
        users_ref = db.collection('users')
        users_docs = users_ref.stream()
        
        users_list = []
        for doc in users_docs:
            data = doc.to_dict()
            users_list.append({
                'id': doc.id,
                'email': data.get('email', ''),
                'displayName': data.get('displayName', ''),
                'photoURL': data.get('photoURL', ''),
                'isAdmin': data.get('isAdmin', False),
                'createdAt': data.get('createdAt'),
                'lastLoginAt': data.get('lastLoginAt'),
                'lastKnownIP': data.get('lastKnownIP', 'Unknown')
            })
        
        return {"users": users_list}
        
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.post("/api/admin/ban-user")
async def ban_user(request: Request):
    """Admin endpoint to ban a user"""
    try:
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = auth_header.split("Bearer ")[1]
        decoded_token = auth.verify_id_token(token)
        admin_user_id = decoded_token['uid']
        
        # Verify admin status
        admin_doc = db.collection('users').document(admin_user_id).get()
        if not admin_doc.exists or not admin_doc.to_dict().get('isAdmin', False):
            raise HTTPException(status_code=403, detail="Admin access required")
        
        data = await request.json()
        target_user_id = data.get('userId')
        target_email = data.get('email')
        target_ip = data.get('ipAddress')
        reason = data.get('reason', 'No reason provided')
        duration_hours = data.get('durationHours', 24)
        
        if not target_user_id or not target_email:
            raise HTTPException(status_code=400, detail="Missing userId or email")
        
        if target_user_id == admin_user_id:
            raise HTTPException(status_code=400, detail="Cannot ban yourself")
        
        expires_at = datetime.now(timezone.utc) + timedelta(hours=duration_hours)
        
        # Ban user by email/ID
        db.collection('banned_users').add({
            'userId': target_user_id,
            'email': target_email,
            'reason': reason,
            'bannedAt': datetime.now(timezone.utc),
            'expiresAt': expires_at,
            'active': True,
            'autoGenerated': False,
            'bannedBy': admin_user_id
        })
        
        # Also ban their IP if available
        if target_ip and target_ip != 'Unknown':
            db.collection('banned_ips').add({
                'ip': target_ip,
                'reason': f"User ban: {reason}",
                'bannedAt': datetime.now(timezone.utc),
                'expiresAt': expires_at,
                'active': True,
                'autoGenerated': False,
                'bannedBy': admin_user_id,
                'associatedUser': target_email
            })
        
        # Log the action
        db.collection('action_logs').add({
            'userId': admin_user_id,
            'action': 'admin_action',
            'details': f"Banned user {target_email} for {duration_hours} hours. Reason: {reason}",
            'timestamp': datetime.now(timezone.utc),
            'userAgent': request.headers.get('user-agent', ''),
            'ip': request.client.host
        })
        
        return {"success": True, "message": f"User {target_email} banned successfully"}
        
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.post("/api/admin/generate-test-data")
async def generate_test_data(request: Request):
    """Admin endpoint to generate test data for development"""
    try:
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = auth_header.split("Bearer ")[1]
        decoded_token = auth.verify_id_token(token)
        admin_user_id = decoded_token['uid']
        
        # Verify admin status
        admin_doc = db.collection('users').document(admin_user_id).get()
        if not admin_doc.exists or not admin_doc.to_dict().get('isAdmin', False):
            raise HTTPException(status_code=403, detail="Admin access required")
        
        logger.info(f"Admin {admin_user_id} generating test data")
        
        # Comprehensive test data with diverse categories and high-quality images
        test_items = [
            # Electronics - Enhanced with more items
            {
                'title': 'Garmin Fenix 7X Solar GPS Watch',
                'description': 'Multi-sport GPS smartwatch with Power Glass solar charging lens. Features heart rate monitoring, pulse ox sensor, detailed mapping, and up to 28 days battery life. Built for serious athletes and outdoor enthusiasts.',
                'price': 649.00,
                'originalPrice': 899.99,
                'brand': 'Garmin',
                'category': 'Electronics',
                'gender': 'Unisex',
                'size': '51mm',
                'color': 'Carbon Gray DLC',
                'condition': 'Excellent',
                'material': 'Titanium Bezel, Sapphire Lens',
                'tags': ['gps', 'smartwatch', 'solar', 'multisport', 'mapping'],
                'status': 'pending',
                'sellerId': admin_user_id,
                'sellerName': 'Tech Gear Expert',
                'sellerEmail': 'tech@summitgear.com',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&h=600&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1434494878577-86c23bcb06b9?w=800&h=600&fit=crop&q=80'
                ]
            },
            {
                'title': 'GoPro Hero 12 Black Action Camera',
                'description': '5.3K60 video recording with Emmy Award-winning HyperSmooth 6.0 stabilization. Waterproof to 33ft without housing. Includes Hero 12 Black camera, Enduro battery, curved adhesive mount, mounting buckle, and USB-C cable.',
                'price': 379.00,
                'originalPrice': 499.99,
                'brand': 'GoPro',
                'category': 'Electronics',
                'gender': 'Unisex',
                'size': '2.4 x 1.7 x 1.4 in',
                'color': 'Black',
                'condition': 'Like New',
                'material': 'Aluminum Alloy Housing',
                'tags': ['action camera', '5.3k video', 'waterproof', 'hypermooth'],
                'status': 'pending',
                'sellerId': 'outdoor_videographer_001',
                'sellerName': 'Adventure Filmmaker',
                'sellerEmail': 'films@adventures.com',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=800&h=600&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=800&h=600&fit=crop&q=80'
                ]
            },
            {
                'title': 'Apple Watch Ultra 2 - GPS + Cellular',
                'description': 'Rugged titanium smartwatch designed for endurance athletes and outdoor adventurers. Features precision dual-frequency GPS, up to 36 hours battery life, and the brightest Apple Watch display ever.',
                'price': 689.00,
                'originalPrice': 799.00,
                'brand': 'Apple',
                'category': 'Electronics',
                'gender': 'Unisex',
                'size': '49mm',
                'color': 'Natural Titanium',
                'condition': 'Excellent',
                'material': 'Grade 5 Titanium',
                'tags': ['smartwatch', 'gps', 'cellular', 'titanium', 'apple'],
                'status': 'pending',
                'sellerId': 'apple_enthusiast_pro',
                'sellerName': 'Premium Tech Consignment',
                'sellerEmail': 'premium@techconsign.com',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1434494878577-86c23bcb06b9?w=800&h=600&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1510017098667-27dfc7150c83?w=800&h=600&fit=crop&q=80'
                ]
            },
            {
                'title': 'DJI Mini 4 Pro Drone',
                'description': 'Compact drone with 4K/60fps HDR video, omnidirectional obstacle sensing, and 34-minute max flight time. Perfect for aerial photography and videography.',
                'price': 759.00,
                'originalPrice': 1069.00,
                'brand': 'DJI',
                'category': 'Electronics',
                'gender': 'Unisex',
                'size': 'Foldable Design',
                'color': 'Gray',
                'condition': 'Very Good',
                'material': 'Magnesium Alloy Frame',
                'tags': ['drone', '4k video', 'aerial photography', 'compact'],
                'status': 'pending',
                'sellerId': 'aerial_photographer',
                'sellerName': 'Sky View Productions',
                'sellerEmail': 'sky@aerialphoto.com',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1473968512647-3e447244af8f?w=800&h=600&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1508614589041-895b88991e3e?w=800&h=600&fit=crop&q=80'
                ]
            },
            {
                'title': 'Insta360 X3 360° Action Camera',
                'description': '360° action camera with 5.7K video recording, invisible selfie stick effect, and FlowState stabilization. Perfect for immersive content creation.',
                'price': 349.00,
                'originalPrice': 449.99,
                'brand': 'Insta360',
                'category': 'Electronics',
                'gender': 'Unisex',
                'size': 'Compact',
                'color': 'Black',
                'condition': 'Very Good',
                'material': 'Aluminum Alloy',
                'tags': ['360 camera', '5.7k video', 'action camera', 'stabilization'],
                'status': 'pending',
                'sellerId': 'content_creator_360',
                'sellerName': '360 Content Studio',
                'sellerEmail': 'create@360studio.com',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1505142468610-359e7d316be0?w=800&h=600&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=800&h=600&fit=crop&q=80'
                ]
            },
            
            # Climbing & Mountaineering - Enhanced with more realistic descriptions
            {
                'title': 'Black Diamond Momentum Climbing Shoes - Men\'s',
                'description': 'Comfortable all-day climbing shoe perfect for beginners and gym sessions. Features sticky BD NeoFriction rubber, breathable Engineered Knit Technology upper, and a generous fit for comfort during extended climbing sessions.',
                'price': 55.00,
                'originalPrice': 89.95,
                'brand': 'Black Diamond',
                'category': 'Footwear',
                'gender': 'Men',
                'size': '10.5',
                'color': 'Ash',
                'condition': 'Good',
                'material': 'Engineered Knit, NeoFriction Rubber',
                'tags': ['climbing shoes', 'beginner friendly', 'gym climbing'],
                'status': 'pending',
                'sellerId': 'rock_climber_pro',
                'sellerName': 'Vertical Adventures',
                'sellerEmail': 'climb@vertical.com',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1544966503-7cc5ac882d5e?w=800&h=600&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1517654077773-8a82e5eaf8c8?w=800&h=600&fit=crop&q=80'
                ]
            },
            {
                'title': 'La Sportiva Solution Comp Climbing Shoes - Women\'s',
                'description': 'Aggressive performance climbing shoe with P3 system for precise edging and hooking. Features sticky Vibram XS Grip2 rubber and Fast Lacing System. Perfect for advanced sport climbing and bouldering.',
                'price': 129.00,
                'originalPrice': 189.00,
                'brand': 'La Sportiva',
                'category': 'Footwear',
                'gender': 'Women',
                'size': '7.5',
                'color': 'White/Lily Orange',
                'condition': 'Excellent',
                'material': 'Leather, Vibram XS Grip2',
                'tags': ['aggressive climbing', 'sport climbing', 'bouldering'],
                'status': 'pending',
                'sellerId': 'comp_climber_pro',
                'sellerName': 'Elite Climbing Gear',
                'sellerEmail': 'elite@climbinggear.com',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1522163182402-834f871fd851?w=800&h=600&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&h=600&fit=crop&q=80'
                ]
            },
            {
                'title': 'Mammut 9.5mm Phoenix Dry Climbing Rope',
                'description': '70m dynamic single rope with Dry treatment technology providing water resistance. Featuring UIAA and CE certified construction with middle mark for safe rappelling. Perfect for sport, trad, and alpine climbing.',
                'price': 125.00,
                'originalPrice': 179.95,
                'brand': 'Mammut',
                'category': 'Climbing Gear',
                'gender': 'Unisex',
                'size': '70m x 9.5mm',
                'color': 'Safety Orange',
                'condition': 'Very Good',
                'material': 'Nylon Core, Polyester Sheath',
                'tags': ['dynamic rope', 'dry treatment', 'single rope', 'middle mark'],
                'status': 'pending',
                'sellerId': admin_user_id,
                'sellerName': 'Mountain Guide Services',
                'sellerEmail': 'guides@mountain.com',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1464207687429-7505649dae38?w=800&h=600&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop&q=80'
                ]
            },
            {
                'title': 'Black Diamond Solution Climbing Harness',
                'description': 'Lightweight all-around harness with Dual Core Construction for strength and comfort. Features four gear loops, belay loop rated to 15 kN, and adjustable leg loops. Perfect for sport climbing and multipitch routes.',
                'price': 45.00,
                'originalPrice': 65.00,
                'brand': 'Black Diamond',
                'category': 'Climbing Gear',
                'gender': 'Unisex',
                'size': 'Medium',
                'color': 'Ultra Blue',
                'condition': 'Good',
                'material': 'Nylon Webbing',
                'tags': ['climbing harness', 'sport climbing', 'multipitch'],
                'status': 'pending',
                'sellerId': 'climbing_instructor_001',
                'sellerName': 'Rock Climbing Academy',
                'sellerEmail': 'instruct@rockacademy.com',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1522163182402-834f871fd851?w=800&h=600&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1464207687429-7505649dae38?w=800&h=600&fit=crop&q=80'
                ]
            },
            {
                'title': 'Petzl GriGri+ Belay Device',
                'description': 'Assisted-braking belay device with anti-panic handle and top-rope mode selector. Features cam-assisted blocking for added security. Compatible with 8.5-11mm dynamic ropes.',
                'price': 85.00,
                'originalPrice': 109.95,
                'brand': 'Petzl',
                'category': 'Climbing Gear',
                'gender': 'Unisex',
                'size': 'Standard',
                'color': 'Red',
                'condition': 'Like New',
                'material': 'Aluminum Alloy',
                'tags': ['belay device', 'assisted braking', 'safety'],
                'status': 'pending',
                'sellerId': 'safety_first_climbing',
                'sellerName': 'Climbing Safety Experts',
                'sellerEmail': 'safety@climbsafe.com',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1522163182402-834f871fd851?w=800&h=600&fit=crop&q=80'
                ]
            },
            
            # Camping Gear - Enhanced with professional descriptions
            {
                'title': 'Big Agnes Copper Spur HV UL2 Tent',
                'description': 'Award-winning ultralight 2-person backpacking tent with High Volume hub design for maximum livability. Features two large vestibules (8.5 + 8.5 sq ft), DAC Featherlite NFL poles, and proprietary tent fabrics. Trail weight: 2 lbs 12 oz.',
                'price': 315.00,
                'originalPrice': 449.95,
                'brand': 'Big Agnes',
                'category': 'Camping Gear',
                'gender': 'Unisex',
                'size': '2 Person',
                'color': 'Gray/Orange',
                'condition': 'Excellent',
                'material': 'Ripstop Nylon, DAC Featherlite Poles',
                'tags': ['ultralight', 'backpacking', 'freestanding', 'dual vestibule'],
                'status': 'pending',
                'sellerId': 'backpack_camper_001',
                'sellerName': 'Lightweight Adventures',
                'sellerEmail': 'ultralight@camping.net',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=800&h=600&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1478131143081-80f7f84ca84d?w=800&h=600&fit=crop&q=80'
                ]
            },
            {
                'title': 'REI Co-op Half Dome 4 Plus Tent',
                'description': 'Spacious 4-person family tent with color-coded poles and clips for easy setup. Features two doors, two vestibules, and 60 sq ft of floor space. Great for car camping and base camps.',
                'price': 189.00,
                'originalPrice': 269.00,
                'brand': 'REI Co-op',
                'category': 'Camping Gear',
                'gender': 'Unisex',
                'size': '4 Person',
                'color': 'Red/Gray',
                'condition': 'Very Good',
                'material': '75D Polyester, Aluminum Poles',
                'tags': ['family tent', 'car camping', 'spacious', 'dual doors'],
                'status': 'pending',
                'sellerId': 'family_camper_pro',
                'sellerName': 'Family Outdoor Adventures',
                'sellerEmail': 'family@outdooradventures.com',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1478131143081-80f7f84ca84d?w=800&h=600&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800&h=600&fit=crop&q=80'
                ]
            },
            {
                'title': 'Jetboil Flash Cooking System',
                'description': 'Integrated cooking system that boils water in 100 seconds flat. Features FluxRing heat exchanger, push-button ignition, and insulated cozy. Includes 1L FluxRing cooking cup and fuel stabilizer.',
                'price': 75.00,
                'originalPrice': 109.95,
                'brand': 'Jetboil',
                'category': 'Camping Gear',
                'gender': 'Unisex',
                'size': '1.0L',
                'color': 'Carbon',
                'condition': 'Very Good',
                'material': 'Aluminum, Stainless Steel',
                'tags': ['integrated stove', 'fast boiling', 'lightweight', 'backpacking'],
                'status': 'pending',
                'sellerId': 'camp_cook_expert',
                'sellerName': 'Outdoor Chef',
                'sellerEmail': 'cook@outdoors.com',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1570737845904-972921524d9f?w=800&h=600&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1587712284248-91c0f8df4de4?w=800&h=600&fit=crop&q=80'
                ]
            },
            {
                'title': 'Western Mountaineering UltraLite Sleeping Bag',
                'description': '20°F rated sleeping bag with 850+ fill power goose down. Weighs only 2 lbs 1 oz. Features differential cut construction and full-length zipper with draft tube.',
                'price': 385.00,
                'originalPrice': 520.00,
                'brand': 'Western Mountaineering',
                'category': 'Sleep Systems',
                'gender': 'Unisex',
                'size': 'Regular',
                'color': 'Red',
                'condition': 'Excellent',
                'material': '850+ Fill Goose Down, Microfiber Shell',
                'tags': ['down sleeping bag', 'ultralight', '20 degree', 'premium'],
                'status': 'pending',
                'sellerId': 'sleep_system_expert',
                'sellerName': 'Backcountry Sleep Co',
                'sellerEmail': 'sleep@backcountry.gear',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1478131143081-80f7f84ca84d?w=800&h=600&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800&h=600&fit=crop&q=80'
                ]
            },
            {
                'title': 'Therm-a-Rest NeoAir XLite Sleeping Pad',
                'description': 'Award-winning ultralight inflatable sleeping pad with Triangular Core Matrix construction. R-value 4.2, weighs 12 oz. Packs to size of water bottle.',
                'price': 129.00,
                'originalPrice': 199.95,
                'brand': 'Therm-a-Rest',
                'category': 'Sleep Systems',
                'gender': 'Unisex',
                'size': 'Regular',
                'color': 'Lemon Curry',
                'condition': 'Very Good',
                'material': '30D Ripstop Nylon',
                'tags': ['sleeping pad', 'ultralight', 'insulated', 'compact'],
                'status': 'pending',
                'sellerId': 'comfort_camping_pro',
                'sellerName': 'Sleep Comfort Specialists',
                'sellerEmail': 'comfort@camping.experts',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800&h=600&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1478131143081-80f7f84ca84d?w=800&h=600&fit=crop&q=80'
                ]
            },
            {
                'title': 'MSR PocketRocket 2 Ultralight Stove',
                'description': 'Ultralight canister stove weighing just 2.6 oz. Features WindClip technology and improved pot supports. Boils 1 liter of water in 3.5 minutes.',
                'price': 35.00,
                'originalPrice': 49.95,
                'brand': 'MSR',
                'category': 'Camping Gear',
                'gender': 'Unisex',
                'size': 'Ultralight',
                'color': 'Red',
                'condition': 'Good',
                'material': 'Stainless Steel, Aluminum',
                'tags': ['ultralight stove', 'canister', 'windproof', 'compact'],
                'status': 'pending',
                'sellerId': 'minimalist_camper',
                'sellerName': 'Ultralight Gear Co',
                'sellerEmail': 'minimal@ultralightgear.com',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1570737845904-972921524d9f?w=800&h=600&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1587712284248-91c0f8df4de4?w=800&h=600&fit=crop&q=80'
                ]
            },
            
            # Jackets & Outerwear
            {
                'title': "Arc'teryx Atom LT Vest - Men's",
                'description': 'Versatile synthetic insulation vest perfect for layering. Wind and weather resistant.',
                'price': 129.00,
                'originalPrice': 189.00,
                'brand': "Arc'teryx",
                'category': 'Jackets & Coats',
                'gender': 'Men',
                'size': 'Large',
                'color': 'Black',
                'condition': 'Excellent',
                'material': 'Coreloft Synthetic',
                'tags': ['layering', 'insulation', 'vest'],
                'status': 'pending',
                'sellerId': 'layer_master_pro',
                'sellerName': 'Layering Systems',
                'sellerEmail': 'layers@system.com',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=800&h=600&fit=crop',
                    'https://images.unsplash.com/photo-1544966503-7cc5ac882d5e?w=800&h=600&fit=crop'
                ]
            },
            {
                'title': 'Patagonia Torrentshell 3L Rain Jacket',
                'description': 'Waterproof, breathable rain jacket with 3-layer H2No Performance Standard shell.',
                'price': 95.00,
                'originalPrice': 149.00,
                'brand': 'Patagonia',
                'category': 'Jackets & Coats',
                'gender': 'Women',
                'size': 'Medium',
                'color': 'Navy Blue',
                'condition': 'Very Good',
                'material': 'Recycled Nylon',
                'tags': ['rain jacket', 'waterproof', 'breathable'],
                'status': 'pending',
                'sellerId': 'rain_gear_specialist',
                'sellerName': 'Weather Protection Co',
                'sellerEmail': 'rain@weather.com',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1506629905607-5b9e4b1d7440?w=800&h=600&fit=crop',
                    'https://images.unsplash.com/photo-1578489758854-f134a358f08b?w=800&h=600&fit=crop'
                ]
            },
            
            # Footwear
            {
                'title': 'Salomon X Ultra 3 GTX Hiking Shoes',
                'description': 'Gore-Tex waterproof hiking shoes with Contagrip sole for superior grip on any terrain.',
                'price': 99.00,
                'originalPrice': 149.95,
                'brand': 'Salomon',
                'category': 'Footwear',
                'gender': 'Men',
                'size': '10',
                'color': 'Black/Magnet',
                'condition': 'Excellent',
                'material': 'Synthetic, Gore-Tex',
                'tags': ['waterproof', 'hiking', 'trail running'],
                'status': 'pending',
                'sellerId': 'fast_hiker_001',
                'sellerName': 'Speed Trail Adventures',
                'sellerEmail': 'fast@trails.com',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1551524164-6cf17af1cb87?w=800&h=600&fit=crop',
                    'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800&h=600&fit=crop'
                ]
            },
            {
                'title': 'Merrell Moab 3 Waterproof Hiking Boots',
                'description': 'Durable waterproof hiking boots with Vibram TC5+ outsole and protective rubber toe cap.',
                'price': 85.00,
                'originalPrice': 129.95,
                'brand': 'Merrell',
                'category': 'Footwear',
                'gender': 'Women',
                'size': '8.5',
                'color': 'Earth',
                'condition': 'Good',
                'material': 'Leather, Mesh',
                'tags': ['waterproof', 'hiking boots', 'vibram sole'],
                'status': 'pending',
                'sellerId': 'trail_explorer_pro',
                'sellerName': 'Day Hiking Specialists',
                'sellerEmail': 'explore@trails.net',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1544966503-7cc5ac882d5e?w=800&h=600&fit=crop',
                    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop'
                ]
            },
            
            # Backpacks
            {
                'title': 'Osprey Atmos AG 65 Backpack',
                'description': 'Anti-Gravity suspension system provides exceptional comfort for multi-day backpacking trips.',
                'price': 185.00,
                'originalPrice': 270.00,
                'brand': 'Osprey',
                'category': 'Backpacks',
                'gender': 'Men',
                'size': 'Medium (65L)',
                'color': 'Abyss Grey',
                'condition': 'Very Good',
                'material': 'Nylon Ripstop',
                'tags': ['backpacking', 'anti-gravity', 'multi-day'],
                'status': 'pending',
                'sellerId': 'backpack_expert_001',
                'sellerName': 'Long Distance Trekking',
                'sellerEmail': 'trek@longdistance.com',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1581833971358-2c8b550f87b3?w=800&h=600&fit=crop',
                    'https://images.unsplash.com/photo-1525971118847-e5eb07203437?w=800&h=600&fit=crop'
                ]
            },
            {
                'title': 'Deuter Speed Lite 26 Daypack',
                'description': 'Lightweight daypack perfect for hiking, climbing, and everyday adventures.',
                'price': 65.00,
                'originalPrice': 95.00,
                'brand': 'Deuter',
                'category': 'Backpacks',
                'gender': 'Unisex',
                'size': '26L',
                'color': 'Alpine Green',
                'condition': 'Excellent',
                'material': 'Ripstop Nylon',
                'tags': ['daypack', 'lightweight', 'climbing'],
                'status': 'pending',
                'sellerId': 'day_hiker_specialist',
                'sellerName': 'Single Day Adventures',
                'sellerEmail': 'day@adventures.com',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&h=600&fit=crop',
                    'https://images.unsplash.com/photo-1622260614927-9cd71154b3a2?w=800&h=600&fit=crop'
                ]
            },
            
            # Winter Sports
            {
                'title': 'Rossignol Experience 88 Ti Skis',
                'description': 'All-mountain skis with titanal construction for stability and performance on any terrain.',
                'price': 385.00,
                'originalPrice': 649.95,
                'brand': 'Rossignol',
                'category': 'Winter Sports',
                'gender': 'Unisex',
                'size': '172cm',
                'color': 'Black/Yellow',
                'condition': 'Good',
                'material': 'Wood Core, Titanal',
                'tags': ['all-mountain', 'titanal', 'carving'],
                'status': 'pending',
                'sellerId': 'ski_instructor_pro',
                'sellerName': 'Alpine Ski School',
                'sellerEmail': 'ski@alpine.school',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1578758002140-b1d10f48aa31?w=800&h=600&fit=crop',
                    'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=800&h=600&fit=crop'
                ]
            },
            {
                'title': 'Burton Custom Snowboard',
                'description': 'Versatile all-mountain snowboard with camber profile for power and precision.',
                'price': 289.00,
                'originalPrice': 429.95,
                'brand': 'Burton',
                'category': 'Winter Sports',
                'gender': 'Men',
                'size': '158cm',
                'color': 'Blue Graphics',
                'condition': 'Very Good',
                'material': 'Wood Core, Fiberglass',
                'tags': ['all-mountain', 'camber', 'freestyle'],
                'status': 'pending',
                'sellerId': 'snowboard_pro_rider',
                'sellerName': 'Mountain Boarders',
                'sellerEmail': 'ride@mountain.board',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=800&h=600&fit=crop',
                    'https://images.unsplash.com/photo-1578758002140-b1d10f48aa31?w=800&h=600&fit=crop'
                ]
            },
            
            # Water Sports
            {
                'title': 'BOTE Flood Aero Inflatable SUP',
                'description': 'High-quality inflatable stand-up paddleboard with pump and paddle included.',
                'price': 589.00,
                'originalPrice': 799.00,
                'brand': 'BOTE',
                'category': 'Water Sports',
                'gender': 'Unisex',
                'size': "11'6\"",
                'color': 'Teal',
                'condition': 'Like New',
                'material': 'Military Grade PVC',
                'tags': ['SUP', 'inflatable', 'paddle included'],
                'status': 'pending',
                'sellerId': 'paddle_board_expert',
                'sellerName': 'Lake Adventures',
                'sellerEmail': 'paddle@lake.adventures',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&h=600&fit=crop',
                    'https://images.unsplash.com/photo-1505142468610-359e7d316be0?w=800&h=600&fit=crop'
                ]
            },
            {
                'title': 'NRS Women\'s Endurance Splash Jacket',
                'description': 'Lightweight paddling jacket with breathable fabric and adjustable fit.',
                'price': 75.00,
                'originalPrice': 119.95,
                'brand': 'NRS',
                'category': 'Water Sports',
                'gender': 'Women',
                'size': 'Small',
                'color': 'Purple',
                'condition': 'Good',
                'material': 'Ripstop Nylon',
                'tags': ['paddling', 'kayaking', 'breathable'],
                'status': 'pending',
                'sellerId': 'kayak_enthusiast_001',
                'sellerName': 'River Running Co',
                'sellerEmail': 'kayak@river.runs',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1544966503-7cc5ac882d5e?w=800&h=600&fit=crop',
                    'https://images.unsplash.com/photo-1578758002140-b1d10f48aa31?w=800&h=600&fit=crop'
                ]
            },
            
            # Cycling
            {
                'title': 'Specialized Stumpjumper Comp Mountain Bike',
                'description': 'Full suspension mountain bike with 29" wheels and modern geometry for trail riding.',
                'price': 2199.00,
                'originalPrice': 3299.00,
                'brand': 'Specialized',
                'category': 'Cycling',
                'gender': 'Unisex',
                'size': 'Large',
                'color': 'Red/Black',
                'condition': 'Good',
                'material': 'Carbon Fiber',
                'tags': ['mountain bike', 'full suspension', '29er'],
                'status': 'pending',
                'sellerId': 'mtb_rider_pro',
                'sellerName': 'Single Track Adventures',
                'sellerEmail': 'mtb@singletrack.com',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=800&h=600&fit=crop',
                    'https://images.unsplash.com/photo-1544966503-7cc5ac882d5e?w=800&h=600&fit=crop'
                ]
            },
            {
                'title': 'Giro Montaro MIPS Helmet',
                'description': 'Mountain bike helmet with MIPS technology for enhanced protection and comfort.',
                'price': 89.00,
                'originalPrice': 149.95,
                'brand': 'Giro',
                'category': 'Cycling',
                'gender': 'Unisex',
                'size': 'Medium',
                'color': 'Matte Blue',
                'condition': 'Excellent',
                'material': 'Polycarbonate',
                'tags': ['MIPS', 'mountain bike', 'safety'],
                'status': 'pending',
                'sellerId': 'safe_rider_001',
                'sellerName': 'Bike Safety Pro',
                'sellerEmail': 'safety@bike.protection',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1571068316344-75bc76f77890?w=800&h=600&fit=crop',
                    'https://images.unsplash.com/photo-1558658044-4c1e7c7a0b47?w=800&h=600&fit=crop'
                ]
            },
            
            # Fishing
            {
                'title': 'Orvis Helios 3D Fly Rod',
                'description': 'Premium fly fishing rod with exceptional feel and accuracy for serious anglers.',
                'price': 549.00,
                'originalPrice': 798.00,
                'brand': 'Orvis',
                'category': 'Fishing',
                'gender': 'Unisex',
                'size': '9\'0" 5wt',
                'color': 'Olive',
                'condition': 'Excellent',
                'material': 'Carbon Fiber',
                'tags': ['fly fishing', 'premium', 'trout'],
                'status': 'pending',
                'sellerId': 'fly_fisher_expert',
                'sellerName': 'Trout Stream Outfitters',
                'sellerEmail': 'fly@trout.streams',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=800&h=600&fit=crop',
                    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop'
                ]
            },
            {
                'title': 'Simms G3 Guide Stockingfoot Waders',
                'description': 'Breathable chest waders with reinforced construction for demanding fishing conditions.',
                'price': 379.00,
                'originalPrice': 599.95,
                'brand': 'Simms',
                'category': 'Fishing',
                'gender': 'Men',
                'size': 'Large',
                'color': 'Dark Stone',
                'condition': 'Good',
                'material': 'Gore-Tex Pro',
                'tags': ['waders', 'breathable', 'fly fishing'],
                'status': 'pending',
                'sellerId': 'wading_specialist',
                'sellerName': 'Deep Water Access',
                'sellerEmail': 'wade@river.access',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=800&h=600&fit=crop',
                    'https://images.unsplash.com/photo-1551524164-6cf17af1cb87?w=800&h=600&fit=crop'
                ]
            },
            
            # Accessories
            {
                'title': 'Hydro Flask 32oz Wide Mouth',
                'description': 'Insulated stainless steel water bottle that keeps drinks cold for 24 hours or hot for 12 hours.',
                'price': 25.00,
                'originalPrice': 44.95,
                'brand': 'Hydro Flask',
                'category': 'Accessories',
                'gender': 'Unisex',
                'size': '32oz',
                'color': 'Pacific Blue',
                'condition': 'Good',
                'material': 'Stainless Steel',
                'tags': ['insulated', 'water bottle', 'hydration'],
                'status': 'pending',
                'sellerId': 'hydration_expert',
                'sellerName': 'Water Bottle Station',
                'sellerEmail': 'hydrate@water.bottles',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=800&h=600&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=800&h=600&fit=crop'
                ]
            },
            {
                'title': 'Black Diamond Spot 325 Headlamp',
                'description': 'Reliable LED headlamp with 325 lumens and red night vision. Waterproof design.',
                'price': 25.00,
                'originalPrice': 39.95,
                'brand': 'Black Diamond',
                'category': 'Accessories',
                'gender': 'Unisex',
                'size': 'One Size',
                'color': 'Aluminum',
                'condition': 'Very Good',
                'material': 'Aluminum, Plastic',
                'tags': ['headlamp', 'LED', 'waterproof'],
                'status': 'pending',
                'sellerId': 'night_navigation_pro',
                'sellerName': 'Head Light Specialists',
                'sellerEmail': 'night@navigation.lights',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=800&h=600&fit=crop',
                    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop'
                ]
            },
            
            # Base Layers & Clothing
            {
                'title': 'Smartwool Merino 150 Base Layer',
                'description': 'Lightweight merino wool base layer with natural odor resistance and temperature regulation.',
                'price': 45.00,
                'originalPrice': 75.00,
                'brand': 'Smartwool',
                'category': 'Base Layers',
                'gender': 'Women',
                'size': 'Medium',
                'color': 'Deep Navy',
                'condition': 'Very Good',
                'material': 'Merino Wool',
                'tags': ['merino wool', 'base layer', 'odor resistant'],
                'status': 'pending',
                'sellerId': 'wool_specialist_001',
                'sellerName': 'Natural Fibers Co',
                'sellerEmail': 'wool@natural.fibers',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=800&h=600&fit=crop',
                    'https://images.unsplash.com/photo-1544966503-7cc5ac882d5e?w=800&h=600&fit=crop'
                ]
            },
            {
                'title': 'Patagonia Baggies Shorts 5-inch',
                'description': 'Quick-dry recycled nylon shorts perfect for hiking, swimming, and everyday wear. Features DWR finish, mesh liner, and elastic waistband with drawstring.',
                'price': 32.00,
                'originalPrice': 55.00,
                'brand': 'Patagonia',
                'category': 'Shorts',
                'gender': 'Men',
                'size': '32',
                'color': 'Navy Blue',
                'condition': 'Good',
                'material': 'Recycled Nylon DWR',
                'tags': ['quick dry', 'versatile', 'recycled', 'water repellent'],
                'status': 'pending',
                'sellerId': 'shorts_enthusiast',
                'sellerName': 'Summer Hikes Co',
                'sellerEmail': 'shorts@summer.hikes',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1506629905607-5b9e4b1d7440?w=800&h=600&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1551524164-6cf17af1cb87?w=800&h=600&fit=crop&q=80'
                ]
            },
            
            # Additional Comprehensive Categories
            
            # Mountain Biking & Cycling
            {
                'title': 'Trek Fuel EX 8 Full Suspension Mountain Bike',
                'description': '29" full suspension trail bike with 130mm travel front and rear. Features Shimano XT 12-speed drivetrain, RockShox suspension, and Trek\'s Alpha Platinum Aluminum frame.',
                'price': 2899.00,
                'originalPrice': 3999.00,
                'brand': 'Trek',
                'category': 'Cycling',
                'gender': 'Unisex',
                'size': 'Large (19.5")',
                'color': 'Matte Trek Black',
                'condition': 'Very Good',
                'material': 'Alpha Platinum Aluminum',
                'tags': ['full suspension', 'trail bike', '29er', 'shimano xt'],
                'status': 'pending',
                'sellerId': 'mountain_bike_shop',
                'sellerName': 'Trail Bike Specialists',
                'sellerEmail': 'bikes@trailspecialists.com',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=800&h=600&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1571068316344-75bc76f77890?w=800&h=600&fit=crop&q=80'
                ]
            },
            {
                'title': 'Fox Racing Rampage Pro Carbon MIPS Helmet',
                'description': 'Full-face mountain bike helmet with MIPS technology and carbon fiber shell. Features Magnetic Visor System and dual-density EPS liner.',
                'price': 189.00,
                'originalPrice': 299.00,
                'brand': 'Fox Racing',
                'category': 'Cycling',
                'gender': 'Unisex',
                'size': 'Medium',
                'color': 'Matte Black',
                'condition': 'Excellent',
                'material': 'Carbon Fiber, EPS Foam',
                'tags': ['full face helmet', 'mips', 'mountain biking', 'carbon'],
                'status': 'pending',
                'sellerId': 'downhill_rider_pro',
                'sellerName': 'Gravity Sports',
                'sellerEmail': 'gravity@downnhill.sports',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1571068316344-75bc76f77890?w=800&h=600&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1558658044-4c1e7c7a0b47?w=800&h=600&fit=crop&q=80'
                ]
            },
            {
                'title': 'Shimano SPD Pedals PD-M520',
                'description': 'Clipless mountain bike pedals with dual-sided entry and adjustable release tension. Includes cleats and mounting hardware.',
                'price': 35.00,
                'originalPrice': 59.99,
                'brand': 'Shimano',
                'category': 'Cycling',
                'gender': 'Unisex',
                'size': 'Standard',
                'color': 'Black',
                'condition': 'Good',
                'material': 'Aluminum Alloy',
                'tags': ['clipless pedals', 'mountain bike', 'dual sided'],
                'status': 'pending',
                'sellerId': 'bike_component_pro',
                'sellerName': 'Component Specialists',
                'sellerEmail': 'components@bikeshop.com',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1571068316344-75bc76f77890?w=800&h=600&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=800&h=600&fit=crop&q=80'
                ]
            },
            
            # Fishing Gear
            {
                'title': 'Sage X 9\' 5wt Fly Rod',
                'description': 'High-performance fly rod with KonneticHD Technology. Delivers exceptional accuracy and feel for trout fishing. Includes protective tube and sock.',
                'price': 649.00,
                'originalPrice': 925.00,
                'brand': 'Sage',
                'category': 'Fishing',
                'gender': 'Unisex',
                'size': '9\'0" 5wt',
                'color': 'Sage Green',
                'condition': 'Like New',
                'material': 'KonneticHD Carbon Fiber',
                'tags': ['fly rod', 'trout', 'premium', 'sage'],
                'status': 'pending',
                'sellerId': 'fly_fishing_guide',
                'sellerName': 'Western Rivers Outfitters',
                'sellerEmail': 'guide@westernrivers.com',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1445020556993-2b4ac8027ac3?w=800&h=600&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop&q=80'
                ]
            },
            {
                'title': 'Patagonia Swiftcurrent Expedition Waders',
                'description': 'Premium chest waders with H2No 4-layer waterproof/breathable fabric. Features reinforced knees, gravel guards, and stocking foot design.',
                'price': 449.00,
                'originalPrice': 649.00,
                'brand': 'Patagonia',
                'category': 'Fishing',
                'gender': 'Men',
                'size': 'Large',
                'color': 'Forge Grey',
                'condition': 'Very Good',
                'material': 'H2No 4-Layer Fabric',
                'tags': ['chest waders', 'breathable', 'reinforced', 'stocking foot'],
                'status': 'pending',
                'sellerId': 'fly_fishing_outfitter',
                'sellerName': 'Angler\'s Paradise',
                'sellerEmail': 'fish@anglersparadise.com',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1464822759844-d150ad6d1ccf?w=800&h=600&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1445020556993-2b4ac8027ac3?w=800&h=600&fit=crop&q=80'
                ]
            },
            
            # Running & Fitness
            {
                'title': 'Garmin Forerunner 255 GPS Running Watch',
                'description': 'Advanced GPS running watch with training metrics, recovery advisor, and up to 14-day battery life. Features multi-band GPS and running power.',
                'price': 279.00,
                'originalPrice': 349.99,
                'brand': 'Garmin',
                'category': 'Electronics',
                'gender': 'Unisex',
                'size': '45.6mm',
                'color': 'Tidal Blue',
                'condition': 'Excellent',
                'material': 'Fiber-reinforced Polymer',
                'tags': ['running watch', 'gps', 'training metrics', 'long battery'],
                'status': 'pending',
                'sellerId': 'running_coach_pro',
                'sellerName': 'Marathon Training Co',
                'sellerEmail': 'coach@marathontraining.com',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1434494878577-86c23bcb06b9?w=800&h=600&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&h=600&fit=crop&q=80'
                ]
            },
            {
                'title': 'Hoka Clifton 9 Running Shoes - Women\'s',
                'description': 'Lightweight daily trainer with maximum cushioning. Features early stage Meta-Rocker technology and engineered mesh upper for breathability.',
                'price': 95.00,
                'originalPrice': 139.95,
                'brand': 'Hoka',
                'category': 'Footwear',
                'gender': 'Women',
                'size': '8.5',
                'color': 'Dazzling Blue',
                'condition': 'Good',
                'material': 'Engineered Mesh, EVA Midsole',
                'tags': ['running shoes', 'maximum cushion', 'daily trainer'],
                'status': 'pending',
                'sellerId': 'running_store_pro',
                'sellerName': 'Fleet Feet Running',
                'sellerEmail': 'run@fleetfeet.com',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=800&h=600&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=800&h=600&fit=crop&q=80'
                ]
            },
            
            # Yoga & Fitness
            {
                'title': 'Manduka PRO Yoga Mat 6mm',
                'description': 'Professional-grade yoga mat with superior cushioning and grip. Features closed-cell construction and lifetime guarantee. Non-toxic and emissions-tested.',
                'price': 89.00,
                'originalPrice': 128.00,
                'brand': 'Manduka',
                'category': 'Fitness',
                'gender': 'Unisex',
                'size': '71" x 24" x 6mm',
                'color': 'Black',
                'condition': 'Very Good',
                'material': 'PVC-free, Non-toxic',
                'tags': ['yoga mat', 'professional grade', 'lifetime guarantee'],
                'status': 'pending',
                'sellerId': 'yoga_instructor_pro',
                'sellerName': 'Zen Yoga Studio',
                'sellerEmail': 'zen@yogastudio.com',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1506629905607-5b9e4b1d7440?w=800&h=600&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800&h=600&fit=crop&q=80'
                ]
            },
            
            # Travel & Luggage
            {
                'title': 'Patagonia Black Hole Duffel 55L',
                'description': 'Weather-resistant duffel bag made from recycled polyester ripstop. Features removable padded shoulder straps and multiple carry options.',
                'price': 89.00,
                'originalPrice': 129.00,
                'brand': 'Patagonia',
                'category': 'Travel Gear',
                'gender': 'Unisex',
                'size': '55L',
                'color': 'Classic Navy',
                'condition': 'Very Good',
                'material': 'Recycled Polyester Ripstop',
                'tags': ['duffel bag', 'weather resistant', 'travel', 'recycled'],
                'status': 'pending',
                'sellerId': 'adventure_traveler',
                'sellerName': 'Global Adventure Gear',
                'sellerEmail': 'travel@adventuregear.com',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&h=600&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1622260614927-9cd71154b3a2?w=800&h=600&fit=crop&q=80'
                ]
            },
            
            # Additional Premium Electronics
            {
                'title': 'Suunto 9 Peak Pro GPS Sports Watch',
                'description': 'Ultra-durable GPS sports watch with sapphire crystal glass and grade 5 titanium bezel. Features 170+ sport modes and up to 300 hours battery life.',
                'price': 459.00,
                'originalPrice': 649.00,
                'brand': 'Suunto',
                'category': 'Electronics',
                'gender': 'Unisex',
                'size': '43mm',
                'color': 'All Black',
                'condition': 'Excellent',
                'material': 'Grade 5 Titanium, Sapphire Crystal',
                'tags': ['gps watch', 'ultra durable', 'long battery', '170 sports'],
                'status': 'pending',
                'sellerId': 'endurance_athlete_pro',
                'sellerName': 'Ultra Endurance Gear',
                'sellerEmail': 'ultra@endurancegear.com',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1434494878577-86c23bcb06b9?w=800&h=600&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1510017098667-27dfc7150c83?w=800&h=600&fit=crop&q=80'
                ]
            },
            
            # Accessories & Gear
            {
                'title': 'Yeti Rambler 20oz Tumbler with MagSlider Lid',
                'description': 'Double-wall vacuum insulated tumbler with MagSlider Lid. Keeps drinks cold for hours and hot drinks hot. Dishwasher safe.',
                'price': 25.00,
                'originalPrice': 35.00,
                'brand': 'Yeti',
                'category': 'Accessories',
                'gender': 'Unisex',
                'size': '20oz',
                'color': 'Navy',
                'condition': 'Very Good',
                'material': '18/8 Stainless Steel',
                'tags': ['insulated tumbler', 'vacuum sealed', 'magslider'],
                'status': 'pending',
                'sellerId': 'gear_accessories_pro',
                'sellerName': 'Premium Accessories Co',
                'sellerEmail': 'accessories@premiumgear.com',
                'isTestData': True,
                'images': [
                    'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=800&h=600&fit=crop&q=80',
                    'https://images.unsplash.com/photo-1506629905607-5b9e4b1d7440?w=800&h=600&fit=crop&q=80'
                ]
            }
        ]
        
        created_items = []
        for item_data in test_items:
            # Add common fields
            item_data.update({
                'createdAt': datetime.now(timezone.utc),
                'lastUpdated': datetime.now(timezone.utc),
                'views': 0,
                'isTestData': True  # Flag to identify test data
            })
            
            # Add to Firestore
            doc_ref = db.collection('items').add(item_data)
            created_items.append({
                'id': doc_ref[1].id,
                'title': item_data['title'],
                'brand': item_data['brand'],
                'category': item_data['category']
            })
        
        # Log admin action
        db.collection('adminActions').add({
            'adminId': admin_user_id,
            'action': 'test_data_generated',
            'details': f'Generated {len(created_items)} diverse test items across multiple categories',
            'timestamp': datetime.now(timezone.utc),
            'itemCount': len(created_items)
        })
        
        logger.info(f"Successfully generated {len(created_items)} test items")
        
        return {
            "success": True,
            "message": f"Successfully generated {len(created_items)} diverse test items across multiple categories",
            "itemCount": len(created_items),
            "items": created_items
        }
        
    except Exception as e:
        logger.error(f"Error generating test data: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.post("/api/admin/remove-test-data")
async def remove_test_data(request: Request):
    """Admin endpoint to remove all test data"""
    try:
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = auth_header.split("Bearer ")[1]
        decoded_token = auth.verify_id_token(token)
        admin_user_id = decoded_token['uid']
        
        # Verify admin status
        admin_doc = db.collection('users').document(admin_user_id).get()
        if not admin_doc.exists or not admin_doc.to_dict().get('isAdmin', False):
            raise HTTPException(status_code=403, detail="Admin access required")
        
        logger.info(f"Admin {admin_user_id} removing test data")
        
        # Find all test data items
        items_ref = db.collection('items')
        test_items_query = items_ref.where('isTestData', '==', True)
        test_items = test_items_query.stream()
        
        deleted_items = []
        deleted_count = 0
        
        for doc in test_items:
            item_data = doc.to_dict()
            deleted_items.append({
                'id': doc.id,
                'title': item_data.get('title', 'Unknown'),
                'brand': item_data.get('brand', 'Unknown Brand')
            })
            
            # Delete the document
            doc.reference.delete()
            deleted_count += 1
        
        # Log admin action
        db.collection('adminActions').add({
            'adminId': admin_user_id,
            'action': 'test_data_removed',
            'details': f'Removed {deleted_count} test items',
            'timestamp': datetime.now(timezone.utc),
            'itemCount': deleted_count
        })
        
        logger.info(f"Successfully removed {deleted_count} test items")
        
        return {
            "success": True,
            "message": f"Successfully removed {deleted_count} test items",
            "deletedCount": deleted_count,
            "deletedItems": deleted_items
        }
        
    except Exception as e:
        logger.error(f"Error removing test data: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.post("/api/admin/clear-all-data")
async def clear_all_data(request: Request):
    """Admin endpoint to clear all data with password protection"""
    try:
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = auth_header.split("Bearer ")[1]
        decoded_token = auth.verify_id_token(token)
        admin_user_id = decoded_token['uid']
        
        # Verify admin status
        admin_doc = db.collection('users').document(admin_user_id).get()
        if not admin_doc.exists or not admin_doc.to_dict().get('isAdmin', False):
            raise HTTPException(status_code=403, detail="Admin access required")
        
        data = await request.json()
        password = data.get('password', '')
        
        # Password protection
        if password != '123':
            raise HTTPException(status_code=401, detail="Invalid password")
        
        logger.warning(f"Admin {admin_user_id} initiated CLEAR ALL DATA operation")
        
        # Collections to clear (excluding critical admin data)
        collections_to_clear = [
            'items',
            'payments',
            'refunds',
            'adminActions',
            'action_logs',
            'storeCreditTransactions'
        ]
        
        cleared_summary = {}
        total_deleted = 0
        
        for collection_name in collections_to_clear:
            try:
                collection_ref = db.collection(collection_name)
                docs = collection_ref.stream()
                
                deleted_count = 0
                for doc in docs:
                    doc.reference.delete()
                    deleted_count += 1
                
                cleared_summary[collection_name] = deleted_count
                total_deleted += deleted_count
                
                logger.info(f"Cleared {deleted_count} documents from {collection_name}")
                
            except Exception as collection_error:
                logger.error(f"Error clearing collection {collection_name}: {collection_error}")
                cleared_summary[collection_name] = f"Error: {str(collection_error)}"
        
        # Log this critical action (after clearing, so it's the first entry)
        db.collection('adminActions').add({
            'adminId': admin_user_id,
            'action': 'clear_all_data',
            'details': f'CLEARED ALL DATA - Total documents deleted: {total_deleted}',
            'timestamp': datetime.now(timezone.utc),
            'summary': cleared_summary,
            'severity': 'CRITICAL'
        })
        
        logger.warning(f"Successfully cleared {total_deleted} total documents across {len(collections_to_clear)} collections")
        
        return {
            "success": True,
            "message": f"Successfully cleared all data - {total_deleted} documents deleted",
            "totalDeleted": total_deleted,
            "summary": cleared_summary,
            "warning": "This action cannot be undone"
        }
        
    except Exception as e:
        logger.error(f"Error clearing all data: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.delete("/api/user/remove-item/{item_id}")
async def remove_user_item(item_id: str, request: Request):
    """User endpoint to remove their own pending item"""
    try:
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = auth_header.split("Bearer ")[1]
        decoded_token = auth.verify_id_token(token)
        user_id = decoded_token['uid']
        
        # Get the item to verify ownership and status
        item_doc = db.collection('items').document(item_id).get()
        if not item_doc.exists:
            raise HTTPException(status_code=404, detail="Item not found")
        
        item_data = item_doc.to_dict()
        
        # Verify the user owns this item
        if item_data.get('sellerId') != user_id:
            raise HTTPException(status_code=403, detail="You can only remove your own items")
        
        # Only allow removing pending items
        if item_data.get('status') != 'pending':
            raise HTTPException(status_code=400, detail="Only pending items can be removed")
        
        # Delete the item
        db.collection('items').document(item_id).delete()
        
        # Log the action
        db.collection('action_logs').add({
            'userId': user_id,
            'action': 'item_removed',
            'details': f"User removed their pending item: {item_data.get('title', 'Unknown')}",
            'timestamp': datetime.now(timezone.utc),
            'userAgent': request.headers.get('user-agent', ''),
            'ip': request.client.host,
            'itemTitle': item_data.get('title')
        })
        
        return {"success": True, "message": "Item removed successfully"}
        
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.put("/api/user/update-item/{item_id}")
async def update_user_item(item_id: str, request: Request):
    """User endpoint to update their own pending item"""
    try:
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = auth_header.split("Bearer ")[1]
        decoded_token = auth.verify_id_token(token)
        user_id = decoded_token['uid']
        
        # Get the item to verify ownership and status
        item_doc = db.collection('items').document(item_id).get()
        if not item_doc.exists:
            raise HTTPException(status_code=404, detail="Item not found")
        
        item_data = item_doc.to_dict()
        
        # Verify the user owns this item
        if item_data.get('sellerId') != user_id:
            raise HTTPException(status_code=403, detail="You can only update your own items")
        
        # Only allow updating pending items
        if item_data.get('status') != 'pending':
            raise HTTPException(status_code=400, detail="Only pending items can be updated")
        
        # Get update data
        update_data = await request.json()
        
        # Validate required fields
        if not update_data.get('title') or not update_data.get('description'):
            raise HTTPException(status_code=400, detail="Title and description are required")
        
        try:
            price = float(update_data.get('price', 0))
            if price <= 0:
                raise HTTPException(status_code=400, detail="Price must be greater than 0")
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid price format")
        
        # Prepare update fields (only allow certain fields to be updated)
        allowed_fields = {
            'title': update_data.get('title').strip(),
            'description': update_data.get('description').strip(),
            'price': price,
            'updatedAt': datetime.now(timezone.utc)
        }
        
        # Add optional fields if provided
        optional_fields = ['category', 'gender', 'size', 'brand', 'condition', 'material']
        for field in optional_fields:
            if field in update_data and update_data[field]:
                allowed_fields[field] = update_data[field].strip() if isinstance(update_data[field], str) else update_data[field]
        
        # Update the item
        db.collection('items').document(item_id).update(allowed_fields)
        
        # Log the action
        db.collection('action_logs').add({
            'userId': user_id,
            'action': 'item_updated',
            'details': f"User updated their pending item: {allowed_fields['title']}",
            'timestamp': datetime.now(timezone.utc),
            'userAgent': request.headers.get('user-agent', ''),
            'ip': request.client.host,
            'itemTitle': allowed_fields['title']
        })
        
        return {"success": True, "message": "Item updated successfully"}
        
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.post("/api/admin/issue-refund")
async def issue_refund(request: Request):
    """Admin endpoint to issue a refund for a sold item"""
    try:
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = auth_header.split("Bearer ")[1]
        decoded_token = auth.verify_id_token(token)
        admin_user_id = decoded_token['uid']
        
        # Verify admin status
        admin_doc = db.collection('users').document(admin_user_id).get()
        if not admin_doc.exists or not admin_doc.to_dict().get('isAdmin', False):
            raise HTTPException(status_code=403, detail="Admin access required")
        
        data = await request.json()
        item_id = data.get('itemId')
        refund_reason = data.get('refundReason', 'No reason provided')
        refund_password = data.get('refundPassword', '')
        
        if not item_id:
            raise HTTPException(status_code=400, detail="Missing itemId")
        
        if not refund_reason.strip():
            raise HTTPException(status_code=400, detail="Refund reason is required")
        
        # Optional password validation for extra security
        # You can add additional validation here if needed
        
        logger.info(f"Admin {admin_user_id} processing refund for item {item_id}")
        
        # Get the item to verify it's sold and get details
        item_ref = db.collection('items').document(item_id)
        item_doc = item_ref.get()
        if not item_doc.exists:
            raise HTTPException(status_code=404, detail="Item not found")
        
        item_data = item_doc.to_dict()
        
        # Verify the item is sold
        if item_data.get('status') != 'sold':
            raise HTTPException(status_code=400, detail="Only sold items can be refunded")
        
        # Create refund record
        refund_data = {
            'itemId': item_id,
            'itemTitle': item_data.get('title', 'Unknown Item'),
            'originalPrice': item_data.get('price', 0),
            'soldPrice': item_data.get('soldPrice') or item_data.get('price', 0),
            'refundAmount': item_data.get('soldPrice') or item_data.get('price', 0),
            'refundReason': refund_reason.strip(),
            'processedBy': admin_user_id,
            'processedAt': datetime.now(timezone.utc),
            'originalBuyerId': item_data.get('buyerId', ''),
            'originalBuyerName': item_data.get('buyerName') or item_data.get('buyerInfo', {}).get('name', 'Unknown Buyer'),
            'originalBuyerEmail': item_data.get('buyerEmail') or item_data.get('buyerInfo', {}).get('email', ''),
            'sellerName': item_data.get('sellerName', 'Unknown Seller'),
            'sellerId': item_data.get('sellerId', 'unknown_seller'),
            'saleType': item_data.get('saleType', 'unknown'),
            'adminNotes': f'Refund processed by admin. Reason: {refund_reason.strip()}'
        }
        
        # Add refund record to Firebase
        db.collection('refunds').add(refund_data)
        
        # CREATE STORE CREDIT for the buyer
        buyer_id = item_data.get('buyerId')
        buyer_email = item_data.get('buyerEmail') or item_data.get('buyerInfo', {}).get('email', '')
        refund_amount = refund_data['refundAmount']
        
        if buyer_id and refund_amount > 0:
            # Update buyer's store credit
            buyer_ref = db.collection('users').document(buyer_id)
            buyer_doc = buyer_ref.get()
            
            if buyer_doc.exists:
                current_store_credit = buyer_doc.to_dict().get('storeCredit', 0)
                new_store_credit = current_store_credit + refund_amount
                buyer_ref.update({'storeCredit': new_store_credit})
                
                # Create store credit transaction record
                store_credit_data = {
                    'userId': buyer_id,
                    'userName': refund_data['originalBuyerName'],
                    'userEmail': buyer_email,
                    'amount': refund_amount,
                    'type': 'refund',
                    'description': f'Refund for "{item_data.get("title", "Unknown Item")}" - {refund_reason.strip()}',
                    'createdAt': datetime.now(timezone.utc),
                    'relatedItemId': item_id,
                    'refundReason': refund_reason.strip(),
                    'processedBy': admin_user_id
                }
                db.collection('storeCredit').add(store_credit_data)
                
                logger.info(f"Added ${refund_amount} store credit to user {buyer_id}")
        
        # Update item status back to PENDING and clear sale information
        item_ref.update({
            'status': 'pending',  # Changed from 'approved' to 'pending'
            'soldAt': None,
            'soldPrice': None,
            'buyerId': None,
            'buyerName': None,
            'buyerEmail': None,
            'buyerInfo': None,
            'saleType': None,
            'paymentStatus': None,
            'trackingNumber': None,
            'shippedAt': None,
            'shippingStatus': None,
            'refundedAt': datetime.now(timezone.utc),
            'refundReason': refund_reason.strip(),
            'returnedToShop': True,  # Flag to indicate item was returned
            'lastUpdated': datetime.now(timezone.utc)
        })
        
        # NOTIFY SELLER about item return
        seller_id = item_data.get('sellerId')
        if seller_id:
            seller_notification = {
                'userId': seller_id,
                'type': 'item_returned',
                'title': 'Item Returned to Shop',
                'message': f'Your item "{item_data.get("title", "Unknown")}" has been returned to the shop due to a refund.',
                'details': f'Reason: {refund_reason.strip()}',
                'itemId': item_id,
                'itemTitle': item_data.get('title', 'Unknown'),
                'createdAt': datetime.now(timezone.utc),
                'read': False,
                'priority': 'high'
            }
            db.collection('notifications').add(seller_notification)
        
        # Log admin action with enhanced details
        admin_action = {
            'adminId': admin_user_id,
            'action': 'item_refunded',
            'details': f'Issued refund for "{item_data.get("title", "Unknown")}" - Reason: {refund_reason.strip()}. Item returned to pending status.',
            'itemId': item_id,
            'refundAmount': refund_data['refundAmount'],
            'buyerId': buyer_id,
            'sellerId': seller_id,
            'storeCreditAdded': refund_amount if buyer_id else 0,
            'timestamp': datetime.now(timezone.utc)
        }
        db.collection('adminActions').add(admin_action)
        
        logger.info(f"Successfully processed refund for item {item_id} - ${refund_amount} store credit added to buyer {buyer_id}")
        
        return {
            "success": True,
            "message": "Refund processed successfully - item returned to pending status and store credit issued",
            "itemId": item_id,
            "refundAmount": refund_data['refundAmount'],
            "storeCreditAdded": refund_amount if buyer_id else 0,
            "buyerNotified": bool(buyer_id),
            "sellerNotified": bool(seller_id),
            "itemStatus": "pending",
            "processedAt": datetime.now(timezone.utc).isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error processing refund: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.get("/api/user/store-credit")
async def get_user_store_credit(request: Request):
    """Get store credit balance and transaction history for authenticated user"""
    try:
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = auth_header.split("Bearer ")[1]
        decoded_token = auth.verify_id_token(token)
        user_id = decoded_token['uid']
        user_email = decoded_token.get('email', '')
        
        logger.info(f"Getting store credit for user {user_id} ({user_email})")
        
        # Get user's current store credit balance
        user_doc = db.collection('users').document(user_id).get()
        current_balance = 0
        if user_doc.exists:
            current_balance = user_doc.to_dict().get('storeCredit', 0)
        
        # Get store credit transaction history
        transactions = []
        try:
            # Use simple query without ordering to avoid index requirement  
            transactions_query = db.collection('store_credits').where('userId', '==', user_id).get()
            
            for transaction_doc in transactions_query:
                transaction_data = transaction_doc.to_dict()
                transactions.append({
                    'id': transaction_doc.id,
                    'amount': transaction_data.get('amount', 0),
                    'type': transaction_data.get('type', 'unknown'),
                    'description': transaction_data.get('description', 'No description'),
                    'createdAt': transaction_data.get('createdAt'),
                    'relatedItemId': transaction_data.get('relatedItemId'),
                    'refundReason': transaction_data.get('refundReason')
                })
                
            # Sort in Python instead of Firestore to avoid index requirement
            transactions.sort(key=lambda x: x.get('createdAt', datetime.min.replace(tzinfo=timezone.utc)) or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
            
        except Exception as e:
            logger.warning(f"Error fetching store credit transactions: {e}")
            # Continue with empty transactions list if query fails
            transactions = []
        
        logger.info(f"Found ${current_balance} store credit balance and {len(transactions)} transactions for user {user_email}")
        
        return {
            "success": True,
            "currentBalance": current_balance,
            "transactions": transactions,
            "totalTransactions": len(transactions)
        }
        
    except Exception as e:
        logger.error(f"Error getting user store credit: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.get("/api/user/purchases")
async def get_user_purchases(request: Request):
    """Get purchase history for authenticated user"""
    try:
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = auth_header.split("Bearer ")[1]
        decoded_token = auth.verify_id_token(token)
        user_id = decoded_token['uid']
        user_email = decoded_token.get('email', '')
        
        logger.info(f"Getting purchases for user {user_id} ({user_email})")
        
        # Get orders where the user is the buyer (by user ID or email)
        orders = []
        
        # Query by user ID
        orders_by_id = db.collection('orders').where('userId', '==', user_id).get()
        for order_doc in orders_by_id:
            order_data = order_doc.to_dict()
            orders.append({
                'orderId': order_data.get('orderId'),
                'transactionId': order_data.get('transactionId'),
                'items': order_data.get('items', []),
                'totalAmount': order_data.get('totalAmount'),
                'fulfillmentMethod': order_data.get('fulfillmentMethod'),
                'paymentMethod': order_data.get('paymentMethod'),
                'status': order_data.get('status'),
                'orderStatus': order_data.get('orderStatus'),
                'createdAt': order_data.get('createdAt'),
                'customerInfo': order_data.get('customerInfo'),
                'estimatedDelivery': order_data.get('estimatedDelivery'),
                'trackingNumber': order_data.get('trackingNumber')
            })
        
        # Also query by email in customer info
        orders_by_email = db.collection('orders').where('customerInfo.email', '==', user_email).get()
        for order_doc in orders_by_email:
            order_data = order_doc.to_dict()
            # Check if we already have this order to avoid duplicates
            existing_order = next((o for o in orders if o['orderId'] == order_data.get('orderId')), None)
            if not existing_order:
                orders.append({
                    'orderId': order_data.get('orderId'),
                    'transactionId': order_data.get('transactionId'),
                    'items': order_data.get('items', []),
                    'totalAmount': order_data.get('totalAmount'),
                    'fulfillmentMethod': order_data.get('fulfillmentMethod'),
                    'paymentMethod': order_data.get('paymentMethod'),
                    'status': order_data.get('status'),
                    'orderStatus': order_data.get('orderStatus'),
                    'createdAt': order_data.get('createdAt'),
                    'customerInfo': order_data.get('customerInfo'),
                    'estimatedDelivery': order_data.get('estimatedDelivery'),
                    'trackingNumber': order_data.get('trackingNumber')
                })
        
        # Sort by creation date (newest first)
        orders.sort(key=lambda x: x.get('createdAt', datetime.min.replace(tzinfo=timezone.utc)), reverse=True)
        
        logger.info(f"Found {len(orders)} orders for user {user_email}")
        
        return {
            "success": True,
            "orders": orders,
            "totalOrders": len(orders)
        }
        
    except Exception as e:
        logger.error(f"Error getting user purchases: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.post("/api/admin/create-sample-data")
async def create_sample_data(request: Request):
    """Admin endpoint to create sample data for Mary's mosquito magnet hat purchase"""
    try:
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = auth_header.split("Bearer ")[1]
        decoded_token = auth.verify_id_token(token)
        admin_user_id = decoded_token['uid']
        
        # Verify admin status
        admin_doc = db.collection('users').document(admin_user_id).get()
        if not admin_doc.exists or not admin_doc.to_dict().get('isAdmin', False):
            raise HTTPException(status_code=403, detail="Admin access required")
        
        logger.info(f"Admin {admin_user_id} creating sample data for Mary's purchase")
        
        # Create the mosquito magnet hat item
        item_id = "mosquito-magnet-hat-001"
        order_id = "ORD-1735432123-MARY"
        transaction_id = "TXN-1735432123-MARY"
        mary_user_id = "mary_pittmancasa_user_id"
        
        # Create the item in sold status
        item_data = {
            'title': 'Outdoor Research Bug Out Mosquito Magnet Hat',
            'description': 'Premium bug-proof hat with built-in mosquito net. Perfect for hiking, camping, and outdoor activities. Lightweight and breathable fabric with durable construction.',
            'brand': 'Outdoor Research',
            'category': 'Headwear',
            'size': 'One Size',
            'color': 'Khaki',
            'condition': 'New',
            'price': 32.95,
            'originalPrice': 45.00,
            'sellerId': 'outdoor_gear_expert_001',
            'sellerName': 'Outdoor Gear Expert',
            'sellerEmail': 'gear.expert@outdoorstore.com',
            'sellerPhone': '555-0123',
            'gender': 'Unisex',
            'material': 'Ripstop Nylon',
            'images': [
                'https://images.unsplash.com/photo-1544725176-7c40e5a71c5e?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
                'https://images.unsplash.com/photo-1578662996442-48f60103fc96?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
            ],
            'status': 'sold',
            'createdAt': datetime.now(timezone.utc) - timedelta(days=5),
            'liveAt': datetime.now(timezone.utc) - timedelta(days=4),
            'soldAt': datetime.now(timezone.utc) - timedelta(days=1),
            'soldPrice': 32.95,
            'buyerId': mary_user_id,
            'buyerInfo': {
                'name': 'Mary Pittman',
                'email': 'mary.pittmancasa@gmail.com',
                'phone': '555-0199',
                'address': '123 Main Street',
                'city': 'Anytown',
                'zip_code': '12345'
            },
            'saleTransactionId': transaction_id,
            'saleType': 'online',
            'fulfillmentMethod': 'shipping',
            'trackingNumber': 'TRK1735432123001',
            'shippingLabelGenerated': True,
            'shippedAt': datetime.now(timezone.utc) - timedelta(hours=12),
            'userEarnings': 26.36,
            'adminEarnings': 6.59,
            'lastUpdated': datetime.now(timezone.utc),
            'orderNumber': order_id,
            'paymentMethod': 'Credit Card',
            'estimatedDelivery': datetime.now(timezone.utc) + timedelta(days=2),
            'isTestData': False
        }
        
        # Create/update the item
        item_ref = db.collection('items').document(item_id)
        item_ref.set(item_data)
        
        # Create the order record
        order_data = {
            'orderId': order_id,
            'userId': mary_user_id,
            'customerInfo': {
                'name': 'Mary Pittman',
                'email': 'mary.pittmancasa@gmail.com',
                'phone': '555-0199',
                'address': '123 Main Street',
                'city': 'Anytown',
                'zip_code': '12345'
            },
            'items': [{
                'item_id': item_id,
                'title': 'Outdoor Research Bug Out Mosquito Magnet Hat',
                'price': 32.95,
                'quantity': 1,
                'seller_id': 'outdoor_gear_expert_001',
                'seller_name': 'Outdoor Gear Expert'
            }],
            'totalAmount': 38.94,  # Item + shipping
            'fulfillmentMethod': 'shipping',
            'paymentMethod': 'Credit Card',
            'transactionId': transaction_id,
            'status': 'completed',
            'orderStatus': 'shipped',
            'createdAt': datetime.now(timezone.utc) - timedelta(days=1),
            'estimatedDelivery': datetime.now(timezone.utc) + timedelta(days=2),
            'trackingNumber': 'TRK1735432123001',
            'shippedAt': datetime.now(timezone.utc) - timedelta(hours=12),
            'shippingCost': 5.99
        }
        
        # Create/update the order
        order_ref = db.collection('orders').document(order_id)
        order_ref.set(order_data)
        
        # Create the sales record
        sales_data = {
            'itemId': item_id,
            'itemTitle': 'Outdoor Research Bug Out Mosquito Magnet Hat',
            'itemCategory': 'Headwear',
            'itemBrand': 'Outdoor Research',
            'itemSize': 'One Size',
            'sellerId': 'outdoor_gear_expert_001',
            'sellerName': 'Outdoor Gear Expert',
            'buyerId': mary_user_id,
            'buyerName': 'Mary Pittman',
            'buyerEmail': 'mary.pittmancasa@gmail.com',
            'salePrice': 32.95,
            'sellerEarnings': 26.36,
            'storeCommission': 6.59,
            'soldAt': datetime.now(timezone.utc) - timedelta(days=1),
            'transactionId': transaction_id,
            'orderNumber': order_id,
            'paymentMethod': 'Credit Card',
            'fulfillmentMethod': 'shipping',
            'saleType': 'online',
            'shippingAddress': order_data['customerInfo'],
            'trackingNumber': 'TRK1735432123001',
            'shippedAt': datetime.now(timezone.utc) - timedelta(hours=12)
        }
        
        # Create the sales record
        sales_ref = db.collection('sales').document()
        sales_ref.set(sales_data)
        
        # Log admin action
        admin_action = {
            'adminId': admin_user_id,
            'action': 'sample_data_created',
            'details': f'Created mosquito magnet hat purchase for Mary Pittman (mary.pittmancasa@gmail.com)',
            'itemId': item_id,
            'orderId': order_id,
            'timestamp': datetime.now(timezone.utc)
        }
        db.collection('adminActions').add(admin_action)
        
        logger.info(f"Successfully created sample data for Mary's mosquito magnet hat purchase")
        
        return {
            "success": True,
            "message": "Sample data created successfully",
            "itemId": item_id,
            "orderId": order_id,
            "transactionId": transaction_id,
            "customerEmail": "mary.pittmancasa@gmail.com",
            "details": {
                "item": "Outdoor Research Bug Out Mosquito Magnet Hat",
                "price": 32.95,
                "shippingCost": 5.99,
                "totalAmount": 38.94,
                "trackingNumber": "TRK1735432123001",
                "status": "shipped"
            }
        }
        
    except Exception as e:
        logger.error(f"Error creating sample data: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.get("/api/admin/search-customers")
async def search_customers(q: str, admin_data: dict = Depends(verify_admin_access)):
    """Search for customers by email or phone number for POS system"""
    try:
        logger.info(f"🔍 Searching customers with query: '{q}'")
        
        if not q or len(q.strip()) < 3:
            return {
                "success": True,
                "customers": [],
                "message": "Query too short, minimum 3 characters required"
            }
        
        search_query = q.strip().lower()
        customers = []
        
        # Search in Firebase Auth users
        try:
            # Get all users from Firebase Auth (this is a paginated API)
            page = auth.list_users()
            
            while page:
                for user in page.users:
                    # Check if email or phone matches search query
                    email_match = user.email and search_query in user.email.lower()
                    phone_match = user.phone_number and search_query in user.phone_number
                    
                    if email_match or phone_match:
                        customers.append({
                            'uid': user.uid,
                            'email': user.email,
                            'phoneNumber': user.phone_number,
                            'displayName': user.display_name,
                            'createdAt': user.user_metadata.creation_timestamp if user.user_metadata else None,
                            'lastSignIn': user.user_metadata.last_sign_in_timestamp if user.user_metadata else None,
                            'emailVerified': user.email_verified,
                            'disabled': user.disabled
                        })
                
                # Get next page
                page = page.get_next_page() if page.has_next_page else None
                
        except Exception as e:
            logger.warning(f"Failed to search Firebase Auth users: {e}")
        
        # Also search in the users collection in Firestore
        try:
            users_ref = db.collection('users')
            users = users_ref.stream()
            
            for user_doc in users:
                user_data = user_doc.to_dict()
                user_data['uid'] = user_doc.id
                
                email_match = user_data.get('email') and search_query in user_data.get('email', '').lower()
                phone_match = user_data.get('phoneNumber') and search_query in user_data.get('phoneNumber', '')
                
                if email_match or phone_match:
                    # Check if already added from Firebase Auth
                    if not any(c['uid'] == user_data['uid'] for c in customers):
                        customers.append({
                            'uid': user_data['uid'],
                            'email': user_data.get('email'),
                            'phoneNumber': user_data.get('phoneNumber'),
                            'displayName': user_data.get('displayName') or user_data.get('email'),
                            'createdAt': user_data.get('createdAt'),
                            'isAdmin': user_data.get('isAdmin', False),
                            'storeCredit': user_data.get('storeCredit', 0)
                        })
                        
        except Exception as e:
            logger.warning(f"Failed to search Firestore users: {e}")
        
        logger.info(f"✅ Found {len(customers)} customers matching query '{q}'")
        
        return {
            "success": True,
            "customers": customers[:10],  # Limit to 10 results
            "total_found": len(customers),
            "query": q
        }
        
    except Exception as e:
        logger.error(f"❌ Customer search failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to search customers: {str(e)}"
        )

@app.get("/api/admin/debug-barcodes")
async def debug_barcodes(admin_data: dict = Depends(verify_admin_access)):
    """Debug endpoint to check items with barcodes"""
    try:
        logger.info("🔍 Debug: Fetching all items with barcode data...")
        
        # Get all items (or recent ones)
        items_ref = db.collection('items').limit(20).stream()
        items_with_barcodes = []
        items_without_barcodes = []
        
        for doc in items_ref:
            item = doc.to_dict()
            item['id'] = doc.id
            
            barcode_data = item.get('barcodeData')
            if barcode_data:
                items_with_barcodes.append({
                    'id': item['id'],
                    'title': item.get('title', 'Unknown'),
                    'barcodeData': barcode_data,
                    'status': item.get('status', 'Unknown'),
                    'createdAt': item.get('createdAt', 'Unknown')
                })
            else:
                items_without_barcodes.append({
                    'id': item['id'],
                    'title': item.get('title', 'Unknown'),
                    'status': item.get('status', 'Unknown'),
                    'createdAt': item.get('createdAt', 'Unknown')
                })
        
        return {
            "success": True,
            "message": f"Found {len(items_with_barcodes)} items with barcodes, {len(items_without_barcodes)} without",
            "items_with_barcodes": items_with_barcodes,
            "items_without_barcodes": items_without_barcodes,
            "total_checked": len(items_with_barcodes) + len(items_without_barcodes)
        }
        
    except Exception as e:
        logger.error(f"❌ Error in debug endpoint: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Debug failed: {str(e)}"
        )

@app.get("/api/admin/lookup-item-by-barcode/{barcode_data}")
async def lookup_item_by_barcode(barcode_data: str, admin_data: dict = Depends(verify_admin_access)):
    """Lookup item by barcode data for POS system"""
    try:
        logger.info(f"🔍 Looking up item by barcode: '{barcode_data}' (length: {len(barcode_data)})")
        
        # Debug: Check recent items with barcodes
        logger.info("🔍 Checking recent items with barcodes...")
        recent_items = db.collection('items').where('status', 'in', ['approved', 'live']).limit(10).stream()
        recent_count = 0
        
        for doc in recent_items:
            item = doc.to_dict()
            recent_count += 1
            barcode = item.get('barcodeData', 'NO_BARCODE')
            logger.info(f"  📊 Item {recent_count}: {item.get('title', 'Unknown')[:30]}... | Barcode: {barcode} | Status: {item.get('status')}")
            
            # Check if this matches our search (case-insensitive)
            if barcode.lower() == barcode_data.lower():
                logger.info(f"  ✅ MATCH FOUND (case-insensitive): {barcode}")
        
        logger.info(f"🔍 Found {recent_count} recent approved/live items to check")
        
        # Query items collection for the barcode (exact match)
        items_ref = db.collection('items')
        query = items_ref.where('barcodeData', '==', barcode_data).limit(1)
        docs = query.stream()
        
        item_data = None
        for doc in docs:
            item_data = doc.to_dict()
            item_data['id'] = doc.id
            logger.info(f"✅ Exact match found: {item_data.get('title')} | Status: {item_data.get('status')}")
            break
        
        # If no exact match, try case-insensitive search
        if not item_data:
            logger.info(f"🔍 No exact match, trying case-insensitive search...")
            all_items_query = items_ref.where('status', 'in', ['approved', 'live']).stream()
            
            for doc in all_items_query:
                item = doc.to_dict()
                stored_barcode = item.get('barcodeData', '')
                if stored_barcode.lower() == barcode_data.lower():
                    item_data = item
                    item_data['id'] = doc.id
                    logger.info(f"✅ Case-insensitive match found: {stored_barcode} -> {item_data.get('title')}")
                    break
        
        if not item_data:
            logger.warning(f"❌ No item found with barcode: {barcode_data}")
            
            # Enhanced debug info
            logger.info("🔍 Debug: Searching for any items with similar barcodes...")
            similar_query = items_ref.stream()
            similar_count = 0
            
            for doc in similar_query:
                item = doc.to_dict()
                stored_barcode = item.get('barcodeData', '')
                if stored_barcode and barcode_data.lower() in stored_barcode.lower():
                    similar_count += 1
                    logger.info(f"  📋 Similar: {stored_barcode} | {item.get('title', 'Unknown')[:30]}...")
                    if similar_count >= 5:  # Limit output
                        break
            
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No item found with barcode: {barcode_data}. Checked {recent_count} recent items."
            )
        
        # Check if item is available for sale
        if item_data.get('status') not in ['approved', 'live']:
            logger.warning(f"Item found but not available: {item_data.get('status')}")
            return {
                "success": False,
                "message": f"Item '{item_data.get('title', 'Unknown')}' is not available for sale (Status: {item_data.get('status', 'Unknown')})",
                "item": item_data,
                "available": False
            }
        
        logger.info(f"✅ Found available item: {item_data.get('title')} - ${item_data.get('price')}")
        
        return {
            "success": True,
            "message": "Item found and available",
            "item": item_data,
            "available": True
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error looking up item by barcode: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to lookup item: {str(e)}"
        )

@app.post("/api/admin/process-inhouse-sale")
async def process_inhouse_sale(request: Request, admin_data: dict = Depends(verify_admin_access)):
    """Process in-house POS sale"""
    try:
        logger.info("=== PROCESSING IN-HOUSE POS SALE ===")
        
        data = await request.json()
        cart_items = data.get('cart_items', [])
        customer_info = data.get('customer_info', {})
        payment_method = data.get('payment_method', 'cash')  # 'cash' or 'card'
        payment_amount = data.get('payment_amount', 0)
        admin_id = admin_data.get('uid')
        
        if not cart_items:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No items in cart"
            )
        
        logger.info(f"Processing {len(cart_items)} items for in-house sale")
        logger.info(f"Payment method: {payment_method}, Amount: ${payment_amount}")
        
        # Validate items and calculate total
        validated_items = []
        total_amount = 0
        
        for cart_item in cart_items:
            item_id = cart_item.get('item_id')
            quantity = cart_item.get('quantity', 1)
            
            # Get current item data
            item_ref = db.collection('items').document(item_id)
            item_doc = item_ref.get()
            
            if not item_doc.exists:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Item {item_id} not found"
                )
            
            item_data = item_doc.to_dict()
            
            # Check availability
            if item_data.get('status') not in ['approved', 'live']:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Item '{item_data.get('title', 'Unknown')}' is not available for sale"
                )
            
            validated_items.append({
                'item_id': item_id,
                'item_data': item_data,
                'quantity': quantity,
                'unit_price': item_data.get('price', 0)
            })
            
            total_amount += item_data.get('price', 0) * quantity
        
        # Validate payment amount
        if abs(payment_amount - total_amount) > 0.01:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Payment amount (${payment_amount}) doesn't match total (${total_amount})"
            )
        
        # Generate transaction identifiers
        order_id = generate_order_number()
        transaction_id = generate_transaction_id()
        sale_timestamp = datetime.now(timezone.utc)
        
        # Process sale in batch transaction
        batch = db.batch()
        
        try:
            for validated_item in validated_items:
                item_id = validated_item['item_id']
                item_data = validated_item['item_data']
                quantity = validated_item['quantity']
                unit_price = validated_item['unit_price']
                earnings = calculate_earnings(unit_price)
                
                # Update item status to sold
                item_ref = db.collection('items').document(item_id)
                batch.update(item_ref, {
                    'status': 'sold',
                    'soldAt': sale_timestamp,
                    'soldPrice': unit_price,
                    'saleType': 'in_house_pos',
                    'paymentMethod': payment_method.title(),
                    'processedBy': admin_id,
                    'buyerInfo': customer_info,
                    'saleTransactionId': transaction_id,
                    'orderNumber': order_id,
                    'sellerEarnings': earnings['seller_earnings'],
                    'storeCommission': earnings['store_commission'],
                    'lastUpdated': sale_timestamp,
                    'fulfillmentMethod': 'in_store_pickup',
                    'posProcessedAt': sale_timestamp
                })
                
                # Create sales record
                sales_ref = db.collection('sales').document()
                batch.set(sales_ref, {
                    'itemId': item_id,
                    'itemTitle': item_data.get('title', 'Unknown'),
                    'itemCategory': item_data.get('category', 'Unknown'),
                    'itemBrand': item_data.get('brand', 'N/A'),
                    'itemSize': item_data.get('size', 'N/A'),
                    'sellerId': item_data.get('sellerId', 'unknown'),
                    'sellerName': item_data.get('sellerName', 'Unknown'),
                    'salePrice': unit_price,
                    'quantity': quantity,
                    'sellerEarnings': earnings['seller_earnings'],
                    'storeCommission': earnings['store_commission'],
                    'soldAt': sale_timestamp,
                    'saleType': 'in_house_pos',
                    'paymentMethod': payment_method.title(),
                    'processedBy': admin_id,
                    'buyerInfo': customer_info,
                    'transactionId': transaction_id,
                    'orderNumber': order_id,
                    'fulfillmentMethod': 'in_store_pickup'
                })
                
                # Create store credit for seller (if applicable)
                seller_id = item_data.get('sellerId')
                if seller_id and not seller_id.startswith('phone_'):
                    credit_ref = db.collection('store_credits').document()
                    batch.set(credit_ref, {
                        'userId': seller_id,
                        'amount': earnings['seller_earnings'],
                        'source': 'item_sale',
                        'itemId': item_id,
                        'itemTitle': item_data.get('title', 'Unknown'),
                        'salePrice': unit_price,
                        'transactionId': transaction_id,
                        'createdAt': sale_timestamp,
                        'description': f"In-house sale of \"{item_data.get('title', 'Unknown')}\""
                    })
            
            # Commit the batch transaction
            batch.commit()
            logger.info(f"Successfully processed in-house sale: {order_id}")
            
            # Log admin action
            admin_action = {
                'adminId': admin_id,
                'action': 'pos_sale_processed',
                'details': f'Processed in-house sale of {len(validated_items)} items for ${total_amount}',
                'orderNumber': order_id,
                'transactionId': transaction_id,
                'paymentMethod': payment_method,
                'totalAmount': total_amount,
                'timestamp': sale_timestamp,
                'itemCount': len(validated_items)
            }
            db.collection('adminActions').add(admin_action)
            
            return {
                "success": True,
                "message": "In-house sale processed successfully",
                "order_id": order_id,
                "transaction_id": transaction_id,
                "total_amount": total_amount,
                "payment_method": payment_method,
                "items_count": len(validated_items),
                "processed_at": sale_timestamp.isoformat(),
                "receipt_data": {
                    "order_number": order_id,
                    "transaction_id": transaction_id,
                    "items": [
                        {
                            "title": item['item_data'].get('title', 'Unknown'),
                            "price": item['unit_price'],
                            "quantity": item['quantity'],
                            "total": item['unit_price'] * item['quantity']
                        }
                        for item in validated_items
                    ],
                    "total_amount": total_amount,
                    "payment_method": payment_method.title(),
                    "processed_by": admin_data.get('name', 'Admin'),
                    "timestamp": sale_timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                    "customer_info": customer_info
                }
            }
            
        except Exception as e:
            logger.error(f"Failed to commit batch transaction: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to process sale: {str(e)}"
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in in-house sale processing: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Sale processing failed: {str(e)}"
        )

# Rewards system endpoints
@app.get("/api/admin/rewards-config")
async def get_rewards_config(admin_data: dict = Depends(verify_admin_access)):
    """Get current rewards configuration"""
    try:
        config_doc = db.collection('system').document('rewards_config').get()
        if config_doc.exists:
            config_data = config_doc.to_dict()
            # Convert timestamps to datetime objects for consistent handling
            if 'lastUpdated' in config_data:
                config_data['lastUpdated'] = config_data['lastUpdated']
            
            return {
                "success": True,
                "config": config_data
            }
        else:
            # Return default configuration
            default_config = {
                "pointsPerDollarSpent": 1,
                "refundPointsPercentage": 50,
                "pointValueInUSD": 0.01,
                "minimumRedemptionPoints": 100,
                "bonusPointsMultiplier": 1.5,
                "welcomeBonusPoints": 100,
                "lastUpdated": datetime.now(timezone.utc),
                "updatedBy": "system"
            }
            
            # Save default config
            db.collection('system').document('rewards_config').set(default_config)
            
            return {
                "success": True,
                "config": default_config
            }
    except Exception as e:
        logger.error(f"Error fetching rewards config: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch rewards configuration: {str(e)}"
        )

@app.post("/api/admin/update-rewards-config")
async def update_rewards_config(request: Request, admin_data: dict = Depends(verify_admin_access)):
    """Update rewards configuration"""
    try:
        config_data = await request.json()
        
        # Add metadata
        config_data['lastUpdated'] = datetime.now(timezone.utc)
        config_data['updatedBy'] = admin_data.get('email', admin_data.get('uid'))
        
        # Validate required fields
        required_fields = ['pointsPerDollarSpent', 'refundPointsPercentage', 'pointValueInUSD', 'minimumRedemptionPoints']
        for field in required_fields:
            if field not in config_data:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Missing required field: {field}"
                )
        
        # Validate ranges
        if config_data['pointsPerDollarSpent'] <= 0 or config_data['pointsPerDollarSpent'] > 10:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Points per dollar must be between 0.1 and 10"
            )
        
        if config_data['pointValueInUSD'] <= 0 or config_data['pointValueInUSD'] > 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Point value must be between 0.001 and 1"
            )
        
        # Save to database
        db.collection('system').document('rewards_config').set(config_data)
        
        logger.info(f"Rewards configuration updated by {admin_data.get('email')}")
        
        return {
            "success": True,
            "message": "Rewards configuration updated successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating rewards config: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update rewards configuration: {str(e)}"
        )

@app.get("/api/admin/rewards-analytics")
async def get_rewards_analytics(admin_data: dict = Depends(verify_admin_access)):
    """Get rewards analytics data"""
    try:
        # Get all users with rewards data
        users_ref = db.collection('users')
        users_docs = users_ref.stream()
        
        users_data = []
        total_points = 0
        
        for user_doc in users_docs:
            user_data = user_doc.to_dict()
            user_id = user_doc.id
            
            # Get user's rewards info
            rewards_info = user_data.get('rewards', {})
            total_user_points = rewards_info.get('totalPoints', 0)
            total_earned = rewards_info.get('totalEarned', 0)
            total_redeemed = rewards_info.get('totalRedeemed', 0)
            
            # Get user's total spending
            total_spent = 0
            try:
                orders_ref = db.collection('orders').where('userId', '==', user_id)
                orders_docs = orders_ref.stream()
                for order_doc in orders_docs:
                    order_data = order_doc.to_dict()
                    total_spent += order_data.get('total_amount', 0)
            except:
                pass
            
            # Add to users data if they have any rewards activity
            if total_user_points > 0 or total_earned > 0 or total_redeemed > 0:
                users_data.append({
                    'uid': user_id,
                    'email': user_data.get('email', ''),
                    'displayName': user_data.get('displayName', user_data.get('email', 'Unknown')),
                    'totalPoints': total_user_points,
                    'totalSpent': total_spent,
                    'totalEarned': total_earned,
                    'totalRedeemed': total_redeemed,
                    'lastActivity': user_data.get('lastActivity', datetime.now(timezone.utc)),
                    'joinDate': user_data.get('createdAt', datetime.now(timezone.utc))
                })
                
                total_points += total_user_points
        
        # Get rewards config for calculations
        config_doc = db.collection('system').document('rewards_config').get()
        point_value = 0.01  # Default
        if config_doc.exists:
            config_data = config_doc.to_dict()
            point_value = config_data.get('pointValueInUSD', 0.01)
        
        return {
            "success": True,
            "users": users_data,
            "totalPoints": total_points,
            "totalValue": total_points * point_value
        }
        
    except Exception as e:
        logger.error(f"Error fetching rewards analytics: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch rewards analytics: {str(e)}"
        )

@app.post("/api/admin/adjust-user-points")
async def adjust_user_points(request: Request, admin_data: dict = Depends(verify_admin_access)):
    """Adjust user's rewards points"""
    try:
        data = await request.json()
        user_id = data.get('userId')
        points_adjustment = data.get('pointsAdjustment', 0)
        reason = data.get('reason', 'Admin adjustment')
        
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User ID is required"
            )
        
        # Get user document
        user_ref = db.collection('users').document(user_id)
        user_doc = user_ref.get()
        
        if not user_doc.exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        user_data = user_doc.to_dict()
        rewards_info = user_data.get('rewards', {
            'totalPoints': 0,
            'totalEarned': 0,
            'totalRedeemed': 0,
            'history': []
        })
        
        # Calculate new balance
        current_points = rewards_info.get('totalPoints', 0)
        new_balance = max(0, current_points + points_adjustment)  # Don't allow negative points
        
        # Update rewards info
        rewards_info['totalPoints'] = new_balance
        if points_adjustment > 0:
            rewards_info['totalEarned'] = rewards_info.get('totalEarned', 0) + points_adjustment
        
        # Add to history
        history_entry = {
            'type': 'admin_adjustment',
            'points': points_adjustment,
            'reason': reason,
            'timestamp': datetime.now(timezone.utc),
            'adminUser': admin_data.get('email', admin_data.get('uid')),
            'balanceAfter': new_balance
        }
        
        if 'history' not in rewards_info:
            rewards_info['history'] = []
        rewards_info['history'].append(history_entry)
        
        # Update user document
        user_ref.update({'rewards': rewards_info})
        
        logger.info(f"Points adjusted for user {user_id}: {points_adjustment} points, reason: {reason}")
        
        return {
            "success": True,
            "message": f"Successfully adjusted user points by {points_adjustment}",
            "newBalance": new_balance
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adjusting user points: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to adjust user points: {str(e)}"
        )

@app.post("/api/user/redeem-points")
async def redeem_rewards_points(request: Request, user_data: dict = Depends(verify_firebase_token)):
    """Allow user to redeem points for store credit"""
    try:
        data = await request.json()
        points_to_redeem = data.get('pointsToRedeem', 0)
        
        if points_to_redeem <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Points to redeem must be greater than 0"
            )
        
        user_id = user_data.get('uid')
        
        # Get rewards config
        config_doc = db.collection('system').document('rewards_config').get()
        if not config_doc.exists:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Rewards configuration not found"
            )
        
        config_data = config_doc.to_dict()
        point_value = config_data.get('pointValueInUSD', 0.01)
        min_redemption = config_data.get('minimumRedemptionPoints', 100)
        
        if points_to_redeem < min_redemption:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Minimum redemption is {min_redemption} points"
            )
        
        # Get user document
        user_ref = db.collection('users').document(user_id)
        user_doc = user_ref.get()
        
        if not user_doc.exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        user_doc_data = user_doc.to_dict()
        rewards_info = user_doc_data.get('rewards', {'totalPoints': 0})
        current_points = rewards_info.get('totalPoints', 0)
        
        if current_points < points_to_redeem:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Insufficient points for redemption"
            )
        
        # Calculate USD value
        usd_value = points_to_redeem * point_value
        
        # Update points balance
        new_points_balance = current_points - points_to_redeem
        rewards_info['totalPoints'] = new_points_balance
        rewards_info['totalRedeemed'] = rewards_info.get('totalRedeemed', 0) + points_to_redeem
        
        # Add to history
        history_entry = {
            'type': 'redemption',
            'points': -points_to_redeem,
            'usdValue': usd_value,
            'timestamp': datetime.now(timezone.utc),
            'balanceAfter': new_points_balance
        }
        
        if 'history' not in rewards_info:
            rewards_info['history'] = []
        rewards_info['history'].append(history_entry)
        
        # Add store credit
        current_store_credit = user_doc_data.get('storeCredit', 0)
        new_store_credit = current_store_credit + usd_value
        
        # Update user document
        user_ref.update({
            'rewards': rewards_info,
            'storeCredit': new_store_credit
        })
        
        logger.info(f"User {user_id} redeemed {points_to_redeem} points for ${usd_value} store credit")
        
        return {
            "success": True,
            "message": f"Successfully redeemed {points_to_redeem} points for ${usd_value:.2f} store credit",
            "pointsRedeemed": points_to_redeem,
            "usdValue": usd_value,
            "newPointsBalance": new_points_balance,
            "storeCreditAdded": usd_value
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error redeeming points: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to redeem points: {str(e)}"
        )

@app.get("/api/user/rewards-info")
async def get_user_rewards_info(user_data: dict = Depends(verify_firebase_token)):
    """Get user's rewards information"""
    try:
        user_id = user_data.get('uid')
        
        # Get rewards config
        config_doc = db.collection('system').document('rewards_config').get()
        config_data = {}
        if config_doc.exists:
            config_data = config_doc.to_dict()
        
        point_value = config_data.get('pointValueInUSD', 0.01)
        min_redemption = config_data.get('minimumRedemptionPoints', 100)
        
        # Get user document
        user_ref = db.collection('users').document(user_id)
        user_doc = user_ref.get()
        
        rewards_info = {'totalPoints': 0, 'totalEarned': 0, 'totalRedeemed': 0, 'history': []}
        
        if user_doc.exists:
            user_data_doc = user_doc.to_dict()
            rewards_info = user_data_doc.get('rewards', rewards_info)
        
        return {
            "success": True,
            "totalPoints": rewards_info.get('totalPoints', 0),
            "totalEarned": rewards_info.get('totalEarned', 0),
            "totalRedeemed": rewards_info.get('totalRedeemed', 0),
            "pointValue": point_value,
            "minimumRedemption": min_redemption,
            "history": rewards_info.get('history', [])
        }
        
    except Exception as e:
        logger.error(f"Error fetching user rewards info: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch rewards information: {str(e)}"
        )

# Helper function to award points for purchases
def award_purchase_points(user_id: str, purchase_amount: float):
    """Award points to a user based on their purchase amount"""
    try:
        # Get current rewards configuration
        config_doc = db.collection('admin_settings').document('rewards_config').get()
        if config_doc.exists:
            config = config_doc.to_dict()
            points_per_dollar = config.get('pointsPerDollar', 1.0)
        else:
            points_per_dollar = 1.0  # Default: 1 point per dollar
        
        # Calculate points to award
        points_to_award = int(purchase_amount * points_per_dollar)
        
        if points_to_award > 0:
            # Get user's current points
            user_doc = db.collection('users').document(user_id).get()
            if user_doc.exists:
                current_points = user_doc.to_dict().get('rewardsPoints', 0)
                new_total = current_points + points_to_award
                
                # Update user's points
                db.collection('users').document(user_id).update({
                    'rewardsPoints': new_total,
                    'lastPointsUpdate': datetime.now(timezone.utc)
                })
                
                # Create points transaction record
                transaction = {
                    'userId': user_id,
                    'type': 'earned',
                    'points': points_to_award,
                    'description': f'Purchase reward - ${purchase_amount:.2f}',
                    'createdAt': datetime.now(timezone.utc),
                    'orderId': None,  # Could link to order if available
                    'balance_after': new_total
                }
                
                db.collection('rewards_transactions').add(transaction)
                
                logger.info(f"Awarded {points_to_award} points to user {user_id} for ${purchase_amount:.2f} purchase")
                return True
            else:
                logger.warning(f"User {user_id} not found when trying to award points")
                return False
        else:
            logger.info(f"No points awarded - purchase amount too small: ${purchase_amount:.2f}")
            return False
            
    except Exception as e:
        logger.error(f"Error awarding purchase points to user {user_id}: {e}")
        return False

@app.get("/api/admin/orders")
async def get_all_orders(admin_data: dict = Depends(verify_admin_access)):
    """Get all orders with comprehensive details including items, shipping, and payment info"""
    try:
        logger.info("Fetching all orders for admin dashboard")
        
        # First, get all completed transactions/payments
        payments_ref = db.collection('payments')
        payments_docs = payments_ref.get()
        
        orders = []
        
        for payment_doc in payments_docs:
            payment_data = payment_doc.to_dict()
            payment_id = payment_doc.id
            
            # Get the order items from the sold items
            order_items = []
            total_amount = 0
            
            # Look for items that were part of this transaction
            items_ref = db.collection('items')
            
            # Try to find items by transaction_id first
            if 'transaction_id' in payment_data:
                sold_items_query = items_ref.where('transaction_id', '==', payment_data['transaction_id'])
                sold_items_docs = sold_items_query.get()
                
                for item_doc in sold_items_docs:
                    item_data = item_doc.to_dict()
                    order_items.append({
                        'id': item_doc.id,
                        'title': item_data.get('title', 'Unknown Item'),
                        'price': item_data.get('soldPrice', item_data.get('price', 0)),
                        'seller': item_data.get('sellerName', 'Unknown Seller'),
                        'category': item_data.get('category', 'Uncategorized'),
                        'status': item_data.get('status', 'sold'),
                        'shippedAt': item_data.get('shippedAt'),
                        'trackingNumber': item_data.get('trackingNumber')
                    })
                    total_amount += item_data.get('soldPrice', item_data.get('price', 0))
            
            # If no items found by transaction_id, try other methods
            if not order_items and 'order_id' in payment_data:
                sold_items_query = items_ref.where('order_id', '==', payment_data['order_id'])
                sold_items_docs = sold_items_query.get()
                
                for item_doc in sold_items_docs:
                    item_data = item_doc.to_dict()
                    order_items.append({
                        'id': item_doc.id,
                        'title': item_data.get('title', 'Unknown Item'),
                        'price': item_data.get('soldPrice', item_data.get('price', 0)),
                        'seller': item_data.get('sellerName', 'Unknown Seller'),
                        'category': item_data.get('category', 'Uncategorized'),
                        'status': item_data.get('status', 'sold'),
                        'shippedAt': item_data.get('shippedAt'),
                        'trackingNumber': item_data.get('trackingNumber')
                    })
                    total_amount += item_data.get('soldPrice', item_data.get('price', 0))
            
            # If still no items, this might be a payment without properly linked items
            if not order_items:
                # Use payment amount as fallback
                total_amount = payment_data.get('amount', payment_data.get('total_amount', 0))
                order_items = [{
                    'id': 'unknown',
                    'title': 'Order Details Not Available',
                    'price': total_amount,
                    'seller': 'System',
                    'category': 'Payment Record',
                    'status': 'completed'
                }]
            
            # Build order object
            order = {
                'id': payment_id,
                'orderId': payment_data.get('order_id', payment_id),
                'customerName': payment_data.get('customer_name', payment_data.get('customerName', 'Unknown Customer')),
                'customerEmail': payment_data.get('customer_email', payment_data.get('customerEmail', 'No email')),
                'customerPhone': payment_data.get('customer_phone', payment_data.get('customerPhone')),
                'totalAmount': total_amount or payment_data.get('amount', 0),
                'paymentStatus': payment_data.get('status', payment_data.get('payment_status', 'completed')),
                'paymentMethod': payment_data.get('payment_method', payment_data.get('paymentMethod', 'card')),
                'status': 'completed',  # All payments are completed by default
                'items': order_items,
                'createdAt': payment_data.get('created_at', payment_data.get('createdAt', datetime.now(timezone.utc))),
                'shippedAt': None,  # Will be set if any items are shipped
                'trackingNumber': None,
                'shippingAddress': {
                    'address': payment_data.get('shipping_address', payment_data.get('address')),
                    'city': payment_data.get('shipping_city', payment_data.get('city')),
                    'state': payment_data.get('shipping_state', payment_data.get('state')),
                    'zip': payment_data.get('shipping_zip', payment_data.get('zip_code')),
                    'country': payment_data.get('shipping_country', 'US')
                } if payment_data.get('fulfillment_method') == 'shipping' else None,
                'fulfillmentMethod': payment_data.get('fulfillment_method', 'pickup'),
                'notes': payment_data.get('notes', ''),
                'transactionId': payment_data.get('transaction_id', payment_id)
            }
            
            # Check if any items in the order have been shipped
            shipped_items = [item for item in order_items if item.get('shippedAt')]
            if shipped_items:
                # Use the first shipped item's shipping info
                first_shipped = shipped_items[0]
                order['shippedAt'] = first_shipped.get('shippedAt')
                order['trackingNumber'] = first_shipped.get('trackingNumber')
            
            orders.append(order)
        
        # Sort orders by creation date (newest first)
        orders.sort(key=lambda x: x.get('createdAt', datetime.min.replace(tzinfo=timezone.utc)), reverse=True)
        
        # Convert datetime objects to ISO strings for JSON serialization
        for order in orders:
            if isinstance(order.get('createdAt'), datetime):
                order['createdAt'] = order['createdAt'].isoformat()
            if isinstance(order.get('shippedAt'), datetime):
                order['shippedAt'] = order['shippedAt'].isoformat()
            
            # Handle items datetime conversion
            for item in order.get('items', []):
                if isinstance(item.get('shippedAt'), datetime):
                    item['shippedAt'] = item['shippedAt'].isoformat()
        
        logger.info(f"Successfully fetched {len(orders)} orders for admin dashboard")
        
        return orders
        
    except Exception as e:
        logger.error(f"Error fetching orders: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch orders: {str(e)}"
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=PORT,
        log_level="info" if DEBUG else "warning",
        access_log=DEBUG
    ) 