import { auth } from '../config/firebase';

const API_BASE_URL = 'http://localhost:8000';

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
        // For development, make simple requests without authentication
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers,
        };

        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers,
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
        }

        return response;
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
                    item_id: itemId,
                    new_status: newStatus,
                    admin_notes: adminNotes,
                }),
            });
        } catch (error) {
            console.error('❌ Failed to update item status:', error);
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
}

export const apiService = new ApiService();
export type { PaymentRequest, PaymentResponse, CartItem, CustomerInfo }; 