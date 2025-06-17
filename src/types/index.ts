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