let cart = { items: [] };
let currentUser = null;
let paymentMethodSelect = null;

window.addEventListener('DOMContentLoaded', () => {
    // Clear any legacy login persistence so a fresh app launch requires authentication
    if (localStorage.getItem('user')) {
        localStorage.removeItem('user');
    }

    const userStr = sessionStorage.getItem('user');
    if (!userStr) {
        window.location.href = 'index.html';
        return;
    }

    currentUser = JSON.parse(userStr);
    if (!currentUser.loggedIn) {
        window.location.href = 'index.html';
        return;
    }

    paymentMethodSelect = document.getElementById('paymentMethod');

    loadCart();
    renderCart();
    setupEventListeners();
    setupModalListeners();
    setupPhoneModalListeners();
    setupOrderTypeButtons();
});

function loadCart() {
    const cartData = localStorage.getItem(`cart_${currentUser.id}`);
    cart = cartData ? JSON.parse(cartData) : { items: [] };
}

function saveCart() {
    localStorage.setItem(`cart_${currentUser.id}`, JSON.stringify(cart));
}

// Helper function to reset payment method select
function resetPaymentMethod() {
    if (paymentMethodSelect) {
        paymentMethodSelect.value = '';
    }
}

function renderCart() {
    const cartItems = document.getElementById('cartItems');
    
    if (!cart || !cart.items || cart.items.length === 0) {
        cartItems.innerHTML = `
            <div class="empty-cart">
                <div class="empty-cart-icon">🛒</div>
                <h3>Your cart is empty</h3>
                <p>Add some products to get started!</p>
            </div>
        `;
        document.getElementById('purchaseBtn').disabled = true;
        updateSummary();
        return;
    }

    document.getElementById('purchaseBtn').disabled = false;
    
    cartItems.innerHTML = cart.items.map((item, index) => {
        const product = item.productId;
        const emoji = product.emoji || '🍞';
        let name = product.name || 'Product';
        // Add size to name if available
        if (item.selectedSize) {
            name += ` (${item.selectedSize})`;
        }
        const price = product.price || 0;
        const quantity = item.quantity || 1;
        const productId = product.id;
        // Create unique identifier for items with size
        const itemId = item.selectedSize ? `${productId}_${item.selectedSize}` : productId;

        return `
            <div class="cart-item" data-item-id="${itemId}">
                <div class="item-info">
                    <div class="item-emoji">${emoji}</div>
                    <div class="item-details">
                        <div class="item-name">${name}</div>
                        <div class="item-price">₹${price.toFixed(2)} each</div>
                    </div>
                </div>
                <div class="item-controls">
                    <div class="quantity-control">
                        <button class="qty-btn" onclick="updateQuantity('${itemId}', ${quantity - 1})">-</button>
                        <span class="quantity">${quantity}</span>
                        <button class="qty-btn" onclick="updateQuantity('${itemId}', ${quantity + 1})">+</button>
                    </div>
                    <div class="item-total">₹${(price * quantity).toFixed(2)}</div>
                    <button class="remove-btn" onclick="removeItem('${itemId}')">Remove</button>
                </div>
            </div>
        `;
    }).join('');

    updateSummary();
}

function updateQuantity(itemId, newQuantity) {
    // itemId can be productId or productId_size for items with size
    const [productId, size] = itemId.includes('_') ? itemId.split('_') : [itemId, null];
    
    if (newQuantity <= 0) {
        if (size) {
            cart.items = cart.items.filter(item => 
                !(item.productId.id === productId && item.selectedSize === size)
            );
        } else {
            cart.items = cart.items.filter(item => 
                item.productId.id !== productId && !item.selectedSize
            );
        }
    } else {
        const item = cart.items.find(item => {
            const sameProduct = item.productId.id === productId;
            const sameSize = size ? item.selectedSize === size : !item.selectedSize;
            return sameProduct && sameSize;
        });
        if (item) {
            item.quantity = newQuantity;
        }
    }
    saveCart();
    renderCart();
}

function removeItem(itemId) {
    // itemId can be productId or productId_size for items with size
    const [productId, size] = itemId.includes('_') ? itemId.split('_') : [itemId, null];
    
    if (size) {
        cart.items = cart.items.filter(item => 
            !(item.productId.id === productId && item.selectedSize === size)
        );
    } else {
        cart.items = cart.items.filter(item => 
            item.productId.id !== productId && !item.selectedSize
        );
    }
    saveCart();
    renderCart();
}

function updateSummary() {
    if (!cart || !cart.items || cart.items.length === 0) {
        document.getElementById('subtotal').textContent = '₹0.00';
        document.getElementById('tax').textContent = '₹0.00';
        document.getElementById('total').textContent = '₹0.00';
        return;
    }

    const subtotal = cart.items.reduce((sum, item) => {
        const price = item.productId.price || 0;
        const quantity = item.quantity || 0;
        return sum + (price * quantity);
    }, 0);
    const tax = subtotal * 0.05;
    const total = subtotal + tax;

    document.getElementById('subtotal').textContent = `₹${subtotal.toFixed(2)}`;
    document.getElementById('tax').textContent = `₹${tax.toFixed(2)}`;
    document.getElementById('total').textContent = `₹${total.toFixed(2)}`;
}

