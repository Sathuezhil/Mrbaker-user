// Products data - fetched from API
let products = [];
let allProducts = []; // Store all products for filtering
let categories = [];
let selectedCategoryId = '';
let cart = { items: [] };
let currentUser = null;
let recentOrders = [];

// Stripe variables (from cart.js)
let stripePublicKey = null;
let stripe = null;
let stripeCardNumber = null;
let stripeCardExpiry = null;
let stripeCardCvc = null;
let stripeCardErrors = null;

function capitalizeWords(text = '') {
    return String(text)
        .split(' ')
        .map(word => word ? word.charAt(0).toUpperCase() + word.slice(1) : '')
        .join(' ');
}

function extractUserName(user = {}) {
    if (!user) return '';
    const nestedUser = user.user || {};
    const firstName = user.firstName || user.first_name || nestedUser.firstName || nestedUser.first_name || null;
    const lastName = user.lastName || user.last_name || nestedUser.lastName || nestedUser.last_name || null;
    let displayName = '';

    if (firstName && lastName) {
        displayName = `${firstName} ${lastName}`;
    } else if (firstName || lastName) {
        displayName = firstName || lastName || '';
    } else {
        displayName = user.name || user.fullName || user.full_name || nestedUser.name || nestedUser.fullName || nestedUser.full_name || user.displayName || nestedUser.displayName || '';
    }

    return capitalizeWords(displayName.trim());
}

function extractUserPosition(user = {}) {
    if (!user) return '';
    const nestedUser = user.user || {};
    const position = user.position || user.role || user.userRole || user.designation || user.jobTitle || nestedUser.position || nestedUser.role || nestedUser.designation || nestedUser.jobTitle || '';
    return capitalizeWords(String(position).trim());
}

function normalizeUsersResponse(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.users)) return payload.users;
    if (Array.isArray(payload.data)) return payload.data;
    if (payload.results && Array.isArray(payload.results)) return payload.results;
    return [];
}

function findMatchingUserRecord(users = [], identifiers = []) {
    if (!Array.isArray(users) || users.length === 0) return null;
    const idSet = new Set(
        identifiers
            .filter(Boolean)
            .map(value => String(value).trim())
            .filter(value => value.length > 0)
    );

    if (idSet.size === 0) return null;

    return users.find(candidate => {
        const nestedUser = candidate.user || {};
        const candidateIds = [
            candidate._id, candidate.id, candidate.user_id, candidate.uid,
            nestedUser._id, nestedUser.id,
            candidate.username, nestedUser.username,
            candidate.email, nestedUser.email,
            candidate.phone, nestedUser.phone
        ]
        .filter(Boolean)
        .map(value => String(value).trim());

        return candidateIds.some(value => idSet.has(value));
    }) || null;
}

