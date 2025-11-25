let cart = { items: [] };
let currentUser = null;
let paymentMethodSelect = null;
let stripe = null;
let stripeCardNumber = null;
let stripeCardExpiry = null;
let stripeCardCvc = null;
let stripeCardForm = null;
let stripeCardErrors = null;
let stripePublicKey = null;

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
    stripeCardForm = document.getElementById('stripeCardForm');
    stripeCardErrors = document.getElementById('stripeCardErrors');

    loadCart();
    renderCart();
    setupEventListeners();
    setupPhoneModalListeners();
    initializeStripe();
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
    if (paymentMethodSelect) {
        paymentMethodSelect.addEventListener('change', async (e) => {
            const selectedMethod = e.target.value;
            if (selectedMethod === 'Card') {
                stripeCardForm.style.display = 'block';
                // Wait for Stripe to initialize if not ready
                if (!stripe) {
                    await initializeStripe();
                }
                if (stripe && !stripeCardNumber) {
                    setupStripeCardElement();
                }
            } else {
                stripeCardForm.style.display = 'none';
                // Reset Stripe payment method when switching away
                window.stripePaymentMethodId = null;
                const addCardBtn = document.getElementById('addCardBtn');
                if (addCardBtn) {
                    addCardBtn.textContent = 'Add Card';
                }
            }
        });
    }

    // Add card button listener
    const addCardBtn = document.getElementById('addCardBtn');
    if (addCardBtn) {
        addCardBtn.addEventListener('click', async () => {
            await handleStripeCardAdd();
        });
    }

    purchaseBtnEl.addEventListener('click', async () => {
        if (!cart || !cart.items || cart.items.length === 0) {
            alert('Your cart is empty. Please add products first.');
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

    document.getElementById('logoutBtn').addEventListener('click', () => {
        sessionStorage.removeItem('user');
        window.location.href = 'index.html';
    });
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

            await triggerCheckoutFlow();
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

            await triggerCheckoutFlow();
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

        // Handle Stripe payment
        await triggerCheckoutFlow();
    });
}

async function triggerCheckoutFlow() {
    const method = currentPaymentMethod;
    if (!method) {
        alert('Payment method missing. Please select again.');
        window.allowBillGeneration = false;
        return;
    }

    if (method === 'Card') {
        await processStripePayment();
    } else {
        await savePaymentRecord(method);
        await savePosOrder(method, currentOrderType || 'take-away'); // Save POS order with selected order type
        // Bill generation disabled — no modal will be shown
    }
}

// Bill generation is disabled. Keeping a no-op function to avoid runtime errors if called.
function generateBill() {
    console.log('generateBill: disabled');
}

// Bill modal and print helpers removed — invoice UI handled server-side or disabled in frontend

// Stripe Integration Functions
async function initializeStripe() {
    try {
        // First, ensure Stripe keys exist in backend
        await ensureStripeKeys();
        
        // Fetch Stripe public key
        const publicKey = await getStripePublicKey();
        if (publicKey) {
            stripePublicKey = publicKey;
            stripe = Stripe(publicKey);
            console.log('Stripe initialized successfully');
        } else {
            console.error('Failed to get Stripe public key');
        }
    } catch (error) {
        console.error('Error initializing Stripe:', error);
    }
}