function setupEventListeners() {
    const purchaseBtnEl = document.getElementById('purchaseBtn');
    const clearBtnEl = document.getElementById('clearBtn');

    // Payment method change listener
    // Stripe/Card UI removed – if you want to support card later,
    // handle it via backend or another provider here.

    purchaseBtnEl.addEventListener('click', async () => {
        if (!cart || !cart.items || cart.items.length === 0) {
            const cartEmptyModal = document.getElementById('cartEmptyModal');
            if (cartEmptyModal) {
                cartEmptyModal.style.display = 'flex';
            } else {
                alert('Your cart is empty. Please add products first.');
            }
            return;
        }

        const selectedPaymentMethod = paymentMethodSelect ? paymentMethodSelect.value : '';
        if (!selectedPaymentMethod) {
            if (paymentMethodSelect) {
                paymentMethodSelect.classList.add('input-error');
                setTimeout(() => paymentMethodSelect.classList.remove('input-error'), 1500);
            }
            alert('Please select a payment method before completing the purchase.');
            return;
        }

        // Show phone number form modal
        showPhoneNumberModal(selectedPaymentMethod);
    });

    clearBtnEl.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear the cart?')) {
            cart = { items: [] };
            saveCart();
            renderCart();
            resetPaymentMethod();
        }
    });

    document.getElementById('backBtn').addEventListener('click', () => {
        window.location.href = 'product.html';
    });

    // Logout Modal Functions
    function showLogoutModal() {
        const modal = document.getElementById('logoutModal');
        if (modal) {
            modal.style.display = 'flex';
        }
    }

    function hideLogoutModal() {
        const modal = document.getElementById('logoutModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    function confirmLogout() {
        sessionStorage.removeItem('user');
        window.location.href = 'index.html';
    }

    // Setup logout modal event listeners
    document.getElementById('logoutBtn').addEventListener('click', () => {
        showLogoutModal();
    });

    const closeLogoutModal = document.getElementById('closeLogoutModal');
    const cancelLogoutBtn = document.getElementById('cancelLogoutBtn');
    const confirmLogoutBtn = document.getElementById('confirmLogoutBtn');

    if (closeLogoutModal) {
        closeLogoutModal.addEventListener('click', hideLogoutModal);
    }

    if (cancelLogoutBtn) {
        cancelLogoutBtn.addEventListener('click', hideLogoutModal);
    }

    if (confirmLogoutBtn) {
        confirmLogoutBtn.addEventListener('click', confirmLogout);
    }

    // Close modal when clicking overlay
    const logoutModal = document.getElementById('logoutModal');
    if (logoutModal) {
        const overlay = logoutModal.querySelector('.modal-overlay');
        if (overlay) {
            overlay.addEventListener('click', hideLogoutModal);
        }
    }
}

// Show phone number modal
let currentPaymentMethod = '';
let currentOrderType = 'take-away'; // Default to take-away
let currentCustomerData = null;
let currentLoyaltyPoints = 0;

function showPhoneNumberModal(paymentMethod) {
    currentPaymentMethod = paymentMethod;
    currentOrderType = 'take-away'; // Reset to default
    const phoneModal = document.getElementById('phoneModal');
    const phoneInput = document.getElementById('customerPhone');
    const orderTypeSelect = document.getElementById('orderType');
    const customerInfo = document.getElementById('customerInfo');
    const phoneSearchStatus = document.getElementById('phoneSearchStatus');
    const continueBtn = document.getElementById('continueBtn');
    
    phoneInput.value = '';
    if (orderTypeSelect) {
        orderTypeSelect.value = '';
    }
    if (customerInfo) {
        customerInfo.style.display = 'none';
        customerInfo.classList.remove('show');
    }
    phoneSearchStatus.textContent = '';
    phoneSearchStatus.className = 'phone-search-status';
    currentCustomerData = null;
    currentLoyaltyPoints = 0;
    window.customerPhoneNumber = '';
    window.loyaltyDiscount = 0;
    
    // Reset button to submit type
    if (continueBtn) {
        continueBtn.type = 'submit';
        continueBtn.disabled = false;
        continueBtn.textContent = 'Search & Continue';
        continueBtn.style.display = 'block';
    }
    
    // Reset Apply and Cancel buttons
    const applyBtn = document.getElementById('applyDiscountBtn');
    const cancelBtn = document.getElementById('cancelDiscountBtn');
    if (applyBtn) {
        applyBtn.disabled = true;
        applyBtn.style.display = 'none';
    }
    if (cancelBtn) {
        cancelBtn.disabled = true;
        cancelBtn.style.display = 'none';
    }
    
    // Bill modal removed from UI
    
    // Reset loyalty form flag and bill guard
    window.loyaltyFormShown = false;
    window.allowBillGeneration = false;
    
    phoneModal.style.display = 'flex';
    phoneInput.focus();
}

// Close phone number modal
function closePhoneNumberModal(resetData = true) {
    const phoneModal = document.getElementById('phoneModal');
    phoneModal.style.display = 'none';
    if (resetData) {
        currentPaymentMethod = '';
        currentCustomerData = null;
        currentLoyaltyPoints = 0;
        window.customerPhoneNumber = '';
        window.customerData = null;
        window.loyaltyPoints = 0;
        window.loyaltyDiscount = 0;
        window.allowBillGeneration = false;
    }
}

// Old fetchAllUsers and findCustomerByPhone functions removed - now using /user-by-phone API directly

