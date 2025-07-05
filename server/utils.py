"""
Utility Functions for Summit Gear Exchange API

This module contains common utility functions used throughout the application.
"""

import uuid
import time
import logging
from datetime import datetime, timezone
from typing import Dict, Any

logger = logging.getLogger(__name__)


def calculate_earnings(price: float) -> dict:
    """
    Calculate seller and store earnings based on 75/25 split
    
    Args:
        price: Item price
        
    Returns:
        dict: Dictionary containing seller_earnings and store_commission
    """
    seller_earnings = price * 0.75
    store_commission = price * 0.25
    return {
        'seller_earnings': round(seller_earnings, 2),
        'store_commission': round(store_commission, 2)
    }


def generate_order_number() -> str:
    """
    Generate a unique order number
    
    Returns:
        str: Unique order number with timestamp and UUID
    """
    return f"ORD-{int(time.time())}-{str(uuid.uuid4())[:8].upper()}"


def generate_transaction_id() -> str:
    """
    Generate a unique transaction ID
    
    Returns:
        str: Unique transaction ID with timestamp and UUID
    """
    return f"TXN-{int(time.time())}-{str(uuid.uuid4())[:8].upper()}"


def generate_barcode_data() -> str:
    """
    Generate unique barcode data for inventory items
    
    Returns:
        str: Unique barcode string
    """
    timestamp = datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')
    random_suffix = str(uuid.uuid4())[:6].upper()
    return f"CSG{timestamp}{random_suffix}"


def generate_cart_id() -> str:
    """
    Generate a unique cart ID
    
    Returns:
        str: Unique cart ID
    """
    return f"CART-{int(time.time())}-{str(uuid.uuid4())[:8]}"


def normalize_phone_number(phone: str) -> str:
    """
    Normalize phone number format
    
    Args:
        phone: Raw phone number string
        
    Returns:
        str: Normalized phone number
    """
    # Remove all non-digit characters
    digits_only = ''.join(filter(str.isdigit, phone))
    
    # Add country code if missing
    if len(digits_only) == 10:
        digits_only = '1' + digits_only
    
    return digits_only


def validate_email(email: str) -> bool:
    """
    Validate email format
    
    Args:
        email: Email string to validate
        
    Returns:
        bool: True if valid email format
    """
    import re
    pattern = r'^[^@]+@[^@]+\.[^@]+$'
    return bool(re.match(pattern, email))


def format_currency(amount: float) -> str:
    """
    Format amount as currency string
    
    Args:
        amount: Amount to format
        
    Returns:
        str: Formatted currency string
    """
    return f"${amount:.2f}"


def parse_price_string(price_str: str) -> float:
    """
    Parse price string and return float value
    
    Args:
        price_str: Price string (e.g., "$25.99", "25.99", "25")
        
    Returns:
        float: Parsed price value
        
    Raises:
        ValueError: If price cannot be parsed
    """
    import re
    # Remove currency symbols and whitespace
    cleaned = re.sub(r'[^\d.]', '', str(price_str))
    try:
        return float(cleaned)
    except ValueError:
        raise ValueError(f"Cannot parse price: {price_str}")


def sanitize_filename(filename: str) -> str:
    """
    Sanitize filename for safe storage
    
    Args:
        filename: Original filename
        
    Returns:
        str: Sanitized filename
    """
    import re
    # Remove or replace dangerous characters
    sanitized = re.sub(r'[^\w\-_\.]', '_', filename)
    # Remove multiple underscores
    sanitized = re.sub(r'_+', '_', sanitized)
    return sanitized


def generate_slug(text: str) -> str:
    """
    Generate URL-friendly slug from text
    
    Args:
        text: Text to convert to slug
        
    Returns:
        str: URL-friendly slug
    """
    import re
    # Convert to lowercase and replace spaces/special chars with hyphens
    slug = re.sub(r'[^\w\s-]', '', text.lower())
    slug = re.sub(r'[-\s]+', '-', slug)
    return slug.strip('-')


def get_timestamp() -> str:
    """
    Get current timestamp in ISO format
    
    Returns:
        str: Current timestamp in ISO format
    """
    return datetime.now(timezone.utc).isoformat()