async function ensureStripeKeys() {
    try {
        const branchId = currentUser.branchId;
        if (!branchId) {
            console.error('Branch ID not found');
            return;
        }

        // Check if keys exist
        const response = await fetch(`https://api.mr-bakers.com/api/stripe-keys/${branchId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (response.ok) {
            const data = await response.json();
            if (data.stripePublicKey) {
                console.log('Stripe keys already exist');
                return;
            }
        }

        // Keys don't exist, create them
        const userToken = currentUser.token;
        const createResponse = await fetch('https://api.mr-bakers.com/api/stripe-keys', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': userToken ? `Bearer ${userToken}` : ''
            },
            body: JSON.stringify({
                branchId: branchId,
                stripePublicKey: 'pk_test_51SFF7NRSKi9P4SsbBZEIzebwnEMiiqSGxfSANV7DJAOdz6WXOOWwLDV1E5ufTtluui9NJzz0fetEOrvxwJJ2lLEk00JOnDkjtv'
                // Note: stripeSecretKey should be configured securely on backend, not sent from frontend
            })
        });

        if (createResponse.ok) {
            console.log('Stripe keys created successfully');
        } else {
            const errorData = await createResponse.json();
            console.error('Failed to create Stripe keys:', errorData);
        }
    } catch (error) {
        console.error('Error ensuring Stripe keys:', error);
    }
}

async function getStripePublicKey() {
    try {
        const branchId = currentUser.branchId;
        if (!branchId) {
            console.error('Branch ID not found');
            return null;
        }

        const response = await fetch(`https://api.mr-bakers.com/api/stripe-keys/${branchId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (response.ok) {
            const data = await response.json();
            return data.stripePublicKey || 'pk_test_51SFF7NRSKi9P4SsbBZEIzebwnEMiiqSGxfSANV7DJAOdz6WXOOWwLDV1E5ufTtluui9NJzz0fetEOrvxwJJ2lLEk00JOnDkjtv';
        } else {
            // Fallback to provided key
            return 'pk_test_51SFF7NRSKi9P4SsbBZEIzebwnEMiiqSGxfSANV7DJAOdz6WXOOWwLDV1E5ufTtluui9NJzz0fetEOrvxwJJ2lLEk00JOnDkjtv';
        }
    } catch (error) {
        console.error('Error fetching Stripe public key:', error);
        // Fallback to provided key
        return 'pk_test_51SFF7NRSKi9P4SsbBZEIzebwnEMiiqSGxfSANV7DJAOdz6WXOOWwLDV1E5ufTtluui9NJzz0fetEOrvxwJJ2lLEk00JOnDkjtv';
    }
}

function setupStripeCardElement() {
    if (!stripe) {
        console.error('Stripe not initialized');
        return;
    }

    const elements = stripe.elements();
    const style = {
        base: {
            fontSize: '16px',
            color: '#333333',
            fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif',
            '::placeholder': {
                color: '#999999'
            }
        },
        invalid: {
            color: '#fa755a',
            iconColor: '#fa755a'
        }
    };

    // Create card number element
    const cardNumberElement = elements.create('cardNumber', { style });
    cardNumberElement.mount('#stripeCardNumber');
    stripeCardNumber = cardNumberElement;

    // Create expiry element
    const cardExpiryElement = elements.create('cardExpiry', { style });
    cardExpiryElement.mount('#stripeCardExpiry');
    stripeCardExpiry = cardExpiryElement;

    // Create CVV element
    const cardCvcElement = elements.create('cardCvc', { style });
    cardCvcElement.mount('#stripeCardCvc');
    stripeCardCvc = cardCvcElement;

    // Listen for errors on all elements
    const handleError = (event) => {
        if (event.error) {
            stripeCardErrors.textContent = event.error.message;
            stripeCardErrors.style.display = 'block';
        } else {
            stripeCardErrors.textContent = '';
            stripeCardErrors.style.display = 'none';
        }
    };

    cardNumberElement.on('change', handleError);
    cardExpiryElement.on('change', handleError);
    cardCvcElement.on('change', handleError);
}

async function handleStripeCardAdd() {
    if (!stripe || !stripeCardNumber || !stripeCardExpiry || !stripeCardCvc) {
        alert('Stripe is not initialized. Please refresh the page.');
        return;
    }

    const addCardBtn = document.getElementById('addCardBtn');
    addCardBtn.disabled = true;
    addCardBtn.textContent = 'Processing...';

    try {
        // Create payment method using separate card elements
        const { paymentMethod, error } = await stripe.createPaymentMethod({
            type: 'card',
            card: stripeCardNumber,
            billing_details: {
                // Optional: Add billing details if needed
            }
        });

        if (error) {
            stripeCardErrors.textContent = error.message;
            stripeCardErrors.style.display = 'block';
            addCardBtn.disabled = false;
            addCardBtn.textContent = 'Add Card';
            return;
        }

        // Card added successfully
        stripeCardErrors.textContent = 'Card added successfully!';
        stripeCardErrors.style.display = 'block';
        stripeCardErrors.style.color = '#28a745';
        
        // Store payment method ID for later use
        window.stripePaymentMethodId = paymentMethod.id;
        
        addCardBtn.disabled = false;
        addCardBtn.textContent = 'Card Added ✓';
        
        setTimeout(() => {
            stripeCardErrors.textContent = '';
            stripeCardErrors.style.display = 'none';
        }, 3000);
    } catch (error) {
        console.error('Error adding card:', error);
        stripeCardErrors.textContent = 'An error occurred. Please try again.';
        stripeCardErrors.style.display = 'block';
        addCardBtn.disabled = false;
        addCardBtn.textContent = 'Add Card';
    }
}

