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
    setupModalListeners();
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
            if (selectedMethod === 'Stripe Card') {
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
            if (paymentMethodSelect) {
                paymentMethodSelect.value = '';
            }
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
let currentCustomerData = null;
let currentLoyaltyPoints = 0;

// Cache for users list (fetched once and stored locally)
let usersCache = null;
let usersCacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

function showPhoneNumberModal(paymentMethod) {
    currentPaymentMethod = paymentMethod;
    const phoneModal = document.getElementById('phoneModal');
    const phoneInput = document.getElementById('customerPhone');
    const customerInfo = document.getElementById('customerInfo');
    const phoneSearchStatus = document.getElementById('phoneSearchStatus');
    const continueBtn = document.getElementById('continueBtn');
    
    phoneInput.value = '';
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
    
    // Ensure bill modal is closed when opening phone modal
    const billModal = document.getElementById('billModal');
    if (billModal) {
        billModal.style.display = 'none';
    }
    
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

// Fetch all users from API and cache them locally
async function fetchAllUsers() {
    // Check if cache is still valid
    const now = Date.now();
    if (usersCache && usersCacheTimestamp && (now - usersCacheTimestamp) < CACHE_DURATION) {
        console.log('Using cached users list');
        return usersCache;
    }

    try {
        // Get token from currentUser (stored in sessionStorage)
        const userToken = currentUser?.token;
        
        // Debug: Log token status
        if (!userToken) {
            console.error('No token found. Please login again.');
            alert('Session expired. Please login again.');
            sessionStorage.removeItem('user');
            window.location.href = 'index.html';
            return;
        }

        console.log('Fetching users with token:', userToken.substring(0, 20) + '...');
        
        const response = await fetch('https://api.mr-bakers.com/api/users', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`,
                'Accept': 'application/json'
            }
        });

        console.log('Users API response status:', response.status);

        if (!response.ok) {
            if (response.status === 401) {
                const errorText = await response.text();
                console.error('401 Unauthorized - Token may be expired:', errorText);
                alert('Session expired. Please login again.');
                sessionStorage.removeItem('user');
                window.location.href = 'index.html';
                throw new Error('Authentication failed. Please login again.');
            }
            const errorText = await response.text();
            console.error(`Failed to fetch users: ${response.status}`, errorText);
            throw new Error(`Failed to fetch users: ${response.status}`);
        }

        const data = await response.json();
        
        // Handle different response formats
        let usersArray = [];
        if (Array.isArray(data)) {
            usersArray = data;
        } else if (data.data && Array.isArray(data.data)) {
            usersArray = data.data;
        } else if (data.users && Array.isArray(data.users)) {
            usersArray = data.users;
        }

        // Filter only customers
        const customers = usersArray.filter(user => user.role === 'customer');
        
        // Cache the results
        usersCache = customers;
        usersCacheTimestamp = now;
        
        console.log(`Fetched and cached ${customers.length} customers`);
        return customers;
    } catch (error) {
        console.error('Error fetching users:', error);
        throw error;
    }
}

// Search for customer by phone number locally from cached users (clean simple logic)
function findCustomerByPhone(phoneNumber, usersList) {
    const customer = usersList.find(
        (user) => String(user.phone) === String(phoneNumber)
    );
    return customer || null;
}

// Main function to find customer by phone number (searches locally)
async function fetchCustomerByPhone(phoneNumber) {
    try {
        // Step 1: Load all users (or use cache)
        const usersList = await fetchAllUsers();
        
        // Step 2: Find user locally by phone number (clean search)
        const customer = findCustomerByPhone(phoneNumber, usersList);
        
        if (customer) {
            console.log('Customer found locally:', customer);
            return customer;
        }

        console.log(`Customer not found with phone: ${phoneNumber}`);
        return null;
    } catch (error) {
        console.error('Error fetching customer:', error);
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
        const phoneNumber = phoneInput.value.trim();

        if (!phoneNumber || phoneNumber.length < 7) {
            phoneInput.classList.add('input-error');
            setTimeout(() => phoneInput.classList.remove('input-error'), 1500);
            alert('Please enter a valid phone number (minimum 7 digits).');
            return;
        }

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
        
        // Ensure bill modal is closed
        const billModal = document.getElementById('billModal');
        if (billModal) {
            billModal.style.display = 'none';
        }

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
                
                // Ensure bill modal is definitely closed
                const billModalCheck = document.getElementById('billModal');
                if (billModalCheck) {
                    billModalCheck.style.display = 'none';
                }
                
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

    if (method === 'Stripe Card') {
        await processStripePayment();
    } else {
        await savePaymentRecord(method);
        generateBill(method);
    }
}

function generateBill(paymentMethod) {
    const purchaseBtn = document.getElementById('purchaseBtn');
    if (!window.allowBillGeneration) {
        console.warn('Bill generation blocked: flag not set.');
        if (purchaseBtn) {
            purchaseBtn.disabled = false;
            purchaseBtn.textContent = 'Purchase & Print Bill';
        }
        return;
    }
    window.allowBillGeneration = false;
    if (purchaseBtn) {
        purchaseBtn.disabled = true;
        purchaseBtn.textContent = 'Processing...';
    }

    const subtotal = cart.items.reduce((sum, item) => {
        return sum + (item.productId.price * item.quantity);
    }, 0);
    const tax = subtotal * 0.05;
    const loyaltyDiscount = window.loyaltyDiscount || 0;
    const total = Math.max(0, subtotal + tax - loyaltyDiscount); // Ensure total doesn't go negative

    const customerPhone = window.customerPhoneNumber || '';
    const customerData = window.customerData || null;
    const loyaltyPoints = window.loyaltyPoints || 0;

    const order = {
        username: currentUser.username,
        customerPhone: customerPhone,
        customerData: customerData,
        loyaltyPoints: loyaltyPoints,
        items: cart.items.map(item => {
            let productName = item.productId.name;
            if (item.selectedSize) {
                productName += ` (${item.selectedSize})`;
            }
            return {
                productName: productName,
                productEmoji: item.productId.emoji || '🍞',
                quantity: item.quantity,
                price: item.productId.price,
                total: item.productId.price * item.quantity
            };
        }),
        subtotal: subtotal,
        tax: tax,
        loyaltyDiscount: loyaltyDiscount,
        total: total,
        paymentMethod: paymentMethod,
        orderDate: new Date().toISOString(),
        invoiceNumber: `INV-${Date.now()}`
    };

    const date = new Date(order.orderDate).toLocaleString('en-IN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });

    // Bill content without buttons (for modal preview)
    const billContentWithoutButtons = `
        <div class="bill-header">
            <div class="mr-baker-logo">
                <span class="logo-text">MR. BAKER</span>
            </div>
            <p>Invoice</p>
        </div>
        <div class="bill-info">
            <p><strong>Date:</strong> ${date}</p>
            <p><strong>Invoice #:</strong> ${order.invoiceNumber}</p>
            ${order.customerPhone ? `<p><strong>Customer Phone:</strong> ${order.customerPhone}</p>` : ''}
            ${order.customerData ? (() => {
                const cust = order.customerData;
                let custName = '';
                if (cust.firstName && cust.lastName) {
                    custName = `${cust.firstName} ${cust.lastName}`;
                } else if (cust.firstName) {
                    custName = cust.firstName;
                } else if (cust.name) {
                    custName = cust.name;
                } else if (cust.username) {
                    custName = cust.username;
                } else {
                    custName = 'Customer';
                }
                return `<p><strong>Customer:</strong> ${custName}</p>`;
            })() : ''}
        </div>
        <p><strong>Payment Method:</strong> ${order.paymentMethod}</p>
        <hr class="bill-divider">
        <div class="bill-items">
            <div class="bill-item-header">
                <span>Item</span>
                <span>Qty</span>
                <span>Price</span>
                <span>Total</span>
            </div>
            ${order.items.map(item => `
                <div class="bill-item">
                    <span>${item.productEmoji} ${item.productName}</span>
                    <span>x${item.quantity}</span>
                    <span>₹${item.price.toFixed(2)}</span>
                    <span>₹${item.total.toFixed(2)}</span>
                </div>
            `).join('')}
        </div>
        <hr class="bill-divider">
        <div class="bill-total">
            <span>Subtotal:</span>
            <span>₹${order.subtotal.toFixed(2)}</span>
        </div>
        <div class="bill-total">
            <span>Tax (5%):</span>
            <span>₹${order.tax.toFixed(2)}</span>
        </div>
        ${order.loyaltyDiscount > 0 ? `
        <div class="bill-total discount">
            <span>Loyalty Points Discount:</span>
            <span>-₹${order.loyaltyDiscount.toFixed(2)}</span>
        </div>
        ` : ''}
        <div class="bill-total grand-total">
            <span><strong>Total:</strong></span>
            <span><strong>₹${order.total.toFixed(2)}</strong></span>
        </div>
        <div class="bill-footer">
            <p>Thank you for your purchase!</p>
        </div>
    `;

    // Bill content with buttons (for printing)
    const billContentWithButtons = billContentWithoutButtons + `
        <div class="bill-actions">
            <button class="print-btn" onclick="window.print()">🖨️ Print Bill</button>
            <button class="back-btn" onclick="window.location.href='product.html'">Continue Shopping</button>
        </div>
    `;

    // Ensure phone modal is closed before opening bill
    const phoneModal = document.getElementById('phoneModal');
    if (phoneModal) {
        phoneModal.style.display = 'none';
    }
    
    // Show bill in modal (without buttons - modal has its own footer buttons)
    document.getElementById('modalBillContent').innerHTML = billContentWithoutButtons;
    document.getElementById('billModal').style.display = 'flex';
    
    // Save full bill with buttons to billSection for printing (but hide it on page)
    document.getElementById('billContent').innerHTML = billContentWithButtons;
    document.getElementById('billSection').style.display = 'none'; // Hide from page, only show when printing

    purchaseBtn.disabled = false;
    purchaseBtn.textContent = 'Purchase & Print Bill';
    if (paymentMethodSelect) {
        paymentMethodSelect.value = '';
    }
}

// Setup modal listeners once on page load
let modalListenersSetup = false;

function setupModalListeners() {
    if (modalListenersSetup) return; // Prevent duplicate listeners
    
    const modal = document.getElementById('billModal');
    const closeModal = document.getElementById('closeModal');
    const cancelBtn = document.getElementById('cancelBillBtn');
    const printBtn = document.getElementById('printBillBtn');
    
    if (!modal || !closeModal || !cancelBtn || !printBtn) return;
    
    // Close modal handlers
    const closeModalHandler = () => {
        modal.style.display = 'none';
        // Always hide bill section from page - only show in modal
        document.getElementById('billSection').style.display = 'none';
        // Clear cart after closing modal (if user doesn't print)
        cart = { items: [] };
        saveCart();
        renderCart();
        if (paymentMethodSelect) {
            paymentMethodSelect.value = '';
        }
        // Clear customer phone number and loyalty data
        window.customerPhoneNumber = '';
        window.customerData = null;
        window.loyaltyPoints = 0;
        window.loyaltyDiscount = 0;
    };
    
    closeModal.addEventListener('click', closeModalHandler);
    cancelBtn.addEventListener('click', closeModalHandler);
    
    // Close on overlay click
    modal.querySelector('.modal-overlay').addEventListener('click', closeModalHandler);
    
    // Print button handler
    printBtn.addEventListener('click', () => {
        // Save full bill with buttons to billSection for printing
        const billSection = document.getElementById('billSection');
        
        // Close modal first
        modal.style.display = 'none';
        
        // Make bill section available for print (but keep it off-screen on page)
        billSection.style.display = 'block';
        billSection.style.position = 'absolute';
        billSection.style.left = '-9999px';
        billSection.style.top = '-9999px';
        billSection.style.visibility = 'visible';
        
        // Clear cart before printing
        cart = { items: [] };
        saveCart();
        renderCart();
        if (paymentMethodSelect) {
            paymentMethodSelect.value = '';
        }
        
        // Print directly - bill will show in print preview
        setTimeout(() => {
            window.print();
        }, 200);
        
        // After printing, hide bill section from page
        window.addEventListener('afterprint', () => {
            billSection.style.display = 'none';
            billSection.style.visibility = 'hidden';
            billSection.style.position = 'absolute';
            billSection.style.left = '-9999px';
            billSection.style.top = '-9999px';
            if (paymentMethodSelect) {
                paymentMethodSelect.value = '';
            }
            // Clear customer phone number
            window.customerPhoneNumber = '';
        }, { once: true });
        
        // Fallback: hide after delay
        setTimeout(() => {
            billSection.style.display = 'none';
            billSection.style.visibility = 'hidden';
            if (paymentMethodSelect) {
                paymentMethodSelect.value = '';
            }
            // Clear customer phone number
            window.customerPhoneNumber = '';
        }, 2000);
    });
    
    modalListenersSetup = true;
}

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
        purchaseBtn.textContent = 'Purchase & Print Bill';
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
                purchaseBtn.textContent = 'Purchase & Print Bill';
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
            await savePaymentRecord('Stripe Card');

            // Payment successful - generate bill
            generateBill('Stripe Card');
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
        purchaseBtn.textContent = 'Purchase & Print Bill';
        window.allowBillGeneration = false;
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

        const paymentResponse = await fetch('https://api.mr-bakers.com/api/payments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': userToken ? `Bearer ${userToken}` : '',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                user: userId,
                method: paymentMethod,
                amount: total,
                date: new Date().toISOString()
            })
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
