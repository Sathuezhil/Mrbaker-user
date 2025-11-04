// Products data - fetched from API
let products = [];
let cart = { items: [] };
let currentUser = null;

// Check login and load products
window.addEventListener('DOMContentLoaded', async () => {
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

    if (!currentUser.branchId) {
        alert('Branch ID not found. Please login again.');
        localStorage.removeItem('user');
        window.location.href = 'index.html';
        return;
    }

    loadCart();
    await fetchProducts();
    updateCartCount();
});

// Fetch products from API using branch-id
async function fetchProducts() {
    const productsGrid = document.getElementById('productsGrid');
    productsGrid.innerHTML = '<div class="loading">Loading products...</div>';
    
    try {
        const response = await fetch(`https://api.mr-bakers.com/api/foods/${currentUser.branchId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        const data = await response.json();

        console.log('Products API Response:', data);

        if (!response.ok) {
            throw new Error(data.message || 'Failed to fetch products');
        }

        // Transform API response to match our product structure
        // API returns products with: _id, name, category, productType, image, shortDescription, description, ingIngredients, price, avg_rating
        let productsData = [];
        
        if (Array.isArray(data)) {
            productsData = data;
        } else if (data.data && Array.isArray(data.data)) {
            productsData = data.data;
        } else if (data.foods && Array.isArray(data.foods)) {
            productsData = data.foods;
        } else {
            throw new Error('Invalid products data format');
        }

        // Map all product fields from API response
        products = productsData.map(item => ({
            _id: item._id,
            id: item._id || item.id, // Use _id as primary identifier
            name: item.name || '',
            category: item.category || null,
            categoryName: item.category?.name || '',
            productType: item.productType || null,
            productTypeName: item.productType?.name || '',
            image: item.image || '',
            shortDescription: item.shortDescription || '',
            description: item.description || '',
            ingIngredients: item.ingIngredients || '',
            price: item.price || 0,
            avg_rating: item.avg_rating || 0,
            // Keep emoji for fallback display
            emoji: item.emoji || '🍞'
        }));

        console.log('Processed Products:', products);

        if (products.length === 0) {
            productsGrid.innerHTML = '<div class="loading">No products available</div>';
            return;
        }

        renderProducts();
    } catch (error) {
        console.error('Error fetching products:', error);
        productsGrid.innerHTML = `<div class="loading error">Error loading products: ${error.message}</div>`;
    }
}

function loadCart() {
    const cartData = localStorage.getItem(`cart_${currentUser.id}`);
    cart = cartData ? JSON.parse(cartData) : { items: [] };
}

function saveCart() {
    localStorage.setItem(`cart_${currentUser.id}`, JSON.stringify(cart));
}

function renderProducts() {
    const productsGrid = document.getElementById('productsGrid');
    productsGrid.innerHTML = '';

    products.forEach(product => {
        const productCard = document.createElement('div');
        productCard.className = 'product-card';
        
        // Build image HTML - use actual image if available, else use emoji fallback
        const imageHtml = product.image 
            ? `<img src="${product.image}" alt="${product.name}" class="product-image-img" onerror="this.parentElement.innerHTML='${product.emoji}'">`
            : `<div class="product-image">${product.emoji}</div>`;
        
        // Build category and type badges
        const categoryBadge = product.categoryName 
            ? `<span class="product-badge category-badge">${product.categoryName}</span>` 
            : '';
        const typeBadge = product.productTypeName 
            ? `<span class="product-badge type-badge">${product.productTypeName}</span>` 
            : '';
        
        // Build rating stars
        const rating = product.avg_rating || 0;
        const ratingStars = '⭐'.repeat(Math.floor(rating)) + (rating % 1 >= 0.5 ? '✨' : '');
        const ratingHtml = rating > 0 
            ? `<div class="product-rating">${ratingStars} <span>${rating.toFixed(1)}</span></div>` 
            : '';
        
        // Build description - use shortDescription if available, else description
        const description = product.shortDescription || product.description || '';
        
        productCard.innerHTML = `
            <div class="product-image-container">
                ${imageHtml}
                ${categoryBadge}
                ${typeBadge}
            </div>
            <div class="product-info">
                <div class="product-name">${product.name}</div>
                ${description ? `<div class="product-description">${description}</div>` : ''}
                ${product.ingIngredients ? `<div class="product-ingredients">Ingredients: ${product.ingIngredients}</div>` : ''}
                ${ratingHtml}
                <div class="product-footer">
                    <div class="product-price">₹${product.price.toFixed(2)}</div>
                    <button class="add-to-cart-btn" data-id="${product.id}">Add to Cart</button>
                </div>
            </div>
        `;
        productsGrid.appendChild(productCard);
    });

    document.querySelectorAll('.add-to-cart-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const productId = btn.getAttribute('data-id');
            addToCart(productId, btn);
        });
    });
}

function addToCart(productId, button) {
    const product = products.find(p => p.id === productId || p._id === productId);
    if (!product) return;

    button.disabled = true;
    
    const existingItem = cart.items.find(item => item.productId.id === productId || item.productId._id === productId);
    
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.items.push({
            productId: {
                _id: product._id,
                id: product.id,
                name: product.name,
                price: product.price,
                image: product.image,
                categoryName: product.categoryName,
                productTypeName: product.productTypeName,
                emoji: product.emoji
            },
            quantity: 1
        });
    }
    
    saveCart();
    updateCartCount();

    button.textContent = 'Added!';
    button.classList.add('added');
    setTimeout(() => {
        button.textContent = 'Add to Cart';
        button.classList.remove('added');
        button.disabled = false;
    }, 1000);
}

function updateCartCount() {
    const cartCount = document.getElementById('cartCount');
    const totalItems = cart.items.reduce((sum, item) => sum + item.quantity, 0);
    cartCount.textContent = totalItems;
}

document.getElementById('cartBtn').addEventListener('click', () => {
    window.location.href = 'cart.html';
});

document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('user');
    window.location.href = 'index.html';
});
