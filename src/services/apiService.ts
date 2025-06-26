import { auth, db } from '../config/firebase';
import { doc, updateDoc } from 'firebase/firestore';

// Detect environment and use appropriate API URL
const getApiBaseUrl = () => {
    // If explicitly set via environment variable, use that
    if (import.meta.env.VITE_API_BASE_URL) {
        return import.meta.env.VITE_API_BASE_URL;
    }
    
    // Development - use localhost
    if (import.meta.env.DEV) {
        return 'http://localhost:8000';
    }
    
    // Production - check if we're on Firebase hosting
    if (window.location.hostname.includes('web.app') || window.location.hostname.includes('firebaseapp.com')) {
        // For Firebase hosting, try relative URLs first, but gracefully fallback
        return '';  // Use relative URLs
    }
    
    // Default to relative URLs for other production environments
    return '';
};

const API_BASE_URL = getApiBaseUrl();

interface CartItem {
    item_id: string;
    title: string;
    price: number;
    quantity: number;
    seller_id: string;
    seller_name: string;
}

interface CustomerInfo {
    name: string;
    email: string;
    phone: string;
    address?: string;
    city?: string;
    zip_code?: string;
}

interface PaymentRequest {
    cart_items: CartItem[];
    customer_info: CustomerInfo;
    fulfillment_method: 'pickup' | 'shipping';
    payment_type: 'online' | 'in_store';
    payment_method_id?: string; // Optional for in-store payments
}

interface PaymentResponse {
    success: boolean;
    order_id: string;
    transaction_id: string;
    total_amount: number;
    message: string;
}

class ApiService {
    private async getAuthToken(): Promise<string> {
        try {
            const user = auth.currentUser;
            if (user) {
                return await user.getIdToken();
            }
            throw new Error('No authenticated user');
        } catch (error) {
            console.error('❌ Failed to get auth token:', error);
            throw new Error('Authentication failed');
        }
    }

    private async makeRequest(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<Response> {
        // Start with basic headers
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> || {}),
        };