// Main function to find customer by phone number using API
async function fetchCustomerByPhone(phoneNumber) {
    try {
        const userToken = currentUser?.token;
        
        if (!userToken) {
            console.error('No token found. Please login again.');
            return null;
        }

        console.log('Fetching customer by phone number:', phoneNumber);
        
        // Use the /user-by-phone/:phoneNumber API endpoint
        const response = await fetch(`https://api.mr-bakers.com/api/user-by-phone/${phoneNumber}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`,
                'Accept': 'application/json'
            }
        });

        console.log('User-by-phone API response status:', response.status);

        if (!response.ok) {
            if (response.status === 401) {
                const errorText = await response.text();
                console.error('401 Unauthorized - Token may be expired:', errorText);
                alert('Session expired. Please login again.');
                sessionStorage.removeItem('user');
                window.location.href = 'index.html';
                return null;
            }
            if (response.status === 404) {
                console.log(`Customer not found with phone: ${phoneNumber}`);
                return null;
            }
            const errorText = await response.text();
            console.error(`Failed to fetch customer: ${response.status}`, errorText);
            return null;
        }

        const data = await response.json();
        
        // Handle different response formats
        let customer = null;
        if (data.data) {
            customer = data.data;
        } else if (data.user) {
            customer = data.user;
        } else if (data._id) {
            customer = data;
        }

        // Check if customer role is 'customer'
        if (customer && customer.role === 'customer') {
            console.log('Customer found via API:', customer);
            return customer;
        }

        console.log(`Customer not found or not a customer role with phone: ${phoneNumber}`);
        return null;
    } catch (error) {
        console.error('Error fetching customer by phone:', error);
        return null;
    }
}

// Fetch loyalty points for customer using /api/loyalty/{customerId} endpoint
async function fetchLoyaltyPoints(customerId) {
    try {
        const userToken = currentUser?.token;
        
        if (!userToken) {
            console.error('No token found for loyalty points fetch');
            return 0;
        }

        console.log('Fetching loyalty points for customer:', customerId);
        
        // Use /api/loyalty/{customerId} endpoint format
        const response = await fetch(`https://api.mr-bakers.com/api/loyalty/${customerId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`,
                'Accept': 'application/json'
            }
        });

        console.log('Loyalty points API response status:', response.status);

        if (!response.ok) {
            if (response.status === 404) {
                console.log('No loyalty points found for customer');
                return 0; // No loyalty points found
            }
            if (response.status === 401) {
                console.error('401 Unauthorized - Token may be expired');
                alert('Session expired. Please login again.');
                sessionStorage.removeItem('user');
                window.location.href = 'index.html';
                return 0;
            }
            const errorText = await response.text();
            console.error('Failed to fetch loyalty points:', response.status, errorText);
            return 0; // Return 0 instead of throwing to allow purchase to continue
        }

        const data = await response.json();
        console.log('Loyalty points response:', data);
        
        // Handle different response formats
        const points = data.points || data.balance || data.total || 0;
        return points;
    } catch (error) {
        console.error('Error fetching loyalty points:', error);
        return 0; // Return 0 to allow purchase to continue even if loyalty fetch fails
    }
}

// Calculate discount from loyalty points (1 point = 1 rupee discount)
function calculateDiscountFromPoints(points, totalAmount) {
    const discountAmount = Math.min(points, totalAmount);
    return discountAmount;
}

