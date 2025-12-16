// API utility functions for the Mr. Baker User App
// Updated to use the new apiClient pattern following auth.ts
import { apiClient } from './apiClient.js';

/**
 * Generic API call function (deprecated - use apiClient instead)
 * @param {string} endpoint - API endpoint URL
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} - Parsed JSON response
 */
async function apiCall(endpoint, options = {}) {
    console.warn('apiCall is deprecated. Use apiClient instead.');
    return await apiClient.request(endpoint, options);
}

/**
 * Redeem loyalty points for a customer
 * @param {string} token - Authentication token
 * @param {string} customerId - Customer ID
 * @param {number} points - Points to redeem
 * @param {string} orderId - Order ID
 * @returns {Promise<Object>} - API response
 */
async function redeemLoyaltyPoints(token, customerId, points, orderId) {
    // Use the new apiClient through window.apiUtils for backward compatibility
    return await window.apiUtils.redeemLoyaltyPoints(token, customerId, points, orderId);
}

/**
 * Get redeemed points history for a user
 * @param {string} token - Authentication token
 * @returns {Promise<Array>} - Array of redeemed points records
 */
async function getRedeemedPointsHistory(token) {
    // Use the new apiClient through window.apiUtils for backward compatibility
    return await window.apiUtils.getRedeemedPointsHistory(token);
}

/**
 * Get user's current loyalty points balance
 * @param {string} token - Authentication token
 * @param {string} customerId - Customer ID
 * @returns {Promise<number>} - Current points balance
 */
async function getLoyaltyPoints(token, customerId) {
    // Use the new apiClient through window.apiUtils for backward compatibility
    return await window.apiUtils.getLoyaltyPoints(token, customerId);
}

// Export functions for use in other scripts
window.apiUtils = {
    redeemLoyaltyPoints,
    getRedeemedPointsHistory,
    getLoyaltyPoints
};