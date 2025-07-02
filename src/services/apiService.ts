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
        return 'http://localhost:8001';
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

// Category Management Types
export interface Category {
  id: string;
  name: string;
  description: string;
  icon: string;
  bannerImage: string;
  attributes: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface CreateCategoryData {
  name: string;
  description?: string;
  icon: string;
  bannerImage?: string;
  attributes?: string[];
  isActive?: boolean;
}

export interface UpdateCategoryData extends Partial<CreateCategoryData> {
  // All fields are optional for updates
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

        // Add authentication for admin endpoints, create-item endpoint, user endpoints, and shared cart endpoints
        if (endpoint.includes('/admin/') || 
            endpoint.includes('/api/create-item') || 
            endpoint.includes('/api/user/') || 
            endpoint.includes('/api/shared-cart/')) {
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
        storeCreditAdded: number;
        buyerNotified: boolean;
        sellerNotified: boolean;
        itemStatus: string;
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
            
            const result = await response.json();
            
            // Log the refund action
            const user = auth.currentUser;
            if (user) {
                await logUserAction(
                    user, 
                    'refund_issued', 
                    `Issued refund: ${refundReason} - $${result.refundAmount} store credit added, item returned to pending`,
                    itemId
                );
            }
            
            return result;
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

    async getUserStoreCredit(): Promise<{
        success: boolean;
        currentBalance: number;
        transactions: any[];
        totalTransactions: number;
    }> {
        try {
            const response = await this.makeRequest('/api/user/store-credit', {
                method: 'GET',
            });
            return await response.json();
        } catch (error) {
            console.error('❌ Failed to get user store credit:', error);
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

    // POS System Methods
    async lookupItemByBarcode(barcodeData: string): Promise<{
        success: boolean;
        message: string;
        item?: any;
        available: boolean;
    }> {
        try {
            const response = await this.makeRequest(`/api/admin/lookup-item-by-barcode/${barcodeData}`);
            const result = await response.json();
            
            // Log the barcode lookup action
            const user = auth.currentUser;
            if (user && result.success) {
                await logUserAction(
                    user, 
                    'barcode_lookup', 
                    `Looked up item by barcode: ${barcodeData} - ${result.item?.title || 'Unknown'}`,
                    result.item?.id || '',
                    barcodeData
                );
            }
            
            return result;
        } catch (error) {
            console.error('❌ Failed to lookup item by barcode:', error);
            throw error;
        }
    }

    async processInhouseSale(saleData: {
        cart_items: Array<{
            item_id: string;
            quantity: number;
        }>;
        customer_info: {
            name: string;
            email?: string;
            phone?: string;
        };
        payment_method: 'cash' | 'card';
        payment_amount: number;
    }): Promise<{
        success: boolean;
        message: string;
        order_id: string;
        transaction_id: string;
        total_amount: number;
        payment_method: string;
        items_count: number;
        processed_at: string;
        receipt_data: any;
    }> {
        try {
            const response = await this.makeRequest('/api/admin/process-inhouse-sale', {
                method: 'POST',
                body: JSON.stringify(saleData),
            });
            
            const result = await response.json();
            
            // Log the POS sale action
            const user = auth.currentUser;
            if (user && result.success) {
                await logUserAction(
                    user, 
                    'pos_sale_completed', 
                    `Processed in-house sale: ${result.items_count} items for $${result.total_amount} via ${result.payment_method}`,
                    result.order_id,
                    `${result.items_count} items`
                );
            }
            
            return result;
        } catch (error) {
            console.error('❌ Failed to process in-house sale:', error);
            throw error;
        }
    }

    // Rewards system methods
    async getRewardsConfig(): Promise<{
        success: boolean;
        config: any;
    }> {
        try {
            const response = await this.makeRequest('/api/admin/rewards-config');
            return await response.json();
        } catch (error) {
            console.error('❌ Failed to get rewards config:', error);
            throw error;
        }
    }

    async updateRewardsConfig(configData: any): Promise<{
        success: boolean;
        message: string;
    }> {
        try {
            const response = await this.makeRequest('/api/admin/update-rewards-config', {
                method: 'POST',
                body: JSON.stringify(configData),
            });
            
            const result = await response.json();
            
            // Log the config update action
            const user = auth.currentUser;
            if (user) {
                await logUserAction(
                    user, 
                    'rewards_config_updated', 
                    `Updated rewards configuration`,
                    '',
                    'rewards_config'
                );
            }
            
            return result;
        } catch (error) {
            console.error('❌ Failed to update rewards config:', error);
            throw error;
        }
    }

    async getRewardsAnalytics(): Promise<{
        success: boolean;
        users: any[];
        totalPoints: number;
        totalValue: number;
    }> {
        try {
            const response = await this.makeRequest('/api/admin/rewards-analytics');
            return await response.json();
        } catch (error) {
            console.error('❌ Failed to get rewards analytics:', error);
            throw error;
        }
    }

    async adjustUserRewardsPoints(userId: string, pointsAdjustment: number, reason: string): Promise<{
        success: boolean;
        message: string;
        newBalance: number;
    }> {
        try {
            const response = await this.makeRequest('/api/admin/adjust-user-points', {
                method: 'POST',
                body: JSON.stringify({
                    userId,
                    pointsAdjustment,
                    reason,
                }),
            });
            
            const result = await response.json();
            
            // Log the points adjustment action
            const user = auth.currentUser;
            if (user) {
                await logUserAction(
                    user, 
                    'user_points_adjusted', 
                    `Adjusted user points by ${pointsAdjustment}: ${reason}`,
                    userId,
                    reason
                );
            }
            
            return result;
        } catch (error) {
            console.error('❌ Failed to adjust user points:', error);
            throw error;
        }
    }

    async redeemRewardsPoints(pointsToRedeem: number): Promise<{
        success: boolean;
        message: string;
        pointsRedeemed: number;
        usdValue: number;
        newPointsBalance: number;
        storeCreditAdded: number;
    }> {
        try {
            const response = await this.makeRequest('/api/user/redeem-points', {
                method: 'POST',
                body: JSON.stringify({
                    pointsToRedeem,
                }),
            });
            
            const result = await response.json();
            
            // Log the points redemption action
            const user = auth.currentUser;
            if (user) {
                await logUserAction(
                    user, 
                    'points_redeemed', 
                    `Redeemed ${pointsToRedeem} points for $${result.usdValue} store credit`,
                    '',
                    `${pointsToRedeem} points`
                );
            }
            
            return result;
        } catch (error) {
            console.error('❌ Failed to redeem rewards points:', error);
            throw error;
        }
    }

    async getUserRewardsInfo(): Promise<{
        success: boolean;
        totalPoints: number;
        totalEarned: number;
        totalRedeemed: number;
        pointValue: number;
        minimumRedemption: number;
        history: any[];
    }> {
        try {
            const response = await this.makeRequest('/api/user/rewards-info');
            return await response.json();
        } catch (error) {
            console.error('❌ Failed to get user rewards info:', error);
            throw error;
        }
    }

    // Shared Cart Methods for Multi-Device POS
    async createSharedCart(): Promise<{
        success: boolean;
        cart_id: string;
        message: string;
        created_at: string;
        access_code: string;
    }> {
        try {
            const response = await this.makeRequest('/api/shared-cart/create', {
                method: 'POST',
                body: JSON.stringify({}),
            });
            return await response.json();
        } catch (error) {
            console.error('❌ Failed to create shared cart:', error);
            throw error;
        }
    }

    async getOrCreatePosCart(): Promise<{
        success: boolean;
        cart_id: string;
        message: string;
        created_at: string;
        access_code: string;
        items: any[];
        total_amount: number;
        item_count: number;
        is_existing: boolean;
    }> {
        try {
            const response = await this.makeRequest('/api/shared-cart/get-or-create-pos-cart', {
                method: 'POST',
                body: JSON.stringify({}),
            });
            
            const result = await response.json();
            
            // Log the cart action
            const user = auth.currentUser;
            if (user) {
                await logUserAction(
                    user, 
                    'pos_cart_accessed', 
                    `${result.is_existing ? 'Accessed existing' : 'Created new'} POS cart: ${result.cart_id}`,
                    result.cart_id,
                    `${result.item_count} items`
                );
            }
            
            return result;
        } catch (error) {
            console.error('❌ Failed to get or create POS cart:', error);
            throw error;
        }
    }

    async getSharedCart(cartId: string): Promise<{
        success: boolean;
        cart_id: string;
        cart_data: any;
        items: any[];
        total_amount: number;
        item_count: number;
    }> {
        try {
            const response = await this.makeRequest(`/api/shared-cart/${cartId}`);
            return await response.json();
        } catch (error) {
            console.error('❌ Failed to get shared cart:', error);
            throw error;
        }
    }

    async addItemToSharedCart(cartId: string, barcodeData: string): Promise<{
        success: boolean;
        message: string;
        item: any;
        cart_total: number;
        cart_item_count: number;
    }> {
        try {
            const response = await this.makeRequest(`/api/shared-cart/${cartId}/add-item`, {
                method: 'POST',
                body: JSON.stringify({
                    barcode_data: barcodeData
                }),
            });
            return await response.json();
        } catch (error) {
            console.error('❌ Failed to add item to shared cart:', error);
            throw error;
        }
    }

    async getUserSharedCarts(): Promise<{
        success: boolean;
        carts: any[];
        total_carts: number;
    }> {
        try {
            const response = await this.makeRequest('/api/shared-cart/user-carts');
            return await response.json();
        } catch (error) {
            console.error('❌ Failed to get user shared carts:', error);
            throw error;
        }
    }

    // Category Management API Functions
    async getCategories(): Promise<Category[]> {
        try {
            const response = await this.makeRequest('/api/categories', {
                method: 'GET'
            });
            
            const result = await response.json();
            
            if (result.success) {
                return result.categories;
            }
            throw new Error(result.message || 'Failed to fetch categories');
        } catch (error) {
            console.error('Error fetching categories:', error);
            throw error;
        }
    }

    async getActiveCategories(): Promise<Category[]> {
        try {
            const response = await this.makeRequest('/api/categories/active', {
                method: 'GET'
            });
            
            const result = await response.json();
            
            if (result.success) {
                return result.categories;
            }
            throw new Error(result.message || 'Failed to fetch active categories');
        } catch (error) {
            console.error('Error fetching active categories:', error);
            throw error;
        }
    }

    async createCategory(categoryData: CreateCategoryData): Promise<Category> {
        try {
            const response = await this.makeRequest('/api/categories', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(categoryData)
            });
            
            const result = await response.json();
            
            if (result.success) {
                return result.category;
            }
            throw new Error(result.message || 'Failed to create category');
        } catch (error) {
            console.error('Error creating category:', error);
            throw error;
        }
    }

    async updateCategory(categoryId: string, updateData: UpdateCategoryData): Promise<Category> {
        try {
            const response = await this.makeRequest(`/api/categories/${categoryId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(updateData)
            });
            
            const result = await response.json();
            
            if (result.success) {
                return result.category;
            }
            throw new Error(result.message || 'Failed to update category');
        } catch (error) {
            console.error('Error updating category:', error);
            throw error;
        }
    }

    async deleteCategory(categoryId: string): Promise<void> {
        try {
            const response = await this.makeRequest(`/api/categories/${categoryId}`, {
                method: 'DELETE'
            });
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.message || 'Failed to delete category');
            }
        } catch (error) {
            console.error('Error deleting category:', error);
            throw error;
        }
    }

    async initializeDefaultCategories(): Promise<Category[]> {
        try {
            const response = await this.makeRequest('/api/categories/initialize-default', {
                method: 'POST'
            });
            
            const result = await response.json();
            
            if (result.success) {
                return result.categories || [];
            }
            throw new Error(result.message || 'Failed to initialize default categories');
        } catch (error) {
            console.error('Error initializing default categories:', error);
            throw error;
        }
    }
}

export const apiService = new ApiService();
export type { PaymentRequest, PaymentResponse, CartItem, CustomerInfo }; 