async function populateNavbarUserInfo() {
    const container = document.getElementById('usernameDisplay');
    const nameEl = document.getElementById('usernameText');
    const positionEl = document.getElementById('usernamePosition');

    if (!container || !nameEl) return;

    let displayName = extractUserName(currentUser);
    let position = extractUserPosition(currentUser);

    // Check userData and nested user object
    if (currentUser?.userData) {
        displayName = displayName || extractUserName(currentUser.userData);
        position = position || extractUserPosition(currentUser.userData);
        
        // Also check nested user object inside userData
        if (currentUser.userData.user) {
            displayName = displayName || extractUserName(currentUser.userData.user);
            position = position || extractUserPosition(currentUser.userData.user);
        }
        
        // Check data.user if it exists
        if (currentUser.userData.data?.user) {
            displayName = displayName || extractUserName(currentUser.userData.data.user);
            position = position || extractUserPosition(currentUser.userData.data.user);
        }
    }

    if (!displayName || !position) {
        // Get token the same way other functions do
        const authToken = currentUser?.token || currentUser?.userData?.token;
        
        if (!authToken) {
            console.warn('Cannot fetch /api/users: missing auth token');
            console.log('Current user keys:', Object.keys(currentUser || {}));
            if (currentUser?.userData) {
                console.log('UserData keys:', Object.keys(currentUser.userData));
            }
            return; // Exit early if no token
        }

        // Clean token - remove any extra whitespace
        const cleanToken = String(authToken).trim();
        
        if (!cleanToken || cleanToken === 'null' || cleanToken === 'undefined') {
            console.warn('Token is empty or invalid');
            return;
        }

        try {
            const response = await fetch('https://api.mr-bakers.com/api/users', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${cleanToken}`
                }
            });

            if (response.ok) {
                const payload = await response.json();
                const users = normalizeUsersResponse(payload);

                const identifiers = [
                    currentUser?.id,
                    currentUser?.user_id,
                    currentUser?.username,
                    currentUser?.email,
                    currentUser?.phone,
                    currentUser?.userData?._id,
                    currentUser?.userData?.id,
                    currentUser?.userData?.username,
                    currentUser?.userData?.email,
                    currentUser?.userData?.phone
                ].filter(Boolean); // Remove null/undefined values

                const matchedUser = findMatchingUserRecord(users, identifiers);

                if (matchedUser) {
                    displayName = displayName || extractUserName(matchedUser);
                    position = position || extractUserPosition(matchedUser);
                }
            } else {
                const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
                console.warn('Unable to fetch users for navbar display:', response.status, errorData);
                
                // If token is invalid/expired, fallback to username if available
                if (response.status === 401 && !displayName) {
                    displayName = currentUser?.username || currentUser?.userData?.username || '';
                    console.log('Token invalid/expired, using username as fallback:', displayName);
                }
            }
        } catch (error) {
            console.error('Failed to fetch users for navbar display:', error);
        }
    }

    if (displayName) {
        nameEl.textContent = displayName;
        container.style.display = 'flex';
    } else {
        container.style.display = 'none';
    }

    if (positionEl) {
        if (position) {
            positionEl.textContent = position;
            positionEl.style.display = 'block';
        } else {
            positionEl.textContent = '';
            positionEl.style.display = 'none';
        }
    }
}

// Check login and load products
window.addEventListener('DOMContentLoaded', async () => {
    // Clear legacy persisted login state so a fresh app launch always asks for credentials
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

    if (!currentUser.branchId) {
        alert('Branch ID not found. Please login again.');
        sessionStorage.removeItem('user');
        window.location.href = 'index.html';
        return;
    }

    await populateNavbarUserInfo();
    loadCart();
    await fetchBranchInfo();
    await fetchCategories();
    await fetchProducts();
    renderCart();
    updateCartCount();
    await loadRecentOrders();
    setupCartListeners();
    setupSizeModalListeners();
    setupOrderSummaryModalListeners();
    setupLoyaltyPointsModalListeners();
    setupBillModalListeners();

    const refreshOrdersBtn = document.getElementById('refreshOrdersBtn');
    if (refreshOrdersBtn) {
        refreshOrdersBtn.addEventListener('click', () => loadRecentOrders());
    }
});

// Fetch branch information from API
async function fetchBranchInfo() {
    try {
        const branchId = currentUser.branchId;
        if (!branchId) {
            document.getElementById('branchName').textContent = '';
            return;
        }

        const response = await fetch('https://api.mr-bakers.com/api/branch', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (response.ok) {
            const data = await response.json();
            const branches = data.data || [];
            // Find branch that matches the current user's branchId
            const branch = branches.find(b => b._id === branchId);
            if (branch && branch.name) {
                document.getElementById('branchName').textContent = branch.name;
            } else {
                document.getElementById('branchName').textContent = '';
            }
        } else {
            document.getElementById('branchName').textContent = '';
        }
    } catch (error) {
        console.error('Error fetching branch info:', error);
        document.getElementById('branchName').textContent = '';
    }
}

// Fetch categories from API
async function fetchCategories() {
    try {
        const response = await fetch('https://api.mr-bakers.com/api/categories', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (response.ok) {
            const data = await response.json();
            categories = data.data || [];
            renderCategoryChips();
        }
    } catch (error) {
        console.error('Error fetching categories:', error);
    }
}

// Render category chips with counts
function renderCategoryChips() {
    const chipsContainer = document.getElementById('categoryChips');
    if (!chipsContainer) return;

    const counts = getCategoryCounts();
    chipsContainer.innerHTML = '';

    const allChip = createCategoryChip('', 'All Categories', allProducts.length, selectedCategoryId === '');
    chipsContainer.appendChild(allChip);

    categories.forEach(category => {
        const count = counts[category._id] || 0;
        // Hide empty categories (count = 0)
        if (count > 0) {
            const chip = createCategoryChip(category._id, category.name, count, selectedCategoryId === category._id);
            chipsContainer.appendChild(chip);
        }
    });
}

function createCategoryChip(id, label, count, isActive) {
    const chip = document.createElement('button');
    chip.className = `category-chip${isActive ? ' active' : ''}`;
    chip.type = 'button';
    chip.dataset.categoryId = id || '';
    chip.innerHTML = `
        <span class="chip-label">${capitalizeWords(label)}</span>
        <span class="chip-count">${count}</span>
    `;
    chip.addEventListener('click', () => filterProductsByCategory(id));
    return chip;
}

function getCategoryCounts() {
    const counts = {};
    allProducts.forEach(product => {
        let categoryId = null;
        if (product.category) {
            if (typeof product.category === 'object') {
                categoryId = product.category._id || product.category.id || null;
            } else if (typeof product.category === 'string') {
                categoryId = product.category;
            }
        }

        if (!categoryId && product.categoryName) {
            const matchingCategory = categories.find(cat => cat.name === product.categoryName);
            if (matchingCategory) {
                categoryId = matchingCategory._id;
            }
        }

        if (categoryId) {
            counts[categoryId] = (counts[categoryId] || 0) + 1;
        }
    });
    return counts;
}

// Filter products by category
function filterProductsByCategory(categoryId) {
    selectedCategoryId = categoryId || '';
    if (!selectedCategoryId) {
        products = [...allProducts];
    } else {
        products = allProducts.filter(product => {
            if (product.category) {
                if (typeof product.category === 'object' && product.category._id) {
                    return product.category._id === selectedCategoryId;
                }
                if (typeof product.category === 'string') {
                    return product.category === selectedCategoryId;
                }
            }
            if (product.categoryName) {
                const selectedCategory = categories.find(cat => cat._id === selectedCategoryId);
                if (selectedCategory && product.categoryName === selectedCategory.name) {
                    return true;
                }
            }
            return false;
        });
    }
    renderProducts();
    renderCategoryChips();
}

// Helper function to extract products from API response
function extractProductsFromResponse(data) {
    let productsData = [];
    
    if (Array.isArray(data)) {
        productsData = data;
    } else if (data.data && Array.isArray(data.data)) {
        productsData = data.data;
    } else if (data.foods && Array.isArray(data.foods)) {
        productsData = data.foods;
    } else if (data.beverage && Array.isArray(data.beverage)) {
        productsData = data.beverage;
    }
    
    return productsData;
}

// Helper function to process product items
function processProductItems(productsData) {
    return productsData.map(item => {
            // Handle both single price and prices array
            let displayPrice = 0;
            let hasMultiplePrices = false;
            
            if (item.price !== undefined && item.price !== null) {
                // Single price
                displayPrice = item.price;
            } else if (item.prices && Array.isArray(item.prices) && item.prices.length > 0) {
                // Multiple prices - use minimum price or first price
                const prices = item.prices.map(p => p.price).filter(p => p !== undefined && p !== null);
                if (prices.length > 0) {
                    displayPrice = Math.min(...prices);
                    hasMultiplePrices = true;
                }
            }
            
            const name = capitalizeWords(item.name || '');
            const categoryName = capitalizeWords(item.category?.name || '');
            const productTypeName = capitalizeWords(item.productType?.name || '');

            return {
                _id: item._id,
                id: item._id || item.id,
                name: name,
                category: item.category || null,
                categoryName: categoryName || '',
                productType: item.productType || null,
                productTypeName: productTypeName || '',
                image: item.image || '',
                shortDescription: item.shortDescription || '',
                description: item.description || '',
                ingIngredients: item.ingIngredients || '',
                price: displayPrice,
                prices: item.prices || null, // Store prices array if exists
                hasMultiplePrices: hasMultiplePrices,
                avg_rating: item.avg_rating || 0,
                emoji: item.emoji || '' // Only use if API provides it
            };
    });
}

// Fetch products from API using branch-id
async function fetchProducts() {
    const productsGrid = document.getElementById('productsGrid');
    productsGrid.innerHTML = '<div class="loading">Loading products...</div>';
    
    try {
        // Fetch from Foods API only
        const response = await fetch(`https://api.mr-bakers.com/api/foods/${currentUser.branchId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        let allProductsData = [];

        // Process Foods API response
        if (response.ok) {
            const foodsData = await response.json();
            const foodsProducts = extractProductsFromResponse(foodsData);
            allProductsData = allProductsData.concat(foodsProducts);
        } else {
            console.error('Failed to fetch foods:', response.status);
        }

        if (allProductsData.length === 0) {
            productsGrid.innerHTML = '<div class="loading">No products available</div>';
            return;
        }

        // Process all products
        allProducts = processProductItems(allProductsData);
        products = [...allProducts];
        renderCategoryChips();

        if (products.length === 0) {
            productsGrid.innerHTML = '<div class="loading">No products available</div>';
            return;
        }

        renderProducts();
        updateCartCount();
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

    if (products.length === 0) {
        productsGrid.innerHTML = '<div class="loading">No products found in this category</div>';
        return;
    }

    products.forEach(product => {
        const productCard = document.createElement('div');
        productCard.className = 'product-card';
        
        let imageHtml = '';
        if (product.image && product.image.trim() !== '') {
            const imageUrl = product.image.trim();
            imageHtml = `
                <div class="product-image-placeholder" style="display: none;"><span>📷</span><span>No Image</span></div>
                <img src="${imageUrl}" alt="${product.name}" class="product-image-img" 
                     onload="this.style.display='block';"
                     onerror="this.onerror=null; this.style.display='none'; const placeholder = this.previousElementSibling; if(placeholder) placeholder.style.display='flex';">
            `;
        } else {
            imageHtml = `<div class="product-image-placeholder"><span>📷</span><span>No Image</span></div>`;
        }
        
        // Build category and type badges
        const categoryBadge = product.categoryName 
            ? `<span class="product-badge category-badge">${product.categoryName}</span>` 
            : '';
        const typeBadge = product.productTypeName 
            ? `<span class="product-badge type-badge">${product.productTypeName}</span>` 
            : '';
        
        // Build rating - only show if API provides rating
        const ratingHtml = product.avg_rating && product.avg_rating > 0
            ? `<div class="product-rating">⭐ <span>${product.avg_rating.toFixed(1)}</span></div>` 
            : '';
        
        // Only show data that comes from API
        const description = product.shortDescription || product.description || '';
        
        // Handle price display - show starting price
        let priceDisplay = '';
        
        if (product.hasMultiplePrices && product.prices && product.prices.length > 0) {
            // Sort prices by size (ascending order) and show first size price
            const sortedPrices = [...product.prices].sort((a, b) => {
                const sizeA = parseInt(a.size) || 0;
                const sizeB = parseInt(b.size) || 0;
                return sizeA - sizeB;
            });
            
            // Show first size price by default
            const firstPrice = sortedPrices[0].price;
            priceDisplay = `₹${firstPrice.toFixed(2)}`;
        } else if (product.price && product.price > 0) {
            priceDisplay = `₹${product.price.toFixed(2)}`;
        } else {
            priceDisplay = '₹0.00';
        }
        
        productCard.innerHTML = `
            <div class="product-image-container">
                ${imageHtml}
                ${categoryBadge}
                ${typeBadge}
            </div>
            <div class="product-info">
                <div class="product-name">${product.name || ''}</div>
                ${description ? `<div class="product-description">${description}</div>` : ''}
                ${product.ingIngredients ? `<div class="product-ingredients">${product.ingIngredients}</div>` : ''}
                ${ratingHtml}
                <div class="product-footer">
                    <div class="product-price">${priceDisplay}</div>
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

    // If product has multiple sizes, show size selection modal
    if (product.hasMultiplePrices && product.prices && product.prices.length > 0) {
        showSizeSelectionModal(productId, product);
        return;
    }
    
    // For products without multiple sizes, add directly to cart
    addProductToCart(productId, product, null, null, null, button);
}

function showSizeSelectionModal(productId, product) {
    const modal = document.getElementById('sizeModal');
    const productNameEl = document.getElementById('modalProductName');
    const sizeSelect = document.getElementById('sizeSelect');
    
    // Set product name
    if (productNameEl) {
        productNameEl.textContent = product.name || 'Product';
    }
    
    // Clear and populate size options
    if (sizeSelect) {
        sizeSelect.innerHTML = '';
        
        // Sort prices by size (ascending order)
        const sortedPrices = [...product.prices].sort((a, b) => {
            const sizeA = parseInt(a.size) || 0;
            const sizeB = parseInt(b.size) || 0;
            return sizeA - sizeB;
        });
        
        sortedPrices.forEach((priceItem, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.setAttribute('data-price', priceItem.price);
            option.setAttribute('data-size', priceItem.size);
            option.textContent = `${priceItem.size} - ₹${priceItem.price.toFixed(2)}`;
            sizeSelect.appendChild(option);
        });
    }
    
    // Show modal
    if (modal) {
        modal.style.display = 'flex';
    }
    
    // Store product ID for confirm button
    if (modal) {
        modal.dataset.productId = productId;
    }
}

function closeSizeModal() {
    const modal = document.getElementById('sizeModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function addProductToCart(productId, product, cartPrice, selectedSize, selectedSizeText, button) {
    if (!product) {
        product = products.find(p => p.id === productId || p._id === productId);
        if (!product) return;
    }

    // Determine the price and size to use
    let finalPrice = cartPrice || product.price || 0;
    let finalSize = selectedSize || null;
    let finalSizeText = selectedSizeText || null;
    
    // If no price/size provided and product has multiple sizes, use first size
    if (!cartPrice && product.hasMultiplePrices && product.prices && product.prices.length > 0) {
        const sortedPrices = [...product.prices].sort((a, b) => {
            const sizeA = parseInt(a.size) || 0;
            const sizeB = parseInt(b.size) || 0;
            return sizeA - sizeB;
        });
        if (sortedPrices.length > 0) {
            finalPrice = sortedPrices[0].price;
            finalSize = sortedPrices[0].size;
            finalSizeText = `${sortedPrices[0].size} - ₹${sortedPrices[0].price.toFixed(2)}`;
        }
    }
    
    // Check if item with same product and size already exists
    const existingItem = cart.items.find(item => {
        const sameProduct = item.productId.id === productId || item.productId._id === productId;
        const sameSize = item.selectedSize === finalSize;
        return sameProduct && sameSize;
    });
    
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.items.push({
            productId: {
                _id: product._id,
                id: product.id,
                name: product.name,
                price: finalPrice,
                prices: product.prices || null,
                hasMultiplePrices: product.hasMultiplePrices || false,
                image: product.image || '',
                categoryName: product.categoryName || '',
                productTypeName: product.productTypeName || ''
            },
            selectedSize: finalSize,
            selectedSizeText: finalSizeText,
            quantity: 1
        });
    }
    
    saveCart();
    renderCart();
    updateCartCount();

    if (button) {
        button.textContent = 'Added!';
        button.classList.add('added');
        setTimeout(() => {
            button.textContent = 'Add to Cart';
            button.classList.remove('added');
            button.disabled = false;
        }, 1000);
    }
}

// Setup size modal listeners
function setupSizeModalListeners() {
    const modal = document.getElementById('sizeModal');
    const closeBtn = document.getElementById('closeSizeModal');
    const cancelBtn = document.getElementById('cancelSizeBtn');
    const confirmBtn = document.getElementById('confirmAddCartBtn');
    const overlay = modal ? modal.querySelector('.modal-overlay') : null;
    
    if (!modal || !closeBtn || !cancelBtn || !confirmBtn) return;
    
    const closeHandler = () => {
        closeSizeModal();
    };
    
    if (closeBtn) closeBtn.addEventListener('click', closeHandler);
    if (cancelBtn) cancelBtn.addEventListener('click', closeHandler);
    if (overlay) overlay.addEventListener('click', closeHandler);
    
    // Confirm button - add to cart with selected size
    confirmBtn.addEventListener('click', () => {
        const productId = modal.dataset.productId;
        if (!productId) return;
        
        const product = products.find(p => p.id === productId || p._id === productId);
        if (!product) return;
        
        const sizeSelect = document.getElementById('sizeSelect');
        if (!sizeSelect || sizeSelect.options.length === 0) return;
        
        const selectedOption = sizeSelect.options[sizeSelect.selectedIndex];
        const selectedPrice = parseFloat(selectedOption.getAttribute('data-price'));
        const selectedSize = selectedOption.getAttribute('data-size');
        const selectedSizeText = selectedOption.textContent.trim();
        
        // Add to cart with selected size
        addProductToCart(productId, product, selectedPrice, selectedSize, selectedSizeText, null);
        
        // Close modal
        closeSizeModal();
    });
}

function renderCart() {
    const cartItems = document.getElementById('cartItems');
    const cartCount = document.getElementById('cartCount');
    
    if (!cart || !cart.items || cart.items.length === 0) {
        if (cartItems) {
            cartItems.innerHTML = `
                <div class="empty-cart">
                    <div class="empty-cart-icon">🛒</div>
                    <h4>Your cart is empty</h4>
                    <p>Add some products to get started!</p>
                </div>
            `;
        }
        if (cartCount) cartCount.textContent = '0';
        updateCartSummary();
        return;
    }

    const totalItems = cart.items.reduce((sum, item) => sum + item.quantity, 0);
    if (cartCount) cartCount.textContent = totalItems;

    if (cartItems) {
        cartItems.innerHTML = cart.items.map((item, index) => {
            const product = item.productId;
            const emoji = product.emoji || '🍞';
            let name = product.name || 'Product';
            if (item.selectedSize) {
                name += ` (${item.selectedSize})`;
            }
            const price = product.price || 0;
            const quantity = item.quantity || 1;
            const productId = product.id;
            const itemId = item.selectedSize ? `${productId}_${item.selectedSize}` : productId;

            const itemTotal = (price * quantity).toFixed(2);
            
            return `
                <div class="cart-item" data-item-id="${itemId}">
                    <div class="item-top-row">
                        <div class="item-info-left">
                            <div class="item-name">${name}</div>
                            <div class="item-price-per-unit">₹${price.toFixed(2)} each</div>
                        </div>
                        <div class="quantity-control-container">
                            <button class="qty-btn qty-minus" onclick="updateCartQuantity('${itemId}', ${quantity - 1})">-</button>
                            <span class="quantity-number">${quantity}</span>
                            <button class="qty-btn qty-plus" onclick="updateCartQuantity('${itemId}', ${quantity + 1})">+</button>
                        </div>
                    </div>
                    <div class="item-bottom-row">
                        <div class="item-total-price">₹${itemTotal}</div>
                        <button class="remove-btn" onclick="removeCartItem('${itemId}')">🗑️</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateCartSummary();
}

function updateCartQuantity(itemId, newQuantity) {
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
    updateCartCount();
}

function removeCartItem(itemId) {
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
    updateCartCount();
}

function updateCartSummary() {
    if (!cart || !cart.items || cart.items.length === 0) {
        const subtotalEl = document.getElementById('cartSubtotal');
        const taxEl = document.getElementById('cartTax');
        const totalEl = document.getElementById('cartTotal');
        if (subtotalEl) subtotalEl.textContent = '₹0.00';
        if (taxEl) taxEl.textContent = '₹0.00';
        if (totalEl) totalEl.textContent = '₹0.00';
        return;
    }

    const subtotal = cart.items.reduce((sum, item) => {
        const price = item.productId.price || 0;
        const quantity = item.quantity || 0;
        return sum + (price * quantity);
    }, 0);
    const tax = subtotal * 0.05;
    const total = subtotal + tax;

    const subtotalEl = document.getElementById('cartSubtotal');
    const taxEl = document.getElementById('cartTax');
    const totalEl = document.getElementById('cartTotal');
    if (subtotalEl) subtotalEl.textContent = `₹${subtotal.toFixed(2)}`;
    if (taxEl) taxEl.textContent = `₹${tax.toFixed(2)}`;
    if (totalEl) totalEl.textContent = `₹${total.toFixed(2)}`;
}

function updateCartCount() {
    const totalItems = cart.items.reduce((sum, item) => sum + item.quantity, 0);
    const productsCountEl = document.getElementById('productsCount');
    if (productsCountEl) {
        productsCountEl.textContent = `${products.length} items`;
    }
    const cartCountEl = document.getElementById('cartCount');
    if (cartCountEl) {
        cartCountEl.textContent = totalItems;
    }
}

function renderRecentOrders() {
    const listEl = document.getElementById('recentOrdersList');
    if (!listEl) return;

    if (!recentOrders.length) {
        listEl.innerHTML = '<div class="orders-placeholder">No orders yet</div>';
        return;
    }

    listEl.innerHTML = recentOrders.map(order => {
        const orderId = order.bill || order._id || order.id || 'Order';
        const totalCost = Number(order.totalCost || order.total || 0).toFixed(2);
        const paymentType = order.paymentType ? capitalizeWords(order.paymentType.replace('-', ' ')) : 'N/A';
        const orderDate = order.date
            ? new Date(order.date).toLocaleString('en-IN', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
            })
            : '';

        return `
            <div class="order-item">
                <div class="order-info">
                    <div class="order-id">${orderId}</div>
                    <div class="order-meta">${paymentType}${orderDate ? ' • ' + orderDate : ''}</div>
                </div>
                <div class="order-total">₹${totalCost}</div>
            </div>
        `;
    }).join('');
}

async function loadRecentOrders(showLoading = true) {
    const listEl = document.getElementById('recentOrdersList');
    if (!listEl) return;

    if (showLoading) {
        listEl.innerHTML = '<div class="orders-placeholder">Loading orders...</div>';
    }

    try {
        const orders = await getPosOrders();
        const normalized = Array.isArray(orders) ? orders : [];
        normalized.sort((a, b) => {
            const dateA = a.date ? new Date(a.date).getTime() : 0;
            const dateB = b.date ? new Date(b.date).getTime() : 0;
            return dateB - dateA;
        });
        recentOrders = normalized.slice(0, 5);
        renderRecentOrders();
    } catch (error) {
        console.error('Failed to load recent orders:', error);
        listEl.innerHTML = '<div class="orders-error">Unable to load orders</div>';
    }
}

function setupCartListeners() {
    const checkoutBtn = document.getElementById('checkoutBtn');
    const clearCartBtn = document.getElementById('clearCartBtn');

    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', () => {
            if (!cart || !cart.items || cart.items.length === 0) {
                alert('Your cart is empty. Please add products first.');
                return;
            }
            showOrderSummaryModal();
        });
    }

    if (clearCartBtn) {
        clearCartBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to clear the cart?')) {
                cart = { items: [] };
                saveCart();
                renderCart();
                updateCartCount();
            }
        });
    }
}