// Setup phone number modal listeners
function setupPhoneModalListeners() {
    const phoneModal = document.getElementById('phoneModal');
    const phoneForm = document.getElementById('phoneForm');
    const phoneInput = document.getElementById('customerPhone');
    const closePhoneModal = document.getElementById('closePhoneModal');
    const overlay = phoneModal ? phoneModal.querySelector('.modal-overlay') : null;
    const customerInfo = document.getElementById('customerInfo');
    const phoneSearchStatus = document.getElementById('phoneSearchStatus');
    const continueBtn = document.getElementById('continueBtn');

    if (!phoneModal || !phoneForm || !phoneInput || !closePhoneModal) return;

    // Only allow numeric input
    phoneInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^0-9]/g, '');
    });

    const closeHandler = () => {
        closePhoneNumberModal();
    };

    closePhoneModal.addEventListener('click', closeHandler);
    if (overlay) {
        overlay.addEventListener('click', closeHandler);
    }

    // Flags to control loyalty form visibility and bill generation
    window.loyaltyFormShown = false;
    window.allowBillGeneration = false;
    
    phoneForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        e.stopPropagation(); // Stop event from bubbling up
        e.stopImmediatePropagation(); // Stop other handlers
        
        // Reset flags
        window.loyaltyFormShown = false;
        window.allowBillGeneration = false;
        
        const phoneInput = document.getElementById('customerPhone');
        const orderTypeSelect = document.getElementById('orderType');
        const phoneNumber = phoneInput.value.trim();
        const orderType = orderTypeSelect ? orderTypeSelect.value : '';

        if (!phoneNumber || phoneNumber.length < 7) {
            phoneInput.classList.add('input-error');
            setTimeout(() => phoneInput.classList.remove('input-error'), 1500);
            alert('Please enter a valid phone number (minimum 7 digits).');
            return;
        }

        if (!orderType) {
            if (orderTypeSelect) {
                orderTypeSelect.classList.add('input-error');
                setTimeout(() => orderTypeSelect.classList.remove('input-error'), 1500);
            }
            alert('Please select order type (Dine In or Take Away).');
            return;
        }

        // Store selected order type
        currentOrderType = orderType;

        // Ensure customerInfo is hidden before search
        if (customerInfo) {
            customerInfo.style.display = 'none';
            customerInfo.classList.remove('show');
            customerInfo.style.setProperty('display', 'none', 'important');
        }
        
        // Hide Apply and Cancel buttons initially
        const applyBtn = document.getElementById('applyDiscountBtn');
        const cancelBtn = document.getElementById('cancelDiscountBtn');
        if (applyBtn) {
            applyBtn.style.display = 'none';
            applyBtn.disabled = true;
        }
        if (cancelBtn) {
            cancelBtn.style.display = 'none';
            cancelBtn.disabled = true;
        }

        // Disable continue button and show loading
        continueBtn.disabled = true;
        continueBtn.textContent = 'Loading...';
        phoneSearchStatus.textContent = 'Fetching customer details...';
        phoneSearchStatus.className = 'phone-search-status searching';
        
        // Bill modal removed from UI

        try {
            // Step 1: Find customer by phone number (local search)
            const customer = await fetchCustomerByPhone(phoneNumber);
            
            if (customer) {
                // Don't proceed automatically - show form first
                currentCustomerData = customer;
                
                // Step 2: Get customer _id
                const customerId = customer._id;
                if (!customerId) {
                    throw new Error('Customer ID not found');
                }
                
                // Step 3: Fetch loyalty points using customer _id
                const points = await fetchLoyaltyPoints(customerId);
                // Always store points (even if 0)
                currentLoyaltyPoints = points || 0;
                
                // Step 4: Calculate discount from loyalty points
                const subtotal = cart.items.reduce((sum, item) => {
                    return sum + (item.productId.price * item.quantity);
                }, 0);
                const tax = subtotal * 0.05;
                const totalAmount = subtotal + tax;
                // Calculate discount (always calculate, even if points is 0)
                const pointsValue = currentLoyaltyPoints || 0;
                const discount = calculateDiscountFromPoints(pointsValue, totalAmount);
                window.loyaltyDiscount = discount || 0;
                
                // Step 5: Display customer info and loyalty points in UI
                let customerName = '';
                if (customer.firstName && customer.lastName) {
                    customerName = `${customer.firstName} ${customer.lastName}`;
                } else if (customer.firstName) {
                    customerName = customer.firstName;
                } else if (customer.name) {
                    customerName = customer.name;
                } else if (customer.username) {
                    customerName = customer.username;
                } else {
                    customerName = 'Customer';
                }
                
                // Get customerInfo element again to make sure it's current
                const customerInfoEl = document.getElementById('customerInfo');
                const customerNameEl = document.getElementById('customerName');
                const loyaltyPointsEl = document.getElementById('loyaltyPoints');
                const loyaltyDiscountEl = document.getElementById('loyaltyDiscount');
                
                // Update UI with customer details - ALWAYS show form even if points are 0
                if (customerNameEl) {
                    customerNameEl.textContent = customerName;
                }
                
                // Always show points (even if 0) - ensure it displays "0" when no points
                const displayPoints = currentLoyaltyPoints || 0;
                if (loyaltyPointsEl) {
                    loyaltyPointsEl.textContent = displayPoints.toLocaleString();
                }
                
                // Always show discount (even if 0) - ensure it displays "₹0.00" when no discount
                const displayDiscount = window.loyaltyDiscount || 0;
                if (loyaltyDiscountEl) {
                    loyaltyDiscountEl.textContent = `₹${displayDiscount.toFixed(2)}`;
                }
                
                // ALWAYS show customer info section/form (even if points are 0)
                // Make sure form is visible - force show with inline style and class
                if (customerInfoEl) {
                    // Remove any conflicting inline styles first
                    customerInfoEl.style.removeProperty('display');
                    customerInfoEl.style.removeProperty('visibility');
                    customerInfoEl.style.removeProperty('opacity');
                    
                    // Add show class
                    customerInfoEl.classList.add('show');
                    
                    // Force display with inline style using !important
                    customerInfoEl.style.setProperty('display', 'block', 'important');
                    customerInfoEl.style.setProperty('visibility', 'visible', 'important');
                    customerInfoEl.style.setProperty('opacity', '1', 'important');
                    customerInfoEl.style.setProperty('position', 'relative', 'important');
                    customerInfoEl.style.setProperty('z-index', '10', 'important');
                    
                    // Ensure parent modal is still visible
                    const phoneModal = document.getElementById('phoneModal');
                    if (phoneModal) {
                        phoneModal.style.setProperty('display', 'flex', 'important');
                        phoneModal.style.setProperty('z-index', '2000', 'important');
                    }
                }
                
                phoneSearchStatus.textContent = 'Customer found!';
                phoneSearchStatus.className = 'phone-search-status success';
                
                // Store phone number and customer data
                window.customerPhoneNumber = phoneNumber;
                window.customerData = currentCustomerData;
                window.loyaltyPoints = currentLoyaltyPoints;
                
                // Hide the continue button when loyalty points form is shown (user must use Apply/Cancel)
                if (continueBtn) {
                    continueBtn.style.setProperty('display', 'none', 'important');
                    continueBtn.disabled = true;
                }
                
                // Re-enable Apply and Cancel buttons
                const applyBtn = document.getElementById('applyDiscountBtn');
                const cancelBtn = document.getElementById('cancelDiscountBtn');
                
                if (applyBtn) {
                    applyBtn.disabled = false;
                    applyBtn.style.setProperty('display', 'block', 'important');
                    applyBtn.style.setProperty('visibility', 'visible', 'important');
                    applyBtn.style.setProperty('opacity', '1', 'important');
                }
                
                if (cancelBtn) {
                    cancelBtn.disabled = false;
                    cancelBtn.style.setProperty('display', 'block', 'important');
                    cancelBtn.style.setProperty('visibility', 'visible', 'important');
                    cancelBtn.style.setProperty('opacity', '1', 'important');
                }
                
                // Force a reflow to ensure display changes take effect
                if (customerInfoEl) {
                    customerInfoEl.offsetHeight; // Trigger reflow
                }
                
                // IMPORTANT: Stop form submission here - don't proceed to bill generation
                // User must click Apply or Cancel button to proceed
                
                // Set flag to indicate loyalty form is shown
                window.loyaltyFormShown = true;
                window.allowBillGeneration = false;
                
                // Re-enable continue button but keep it hidden (user must use Apply/Cancel)
                if (continueBtn) {
                    continueBtn.style.setProperty('display', 'none', 'important');
                    continueBtn.disabled = true;
                    continueBtn.type = 'button'; // Change to button to prevent form submission
                }
                
                // Double check modal is still open and bill modal is closed
                const phoneModalCheck = document.getElementById('phoneModal');
                if (phoneModalCheck) {
                    phoneModalCheck.style.setProperty('display', 'flex', 'important');
                }
                
                // Bill modal removed from UI
                
                // Verify form is visible
                setTimeout(() => {
                    const checkForm = document.getElementById('customerInfo');
                    if (checkForm) {
                        const computed = window.getComputedStyle(checkForm);
                        if (computed.display === 'none') {
                            checkForm.style.setProperty('display', 'block', 'important');
                            checkForm.classList.add('show');
                        }
                        // Confirm loyalty form is shown
                        window.loyaltyFormShown = true;
                    }
                }, 100);
                
                return; // Exit here - don't proceed to bill. User must click Apply/Cancel.
            } else {
                // Customer not found - show message
                currentCustomerData = null;
                currentLoyaltyPoints = 0;
                window.loyaltyDiscount = 0;
                customerInfo.style.display = 'none';
                phoneSearchStatus.textContent = 'Customer not found';
                phoneSearchStatus.className = 'phone-search-status not-found';
                
                // Store phone number anyway (for bill)
                window.customerPhoneNumber = phoneNumber;
                window.customerData = null;
                window.loyaltyPoints = 0;
                
                // Show continue button for customer not found case
                continueBtn.disabled = false;
                continueBtn.textContent = 'Continue without Customer';
                continueBtn.type = 'button';
                continueBtn.style.display = 'block';
                
                // Hide Apply and Cancel buttons (customer not found)
                const applyBtn = document.getElementById('applyDiscountBtn');
                const cancelBtn = document.getElementById('cancelDiscountBtn');
                if (applyBtn) applyBtn.style.display = 'none';
                if (cancelBtn) cancelBtn.style.display = 'none';
            }
        } catch (error) {
            console.error('Error fetching customer:', error);
            phoneSearchStatus.textContent = 'Error fetching customer. You can continue.';
            phoneSearchStatus.className = 'phone-search-status error';
            currentCustomerData = null;
            currentLoyaltyPoints = 0;
            window.loyaltyDiscount = 0;
            customerInfo.style.display = 'none';
            
            // Show continue button for error case
            continueBtn.disabled = false;
            continueBtn.textContent = 'Continue without Points';
            continueBtn.type = 'button'; // Change to button to allow manual click
            continueBtn.style.display = 'block';
            
            // Hide Apply and Cancel buttons (error case)
            const applyBtn = document.getElementById('applyDiscountBtn');
            const cancelBtn = document.getElementById('cancelDiscountBtn');
            if (applyBtn) applyBtn.style.display = 'none';
            if (cancelBtn) cancelBtn.style.display = 'none';
            
            // Store phone number anyway
            window.customerPhoneNumber = phoneNumber;
            window.customerData = null;
            window.loyaltyPoints = 0;
        }
    });

    // Handle Apply Discount button click
    const applyDiscountBtn = document.getElementById('applyDiscountBtn');
    if (applyDiscountBtn) {
        applyDiscountBtn.addEventListener('click', async () => {
            // Apply discount and proceed with purchase
            const phoneNumber = document.getElementById('customerPhone').value.trim();
            if (!phoneNumber || phoneNumber.length < 7) {
                return;
            }

            // Ensure loyalty form was shown before proceeding
            const customerInfoCheck = document.getElementById('customerInfo');
            const isFormVisible = customerInfoCheck && (
                window.getComputedStyle(customerInfoCheck).display === 'block' || 
                customerInfoCheck.classList.contains('show')
            );
            
            if (!isFormVisible && !window.loyaltyFormShown) {
                return;
            }

            // Close modal and proceed with discount applied
            window.allowBillGeneration = true;
            closePhoneNumberModal(false);
            
            // Reset flag
            window.loyaltyFormShown = false;

            // Generate and show bill before proceeding
            setupModalListeners();
            generateAndShowBill(currentPaymentMethod);
        });
    }

    // Handle Cancel Discount button click
    const cancelDiscountBtn = document.getElementById('cancelDiscountBtn');
    if (cancelDiscountBtn) {
        cancelDiscountBtn.addEventListener('click', async () => {
            // Cancel discount (set to 0) and proceed without discount
            window.loyaltyDiscount = 0;
            currentLoyaltyPoints = 0;
            window.loyaltyPoints = 0;

            const phoneNumber = document.getElementById('customerPhone').value.trim();
            if (!phoneNumber || phoneNumber.length < 7) {
                return;
            }

            // Ensure loyalty form was shown before proceeding
            const customerInfoCheck = document.getElementById('customerInfo');
            const isFormVisible = customerInfoCheck && (
                window.getComputedStyle(customerInfoCheck).display === 'block' || 
                customerInfoCheck.classList.contains('show')
            );
            
            if (!isFormVisible && !window.loyaltyFormShown) {
                return;
            }

            // Close modal and proceed without discount
            window.allowBillGeneration = true;
            closePhoneNumberModal(false);
            
            // Reset flag
            window.loyaltyFormShown = false;

            // Generate and show bill before proceeding
            setupModalListeners();
            generateAndShowBill(currentPaymentMethod);
        });
    }

    // Handle continue button click (ONLY when customer NOT found or error case)
    continueBtn.addEventListener('click', async (e) => {
        // Prevent form submission if button type is button
        if (continueBtn.type === 'button') {
            e.preventDefault();
        }
        
        // Check if customer info form is visible - if yes, don't proceed (user must use Apply/Cancel)
        const customerInfoCheck = document.getElementById('customerInfo');
        if (customerInfoCheck) {
            const computedStyle = window.getComputedStyle(customerInfoCheck);
            if (computedStyle.display === 'block' || customerInfoCheck.classList.contains('show')) {
                return;
            }
        }
        
        // Only proceed if we have the phone number and customer was NOT found
        const phoneNumber = document.getElementById('customerPhone').value.trim();
        if (!phoneNumber || phoneNumber.length < 7) {
            return;
        }

        // Close modal and proceed (only when customer not found)
        window.allowBillGeneration = true;
        closePhoneNumberModal(false);

        // Generate and show bill before proceeding
        setupModalListeners();
        generateAndShowBill(currentPaymentMethod);
    });
}