def calculate_performance_rating(items_sold: int, total_items: int, earnings: float) -> float:
    """
    Calculate user performance rating
    
    Args:
        items_sold: Number of items sold
        total_items: Total number of items listed
        earnings: Total earnings
        
    Returns:
        float: Performance rating (0.0 to 5.0)
    """
    if total_items == 0:
        return 0.0
    
    # Base rating on sell-through rate
    sell_through_rate = items_sold / total_items
    base_rating = sell_through_rate * 4.0  # Max 4.0 from sell-through
    
    # Bonus points for high earnings
    if earnings > 1000:
        base_rating += 1.0
    elif earnings > 500:
        base_rating += 0.5
    elif earnings > 100:
        base_rating += 0.25
    
    return min(5.0, round(base_rating, 2))


def validate_item_status(status: str) -> bool:
    """
    Validate item status
    
    Args:
        status: Status string to validate
        
    Returns:
        bool: True if valid status
    """
    valid_statuses = {'pending', 'approved', 'live', 'sold', 'rejected', 'archived'}
    return status.lower() in valid_statuses


def format_file_size(size_bytes: int) -> str:
    """
    Format file size in human-readable format
    
    Args:
        size_bytes: Size in bytes
        
    Returns:
        str: Formatted file size
    """
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.1f} TB"


def parse_search_query(query: str) -> Dict[str, Any]:
    """
    Parse search query and extract filters
    
    Args:
        query: Search query string
        
    Returns:
        dict: Parsed search parameters
    """
    import re
    
    result = {
        'text': '',
        'filters': {},
        'tags': []
    }
    
    # Extract filters like "brand:nike" or "price:<50"
    filter_pattern = r'(\w+):([^\s]+)'
    filters = re.findall(filter_pattern, query)
    
    for key, value in filters:
        result['filters'][key] = value
    
    # Extract hashtags
    tag_pattern = r'#(\w+)'
    tags = re.findall(tag_pattern, query)
    result['tags'] = tags
    
    # Remove filters and tags from text
    text = re.sub(filter_pattern, '', query)
    text = re.sub(tag_pattern, '', text)
    result['text'] = ' '.join(text.split())  # Clean up whitespace
    
    return result


def chunk_list(lst: list, chunk_size: int) -> list:
    """
    Split list into chunks of specified size
    
    Args:
        lst: List to chunk
        chunk_size: Size of each chunk
        
    Returns:
        list: List of chunks
    """
    return [lst[i:i + chunk_size] for i in range(0, len(lst), chunk_size)]


def safe_float(value: Any, default: float = 0.0) -> float:
    """
    Safely convert value to float
    
    Args:
        value: Value to convert
        default: Default value if conversion fails
        
    Returns:
        float: Converted value or default
    """
    try:
        return float(value)
    except (ValueError, TypeError):
        return default


def safe_int(value: Any, default: int = 0) -> int:
    """
    Safely convert value to integer
    
    Args:
        value: Value to convert
        default: Default value if conversion fails
        
    Returns:
        int: Converted value or default
    """
    try:
        return int(value)
    except (ValueError, TypeError):
        return default


def generate_item_id() -> str:
    """Generate a unique item ID"""
    return str(uuid.uuid4())


def validate_phone(phone: str) -> bool:
    """Basic phone validation"""
    # Remove common separators and check length
    clean_phone = ''.join(filter(str.isdigit, phone))
    return len(clean_phone) >= 10


def sanitize_string(text: str, max_length: int = 255) -> str:
    """Sanitize string input"""
    if not text:
        return ""
    return text.strip()[:max_length]


def parse_price_range(price_range: str) -> tuple:
    """Parse price range string into min and max values"""
    if not price_range:
        return (0, float('inf'))
    
    if price_range == "500":
        return (500, float('inf'))
    
    try:
        min_price, max_price = map(float, price_range.split('-'))
        return (min_price, max_price)
    except ValueError:
        return (0, float('inf'))


def calculate_points_earned(purchase_amount: float, points_per_dollar: float = 1.0) -> int:
    """Calculate reward points earned from purchase"""
    return int(purchase_amount * points_per_dollar)


def calculate_discount_from_points(points: int, point_value: float = 0.01) -> float:
    """Calculate discount amount from reward points"""
    return round(points * point_value, 2)


def validate_status_transition(current_status: str, new_status: str) -> bool:
    """Validate if status transition is allowed"""
    valid_transitions = {
        'pending': ['approved', 'rejected'],
        'approved': ['live', 'rejected', 'pending'],
        'live': ['sold', 'pending'],
        'sold': [],  # Sold items generally can't change status
        'rejected': ['pending']  # Rejected items can be resubmitted
    }
    
    return new_status in valid_transitions.get(current_status, [])


def format_admin_notes(notes: str, admin_name: str) -> str:
    """Format admin notes with timestamp and admin name"""
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    return f"[{timestamp}] {admin_name}: {notes}" 