// Make functions globally accessible
window.updateCartQuantity = updateCartQuantity;
window.removeCartItem = removeCartItem;

document.getElementById('logoutBtn').addEventListener('click', () => {
    sessionStorage.removeItem('user');
    window.location.href = 'index.html';
});

// Order Summary Modal Functions
function showOrderSummaryModal() {
    const modal = document.getElementById('orderSummaryModal');
    const subtotalEl = document.getElementById('orderSubtotal');
    const taxEl = document.getElementById('orderTax');
    const totalEl = document.getElementById('orderTotal');
    
    // Calculate order totals
    if (!cart || !cart.items || cart.items.length === 0) {
        alert('Your cart is empty. Please add products first.');
        return;
    }
    
    const subtotal = cart.items.reduce((sum, item) => {
        const price = item.productId.price || 0;
        const quantity = item.quantity || 0;
        return sum + (price * quantity);
    }, 0);
    const tax = subtotal * 0.05;
    const total = subtotal + tax;
    
    // Update modal values
    if (subtotalEl) subtotalEl.textContent = `₹${subtotal.toFixed(2)}`;
    if (taxEl) taxEl.textContent = `₹${tax.toFixed(2)}`;
    if (totalEl) totalEl.textContent = `₹${total.toFixed(2)}`;
    
    // Reset payment method
    const paymentMethod = document.getElementById('orderPaymentMethod');
    if (paymentMethod) {
        paymentMethod.value = '';
    }

    const phoneInput = document.getElementById('orderCustomerPhone');
    if (phoneInput) {
        phoneInput.value = '';
    }
    const orderTypeSelect = document.getElementById('orderOrderType');
    if (orderTypeSelect) {
        orderTypeSelect.value = '';
    }
    
    // Show modal
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeOrderSummaryModal() {
    const modal = document.getElementById('orderSummaryModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Setup order summary modal listeners
function setupOrderSummaryModalListeners() {
    const modal = document.getElementById('orderSummaryModal');
    const closeBtn = document.getElementById('closeOrderSummaryModal');
    const purchaseBtn = document.getElementById('orderPurchaseBtn');
    const clearBtn = document.getElementById('orderClearBtn');
    const paymentMethodSelect = document.getElementById('orderPaymentMethod');
    const phoneInput = document.getElementById('orderCustomerPhone');
    const orderTypeSelect = document.getElementById('orderOrderType');
    const overlay = modal ? modal.querySelector('.modal-overlay') : null;
    
    if (!modal || !closeBtn || !purchaseBtn || !clearBtn) return;
    
    const closeHandler = () => {
        closeOrderSummaryModal();
    };
    
    if (closeBtn) closeBtn.addEventListener('click', closeHandler);
    if (overlay) overlay.addEventListener('click', closeHandler);
    
    // Payment method change listener - show/hide Stripe form
    if (paymentMethodSelect) {
        paymentMethodSelect.addEventListener('change', async (e) => {
            const selectedMethod = e.target.value;
            const stripeCardForm = document.getElementById('stripeCardForm');
            
            if (selectedMethod === 'Card') {
                if (stripeCardForm) {
                    stripeCardForm.style.display = 'block';
                }
                // Wait for Stripe to initialize if not ready
                if (!stripe) {
                    await initializeStripeForProduct();
                }
                if (stripe && !stripeCardNumber) {
                    setupStripeCardElementsForProduct();
                }
            } else {
                if (stripeCardForm) {
                    stripeCardForm.style.display = 'none';
                }
                window.stripePaymentMethodId = null;
            }
        });
    }

    // Restrict phone input to digits only
    if (phoneInput) {
        phoneInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^0-9]/g, '');
        });
    }
    
    // Add card button listener
    const addCardBtn = document.getElementById('addCardBtn');
    if (addCardBtn) {
        addCardBtn.addEventListener('click', async () => {
            await handleStripeCardAddForProduct();
        });
    }
    
    // Purchase button - show phone number modal
    if (purchaseBtn) {
        purchaseBtn.addEventListener('click', () => {
            const paymentMethod = document.getElementById('orderPaymentMethod');
            if (!paymentMethod || !paymentMethod.value) {
                alert('Please select a payment method.');
                return;
            }
            // If Card is selected, ensure card is added
            if (paymentMethod.value === 'Card' && !window.stripePaymentMethodId) {
                alert('Please add your card details first.');
                return;
            }
            const phoneValue = phoneInput ? phoneInput.value.trim() : '';
            const cleanPhone = phoneValue.replace(/[^0-9]/g, '');
            if (!cleanPhone || cleanPhone.length < 7) {
                alert('Please enter a valid phone number (minimum 7 digits).');
                if (phoneInput) {
                    phoneInput.classList.add('input-error');
                    setTimeout(() => phoneInput && phoneInput.classList.remove('input-error'), 1500);
                }
                return;
            }
            const orderTypeValue = orderTypeSelect ? orderTypeSelect.value : '';
            if (!orderTypeValue) {
                alert('Please select order type (Dine In or Take Away).');
                if (orderTypeSelect) {
                    orderTypeSelect.classList.add('input-error');
                    setTimeout(() => orderTypeSelect && orderTypeSelect.classList.remove('input-error'), 1500);
                }
                return;
            }

            selectedPaymentMethod = paymentMethod.value;
            selectedOrderType = orderTypeValue;

            // Close order summary modal and show loyalty modal directly
            closeOrderSummaryModal();
            showLoyaltyPointsModal(cleanPhone);
        });
    }
    
    // Clear cart button
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to clear the cart?')) {
                cart = { items: [] };
                saveCart();
                renderCart();
                updateCartCount();
                closeOrderSummaryModal();
            }
        });
    }
}

