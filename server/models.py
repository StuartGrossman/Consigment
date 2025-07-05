"""
Pydantic Models for Summit Gear Exchange API

This module contains all the data models used throughout the application.
"""

from pydantic import BaseModel, Field, field_validator
from typing import List, Optional


class CartItem(BaseModel):
    """Cart item model for shopping cart functionality"""
    item_id: str
    title: str
    price: float = Field(..., gt=0)
    quantity: int = Field(..., gt=0)
    seller_id: str
    seller_name: str


class CustomerInfo(BaseModel):
    """Customer information for order processing"""
    name: str = Field(..., min_length=1)
    email: str = Field(..., pattern=r'^[^@]+@[^@]+\.[^@]+$')
    phone: str = Field(..., min_length=10)
    address: Optional[str] = None
    city: Optional[str] = None
    zip_code: Optional[str] = None


class PaymentRequest(BaseModel):
    """Payment request model for processing orders"""
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
    """Payment response model for order completion"""
    success: bool
    order_id: str
    transaction_id: str
    total_amount: float
    message: str


class ItemStatusUpdate(BaseModel):
    """Model for updating item status"""
    item_id: str
    new_status: str = Field(..., pattern='^(pending|approved|live|sold|rejected)$')
    admin_notes: Optional[str] = None


class Message(BaseModel):
    """Message model for communication"""
    content: str = Field(..., min_length=1, description="Message content cannot be empty")
    timestamp: str


class TestResult(BaseModel):
    """Test result model for application testing"""
    test_name: str
    status: str
    duration: float
    error_message: Optional[str] = None


class TestSummary(BaseModel):
    """Test summary model for comprehensive testing reports"""
    total_tests: int
    passed: int
    failed: int
    errors: int
    duration: float
    coverage_percentage: Optional[float] = None
    test_details: List[TestResult]
    timestamp: str


class ConsignmentItem(BaseModel):
    """Consignment item model for inventory management"""
    id: Optional[str] = None
    title: str = Field(..., min_length=1)
    brand: str = Field(..., min_length=1)
    category: str
    size: Optional[str] = None
    color: Optional[str] = None
    condition: str = Field(..., pattern='^(Excellent|Very Good|Good|Fair)$')
    original_price: float = Field(..., gt=0, alias='originalPrice')
    price: float = Field(..., gt=0)
    description: str
    seller_email: str = Field(..., pattern=r'^[^@]+@[^@]+\.[^@]+$', alias='sellerEmail')
    seller_phone: Optional[str] = Field(None, alias='sellerPhone')
    seller_id: str = Field(..., alias='sellerId')
    seller_name: str = Field(..., alias='sellerName')
    gender: Optional[str] = Field(None, pattern='^(Men|Women|Unisex|Kids)$')
    material: Optional[str] = None
    status: str = Field(default='pending', pattern='^(pending|approved|live|sold|rejected|archived)$')
    images: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)


class BulkStatusUpdate(BaseModel):
    """Model for bulk status updates"""
    item_ids: List[str]
    new_status: str = Field(..., pattern='^(pending|approved|live|sold|rejected|archived)$')
    admin_notes: Optional[str] = None


class RefundRequest(BaseModel):
    """Model for refund processing"""
    order_id: str
    item_ids: List[str]
    reason: str = Field(..., min_length=1)
    refund_amount: float = Field(..., gt=0)
    refund_method: str = Field(..., pattern='^(store_credit|original_payment)$')


class RewardsConfig(BaseModel):
    """Model for rewards system configuration"""
    points_per_dollar_spent: float = Field(..., ge=0)
    points_per_dollar_sold: float = Field(..., ge=0)
    redemption_rate: float = Field(..., gt=0)  # points per dollar value
    minimum_redemption_points: int = Field(..., ge=0)
    bonus_multipliers: dict = Field(default_factory=dict)


class UserAnalytics(BaseModel):
    """Model for user analytics data"""
    user_id: str
    total_items_listed: int = 0
    total_items_sold: int = 0
    total_earnings: float = 0.0
    total_purchases: float = 0.0
    average_item_price: float = 0.0
    performance_rating: float = 0.0
    reward_points: int = 0
    store_credit: float = 0.0

class ItemSubmission(BaseModel):
    title: str = Field(..., min_length=1)
    brand: str
    category: str
    size: str
    color: str
    condition: str
    price: float = Field(..., gt=0)
    originalPrice: float = Field(..., gt=0)
    description: str
    material: Optional[str] = None
    gender: str
    sellerEmail: str = Field(..., pattern=r'^[^@]+@[^@]+\.[^@]+$')
    sellerPhone: Optional[str] = None
    images: Optional[List[str]] = None

class ItemApproval(BaseModel):
    item_id: str
    admin_notes: Optional[str] = None
    price_adjustment: Optional[float] = None

class BulkItemUpdate(BaseModel):
    item_ids: List[str] = Field(..., min_items=1)
    new_status: str = Field(..., pattern='^(pending|approved|live|sold|rejected)$')
    admin_notes: Optional[str] = None

class UserBan(BaseModel):
    user_id: str
    reason: str = Field(..., min_length=1)
    duration_days: Optional[int] = None  # None for permanent ban

class StoreCredit(BaseModel):
    user_id: str
    amount: float = Field(..., gt=0)
    reason: str = Field(..., min_length=1)
    expires_at: Optional[str] = None

class PointsAdjustment(BaseModel):
    user_id: str
    points_change: int  # Can be positive or negative
    reason: str = Field(..., min_length=1)

class PointsRedemption(BaseModel):
    points_to_redeem: int = Field(..., gt=0)
    redemption_type: str = Field(..., pattern='^(store_credit|discount)$')

class InHouseSale(BaseModel):
    items: List[CartItem] = Field(..., min_items=1)
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    payment_method: str = Field(..., pattern='^(cash|card|other)$')
    notes: Optional[str] = None 