async function processStripePayment() {
    if (!stripe || !stripeCardNumber || !stripeCardExpiry || !stripeCardCvc) {
        alert('Stripe card form is not ready. Please add a card first.');
        window.allowBillGeneration = false;
        return;
    }

    const purchaseBtn = document.getElementById('purchaseBtn');
    purchaseBtn.disabled = true;
    purchaseBtn.textContent = 'Processing Payment...';

    if (!window.allowBillGeneration) {
        purchaseBtn.disabled = false;
        purchaseBtn.textContent = 'Purchase';
        return;
    }

    try {
        const subtotal = cart.items.reduce((sum, item) => {
            return sum + (item.productId.price * item.quantity);
        }, 0);
        const tax = subtotal * 0.05;
        const total = subtotal + tax;

        // Convert to paise (Stripe uses smallest currency unit - for INR, it's paise)
        const amountInPaise = Math.round(total * 100);

        // Create payment method if not already created
        let paymentMethodId = window.stripePaymentMethodId;
        if (!paymentMethodId) {
            const { paymentMethod, error } = await stripe.createPaymentMethod({
                type: 'card',
                card: stripeCardNumber,
                billing_details: {
                    // Optional: Add billing details if needed
                }
            });

            if (error) {
                stripeCardErrors.textContent = error.message;
                stripeCardErrors.style.display = 'block';
                purchaseBtn.disabled = false;
                purchaseBtn.textContent = 'Purchase';
                return;
            }
            paymentMethodId = paymentMethod.id;
        }

        // Process payment - card is already validated through createPaymentMethod
        try {
            // Validate that payment method was created successfully
            if (!paymentMethodId) {
                throw new Error('Payment method not created');
            }

            // Payment method creation means card is valid
            // Save payment record to backend
            await savePaymentRecord('Card');
            // Save POS order to backend
            await savePosOrder('Card', currentOrderType || 'take-away');

            // Payment successful - bill generation disabled
            window.allowBillGeneration = false;
            
            // Reset Stripe form
            if (stripeCardNumber) {
                stripeCardNumber.clear();
            }
            if (stripeCardExpiry) {
                stripeCardExpiry.clear();
            }
            if (stripeCardCvc) {
                stripeCardCvc.clear();
            }
            window.stripePaymentMethodId = null;
            const addCardBtn = document.getElementById('addCardBtn');
            if (addCardBtn) {
                addCardBtn.textContent = 'Add Card';
            }
            
        } catch (validationError) {
            throw new Error('Payment validation failed: ' + validationError.message);
        }
        
    } catch (error) {
        console.error('Payment error:', error);
        stripeCardErrors.textContent = error.message || 'Payment failed. Please try again.';
        stripeCardErrors.style.display = 'block';
        purchaseBtn.disabled = false;
        purchaseBtn.textContent = 'Purchase';
        window.allowBillGeneration = false;
    }
}

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

// Save payment record to backend
async function savePaymentRecord(paymentMethod) {
    try {
        const subtotal = cart.items.reduce((sum, item) => {
            return sum + (item.productId.price * item.quantity);
        }, 0);
        const tax = subtotal * 0.05;
        const total = subtotal + tax;

        const userToken = currentUser.token;
        const userId = currentUser.id;

        // Map payment method to backend format - backend expects capitalized format like "Cash", "Card", "PayPal"
        const paymentMap = {
            'Cash': 'Cash',
            'Card': 'Card',
            'card': 'Card',
            'cash': 'Cash',
            'paypal': 'PayPal',
            'PayPal': 'PayPal'
        };
        const mappedMethod = paymentMap[paymentMethod] || paymentMethod;

        const paymentData = {
            user: userId,
            method: mappedMethod,
            amount: total,
            date: new Date().toISOString()
        };

        console.log('Saving payment record to backend:', paymentData);

        const paymentResponse = await fetch('https://api.mr-bakers.com/api/payments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': userToken ? `Bearer ${userToken}` : '',
                'Accept': 'application/json'
            },
            body: JSON.stringify(paymentData)
        });

        if (!paymentResponse.ok) {
            console.warn('Failed to save payment record');
        } else {
            const paymentData = await paymentResponse.json();
            console.log('Payment record saved:', paymentData);
        }
    } catch (error) {
        console.error('Error saving payment record:', error);
        // Continue even if payment record save fails
    }
}

window.updateQuantity = updateQuantity;
window.removeItem = removeItem;