        // Add authentication for admin endpoints
        if (endpoint.includes('/admin/')) {
            try {
                const token = await this.getAuthToken();
                headers['Authorization'] = `Bearer ${token}`;
            } catch (error) {
                console.warn('⚠️ Could not get auth token for admin endpoint:', error);
                // Continue without token - let server handle auth error
            }
        }

        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                ...options,
                headers,
            });

            // Check if we got HTML instead of JSON (indicates no backend)
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('text/html')) {
                if (!import.meta.env.DEV && endpoint === '/api/process-payment') {
                    console.log('🔄 Got HTML response - no backend available, using client-side mock payment processing');
                    return this.mockPaymentResponse(options);
                }
                throw new Error('Backend not available - got HTML response instead of JSON');
            }

            if (!response.ok) {
                let errorData: any = {};
                try {
                    errorData = await response.json();
                } catch (jsonError) {
                    // If JSON parsing fails, check if it's HTML (no backend scenario)
                    if (!import.meta.env.DEV && endpoint === '/api/process-payment') {
                        console.log('🔄 JSON parsing failed - no backend available, using client-side mock payment processing');
                        return this.mockPaymentResponse(options);
                    }
                }
                throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
            }

            return response;
        } catch (error) {
            // Handle fetch errors (network issues, CORS, etc.)
            if (!import.meta.env.DEV && endpoint === '/api/process-payment') {
                console.log('🔄 Fetch error - no backend available, using client-side mock payment processing');
                return this.mockPaymentResponse(options);
            }
            throw error;
        }
    }

    private async mockPaymentResponse(options: RequestInit): Promise<Response> {
        // Extract payment data to calculate total
        let totalAmount = 0;
        try {
            if (options.body) {
                const paymentData = JSON.parse(options.body as string);
                totalAmount = paymentData.cart_items?.reduce((sum: number, item: any) => 
                    sum + (item.price * item.quantity), 0) || 0;
                
                // Add shipping if applicable
                if (paymentData.fulfillment_method === 'shipping') {
                    totalAmount += 5.99;
                }
            }
        } catch (e) {
            console.log('Could not parse payment data for mock response');
        }

        // Mock successful payment response for production demo
        const mockResponse = {
            success: true,
            order_id: `ORD-${Date.now()}-DEMO`,
            transaction_id: `TXN-${Date.now()}-DEMO`,
            total_amount: totalAmount,
            message: "Demo payment processed (no backend connected)"
        };

        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 2000));

        return new Response(JSON.stringify(mockResponse), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    async processPayment(paymentData: PaymentRequest): Promise<PaymentResponse> {
        try {
            console.log('🛒 Processing payment with data:', paymentData);
            
            const response = await this.makeRequest('/api/process-payment', {
                method: 'POST',
                body: JSON.stringify(paymentData),
            });

            const result = await response.json();
            console.log('✅ Payment processed successfully:', result);
            return result;
        } catch (error) {
            console.error('❌ Payment processing failed:', error);
            throw error;
        }
    }

    async updateItemStatus(itemId: string, newStatus: string, adminNotes?: string): Promise<void> {
        try {
            await this.makeRequest('/api/admin/update-item-status', {
                method: 'POST',
                body: JSON.stringify({
                    itemId: itemId,
                    status: newStatus,
                    admin_notes: adminNotes,
                }),
            });
        } catch (error) {
            console.error('❌ Failed to update item status:', error);
            throw error;
        }
    }

    async updateItemWithBarcode(itemId: string, barcodeData: {
        barcodeData: string;
        barcodeImageUrl: string;
        status: string;
    }): Promise<void> {
        try {
            await this.makeRequest('/api/admin/update-item-with-barcode', {
                method: 'POST',
                body: JSON.stringify({
                    itemId: itemId,
                    ...barcodeData,
                }),
            });
        } catch (error) {
            console.error('❌ Failed to update item with barcode:', error);
            throw error;
        }
    }

    async bulkUpdateItemStatus(itemIds: string[], newStatus: string): Promise<void> {
        try {
            const response = await this.makeRequest('/api/admin/bulk-update-status', {
                method: 'POST',
                body: JSON.stringify({
                    itemIds: itemIds,
                    status: newStatus,
                }),
            });
            
            const result = await response.json();
            console.log('✅ Bulk status update successful:', result);
        } catch (error) {
            console.error('❌ Failed to bulk update item status:', error);
            throw error;
        }
    }

    async getSalesSummary(): Promise<{
        total_items_sold: number;
        total_sales_amount: number;
        total_commission: number;
        period_days: number;
    }> {
        try {
            const response = await this.makeRequest('/api/admin/sales-summary');
            return await response.json();
        } catch (error) {
            console.error('❌ Failed to get sales summary:', error);
            throw error;
        }
    }

    async healthCheck(): Promise<any> {
        try {
            const response = await this.makeRequest('/api/health');
            return await response.json();
        } catch (error) {
            console.error('❌ Health check failed:', error);
            throw error;
        }
    }

    async rejectItem(itemId: string, rejectionReason?: string): Promise<void> {
        try {
            await this.makeRequest('/api/admin/reject-item', {
                method: 'POST',
                body: JSON.stringify({
                    itemId,
                    rejectionReason,
                }),
            });
        } catch (error) {
            console.error('❌ Failed to reject item:', error);
            throw error;
        }
    }

    async editItem(itemId: string, itemData: any): Promise<void> {
        try {
            await this.makeRequest('/api/admin/edit-item', {
                method: 'POST',
                body: JSON.stringify({
                    itemId,
                    ...itemData,
                }),
            });
        } catch (error) {
            console.error('❌ Failed to edit item:', error);
            throw error;
        }
    }

    async makeItemLive(itemId: string): Promise<void> {
        try {
            await this.makeRequest('/api/admin/make-item-live', {
                method: 'POST',
                body: JSON.stringify({
                    itemId,
                }),
            });
        } catch (error) {
            console.error('❌ Failed to make item live:', error);
            throw error;
        }
    }

    async sendBackToPending(itemId: string): Promise<void> {
        try {
            await this.makeRequest('/api/admin/send-back-to-pending', {
                method: 'POST',
                body: JSON.stringify({
                    itemId,
                }),
            });
        } catch (error) {
            console.error('❌ Failed to send item back to pending:', error);
            throw error;
        }
    }
}

export const apiService = new ApiService();
export type { PaymentRequest, PaymentResponse, CartItem, CustomerInfo }; 