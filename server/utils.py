import time
import uuid
from datetime import datetime, timezone


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


def generate_barcode_data(index: int = 0) -> str:
    """Generate unique barcode data"""
    return f"CSG{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}{str(index).zfill(3)}"


def generate_item_id() -> str:
    """Generate a unique item ID"""
    return str(uuid.uuid4())


def format_currency(amount: float) -> str:
    """Format amount as currency string"""
    return f"${amount:.2f}"


def validate_email(email: str) -> bool:
    """Basic email validation"""
    import re
    pattern = r'^[^@]+@[^@]+\.[^@]+$'
    return bool(re.match(pattern, email))


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


def get_current_timestamp() -> str:
    """Get current timestamp in ISO format"""
    return datetime.now(timezone.utc).isoformat()


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