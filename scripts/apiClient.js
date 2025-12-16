// API Client for the Mr. Baker User App - Following auth.ts pattern

// -------------------- Auth Utilities --------------------
const getAuthToken = () => {
  if (typeof window !== "undefined") {
    const userStr = sessionStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        return user.token;
      } catch (e) {
        return null;
      }
    }
  }
  return null;
};

// -------------------- API Client --------------------
class ApiClient {
  baseUrl = 'https://api.mr-bakers.com/api';
  
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const token = getAuthToken();
    
    const config = {
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      },
      ...options,
    };
    
    try {
      const response = await fetch(url, config);
      
      // Handle 401 unauthorized
      if (response.status === 401) {
        sessionStorage.removeItem('user');
        window.location.href = 'index.html';
        return {
          success: false,
          error: "Session expired. Please login again."
        };
      }
      
      // Handle 403 forbidden
      if (response.status === 403) {
        return {
          success: false,
          error: "Insufficient permissions to perform this action."
        };
      }
      
      // Parse response
      let data;
      try {
        data = await response.json();
      } catch {
        // Handle non-JSON responses
        data = await response.text();
      }
      
      if (!response.ok) {
        return {
          success: false,
          error: data?.message || data?.error || `HTTP ${response.status}: ${response.statusText}`
        };
      }
      
      return {
        success: true,
        data: data?.data || data
      };
    } catch (error) {
      console.error(`API request failed for ${endpoint}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Network error occurred"
      };
    }
  }
  
  // -------------------- API Methods --------------------
  
  // Loyalty APIs
  async redeemLoyaltyPoints(customerId, points, orderId) {
    if (!customerId) {
      return {
        success: false,
        error: 'Customer ID is required to redeem points'
      };
    }
    
    if (!points || points <= 0) {
      return {
        success: false,
        error: 'Valid points amount is required to redeem points'
      };
    }
    
    if (!orderId) {
      return {
        success: false,
        error: 'Order ID is required to redeem points'
      };
    }
    
    return await this.request('/points-redeemed', {
      method: 'POST',
      body: JSON.stringify({
        user: customerId,
        points: points,
        type: 'pos',
        posOrder: orderId
      })
    });
  }
  
  async getRedeemedPointsHistory() {
    return await this.request('/points-redeemed');
  }
  
  async getLoyaltyPoints(customerId) {
    if (!customerId) {
      return {
        success: false,
        error: 'Customer ID is required'
      };
    }
    
    return await this.request(`/loyalty-points?user=${encodeURIComponent(customerId)}`);
  }
  
  // User APIs
  async getCustomerByPhone(phoneNumber) {
    if (!phoneNumber || phoneNumber.trim() === '') {
      return {
        success: false,
        error: 'Phone number is required'
      };
    }
    
    // Clean phone number - remove spaces, dashes, and other non-numeric characters
    const cleanPhoneNumber = phoneNumber.trim().replace(/[^0-9]/g, '');
    
    if (!cleanPhoneNumber || cleanPhoneNumber.length < 7) {
      return {
        success: false,
        error: 'Invalid phone number format'
      };
    }
    
    return await this.request(`/user-by-phone/${cleanPhoneNumber}`);
  }
  
  // Product APIs
  async getCategories() {
    return await this.request('/categories');
  }
  
  async getProducts(branchId) {
    const endpoint = branchId ? `/foods/${branchId}` : '/foods/687652114e53186df0bf0508';
    return await this.request(endpoint);
  }
  
  // Order APIs
  async createPosOrder(orderData) {
    return await this.request('/pos-order', {
      method: 'POST',
      body: JSON.stringify(orderData)
    });
  }
  
  async getRecentOrders(limit = 50) {
    return await this.request(`/sales?limit=${limit}`);
  }
  
  // Rule APIs
  async getPointsRuleByKey(key) {
    return await this.request(`/rule/${key}`);
  }
  
  async getAllPointsRules() {
    // We'll need to fetch each rule individually since there's no bulk endpoint
    const ruleKeys = ['min_order_ammount', 'basic_unit', 'per_unit', 'dine_in_tax', 'take_away_tax'];
    const rules = {};
    
    for (const key of ruleKeys) {
      try {
        const response = await this.getPointsRuleByKey(key);
        if (response.success && response.data) {
          rules[key] = response.data[0]?.value || 0;
        }
      } catch (error) {
        console.warn(`Failed to fetch rule ${key}:`, error);
      }
    }
    
    return {
      success: true,
      data: rules
    };
  }
  
  async updatePointsRuleByKey(key, updatePayload) {
    return await this.request(`/rule/${key}`, {
      method: 'PUT',
      body: JSON.stringify(updatePayload)
    });
  }
}

// Export singleton instance
const apiClient = new ApiClient();
window.apiClient = apiClient;

// For backward compatibility with existing code
window.apiUtils = {
  redeemLoyaltyPoints: async (token, customerId, points, orderId) => {
    // Set token in sessionStorage temporarily for this call
    const originalUser = sessionStorage.getItem('user');
    if (token && !originalUser) {
      sessionStorage.setItem('user', JSON.stringify({ token }));
    }
    
    const result = await apiClient.redeemLoyaltyPoints(customerId, points, orderId);
    
    // Restore original user data
    if (originalUser) {
      sessionStorage.setItem('user', originalUser);
    } else if (!originalUser) {
      sessionStorage.removeItem('user');
    }
    
    return result;
  },
  getRedeemedPointsHistory: apiClient.getRedeemedPointsHistory.bind(apiClient),
  getLoyaltyPoints: async (token, customerId) => {
    // Set token in sessionStorage temporarily for this call
    const originalUser = sessionStorage.getItem('user');
    if (token && !originalUser) {
      sessionStorage.setItem('user', JSON.stringify({ token }));
    }
    
    const result = await apiClient.getLoyaltyPoints(customerId);
    
    // Restore original user data
    if (originalUser) {
      sessionStorage.setItem('user', originalUser);
    } else if (!originalUser) {
      sessionStorage.removeItem('user');
    }
    
    if (result.success && result.data) {
      // Handle different response formats like in the original function
      if (Array.isArray(result.data)) {
        return result.data[0]?.points || 0;
      } else if (Array.isArray(result.data?.data)) {
        return result.data.data[0]?.points || 0;
      } else if (result.data?.points) {
        return result.data.points;
      }
      return 0;
    }
    
    return 0;
  }
};