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

    purchaseBtnEl.addEventListener('click', () => {
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

        generateBill(selectedPaymentMethod);
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

window.updateQuantity = updateQuantity;
window.removeItem = removeItem;
