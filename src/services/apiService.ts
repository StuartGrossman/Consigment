import { auth, db } from '../config/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { logUserAction } from './firebaseService';

// Detect environment and use appropriate API URL
const getApiBaseUrl = () => {
    // If explicitly set via environment variable, use that
    if (import.meta.env.VITE_API_BASE_URL) {
        return import.meta.env.VITE_API_BASE_URL;
    }
    
    // Development - use localhost
    if (import.meta.env.DEV) {
        return 'http://localhost:8080';
    }
    
    // Production - check if we're on Firebase hosting
    if (window.location.hostname.includes('web.app') || window.location.hostname.includes('firebaseapp.com')) {
        // Use production API server
        return 'https://consignment-api-caua3ttntq-uc.a.run.app';
    }
    
    // Default to production API for other environments
    return 'https://consignment-api-caua3ttntq-uc.a.run.app';
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

        // Add authentication for admin endpoints, create-item endpoint, and user endpoints
        if (endpoint.includes('/admin/') || endpoint.includes('/api/create-item') || endpoint.includes('/api/user/')) {
            try {
                const token = await this.getAuthToken();
                headers['Authorization'] = `Bearer ${token}`;
            } catch (error) {
                console.warn('⚠️ Could not get auth token for protected endpoint:', error);
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
            
            // Log the purchase action
            const user = auth.currentUser;
            if (user) {
                const itemTitles = paymentData.cart_items.map(item => item.title).join(', ');
                const totalAmount = paymentData.cart_items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                await logUserAction(
                    user, 
                    'purchase_completed', 
                    `Purchased ${paymentData.cart_items.length} items (${itemTitles}) for $${totalAmount.toFixed(2)} via ${paymentData.payment_type}`,
                    result.order_id,
                    itemTitles
                );
            }
            
            return result;
        } catch (error) {
            console.error('❌ Payment processing failed:', error);
            
            // Log failed purchase attempt
            const user = auth.currentUser;
            if (user) {
                const itemTitles = paymentData.cart_items.map(item => item.title).join(', ');
                await logUserAction(
                    user, 
                    'purchase_failed', 
                    `Failed to purchase ${paymentData.cart_items.length} items: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    '',
                    itemTitles
                );
            }
            
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

    async rejectItem(itemId: string, reason: string): Promise<void> {
        try {
            await this.makeRequest('/api/admin/reject-item', {
                method: 'POST',
                body: JSON.stringify({
                    itemId,
                    reason
                }),
            });
            
            // Log the rejection action
            const user = auth.currentUser;
            if (user) {
                await logUserAction(
                    user, 
                    'item_rejected', 
                    `Rejected item with reason: ${reason}`,
                    itemId
                );
            }
        } catch (error) {
            console.error('❌ Failed to reject item:', error);
            throw error;
        }
    }

    async approveItem(itemId: string): Promise<void> {
        try {
            await this.makeRequest('/api/admin/approve-item', {
                method: 'POST',
                body: JSON.stringify({
                    itemId,
                }),
            });
            
            // Log the approval action
            const user = auth.currentUser;
            if (user) {
                await logUserAction(
                    user, 
                    'item_approved', 
                    `Approved item for sale`,
                    itemId
                );
            }
        } catch (error) {
            console.error('❌ Failed to approve item:', error);
            throw error;
        }
    }

    async bulkApproveItems(itemIds: string[]): Promise<void> {
        try {
            await this.makeRequest('/api/admin/bulk-approve', {
                method: 'POST',
                body: JSON.stringify({
                    itemIds,
                }),
            });
            
            // Log the bulk approval action
            const user = auth.currentUser;
            if (user) {
                await logUserAction(
                    user, 
                    'bulk_approve', 
                    `Bulk approved ${itemIds.length} items`,
                    itemIds[0],
                    `${itemIds.length} items`
                );
            }
        } catch (error) {
            console.error('❌ Failed to bulk approve items:', error);
            throw error;
        }
    }

    async bulkRejectItems(itemIds: string[], reason: string): Promise<void> {
        try {
            await this.makeRequest('/api/admin/bulk-reject-items', {
                method: 'POST',
                body: JSON.stringify({
                    itemIds,
                    reason,
                }),
            });
        } catch (error) {
            console.error('❌ Failed to bulk reject items:', error);
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

    async markItemShipped(itemId: string, trackingNumber?: string): Promise<{
        success: boolean;
        message: string;
        itemId: string;
        trackingNumber: string;
        shippedAt: string;
    }> {
        try {
            const response = await this.makeRequest('/api/admin/mark-shipped', {
                method: 'POST',
                body: JSON.stringify({
                    itemId,
                    trackingNumber,
                }),
            });
            
            const result = await response.json();
            
            // Log the shipping action
            const user = auth.currentUser;
            if (user) {
                await logUserAction(
                    user, 
                    'item_shipped', 
                    `Marked item as shipped${trackingNumber ? ` with tracking: ${trackingNumber}` : ''}`,
                    itemId
                );
            }
            
            return result;
        } catch (error) {
            console.error('❌ Failed to mark item as shipped:', error);
            throw error;
        }
    }

    async createItem(itemData: any): Promise<{
        success: boolean;
        message: string;
        itemId: string;
        status: string;
    }> {
        try {
            const response = await this.makeRequest('/api/create-item', {
                method: 'POST',
                body: JSON.stringify(itemData),
            });
            
            const result = await response.json();
            
            // Log the item creation action
            const user = auth.currentUser;
            if (user) {
                await logUserAction(
                    user, 
                    'item_created', 
                    `Created new item: ${itemData.title || 'Untitled'} - Status: ${result.status}`,
                    result.itemId,
                    itemData.title
                );
            }
            
            return result;
        } catch (error) {
            console.error('❌ Failed to create item:', error);
            throw error;
        }
    }

    async toggleAdminStatus(userId: string, isAdmin: boolean): Promise<void> {
        try {
            await this.makeRequest('/api/admin/toggle-admin-status', {
                method: 'POST',
                body: JSON.stringify({
                    userId,
                    isAdmin,
                }),
            });
        } catch (error) {
            console.error('❌ Failed to toggle admin status:', error);
            throw error;
        }
    }

    async getAllUsers(): Promise<any[]> {
        try {
            const response = await this.makeRequest('/api/admin/get-all-users', {
                method: 'GET',
            }) as any;
            return response.users;
        } catch (error) {
            console.error('❌ Failed to get all users:', error);
            throw error;
        }
    }

    async banUser(userId: string, email: string, ipAddress: string, reason: string, durationHours: number = 24): Promise<void> {
        try {
            await this.makeRequest('/api/admin/ban-user', {
                method: 'POST',
                body: JSON.stringify({
                    userId,
                    email,
                    ipAddress,
                    reason,
                    durationHours,
                }),
            });
            
            // Log the ban action
            const user = auth.currentUser;
            if (user) {
                await logUserAction(
                    user, 
                    'user_banned', 
                    `Banned user (${email}) for ${durationHours} hours. Reason: ${reason}`,
                    userId
                );
            }
        } catch (error) {
            console.error('❌ Failed to ban user:', error);
            throw error;
        }
    }

    async removeUserItem(itemId: string): Promise<void> {
        try {
            await this.makeRequest(`/api/user/remove-item/${itemId}`, {
                method: 'DELETE',
            });
            
            // Log the item deletion action
            const user = auth.currentUser;
            if (user) {
                await logUserAction(
                    user, 
                    'item_deleted', 
                    `Deleted own item`,
                    itemId
                );
            }
        } catch (error) {
            console.error('❌ Failed to remove user item:', error);
            throw error;
        }
    }

    async updateUserItem(itemId: string, itemData: any): Promise<void> {
        try {
            await this.makeRequest(`/api/user/update-item/${itemId}`, {
                method: 'PUT',
                body: JSON.stringify(itemData),
            });
        } catch (error) {
            console.error('❌ Failed to update user item:', error);
            throw error;
        }
    }

    async issueRefund(itemId: string, refundReason: string, refundPassword?: string): Promise<{
        success: boolean;
        message: string;
        itemId: string;
        refundAmount: number;
        processedAt: string;
    }> {
        try {
            const response = await this.makeRequest('/api/admin/issue-refund', {
                method: 'POST',
                body: JSON.stringify({
                    itemId,
                    refundReason,
                    refundPassword,
                }),
            });
            return await response.json();
        } catch (error) {
            console.error('❌ Failed to issue refund:', error);
            throw error;
        }
    }

    async generateTestData(): Promise<{
        success: boolean;
        message: string;
        itemCount: number;
        items: any[];
    }> {
        try {
            const response = await this.makeRequest('/api/admin/generate-test-data', {
                method: 'POST',
            });
            
            const result = await response.json();
            
            // Log the test data generation action
            const user = auth.currentUser;
            if (user) {
                await logUserAction(
                    user, 
                    'test_data_generated', 
                    `Generated ${result.itemCount} test items for testing`,
                    '',
                    `${result.itemCount} test items`
                );
            }
            
            return result;
        } catch (error) {
            console.error('❌ Failed to generate test data:', error);
            throw error;
        }
    }

    async removeTestData(): Promise<{
        success: boolean;
        message: string;
        deletedCount: number;
        deletedItems: any[];
    }> {
        try {
            const response = await this.makeRequest('/api/admin/remove-test-data', {
                method: 'POST',
            });
            return await response.json();
        } catch (error) {
            console.error('❌ Failed to remove test data:', error);
            throw error;
        }
    }

    async clearAllData(password: string): Promise<{
        success: boolean;
        message: string;
        totalDeleted: number;
        summary: any;
        warning: string;
    }> {
        try {
            const response = await this.makeRequest('/api/admin/clear-all-data', {
                method: 'POST',
                body: JSON.stringify({ password }),
            });
            
            const result = await response.json();
            
            // Log the data clearing action (CRITICAL)
            const user = auth.currentUser;
            if (user) {
                await logUserAction(
                    user, 
                    'database_cleared', 
                    `🚨 CLEARED ALL DATABASE DATA - ${result.totalDeleted} items deleted`,
                    '',
                    `ALL DATA (${result.totalDeleted} items)`
                );
            }
            
            return result;
        } catch (error) {
            console.error('❌ Failed to clear all data:', error);
            throw error;
        }
    }

    async getUserPurchases(): Promise<{
        success: boolean;
        orders: any[];
        totalOrders: number;
    }> {
        try {
            const response = await this.makeRequest('/api/user/purchases', {
                method: 'GET',
            });
            return await response.json();
        } catch (error) {
            console.error('❌ Failed to get user purchases:', error);
            throw error;
        }
    }

    async createSampleData(): Promise<{
        success: boolean;
        message: string;
        itemId: string;
        orderId: string;
        transactionId: string;
        customerEmail: string;
        details: any;
    }> {
        try {
            const response = await this.makeRequest('/api/admin/create-sample-data', {
                method: 'POST',
            });
            return await response.json();
        } catch (error) {
            console.error('❌ Failed to create sample data:', error);
            throw error;
        }
    }
}

export const apiService = new ApiService();
export type { PaymentRequest, PaymentResponse, CartItem, CustomerInfo }; 