async function triggerCheckoutFlow() {
    const method = currentPaymentMethod;
    if (!method) {
        alert('Payment method missing. Please select again.');
        window.allowBillGeneration = false;
        return;
    }

    // Directly save POS order (no separate /payments API)
    await savePosOrder(method, currentOrderType || 'take-away'); // Save POS order with selected order type
    // Bill generation disabled — no modal will be shown
}

// Bill generation is disabled. Keeping a no-op function to avoid runtime errors if called.
function generateBill() {
    console.log('generateBill: disabled');
}

// Generate and display invoice bill in modal
function generateAndShowBill(paymentMethod) {
    const subtotal = cart.items.reduce((sum, item) => {
        return sum + (item.productId.price * item.quantity);
    }, 0);
    const tax = subtotal * 0.05;
    const loyaltyDiscount = window.loyaltyDiscount || 0;
    const total = subtotal + tax - loyaltyDiscount;

    const billNumber = `INV-${Date.now()}`;
    const billDate = new Date().toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'medium'
    });

    // Generate bill HTML
    const billHTML = `
        <div class="bill-header">
            <div class="mr-baker-logo">
                <span class="logo-text">MR. BAKER</span>
            </div>
            <h2>Invoice</h2>
        </div>
        
        <div class="bill-info">
            <p><strong>Date:</strong> ${billDate}</p>
            <p><strong>Invoice #:</strong> ${billNumber}</p>
        </div>
        
        <div class="bill-divider"></div>
        
        <div class="bill-items">
            <div class="bill-item-header">
                <span>ITEM</span>
                <span>QTY</span>
                <span>PRICE</span>
                <span>TOTAL</span>
            </div>
            ${cart.items.map(item => {
                const product = item.productId;
                const name = product.name || 'Product';
                const price = product.price || 0;
                const quantity = item.quantity || 1;
                return `
                    <div class="bill-item">
                        <span>${name}</span>
                        <span>x${quantity}</span>
                        <span>₹${price.toFixed(2)}</span>
                        <span>₹${(price * quantity).toFixed(2)}</span>
                    </div>
                `;
            }).join('')}
        </div>
        
        <div class="bill-divider"></div>
        
        <div class="bill-total">
            <span>Subtotal:</span>
            <span>₹${subtotal.toFixed(2)}</span>
        </div>
        <div class="bill-total">
            <span>Tax (5%):</span>
            <span>₹${tax.toFixed(2)}</span>
        </div>
        ${loyaltyDiscount > 0 ? `
            <div class="bill-total discount">
                <span>Loyalty Discount:</span>
                <span>-₹${loyaltyDiscount.toFixed(2)}</span>
            </div>
        ` : ''}
        <div class="bill-total grand-total">
            <span>Total:</span>
            <span>₹${total.toFixed(2)}</span>
        </div>
        
        <div class="bill-footer">
            <p>Thank you for your purchase!</p>
        </div>
    `;

    // Insert into both modal and print section
    const billModalContent = document.getElementById('billModalContent');
    const billContent = document.getElementById('billContent');
    
    if (billModalContent) {
        billModalContent.innerHTML = billHTML;
    }
    if (billContent) {
        billContent.innerHTML = billHTML;
    }

    // Show the bill modal
    const billModal = document.getElementById('billModal');
    if (billModal) {
        billModal.style.display = 'flex';
    }
}

