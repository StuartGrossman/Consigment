"""
Error Handling Module

Provides centralized error handling, custom exceptions, and error formatting
for the consignment store API.
"""

from fastapi import HTTPException, Request, status
from fastapi.responses import JSONResponse
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Union
import traceback
import os

logger = logging.getLogger(__name__)

class ConsignmentError(Exception):
    """Base exception class for consignment store errors"""
    
    def __init__(self, message: str, error_code: str = None, details: Dict[str, Any] = None):
        self.message = message
        self.error_code = error_code or "GENERAL_ERROR"
        self.details = details or {}
        super().__init__(self.message)

class ValidationError(ConsignmentError):
    """Raised when data validation fails"""
    
    def __init__(self, message: str, field: str = None, value: Any = None):
        self.field = field
        self.value = value
        details = {}
        if field:
            details['field'] = field
        if value is not None:
            details['value'] = str(value)
        super().__init__(message, "VALIDATION_ERROR", details)

class ItemNotFoundError(ConsignmentError):
    """Raised when an item is not found"""
    
    def __init__(self, item_id: str):
        self.item_id = item_id
        super().__init__(
            f"Item with ID '{item_id}' not found",
            "ITEM_NOT_FOUND",
            {"item_id": item_id}
        )

class UserNotFoundError(ConsignmentError):
    """Raised when a user is not found"""
    
    def __init__(self, user_id: str):
        self.user_id = user_id
        super().__init__(
            f"User with ID '{user_id}' not found",
            "USER_NOT_FOUND",
            {"user_id": user_id}
        )

class InsufficientPermissionsError(ConsignmentError):
    """Raised when user lacks required permissions"""
    
    def __init__(self, required_permission: str = None):
        self.required_permission = required_permission
        message = "Insufficient permissions"
        if required_permission:
            message += f" (requires: {required_permission})"
        super().__init__(
            message,
            "INSUFFICIENT_PERMISSIONS",
            {"required_permission": required_permission}
        )

class ItemUnavailableError(ConsignmentError):
    """Raised when an item is not available for the requested operation"""
    
    def __init__(self, item_id: str, current_status: str, required_status: str = None):
        self.item_id = item_id
        self.current_status = current_status
        self.required_status = required_status
        
        message = f"Item '{item_id}' is not available (status: {current_status})"
        if required_status:
            message += f" (required: {required_status})"
        
        super().__init__(
            message,
            "ITEM_UNAVAILABLE",
            {
                "item_id": item_id,
                "current_status": current_status,
                "required_status": required_status
            }
        )

class PaymentError(ConsignmentError):
    """Raised when payment processing fails"""
    
    def __init__(self, message: str, payment_provider_error: str = None):
        self.payment_provider_error = payment_provider_error
        details = {}
        if payment_provider_error:
            details['provider_error'] = payment_provider_error
        super().__init__(message, "PAYMENT_ERROR", details)

class DatabaseError(ConsignmentError):
    """Raised when database operations fail"""
    
    def __init__(self, message: str, operation: str = None, collection: str = None):
        self.operation = operation
        self.collection = collection
        details = {}
        if operation:
            details['operation'] = operation
        if collection:
            details['collection'] = collection
        super().__init__(message, "DATABASE_ERROR", details)

class BusinessRuleViolationError(ConsignmentError):
    """Raised when business rules are violated"""
    
    def __init__(self, message: str, rule: str = None):
        self.rule = rule
        details = {}
        if rule:
            details['rule'] = rule
        super().__init__(message, "BUSINESS_RULE_VIOLATION", details)

class RateLimitError(ConsignmentError):
    """Raised when rate limits are exceeded"""
    
    def __init__(self, message: str, limit: int = None, window: str = None):
        self.limit = limit
        self.window = window
        details = {}
        if limit:
            details['limit'] = limit
        if window:
            details['window'] = window
        super().__init__(message, "RATE_LIMIT_EXCEEDED", details)

