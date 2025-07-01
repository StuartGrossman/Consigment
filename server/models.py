from pydantic import BaseModel, Field, field_validator
from typing import List, Optional

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

class RefundRequest(BaseModel):
    order_id: str
    item_ids: List[str] = Field(..., min_items=1)
    reason: str = Field(..., min_length=1)
    refund_amount: float = Field(..., gt=0)

class StoreCredit(BaseModel):
    user_id: str
    amount: float = Field(..., gt=0)
    reason: str = Field(..., min_length=1)
    expires_at: Optional[str] = None

class RewardsConfig(BaseModel):
    points_per_dollar: float = Field(..., gt=0)
    signup_bonus: int = Field(..., ge=0)
    referral_bonus: int = Field(..., ge=0)
    review_bonus: int = Field(..., ge=0)
    min_redemption: int = Field(..., gt=0)
    point_value: float = Field(..., gt=0)  # How much 1 point is worth in dollars

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