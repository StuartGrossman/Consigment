export interface ConsignmentItem {
  id: string;
  title: string;
  description: string;
  price: number;
  images: string[];
  sellerId: string;
  sellerName: string;
  sellerEmail: string;
  status: 'pending' | 'approved' | 'live' | 'sold' | 'archived';
  createdAt: Date;
  approvedAt?: Date;
  liveAt?: Date;
  soldAt?: Date;
  soldPrice?: number;
  buyerId?: string;
  buyerName?: string;
  buyerEmail?: string;
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
  // Earnings split (user gets 75%, admin gets 25%)
  userEarnings?: number;
  adminEarnings?: number;
  // Archive tracking
  archivedAt?: Date;
  archiveReason?: string;
  // Barcode tracking
  barcodeData?: string;
  barcodeGeneratedAt?: Date;
  printConfirmedAt?: Date;
  // New filtering fields
  category?: string;
  gender?: 'Men' | 'Women' | 'Unisex' | '';
  size?: string;
  brand?: string;
  condition?: 'New' | 'Like New' | 'Good' | 'Fair' | '';
  material?: string;
  color?: string;
}

export interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  isAdmin?: boolean;
  storeCredit?: number; // Store credit balance
}

// Custom user type for phone number authentication
export interface PhoneUser {
  uid: string;
  phoneNumber: string;
  displayName: string;
  email?: string;
  photoURL?: string;
  isPhoneUser: boolean;
}

// Union type for authentication  
export type AuthUser = import('firebase/auth').User | PhoneUser;

export interface UploadProgress {
  url: string;
  progress: number;
}

export interface UserAnalytics {
  userId: string;
  userName: string;
  userEmail: string;
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