class ErrorHandler:
    """Centralized error handling and logging"""
    
    @staticmethod
    def log_error(error: Exception, context: Dict[str, Any] = None):
        """Log an error with context information"""
        context = context or {}
        
        error_info = {
            'error_type': type(error).__name__,
            'error_message': str(error),
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'context': context
        }
        
        if isinstance(error, ConsignmentError):
            error_info['error_code'] = error.error_code
            error_info['details'] = error.details
        
        # Add stack trace in development
        if os.getenv("ENVIRONMENT", "development") == "development":
            error_info['stack_trace'] = traceback.format_exc()
        
        logger.error(f"Error occurred: {error_info}")
        
        return error_info
    
    @staticmethod
    def format_error_response(error: Exception, request: Request = None) -> Dict[str, Any]:
        """Format an error for API response"""
        timestamp = datetime.now(timezone.utc).isoformat()
        
        if isinstance(error, ConsignmentError):
            return {
                "error": {
                    "code": error.error_code,
                    "message": error.message,
                    "details": error.details,
                    "timestamp": timestamp
                }
            }
        elif isinstance(error, HTTPException):
            return {
                "error": {
                    "code": "HTTP_ERROR",
                    "message": error.detail,
                    "status_code": error.status_code,
                    "timestamp": timestamp
                }
            }
        else:
            # Generic error
            return {
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "An internal error occurred",
                    "timestamp": timestamp
                }
            }
    
    @staticmethod
    def get_http_status_code(error: Exception) -> int:
        """Get appropriate HTTP status code for an error"""
        if isinstance(error, HTTPException):
            return error.status_code
        elif isinstance(error, ValidationError):
            return status.HTTP_400_BAD_REQUEST
        elif isinstance(error, (ItemNotFoundError, UserNotFoundError)):
            return status.HTTP_404_NOT_FOUND
        elif isinstance(error, InsufficientPermissionsError):
            return status.HTTP_403_FORBIDDEN
        elif isinstance(error, ItemUnavailableError):
            return status.HTTP_409_CONFLICT
        elif isinstance(error, PaymentError):
            return status.HTTP_402_PAYMENT_REQUIRED
        elif isinstance(error, BusinessRuleViolationError):
            return status.HTTP_422_UNPROCESSABLE_ENTITY
        elif isinstance(error, RateLimitError):
            return status.HTTP_429_TOO_MANY_REQUESTS
        elif isinstance(error, DatabaseError):
            return status.HTTP_503_SERVICE_UNAVAILABLE
        else:
            return status.HTTP_500_INTERNAL_SERVER_ERROR