// Phone Number capture handled inside order summary modal
let selectedPaymentMethod = '';
let selectedOrderType = 'take-away'; // Default to take-away

// Loyalty Points Variables
let currentCustomerPhone = '';
let currentCustomerData = null;
let currentLoyaltyPoints = 0;
let loyaltyDiscount = 0;

// Old fetchAllUsers function removed - now using /user-by-phone API directly

// Fetch customer by phone number using API
async function fetchCustomerByPhone(phoneNumber) {
    try {
        const userToken = currentUser?.token;
        
        if (!userToken) {
            console.error('No token found. Please login again.');
            return null;
        }

        if (!phoneNumber || phoneNumber.trim() === '') {
            console.error('Phone number is required');
            return null;
        }

        // Clean phone number - remove spaces, dashes, and other non-numeric characters
        // Keep only digits for consistent API calls
        const cleanPhoneNumber = phoneNumber.trim().replace(/[^0-9]/g, '');
        
        if (!cleanPhoneNumber || cleanPhoneNumber.length < 7) {
            console.error('Invalid phone number format');
            return null;
        }

        console.log('Fetching customer by phone number:', cleanPhoneNumber);
        console.log('Original phone number:', phoneNumber);
        
        // Use the /user-by-phone/:phoneNumber API endpoint
        // Router: router.get('/user-by-phone/:phoneNumber', requireAuth, allowRoles('staff', 'admin', 'superadmin'), getUserByPhoneNumber);
        const url = `https://api.mr-bakers.com/api/user-by-phone/${encodeURIComponent(cleanPhoneNumber)}`;
        
        console.log('API URL:', url);
        
        const response = await fetch(url, {
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
            if (response.status === 403) {
                const errorText = await response.text();
                console.error('403 Forbidden - Insufficient permissions:', errorText);
                return null;
            }
            if (response.status === 404) {
                console.log(`Customer not found with phone: ${cleanPhoneNumber}`);
                // Return null - this is expected if customer doesn't exist
                // The modal will show "Customer not found" message
                return null;
            }
            const errorText = await response.text();
            console.error(`Failed to fetch customer: ${response.status}`, errorText);
            return null;
        }

        const data = await response.json();
        console.log('User-by-phone API response data:', data);
        
        // Handle different response formats
        let customer = null;
        if (data.data) {
            customer = data.data;
        } else if (data.user) {
            customer = data.user;
        } else if (data._id || data.id) {
            customer = data;
        }

        // Return customer if found (don't check role - show customer info regardless)
        if (customer) {
            console.log('Customer found via API:', customer);
            return customer;
        }

        console.log(`Customer not found with phone: ${cleanPhoneNumber}`);
        return null;
    } catch (error) {
        console.error('Error fetching customer by phone:', error);
        return null;
    }
}

// Fetch loyalty points for customer using /api/loyalty-points endpoint
// Schema: { user: ObjectId, points: Number }
async function fetchLoyaltyPoints(customerId) {
    try {
        const userToken = currentUser?.token;
        if (!userToken) {
            console.error('No token found for loyalty points fetch');
            return 0;
        }

        if (!customerId) {
            console.error('Customer ID is required');
            return 0;
        }

        console.log('Fetching loyalty points for customer:', customerId);
        
        // Use /api/loyalty-points endpoint
        // Backend router: router.use('/loyalty-points', createCrud(LoyaltyPoint, {...}))
        // Backend filters by req.user.id by default, but query parameter 'user' should override it
        // Schema: { user: ObjectId, points: Number }
        const url = `https://api.mr-bakers.com/api/loyalty-points?user=${encodeURIComponent(customerId)}`;
        
        console.log('Fetching loyalty points from URL:', url);
        
        const response = await fetch(url, {
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
                return 0;
            }
            const errorText = await response.text();
            console.error('Failed to fetch loyalty points:', response.status, errorText);
            return 0;
        }

        const data = await response.json();
        console.log('Loyalty points response:', data);
        
        // Handle different response formats based on schema: { user: ObjectId, points: Number }
        // Response could be:
        // 1. Direct array: [{ user: ObjectId, points: 100 }]
        // 2. Object with data: { data: [{ user: ObjectId, points: 100 }] }
        // 3. Single object: { user: ObjectId, points: 100 }
        
        let points = 0;
        
        if (Array.isArray(data)) {
            // If array, get points from first item (should only be one per user)
            if (data.length > 0) {
                points = Number(data[0].points) || 0;
                console.log('Found loyalty points in array:', points);
            }
        } else if (data.data && Array.isArray(data.data)) {
            if (data.data.length > 0) {
                points = Number(data.data[0].points) || 0;
                console.log('Found loyalty points in data array:', points);
            }
        } else if (data.points !== undefined) {
            points = Number(data.points) || 0;
            console.log('Found loyalty points in object:', points);
        }
        
        console.log('Extracted loyalty points:', points);
        return points;
    } catch (error) {
        console.error('Error fetching loyalty points:', error);
        return 0;
    }
}

// Calculate discount from loyalty points (1 point = 1 rupee)
function calculateDiscountFromPoints(points, totalAmount) {
    return Math.min(points, totalAmount);
}

// Save payment record to backend
async function savePaymentRecordToBackend(paymentMethod, cart, currentUser, totalAmount) {
    try {
        const userToken = currentUser.token;
        const userId = currentUser.id;

        // Map payment method to backend format - backend expects capitalized format
        const paymentMap = {
            'Cash': 'Cash',
            'Card': 'Card',
            'paypal': 'PayPal'
        };
        const mappedMethod = paymentMap[paymentMethod] || paymentMethod;

        const paymentData = {
            user: userId,
            method: mappedMethod,
            amount: totalAmount,
            date: new Date().toISOString()
        };

        console.log('Saving payment record:', paymentData);

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
            const errorText = await paymentResponse.text();
            console.error('Failed to save payment record:', paymentResponse.status, errorText);
        } else {
            const responseData = await paymentResponse.json();
            console.log('Payment record saved successfully:', responseData);
        }
    } catch (error) {
        console.error('Error saving payment record:', error);
        // Continue even if payment record save fails
    }
}