// Setup modal listeners once on page load
let modalListenersSetup = false;

function setupModalListeners() {
    if (modalListenersSetup) return; // Prevent duplicate listeners
    
    const modal = document.getElementById('billModal');
    const closeBillModal = document.getElementById('closeBillModal');
    const closeBillBtn = document.getElementById('closeBillBtn');
    const printBtn = document.getElementById('printBillBtn');
    
    if (!modal) return;
    
    // Close modal handlers
    const closeModalHandler = () => {
        modal.style.display = 'none';
        // Clear cart after closing modal
        cart = { items: [] };
        saveCart();
        renderCart();
        resetPaymentMethod();
        // Clear customer phone number and loyalty data
        window.customerPhoneNumber = '';
        window.customerData = null;
        window.loyaltyPoints = 0;
        window.loyaltyDiscount = 0;
    };
    
    if (closeBillModal) {
        closeBillModal.addEventListener('click', closeModalHandler);
    }
    if (closeBillBtn) {
        closeBillBtn.addEventListener('click', closeModalHandler);
    }
    
    // Close on overlay click
    const overlay = modal.querySelector('.modal-overlay');
    if (overlay) {
        overlay.addEventListener('click', closeModalHandler);
    }
    
    // Print button handler — print the dedicated off-screen print section to avoid extra page content
    if (printBtn) {
        printBtn.addEventListener('click', () => {
            const printSection = document.getElementById('billSection') || modal;
            safePrintBill(printSection);
        });
    }
    
    modalListenersSetup = true;
}