# Global exception handler for FastAPI
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Global exception handler for the FastAPI application"""
    
    # Log the error
    context = {
        "method": request.method,
        "url": str(request.url),
        "headers": dict(request.headers),
        "user_agent": request.headers.get("user-agent", "unknown")
    }
    
    ErrorHandler.log_error(exc, context)
    
    # Format error response
    error_response = ErrorHandler.format_error_response(exc, request)
    status_code = ErrorHandler.get_http_status_code(exc)
    
    return JSONResponse(
        status_code=status_code,
        content=error_response
    )

# Validation helpers
class Validators:
    """Common validation functions"""
    
    @staticmethod
    def validate_email(email: str) -> bool:
        """Validate email format"""
        if not email or '@' not in email:
            return False
        parts = email.split('@')
        return len(parts) == 2 and all(part.strip() for part in parts)
    
    @staticmethod
    def validate_phone(phone: str) -> bool:
        """Validate phone number format"""
        if not phone:
            return False
        # Remove common separators
        clean_phone = ''.join(c for c in phone if c.isdigit())
        return len(clean_phone) >= 10
    
    @staticmethod
    def validate_price(price: Union[str, int, float]) -> float:
        """Validate and convert price"""
        try:
            price_float = float(price)
            if price_float <= 0:
                raise ValidationError("Price must be greater than 0", "price", price)
            if price_float > 100000:
                raise ValidationError("Price cannot exceed $100,000", "price", price)
            return round(price_float, 2)
        except (ValueError, TypeError):
            raise ValidationError("Price must be a valid number", "price", price)
    
    @staticmethod
    def validate_item_status(status: str) -> str:
        """Validate item status"""
        valid_statuses = ['pending', 'approved', 'live', 'sold', 'rejected', 'archived']
        if status not in valid_statuses:
            raise ValidationError(
                f"Invalid status. Must be one of: {', '.join(valid_statuses)}",
                "status",
                status
            )
        return status
    
    @staticmethod
    def validate_category(category: str) -> str:
        """Validate item category"""
        valid_categories = [
            'Jackets', 'Pants', 'Shirts', 'Footwear', 'Backpacks',
            'Climbing Gear', 'Sleep Systems', 'Cooking Gear',
            'Base Layers', 'Socks', 'Vests', 'Outerwear', 'Accessories'
        ]
        if category not in valid_categories:
            raise ValidationError(
                f"Invalid category. Must be one of: {', '.join(valid_categories)}",
                "category",
                category
            )
        return category
    
    @staticmethod
    def validate_condition(condition: str) -> str:
        """Validate item condition"""
        valid_conditions = ['New', 'Like New', 'Good', 'Fair']
        if condition not in valid_conditions:
            raise ValidationError(
                f"Invalid condition. Must be one of: {', '.join(valid_conditions)}",
                "condition",
                condition
            )
        return condition

# Decorator for handling common exceptions
def handle_common_exceptions(func):
    """Decorator to handle common exceptions in route handlers"""
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except ConsignmentError:
            # Re-raise our custom exceptions
            raise
        except Exception as e:
            # Convert unexpected exceptions to internal errors
            ErrorHandler.log_error(e)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="An internal error occurred"
            )
    return wrapper

# Context manager for database operations
class DatabaseOperationContext:
    """Context manager for database operations with error handling"""
    
    def __init__(self, operation: str, collection: str = None):
        self.operation = operation
        self.collection = collection
        self.start_time = None
    
    def __enter__(self):
        self.start_time = datetime.now()
        logger.info(f"Starting database operation: {self.operation} on {self.collection}")
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        duration = datetime.now() - self.start_time
        
        if exc_type is None:
            logger.info(f"Database operation completed: {self.operation} on {self.collection} in {duration.total_seconds():.3f}s")
        else:
            logger.error(f"Database operation failed: {self.operation} on {self.collection} after {duration.total_seconds():.3f}s")
            
            # Convert database exceptions to our custom exception
            if exc_type not in [ConsignmentError, HTTPException]:
                raise DatabaseError(
                    f"Database operation failed: {str(exc_val)}",
                    self.operation,
                    self.collection
                ) from exc_val
        
        return False  # Don't suppress exceptions

# Response helpers
class ResponseHelpers:
    """Helper functions for creating consistent API responses"""
    
    @staticmethod
    def success_response(message: str, data: Any = None, status_code: int = 200) -> Dict[str, Any]:
        """Create a success response"""
        response = {
            "success": True,
            "message": message,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        if data is not None:
            response["data"] = data
        
        return response
    
    @staticmethod
    def error_response(message: str, error_code: str = None, details: Dict[str, Any] = None) -> Dict[str, Any]:
        """Create an error response"""
        response = {
            "success": False,
            "message": message,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        if error_code:
            response["error_code"] = error_code
        
        if details:
            response["details"] = details
        
        return response
    
    @staticmethod
    def paginated_response(items: List[Any], total: int, page: int, per_page: int) -> Dict[str, Any]:
        """Create a paginated response"""
        total_pages = (total + per_page - 1) // per_page
        
        return {
            "success": True,
            "data": items,
            "pagination": {
                "total": total,
                "page": page,
                "per_page": per_page,
                "total_pages": total_pages,
                "has_next": page < total_pages,
                "has_prev": page > 1
            },
            "timestamp": datetime.now(timezone.utc).isoformat()
        } 