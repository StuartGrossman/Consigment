export interface ConsignmentItem {
  id: string;
  title: string;
  description: string;
  price: number;
  images: string[];
  sellerId: string;
  sellerName: string;
  sellerEmail: string;
  status: 'pending' | 'approved' | 'live' | 'sold' | 'archived' | 'rejected';
  createdAt: Date;
  approvedAt?: Date;
  liveAt?: Date;
  soldAt?: Date;
  rejectedAt?: Date;
  rejectionReason?: string;
  category?: string;
  gender?: 'Men' | 'Women' | 'Unisex';
  size?: string;
  brand?: string;
  condition?: 'New' | 'Like New' | 'Good' | 'Fair';
  material?: string;
  color?: string;
  barcode?: string;
  barcodeImageUrl?: string;
  barcodeGeneratedAt?: Date;
  printConfirmedAt?: Date;
  shippedAt?: Date;
  trackingNumber?: string;
  shippingStatus?: 'pending' | 'shipped' | 'delivered';
  soldPrice?: number;
  userEarnings?: number;
  buyerId?: string;
  buyerName?: string;
  buyerEmail?: string;
  paymentId?: string;
  paymentStatus?: 'pending' | 'completed' | 'failed' | 'refunded';
  notes?: string;
  tags?: string[];
  // Sale type tracking
  saleType?: 'in-store' | 'online';
  // Buyer information for sold items
  buyerInfo?: {
    name: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    zipCode: string;
  };
  // Sale transaction details
  saleTransactionId?: string;
  // Fulfillment method for online orders
  fulfillmentMethod?: 'pickup' | 'shipping';
  // Shipping tracking
  shippingLabelGenerated?: boolean;
  deliveredAt?: Date;
  // Earnings split (user gets 75%, admin gets 25%)
  adminEarnings?: number;
  // Archive tracking
  archivedAt?: Date;
  archiveReason?: string;
  // Barcode tracking
  barcodeData?: string;
  discountPercentage?: number; // Percentage discount applied
  discountAppliedAt?: Date; // When discount was applied
  discountReason?: string; // Reason for discount (e.g., "Shelf time over 30 days")
  originalPrice?: number; // Store original price when discount is applied
  // Refund tracking
  refundedAt?: Date; // When item was refunded
  refundReason?: string; // Reason for refund
  returnedToShop?: boolean; // Flag indicating item was returned to shop due to refund
}

export interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  isAdmin?: boolean;
  storeCredit?: number; // Store credit balance
}

// Union type for authentication using Firebase Auth User
export type AuthUser = import('firebase/auth').User;

export interface UploadProgress {
  url: string;
  progress: number;
}

export interface UserAnalytics {
  userId: string;
  userName?: string; // Made optional to handle missing data
  userEmail?: string; // Made optional to handle missing data
  totalItemsListed: number;
  totalItemsSold: number;
  totalEarnings: number; // User's 75% share
  totalPaid: number;
  outstandingBalance: number;
  storeCredit: number; // Current store credit balance
  activeItems: ConsignmentItem[];
  soldItems: ConsignmentItem[];
  pendingItems: ConsignmentItem[];
  approvedItems: ConsignmentItem[];
  archivedItems?: ConsignmentItem[];
}

export interface PaymentRecord {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  amount: number;
  type: 'cash' | 'store_credit'; // Payment type
  itemsSold: string[]; // Array of item IDs
  paidAt: Date;
  paymentMethod?: string;
  notes?: string;
}

export interface StoreCreditTransaction {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  amount: number;
  type: 'earned' | 'added' | 'used'; // How the credit was obtained/used
  description: string;
  createdAt: Date;
  relatedItemId?: string; // If related to a purchase
  relatedPaymentId?: string; // If related to a payment
}

export interface RefundRecord {
  id: string;
  itemId: string;
  itemTitle: string;
  originalPrice: number;
  refundAmount: number;
  reason: string;
  refundedAt: Date;
  refundedBy: string; // admin user ID
  refundedByName: string; // admin display name
  originalBuyerId?: string;
  originalBuyerName?: string;
  sellerName: string;
  sellerId: string;
}

export interface Category {
  id: string;
  name: string;
  description: string;
  icon: string;
  bannerImage: string;
  attributes: any[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
} 