// Helper: temporarily hide all elements except the provided element, call print, then restore
function safePrintBill(targetEl) {
    // Safer print: open a new window with only the bill HTML (strip any images) to avoid printing other page content
    try {
        const billEl = document.getElementById('billContent') || targetEl;
        let html = billEl ? billEl.innerHTML : (targetEl ? targetEl.innerHTML : '');

        // Remove any <img> tags if present
        html = html.replace(/<img[^>]*>/gi, '');

        const styles = `
            <style>
                body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; padding: 20px; }
                .bill { max-width: 700px; margin: 0 auto; padding: 20px; }
                .bill-header, .bill-items, .bill-footer { margin-bottom: 12px; }
                .bill-item { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 10px; padding: 6px 0; border-bottom: 1px solid #eee; }
                .bill-item-header { font-weight: 700; border-bottom: 2px solid #ddd; padding-bottom: 6px; }
                .bill-total { display:flex; justify-content: space-between; padding: 6px 0; }
                @page { size: auto; margin: 10mm; }
            </style>
        `;

        const printWindow = window.open('', '_blank', 'toolbar=0,location=0,menubar=0');
        if (!printWindow) {
            // Fallback to original print if popup blocked
            window.print();
            return;
        }

        printWindow.document.open();
        printWindow.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Invoice</title>' + styles + '</head><body>');
        printWindow.document.write('<div class="bill">' + html + '</div>');
        printWindow.document.write('</body></html>');
        printWindow.document.close();

        // Wait for content to render then print
        printWindow.focus();
        setTimeout(() => {
            try {
                printWindow.print();
            } catch (e) {
                console.error('Print failed:', e);
            }
            // Optionally close the window after printing
            try { printWindow.close(); } catch (e) {}
        }, 500);
    } catch (err) {
        console.error('safePrintBill error:', err);
        window.print();
    }
}

// Bill modal and print helpers restored — invoice UI shown in modal

// Stripe integration removed from POS (card payments must be handled externally)

// Map payment method to POS order schema format (lowercase for schema)
function mapPaymentTypeToSchema(paymentMethod) {
    const paymentMap = {
        'Cash': 'cash',
        'Card': 'card',
        'paypal': 'paypal'
    };
    return paymentMap[paymentMethod] || 'cash';
}

// Save POS order to backend using the schema
async function savePosOrder(paymentMethod, orderType = 'take-away') {
    try {
        const subtotal = cart.items.reduce((sum, item) => {
            return sum + (item.productId.price * item.quantity);
        }, 0);
        const tax = subtotal * 0.05;
        const loyaltyDiscount = window.loyaltyDiscount || 0;
        const totalCost = Math.max(0, subtotal + tax - loyaltyDiscount);

        const userToken = currentUser.token;
        const userId = currentUser.id;
        const branchId = currentUser.branchId;

        // Map cart items to POS order items schema
        const posOrderItems = cart.items.map(item => {
            return {
                food: item.productId._id || item.productId.id, // Product reference
                quantity: item.quantity,
                cost: item.productId.price * item.quantity,
                size: item.selectedSize || null,
                offer: null // Can be set if there's an offer
            };
        });

        // Generate bill number
        const billNumber = `INV-${Date.now()}`;

        // Create POS order object matching backend controller requirements
        // Note: posId and date are set automatically by backend from req.user.id and new Date()
        const posOrder = {
            items: posOrderItems,
            branch: branchId, // ObjectId ref: 'Branch' - required
            orderType: orderType, // enum: ['dine-in', 'take-away'], required
            paymentType: mapPaymentTypeToSchema(paymentMethod), // enum: ['cash', 'card', 'paypal'], required
            totalCost: totalCost, // Number, required
            tax: tax, // Number
            deviceType: 'POS', // enum: ['POS', 'KIOSK'], optional, defaults to 'POS'
            bill: billNumber // String, optional
        };

        const orderResponse = await fetch('https://api.mr-bakers.com/api/pos-order', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': userToken ? `Bearer ${userToken}` : '',
                'Accept': 'application/json'
            },
            body: JSON.stringify(posOrder)
        });

        if (!orderResponse.ok) {
            console.warn('Failed to save POS order');
            const errorText = await orderResponse.text();
            console.error('POS order error:', errorText);
        } else {
            const orderData = await orderResponse.json();
            console.log('POS order saved:', orderData);
            return orderData; // Return the saved order data
        }
    } catch (error) {
        console.error('Error saving POS order:', error);
        // Continue even if order save fails
        throw error;
    }
}

