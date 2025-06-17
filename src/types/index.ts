export interface ConsignmentItem {
  id: string;
  title: string;
  description: string;
  price: number;
  images: string[];
  sellerId: string;
  sellerName: string;
  sellerEmail: string;
  status: 'pending' | 'approved' | 'live' | 'sold';
  createdAt: Date;
  approvedAt?: Date;
  liveAt?: Date;
  soldAt?: Date;
  soldPrice?: number;
  buyerId?: string;
  buyerName?: string;
  buyerEmail?: string;
  // New filtering fields
  category?: string;
  gender?: 'Men' | 'Women' | 'Unisex' | '';
  size?: string;
  brand?: string;
  condition?: 'New' | 'Like New' | 'Good' | 'Fair' | '';
  material?: string;
}

export interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  isAdmin?: boolean;
}

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
  totalEarnings: number;
  totalPaid: number;
  outstandingBalance: number;
  activeItems: ConsignmentItem[];
  soldItems: ConsignmentItem[];
  pendingItems: ConsignmentItem[];
  approvedItems: ConsignmentItem[];
}

export interface PaymentRecord {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  amount: number;
  itemsSold: string[]; // Array of item IDs
  paidAt: Date;
  paymentMethod?: string;
  notes?: string;
} 