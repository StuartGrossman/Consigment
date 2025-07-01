import { useState, useCallback } from 'react';
import { ConsignmentItem } from '../types';

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
    payment_method_id: string;
}

interface PaymentResponse {
    success: boolean;
    order_id: string;
    transaction_id: string;
    total_amount: number;
    message: string;
}

interface PaymentState {
    isProcessing: boolean;
    error: string | null;
    lastOrder: PaymentResponse | null;
}

export const usePaymentProcessing = () => {
    const [paymentState, setPaymentState] = useState<PaymentState>({
        isProcessing: false,
        error: null,
        lastOrder: null
    });

    const calculateTotalAmount = useCallback((cartItems: CartItem[]): number => {
        return cartItems.reduce((total, item) => total + (item.price * item.quantity), 0);
    }, []);

    const calculateEarnings = useCallback((price: number) => {
        const sellerEarnings = price * 0.75;
        const storeCommission = price * 0.25;
        return {
            seller_earnings: Math.round(sellerEarnings * 100) / 100,
            store_commission: Math.round(storeCommission * 100) / 100
        };
    }, []);

    const convertCartToPaymentItems = useCallback((items: ConsignmentItem[]): CartItem[] => {
        return items.map(item => ({
            item_id: item.id,
            title: item.title,
            price: item.price,
            quantity: 1, // Consignment items are typically unique
            seller_id: item.sellerId || 'unknown',
            seller_name: item.sellerName || 'Unknown Seller'
        }));
    }, []);

    const validatePaymentRequest = useCallback((request: PaymentRequest): string | null => {
        if (!request.cart_items || request.cart_items.length === 0) {
            return 'Cart cannot be empty';
        }

        if (!request.customer_info.name || request.customer_info.name.trim().length === 0) {
            return 'Customer name is required';
        }

        if (!request.customer_info.email || !request.customer_info.email.includes('@')) {
            return 'Valid email address is required';
        }

        if (!request.customer_info.phone || request.customer_info.phone.length < 10) {
            return 'Valid phone number is required';
        }

        if (!request.payment_method_id || request.payment_method_id.trim().length === 0) {
            return 'Payment method is required';
        }

        if (request.fulfillment_method !== 'pickup' && request.fulfillment_method !== 'shipping') {
            return 'Fulfillment method must be either pickup or shipping';
        }

        if (request.fulfillment_method === 'shipping') {
            if (!request.customer_info.address || request.customer_info.address.trim().length === 0) {
                return 'Address is required for shipping';
            }
            if (!request.customer_info.city || request.customer_info.city.trim().length === 0) {
                return 'City is required for shipping';
            }
            if (!request.customer_info.zip_code || request.customer_info.zip_code.trim().length === 0) {
                return 'ZIP code is required for shipping';
            }
        }

        return null;
    }, []);

    const processPayment = useCallback(async (paymentRequest: PaymentRequest): Promise<PaymentResponse> => {
        setPaymentState(prev => ({ ...prev, isProcessing: true, error: null }));

        try {
            // Validate request
            const validationError = validatePaymentRequest(paymentRequest);
            if (validationError) {
                throw new Error(validationError);
            }

            // Make API call to process payment
            const response = await fetch('/api/process-payment', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(paymentRequest)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Payment processing failed');
            }

            const paymentResponse: PaymentResponse = await response.json();

            setPaymentState(prev => ({
                ...prev,
                isProcessing: false,
                lastOrder: paymentResponse,
                error: null
            }));

            // Dispatch custom event for successful payment
            window.dispatchEvent(new CustomEvent('itemsUpdated', {
                detail: { 
                    action: 'purchase_completed',
                    order_id: paymentResponse.order_id,
                    items: paymentRequest.cart_items
                }
            }));

            return paymentResponse;

        } catch (error: any) {
            const errorMessage = error.message || 'Payment processing failed';
            setPaymentState(prev => ({
                ...prev,
                isProcessing: false,
                error: errorMessage
            }));
            throw error;
        }
    }, [validatePaymentRequest]);

    const processInHouseSale = useCallback(async (
        items: ConsignmentItem[],
        customerInfo: CustomerInfo,
        paymentMethod: string,
        adminToken: string
    ): Promise<PaymentResponse> => {
        setPaymentState(prev => ({ ...prev, isProcessing: true, error: null }));

        try {
            const saleData = {
                items: items.map(item => ({
                    id: item.id,
                    title: item.title,
                    price: item.price,
                    seller_id: item.sellerId,
                    seller_name: item.sellerName
                })),
                customer_info: customerInfo,
                payment_method: paymentMethod,
                sale_type: 'in_house'
            };

            const response = await fetch('/api/admin/process-inhouse-sale', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken}`
                },
                body: JSON.stringify(saleData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'In-house sale processing failed');
            }

            const saleResponse: PaymentResponse = await response.json();

            setPaymentState(prev => ({
                ...prev,
                isProcessing: false,
                lastOrder: saleResponse,
                error: null
            }));

            return saleResponse;

        } catch (error: any) {
            const errorMessage = error.message || 'In-house sale processing failed';
            setPaymentState(prev => ({
                ...prev,
                isProcessing: false,
                error: errorMessage
            }));
            throw error;
        }
    }, []);

    const issueRefund = useCallback(async (
        orderId: string,
        amount: number,
        reason: string,
        adminToken: string
    ): Promise<{ success: boolean; message: string }> => {
        setPaymentState(prev => ({ ...prev, isProcessing: true, error: null }));

        try {
            const refundData = {
                order_id: orderId,
                refund_amount: amount,
                reason: reason
            };

            const response = await fetch('/api/admin/issue-refund', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken}`
                },
                body: JSON.stringify(refundData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Refund processing failed');
            }

            const refundResponse = await response.json();

            setPaymentState(prev => ({
                ...prev,
                isProcessing: false,
                error: null
            }));

            return refundResponse;

        } catch (error: any) {
            const errorMessage = error.message || 'Refund processing failed';
            setPaymentState(prev => ({
                ...prev,
                isProcessing: false,
                error: errorMessage
            }));
            throw error;
        }
    }, []);

    const clearPaymentState = useCallback(() => {
        setPaymentState({
            isProcessing: false,
            error: null,
            lastOrder: null
        });
    }, []);

    const formatCurrency = useCallback((amount: number): string => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    }, []);

    return {
        paymentState,
        calculateTotalAmount,
        calculateEarnings,
        convertCartToPaymentItems,
        validatePaymentRequest,
        processPayment,
        processInHouseSale,
        issueRefund,
        clearPaymentState,
        formatCurrency
    };
}; 