// Save POS order to backend - consolidated function to avoid duplication
async function savePosOrderToBackend(paymentMethod, orderType, cart, currentUser, loyaltyDiscount = 0) {
    try {
        const subtotal = cart.items.reduce((sum, item) => {
            return sum + (item.productId.price * item.quantity);
        }, 0);
        const tax = subtotal * 0.05;
        const totalCost = Math.max(0, subtotal + tax - loyaltyDiscount);

        const userToken = currentUser.token;
        const userId = currentUser.id;
        const branchId = currentUser.branchId;

        // Map payment method
        const paymentMap = {
            'Cash': 'cash',
            'Card': 'card',
            'paypal': 'paypal'
        };
        const paymentType = paymentMap[paymentMethod] || 'cash';

        // Map cart items to POS order items schema - exactly matching backend schema
        const posOrderItems = cart.items.map(item => {
            const orderItem = {
                food: item.productId._id || item.productId.id, // ObjectId ref: 'Product'
                quantity: Number(item.quantity) || 0, // Number
                cost: Number(item.productId.price * item.quantity) || 0, // Number
            };
            
            // Add size only if it exists (String, optional)
            if (item.selectedSize) {
                orderItem.size = String(item.selectedSize);
            }
            
            // offer is optional, can be null or omitted
            // orderItem.offer = null; // Optional field, can omit if null
            
            return orderItem;
        });

        const billNumber = `INV-${Date.now()}`;

        // Create POS order object exactly matching backend schema
        // Schema fields:
        // - items: [posOrderItemSchema] ✓
        // - deviceType: enum ['POS', 'KIOSK'], default 'POS' ✓
        // - posId: ObjectId ref 'User' (set by backend from req.user.id) ✓
        // - branch: ObjectId ref 'Branch' (required) ✓
        // - orderType: enum ['dine-in', 'take-away'] (required) ✓
        // - paymentType: enum ['cash', 'card', 'paypal'] (required) ✓
        // - totalCost: Number (required) ✓
        // - bill: String (optional) ✓
        // - tax: Number (optional) ✓
        // - date: Date (set by backend automatically) ✓
        const posOrder = {
            items: posOrderItems,
            deviceType: 'POS', // enum: ['POS', 'KIOSK'], default 'POS'
            branch: branchId, // ObjectId ref: 'Branch' - required
            orderType: orderType, // enum: ['dine-in', 'take-away'], required
            paymentType: paymentType, // enum: ['cash', 'card', 'paypal'], required
            totalCost: Number(totalCost), // Number, required
            tax: Number(tax), // Number, optional
            bill: billNumber // String, optional
            // posId and date are set automatically by backend
        };

        console.log('Saving POS order to backend - Schema matched:', JSON.stringify(posOrder, null, 2));

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
            const errorText = await orderResponse.text();
            console.error('Failed to save POS order:', orderResponse.status, errorText);
            console.error('Request body was:', JSON.stringify(posOrder, null, 2));
            throw new Error(`Failed to save POS order: ${orderResponse.status} - ${errorText}`);
        } else {
            const orderData = await orderResponse.json();
            console.log('POS order saved successfully - Response:', JSON.stringify(orderData, null, 2));
            // Return the saved order data (could be in data property or directly)
            const savedOrder = orderData.data || orderData.order || orderData;
            console.log('Returning saved order:', savedOrder);
            return savedOrder;
        }
    } catch (error) {
        console.error('Error saving POS order:', error);
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
        // Handle different response formats:
        // 1. Direct array: [order1, order2, ...]
        // 2. Object with orders property: { orders: [...] }
        // 3. Object with data property: { data: [...] }
        if (Array.isArray(data)) {
            return data;
        } else if (data.orders && Array.isArray(data.orders)) {
            return data.orders;
        } else if (data.data && Array.isArray(data.data)) {
            return data.data;
        } else {
            console.warn('Unexpected response format from POS orders API:', data);
            return [];
        }
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

// Show loyalty points modal
async function showLoyaltyPointsModal(phoneNumber) {
    currentCustomerPhone = phoneNumber;
    const modal = document.getElementById('loyaltyPointsModal');
    const loadingEl = document.getElementById('loyaltyLoading');
    const notFoundEl = document.getElementById('loyaltyNotFound');
    const customerInfoEl = document.getElementById('loyaltyCustomerInfo');
    const applyBtn = document.getElementById('applyDiscountBtn');
    const continueBtn = document.getElementById('continueWithoutBtn');
    
    // Show modal and loading
    if (modal) modal.style.display = 'flex';
    if (loadingEl) loadingEl.style.display = 'block';
    if (notFoundEl) notFoundEl.style.display = 'none';
    if (customerInfoEl) customerInfoEl.style.display = 'none';
    if (applyBtn) applyBtn.style.display = 'none';
    if (continueBtn) continueBtn.style.display = 'block';
    
    try {
        // Fetch customer by phone number using API
        const customer = await fetchCustomerByPhone(phoneNumber);
        
        if (customer) {
            currentCustomerData = customer;
            
            // Fetch loyalty points
            const customerId = customer._id;
            const points = await fetchLoyaltyPoints(customerId);
            currentLoyaltyPoints = points || 0;
            
            // Calculate discount
            const subtotal = cart.items.reduce((sum, item) => {
                return sum + (item.productId.price * item.quantity);
            }, 0);
            const tax = subtotal * 0.05;
            const totalAmount = subtotal + tax;
            loyaltyDiscount = calculateDiscountFromPoints(currentLoyaltyPoints, totalAmount);
            
            // Display customer info
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
            
            const nameEl = document.getElementById('loyaltyCustomerName');
            const pointsEl = document.getElementById('loyaltyPointsDisplay');
            const discountEl = document.getElementById('loyaltyDiscountDisplay');
            const continueWithPointsBtn = document.getElementById('continueWithPointsBtn');
            
            if (nameEl) nameEl.textContent = customerName;
            if (pointsEl) pointsEl.textContent = currentLoyaltyPoints.toLocaleString();
            if (discountEl) discountEl.textContent = `₹${loyaltyDiscount.toFixed(2)}`;
            
            // Show customer info
            if (loadingEl) loadingEl.style.display = 'none';
            if (customerInfoEl) customerInfoEl.style.display = 'block';
            
            // Show "Continue with Points" button if customer has loyalty points
            if (continueWithPointsBtn) {
                if (currentLoyaltyPoints > 0) {
                    continueWithPointsBtn.style.removeProperty('display');
                    continueWithPointsBtn.style.setProperty('display', 'block', 'important');
                    continueWithPointsBtn.style.setProperty('visibility', 'visible', 'important');
                    continueWithPointsBtn.style.setProperty('opacity', '1', 'important');
                } else {
                    continueWithPointsBtn.style.display = 'none';
                }
            }
        } else {
            // Customer not found
            currentCustomerData = null;
            currentLoyaltyPoints = 0;
            loyaltyDiscount = 0;
            
            if (loadingEl) loadingEl.style.display = 'none';
            if (notFoundEl) notFoundEl.style.display = 'block';
            if (customerInfoEl) customerInfoEl.style.display = 'none';
            // Hide "Continue with Points" button when customer not found
            const continueWithPointsBtn = document.getElementById('continueWithPointsBtn');
            if (continueWithPointsBtn) {
                continueWithPointsBtn.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Error fetching customer:', error);
        if (loadingEl) loadingEl.style.display = 'none';
        if (notFoundEl) notFoundEl.style.display = 'block';
        if (customerInfoEl) customerInfoEl.style.display = 'none';
        // Hide "Continue with Points" button on error
        const continueWithPointsBtn = document.getElementById('continueWithPointsBtn');
        if (continueWithPointsBtn) {
            continueWithPointsBtn.style.display = 'none';
        }
    }
}

function closeLoyaltyPointsModal() {
    const modal = document.getElementById('loyaltyPointsModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

async function completePurchase(phoneNumber, discount = 0) {
    // If Card payment, process Stripe payment first (from cart.js)
    if (selectedPaymentMethod === 'Card') {
        await processStripePaymentForProduct(discount);
        return;
    }
    
    // Calculate totals
    const subtotal = cart.items.reduce((sum, item) => {
        const price = item.productId.price || 0;
        const quantity = item.quantity || 0;
        return sum + (price * quantity);
    }, 0);
    const tax = subtotal * 0.05;
    const total = Math.max(0, subtotal + tax - discount);
    
    try {
        // Save payment record and POS order to backend for all payment methods
        if (selectedPaymentMethod) {
            // Save payment record first
            await savePaymentRecordToBackend(selectedPaymentMethod, cart, currentUser, total);
            // Then save POS order - wait for response
            const savedOrder = await savePosOrderToBackend(selectedPaymentMethod, selectedOrderType || 'take-away', cart, currentUser, discount);
            
            if (savedOrder) {
                console.log('Order saved successfully:', savedOrder);
                // Order saved successfully - can show success message if needed
            } else {
                console.warn('Order saved but no confirmation received');
                alert('Order saved but no confirmation received. Please check orders list.');
            }
        } else {
            throw new Error('Payment method not selected');
        }
        
        // Generate and show bill only after order is saved successfully
        generateBill(phoneNumber, discount, subtotal, tax, total);
        
        // Close loyalty modal
        closeLoyaltyPointsModal();

        await loadRecentOrders(false);
    } catch (error) {
        console.error('Error completing purchase:', error);
        alert('Failed to save order. Please try again. Error: ' + error.message);
        // Don't show bill if order save failed
    }
}

function generateBill(phoneNumber, discount, subtotal, tax, total) {
    const date = new Date().toLocaleString('en-IN', {
        year: 'numeric',
        month: 'long',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });

    const invoiceNumber = `INV-${Date.now()}`;

    let customerName = 'Walk-in Customer';
    if (currentCustomerData) {
        if (currentCustomerData.firstName && currentCustomerData.lastName) {
            customerName = `${currentCustomerData.firstName} ${currentCustomerData.lastName}`;
        } else if (currentCustomerData.firstName) {
            customerName = currentCustomerData.firstName;
        } else if (currentCustomerData.name) {
            customerName = currentCustomerData.name;
        } else if (currentCustomerData.username) {
            customerName = currentCustomerData.username;
        }
    }

    const itemsHtml = cart.items.map(item => {
        const product = item.productId;
        let name = product.name || 'Product';
        if (item.selectedSize) {
            name += ` (${item.selectedSize})`;
        }
        const price = product.price || 0;
        const quantity = item.quantity || 1;
        const itemTotal = price * quantity;

        return `
            <tr>
                <td class="invoice-item-name">${name}</td>
                <td class="invoice-item-qty">x${quantity}</td>
                <td>₹${price.toFixed(2)}</td>
                <td>₹${itemTotal.toFixed(2)}</td>
            </tr>
        `;
    }).join('');

    const billContentHTML = `
        <div class="invoice-card">
            <div class="invoice-brand">MR. BAKER</div>
            <h2 class="invoice-heading">Invoice</h2>

            <div class="invoice-meta">
                <div><span>Date:</span> ${date}</div>
                <div><span>Invoice #:</span> ${invoiceNumber}</div>
                ${phoneNumber ? `<div><span>Customer Phone:</span> ${phoneNumber}</div>` : ''}
                <div><span>Customer:</span> ${customerName}</div>
                <div><span>Payment Method:</span> ${capitalizeWords(selectedPaymentMethod || 'Cash')}</div>
            </div>

            <table class="invoice-items">
                <thead>
                    <tr>
                        <th>Item</th>
                        <th>Qty</th>
                        <th>Price</th>
                        <th>Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>

            <div class="invoice-summary">
                <div><span>Subtotal</span><span>₹${subtotal.toFixed(2)}</span></div>
                <div><span>Tax (5%)</span><span>₹${tax.toFixed(2)}</span></div>
                ${discount > 0 ? `<div class="discount"><span>Loyalty Discount</span><span>-₹${discount.toFixed(2)}</span></div>` : ''}
                <div class="grand-total"><span>Total</span><span>₹${total.toFixed(2)}</span></div>
            </div>

            <div class="invoice-footer">Thank you for your purchase!</div>
        </div>
    `;

    const billModal = document.getElementById('billModal');
    const billModalContent = document.getElementById('billModalContent');
    const billContent = document.getElementById('billContent');

    if (billModalContent) billModalContent.innerHTML = billContentHTML;
    if (billContent) billContent.innerHTML = billContentHTML;
    if (billModal) billModal.style.display = 'flex';
}

function closeBillModal() {
    const billModal = document.getElementById('billModal');
    if (billModal) {
        billModal.style.display = 'none';
    }
    
    // Clear cart after closing bill
    cart = { items: [] };
    saveCart();
    renderCart();
    updateCartCount();
    
    // Reset variables
    currentCustomerPhone = '';
    currentCustomerData = null;
    currentLoyaltyPoints = 0;
    loyaltyDiscount = 0;
    selectedPaymentMethod = '';
}

// Setup bill modal listeners
function setupBillModalListeners() {
    const billModal = document.getElementById('billModal');
    const closeBtn = document.getElementById('closeBillModal');
    const closeBillBtn = document.getElementById('closeBillBtn');
    const printBtn = document.getElementById('printBillBtn');
    const overlay = billModal ? billModal.querySelector('.modal-overlay') : null;
    
    if (!billModal || !closeBtn || !closeBillBtn || !printBtn) return;
    
    const closeHandler = () => {
        closeBillModal();
    };
    
    if (closeBtn) closeBtn.addEventListener('click', closeHandler);
    if (closeBillBtn) closeBillBtn.addEventListener('click', closeHandler);
    if (overlay) overlay.addEventListener('click', closeHandler);
    
    // Print button
    if (printBtn) {
        printBtn.addEventListener('click', () => {
            // Show bill section for printing
            const billSection = document.getElementById('billSection');
            if (billSection) {
                billSection.style.display = 'block';
                billSection.style.position = 'absolute';
                billSection.style.left = '-9999px';
                billSection.style.top = '-9999px';
                billSection.style.visibility = 'visible';
            }
            
            // Close modal
            closeBillModal();
            
            // Print after a short delay
            setTimeout(() => {
                window.print();
                
                // Hide bill section after printing
                setTimeout(() => {
                    if (billSection) {
                        billSection.style.display = 'none';
                        billSection.style.visibility = 'hidden';
                    }
                }, 500);
            }, 200);
        });
    }
}

// Setup loyalty points modal listeners
function setupLoyaltyPointsModalListeners() {
    const modal = document.getElementById('loyaltyPointsModal');
    const closeBtn = document.getElementById('closeLoyaltyModal');
    const continueWithPointsBtn = document.getElementById('continueWithPointsBtn');
    const continueBtn = document.getElementById('continueWithoutBtn');
    const overlay = modal ? modal.querySelector('.modal-overlay') : null;
    
    if (!modal || !closeBtn || !continueBtn) return;
    
    const closeHandler = () => {
        closeLoyaltyPointsModal();
        // Reset variables
        currentCustomerPhone = '';
        currentCustomerData = null;
        currentLoyaltyPoints = 0;
        loyaltyDiscount = 0;
    };
    
    if (closeBtn) closeBtn.addEventListener('click', closeHandler);
    if (overlay) overlay.addEventListener('click', closeHandler);
    
    // Continue with points button (applies discount)
    if (continueWithPointsBtn) {
        continueWithPointsBtn.addEventListener('click', () => {
            closeLoyaltyPointsModal();
            completePurchase(currentCustomerPhone, loyaltyDiscount);
        });
    }
    
    // Continue without points button (no discount)
    if (continueBtn) {
        continueBtn.addEventListener('click', () => {
            closeLoyaltyPointsModal();
            completePurchase(currentCustomerPhone, 0);
        });
    }
}


// Stripe Integration Functions (from cart.js)

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

async function initializeStripeForProduct() {
    try {
        // First, ensure Stripe keys exist in backend
        await ensureStripeKeys();
        
        // Fetch Stripe public key
        const publicKey = await getStripePublicKey();
        if (publicKey) {
            stripePublicKey = publicKey;
            if (typeof window.Stripe !== 'undefined') {
                stripe = window.Stripe(publicKey);
                window.stripeInstance = stripe; // Also set for compatibility
                console.log('Stripe initialized successfully');
            }
        } else {
            console.error('Failed to get Stripe public key');
        }
    } catch (error) {
        console.error('Error initializing Stripe:', error);
    }
}

// Setup Stripe card elements (from cart.js)
function setupStripeCardElementsForProduct() {
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
    window.stripeCardNumberElement = cardNumberElement; // Also set for compatibility

    // Create expiry element
    const cardExpiryElement = elements.create('cardExpiry', { style });
    cardExpiryElement.mount('#stripeCardExpiry');
    stripeCardExpiry = cardExpiryElement;
    window.stripeCardExpiryElement = cardExpiryElement; // Also set for compatibility

    // Create CVV element
    const cardCvcElement = elements.create('cardCvc', { style });
    cardCvcElement.mount('#stripeCardCvc');
    stripeCardCvc = cardCvcElement;
    window.stripeCardCvcElement = cardCvcElement; // Also set for compatibility

    // Get errors element
    stripeCardErrors = document.getElementById('stripeCardErrors');

    // Listen for errors on all elements
    const handleError = (event) => {
        if (event.error) {
            if (stripeCardErrors) {
                stripeCardErrors.textContent = event.error.message;
                stripeCardErrors.style.display = 'block';
            }
        } else {
            if (stripeCardErrors) {
                stripeCardErrors.textContent = '';
                stripeCardErrors.style.display = 'none';
            }
        }
    };

    cardNumberElement.on('change', handleError);
    cardExpiryElement.on('change', handleError);
    cardCvcElement.on('change', handleError);
}

// Handle Stripe card add (from cart.js)
async function handleStripeCardAddForProduct() {
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
            if (stripeCardErrors) {
                stripeCardErrors.textContent = error.message;
                stripeCardErrors.style.display = 'block';
            }
            addCardBtn.disabled = false;
            addCardBtn.textContent = 'Add Card';
            return;
        }

        // Card added successfully
        if (stripeCardErrors) {
            stripeCardErrors.textContent = 'Card added successfully!';
            stripeCardErrors.style.display = 'block';
            stripeCardErrors.style.color = '#28a745';
        }
        
        // Store payment method ID for later use
        window.stripePaymentMethodId = paymentMethod.id;
        
        addCardBtn.disabled = false;
        addCardBtn.textContent = 'Card Added ✓';
        
        setTimeout(() => {
            if (stripeCardErrors) {
                stripeCardErrors.textContent = '';
                stripeCardErrors.style.display = 'none';
            }
        }, 3000);
    } catch (error) {
        console.error('Error adding card:', error);
        if (stripeCardErrors) {
            stripeCardErrors.textContent = 'An error occurred. Please try again.';
            stripeCardErrors.style.display = 'block';
        }
        addCardBtn.disabled = false;
        addCardBtn.textContent = 'Add Card';
    }
}

// Process Stripe payment (from cart.js) - for Card payment method
async function processStripePaymentForProduct(loyaltyDiscount = 0) {
    if (!stripe || !stripeCardNumber || !stripeCardExpiry || !stripeCardCvc) {
        alert('Stripe card form is not ready. Please add a card first.');
        return;
    }

    try {
        const subtotal = cart.items.reduce((sum, item) => {
            return sum + (item.productId.price * item.quantity);
        }, 0);
        const tax = subtotal * 0.05;
        const total = Math.max(0, subtotal + tax - loyaltyDiscount);

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
                if (stripeCardErrors) {
                    stripeCardErrors.textContent = error.message;
                    stripeCardErrors.style.display = 'block';
                }
                return;
            }
            paymentMethodId = paymentMethod.id;
        }

        // Validate that payment method was created successfully
        if (!paymentMethodId) {
            throw new Error('Payment method not created');
        }

        // Payment method creation means card is valid
        // Save payment record to backend with 'Card' method
        await savePaymentRecordToBackend('Card', cart, currentUser, total);
        // Save POS order to backend - wait for response
        const savedOrder = await savePosOrderToBackend('Card', selectedOrderType || 'take-away', cart, currentUser, loyaltyDiscount);

        if (savedOrder) {
            console.log('Order saved successfully for Card payment:', savedOrder);
            // Order saved successfully
        } else {
            console.warn('Order saved but no confirmation received for Card payment');
            alert('Order saved but no confirmation received. Please check orders list.');
        }

        // Payment successful - generate bill only after order is saved
        const phoneNumber = currentCustomerPhone || '';
        generateBill(phoneNumber, loyaltyDiscount, subtotal, tax, total);
        
        // Close loyalty modal
        closeLoyaltyPointsModal();
        
        await loadRecentOrders(false);

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
        
    } catch (error) {
        console.error('Payment error:', error);
        if (stripeCardErrors) {
            stripeCardErrors.textContent = error.message || 'Payment failed. Please try again.';
            stripeCardErrors.style.display = 'block';
        }
    }
}
