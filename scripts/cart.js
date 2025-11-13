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

        // Handle Stripe payment
        if (selectedPaymentMethod === 'Stripe Card') {
            await processStripePayment();
        } else {
            // Save payment record for other payment methods
            await savePaymentRecord(selectedPaymentMethod);
            generateBill(selectedPaymentMethod);
        }
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

function generateBill(paymentMethod) {
    const purchaseBtn = document.getElementById('purchaseBtn');
    purchaseBtn.disabled = true;
    purchaseBtn.textContent = 'Processing...';

    const subtotal = cart.items.reduce((sum, item) => {
        return sum + (item.productId.price * item.quantity);
    }, 0);
    const tax = subtotal * 0.05;
    const total = subtotal + tax;

    const order = {
        username: currentUser.username,
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
        }, { once: true });
        
        // Fallback: hide after delay
        setTimeout(() => {
            billSection.style.display = 'none';
            billSection.style.visibility = 'hidden';
            if (paymentMethodSelect) {
                paymentMethodSelect.value = '';
            }
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
        return;
    }

    const purchaseBtn = document.getElementById('purchaseBtn');
    purchaseBtn.disabled = true;
    purchaseBtn.textContent = 'Processing Payment...';

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