// Get all POS orders from backend
async function getPosOrders() {
    try {
        const userToken = currentUser?.token;
        if (!userToken) {
            console.error('No token found. Please login again.');
            throw new Error('Authentication required');
        }

        const branchId = currentUser?.branchId;
        if (!branchId) {
            console.error('Branch ID not found');
            throw new Error('Branch ID is required');
        }

        // IMPORTANT: Backend doesn't have GET /api/pos-orders/:orderId route
        // Must use: GET /api/pos-orders?branchId=xxx (with branchId as query parameter)
        const url = `https://api.mr-bakers.com/api/pos-orders?branchId=${encodeURIComponent(branchId)}`;
        
        console.log('Fetching POS orders from:', url);
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                console.error('401 Unauthorized - Token may be expired');
                alert('Session expired. Please login again.');
                sessionStorage.removeItem('user');
                window.location.href = 'index.html';
                throw new Error('Authentication failed');
            }
            const errorText = await response.text();
            console.error(`Failed to fetch POS orders: ${response.status}`, errorText);
            throw new Error(`Failed to fetch POS orders: ${response.status}`);
        }

        const data = await response.json();
        console.log('POS orders fetched:', data);
        // Backend returns { message, orders } format
        return data.orders || data;
    } catch (error) {
        console.error('Error fetching POS orders:', error);
        throw error;
    }
}

// Get a single POS order by ID
// Note: Backend doesn't have GET /api/pos-orders/:orderId route
// So we fetch all orders and filter by ID
async function getPosOrderById(orderId) {
    try {
        if (!orderId) {
            throw new Error('Order ID is required');
        }

        // Fetch all orders using the correct endpoint
        const allOrders = await getPosOrders();
        
        // Handle different response formats from backend
        let ordersArray = [];
        if (Array.isArray(allOrders)) {
            ordersArray = allOrders;
        } else if (allOrders && Array.isArray(allOrders.orders)) {
            ordersArray = allOrders.orders;
        } else if (allOrders && allOrders.data && Array.isArray(allOrders.data)) {
            ordersArray = allOrders.data;
        } else {
            console.warn('Unexpected response format from getPosOrders:', allOrders);
            ordersArray = [];
        }
        
        // Find order by ID (handle different ID formats)
        const order = ordersArray.find(o => {
            if (!o) return false;
            const orderIdStr = String(orderId).trim();
            const id1 = o._id ? String(o._id).trim() : '';
            const id2 = o.id ? String(o.id).trim() : '';
            return id1 === orderIdStr || id2 === orderIdStr;
        });
        
        if (order) {
            console.log('POS order found by ID:', order);
            return order;
        } else {
            console.warn(`Order with ID ${orderId} not found. Total orders: ${ordersArray.length}`);
            throw new Error(`Order with ID ${orderId} not found`);
        }
    } catch (error) {
        console.error('Error fetching POS order by ID:', error);
        throw error;
    }
}

// Update bill image for a POS order
async function updateBillImage(orderId, billImage) {
    try {
        const userToken = currentUser?.token;
        if (!userToken) {
            console.error('No token found. Please login again.');
            throw new Error('Authentication required');
        }

        const response = await fetch(`https://api.mr-bakers.com/api/pos-order/${orderId}/bill`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`,
                'Accept': 'application/json'
            },
            body: JSON.stringify({ bill: billImage })
        });

        if (!response.ok) {
            if (response.status === 401) {
                console.error('401 Unauthorized - Token may be expired');
                alert('Session expired. Please login again.');
                sessionStorage.removeItem('user');
                window.location.href = 'index.html';
                throw new Error('Authentication failed');
            }
            const errorText = await response.text();
            console.error(`Failed to update bill image: ${response.status}`, errorText);
            throw new Error(`Failed to update bill image: ${response.status}`);
        }

        const data = await response.json();
        console.log('Bill image updated:', data);
        return data;
    } catch (error) {
        console.error('Error updating bill image:', error);
        throw error;
    }
}

// Setup order type buttons - moved inside DOMContentLoaded
function setupOrderTypeButtons() {
    const orderTypeButtons = document.querySelectorAll('.order-type-btn');
    const hiddenInput = document.getElementById('orderOrderType');
    
    if (orderTypeButtons.length > 0 && hiddenInput) {
        orderTypeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                // Remove active class from all buttons
                orderTypeButtons.forEach(b => b.classList.remove('active'));
                
                // Add active class to clicked button
                btn.classList.add('active');
                
                // Set hidden input value
                const orderType = btn.getAttribute('data-type');
                hiddenInput.value = orderType;
                
                // Update currentOrderType variable
                currentOrderType = orderType;
            });
        });
    }
}

window.updateQuantity = updateQuantity;
window.removeItem = removeItem;
