let cart = { items: [] };
let currentUser = null;

window.addEventListener('DOMContentLoaded', () => {
    const userStr = localStorage.getItem('user');
    if (!userStr) {
        window.location.href = 'index.html';
        return;
    }

    currentUser = JSON.parse(userStr);
    if (!currentUser.loggedIn) {
        window.location.href = 'index.html';
        return;
    }

    loadCart();
    renderCart();
    setupEventListeners();
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
    
    cartItems.innerHTML = cart.items.map((item) => {
        const product = item.productId;
        const emoji = product.emoji || '🍞';
        const name = product.name || 'Product';
        const price = product.price || 0;
        const quantity = item.quantity || 1;
        const productId = product.id;

        return `
            <div class="cart-item">
                <div class="item-info">
                    <div class="item-emoji">${emoji}</div>
                    <div class="item-details">
                        <div class="item-name">${name}</div>
                        <div class="item-price">₹${price} each</div>
                    </div>
                </div>
                <div class="item-controls">
                    <div class="quantity-control">
                        <button class="qty-btn" onclick="updateQuantity('${productId}', ${quantity - 1})">-</button>
                        <span class="quantity">${quantity}</span>
                        <button class="qty-btn" onclick="updateQuantity('${productId}', ${quantity + 1})">+</button>
                    </div>
                    <div class="item-total">₹${(price * quantity).toFixed(2)}</div>
                    <button class="remove-btn" onclick="removeItem('${productId}')">Remove</button>
                </div>
            </div>
        `;
    }).join('');

    updateSummary();
}

function updateQuantity(productId, newQuantity) {
    if (newQuantity <= 0) {
        cart.items = cart.items.filter(item => item.productId.id !== productId);
    } else {
        const item = cart.items.find(item => item.productId.id === productId);
        if (item) {
            item.quantity = newQuantity;
        }
    }
    
    saveCart();
    renderCart();
}

function removeItem(productId) {
    cart.items = cart.items.filter(item => item.productId.id !== productId);
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
    document.getElementById('purchaseBtn').addEventListener('click', () => {
        if (!cart || !cart.items || cart.items.length === 0) {
            alert('Your cart is empty. Please add products first.');
            return;
        }
        
        // Validate form before generating bill
        const customerName = document.getElementById('customerName').value.trim();
        const paymentMethod = document.getElementById('paymentMethod').value;
        
        if (!customerName) {
            alert('Please enter customer name');
            document.getElementById('customerName').focus();
            return;
        }
        
        if (!paymentMethod) {
            alert('Please select payment method');
            document.getElementById('paymentMethod').focus();
            return;
        }
        
        generateBill(customerName, paymentMethod);
    });

    document.getElementById('clearBtn').addEventListener('click', () => {
        if (confirm('Are you sure you want to clear the cart?')) {
            cart = { items: [] };
            saveCart();
            renderCart();
            // Reset form
            document.getElementById('customerName').value = '';
            document.getElementById('paymentMethod').value = 'cash';
        }
    });

    document.getElementById('backBtn').addEventListener('click', () => {
        window.location.href = 'product.html';
    });

    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('user');
        window.location.href = 'index.html';
    });
}

function generateBill(customerName, paymentMethod) {
    const purchaseBtn = document.getElementById('purchaseBtn');
    purchaseBtn.disabled = true;
    purchaseBtn.textContent = 'Processing...';

    const subtotal = cart.items.reduce((sum, item) => {
        return sum + (item.productId.price * item.quantity);
    }, 0);
    const tax = subtotal * 0.05;
    const total = subtotal + tax;

    const order = {
        customerName: customerName,
        paymentMethod: paymentMethod,
        username: currentUser.username,
        items: cart.items.map(item => ({
            productName: item.productId.name,
            productEmoji: item.productId.emoji || '🍞',
            quantity: item.quantity,
            price: item.productId.price,
            total: item.productId.price * item.quantity
        })),
        subtotal: subtotal,
        tax: tax,
        total: total,
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

    const billContent = `
        <div class="bill-header">
            <div class="mr-baker-logo">
                <span class="logo-text">MR. BAKER</span>
            </div>
            <p>Invoice</p>
        </div>
        <div class="bill-info">
            <p><strong>Customer:</strong> ${order.customerName}</p>
            <p><strong>Date:</strong> ${date}</p>
            <p><strong>Invoice #:</strong> ${order.invoiceNumber}</p>
            <p><strong>Payment Method:</strong> ${order.paymentMethod.toUpperCase()}</p>
        </div>
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
            <p>Payment Method: <strong>${order.paymentMethod.toUpperCase()}</strong></p>
            <p>Thank you for your purchase!</p>
        </div>
        <div class="bill-actions">
            <button class="print-btn" onclick="window.print()">🖨️ Print Bill</button>
            <button class="back-btn" onclick="window.location.href='product.html'">Continue Shopping</button>
        </div>
    `;

    document.getElementById('billContent').innerHTML = billContent;
    document.getElementById('billSection').style.display = 'block';
    document.getElementById('billSection').scrollIntoView({ behavior: 'smooth' });

    // Clear cart after bill generation
    cart = { items: [] };
    saveCart();
    renderCart();
    
    // Reset form
    document.getElementById('customerName').value = '';
    document.getElementById('paymentMethod').value = 'cash';

    purchaseBtn.disabled = false;
    purchaseBtn.textContent = 'Purchase & Print Bill';
    
    // Auto print after a short delay
    setTimeout(() => {
        window.print();
    }, 500);
}

window.updateQuantity = updateQuantity;
window.removeItem = removeItem;
