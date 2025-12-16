// Products data - fetched from API
let products = [];
let allProducts = []; // Store all products for filtering
let categories = [];
let selectedCategoryId = '';
let cart = { items: [] };
let currentUser = null;
let recentOrders = [];

// Payment method variables

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
    await loadLoyaltyRules();
    setupCartListeners();
    setupOrderSummaryModalListeners();
    // Loyalty points modal removed in new flow; no setup needed
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
        let sizeButtonsHtml = '';
        let addToCartBtnAttrs = `data-id="${product.id}"`;
        
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
            
            // Set default size attributes for add-to-cart button
            const defaultSize = sortedPrices[0];
            addToCartBtnAttrs += ` data-selected-price="${defaultSize.price}" data-selected-size="${defaultSize.size}" data-selected-size-text="${defaultSize.size} - ₹${defaultSize.price.toFixed(2)}"`;
            
            // Generate size selection buttons
            sizeButtonsHtml = `
                <div class="product-size-buttons" data-product-id="${product.id}">
                    ${sortedPrices.map((priceItem, index) => `
                        <button class="size-btn ${index === 0 ? 'active' : ''}" 
                                data-product-id="${product.id}"
                                data-price="${priceItem.price}"
                                data-size="${priceItem.size}"
                                data-size-text="${priceItem.size} - ₹${priceItem.price.toFixed(2)}">
                            <span class="size-label">${priceItem.size}</span>
                            <span class="size-price">₹${priceItem.price.toFixed(2)}</span>
                        </button>
                    `).join('')}
                </div>
            `;
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
                ${sizeButtonsHtml}
                ${product.ingIngredients ? `<div class="product-ingredients">${product.ingIngredients}</div>` : ''}
                ${ratingHtml}
                <div class="product-footer">
                    <div class="product-price">${priceDisplay}</div>
                    <button class="add-to-cart-btn" ${addToCartBtnAttrs}>Add to Cart</button>
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
    
    // Setup size button listeners
    document.querySelectorAll('.size-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const productId = btn.getAttribute('data-product-id');
            const price = parseFloat(btn.getAttribute('data-price'));
            const size = btn.getAttribute('data-size');
            const sizeText = btn.getAttribute('data-size-text');
            
            // Remove active class from all size buttons for this product
            const sizeButtonsContainer = btn.closest('.product-size-buttons');
            if (sizeButtonsContainer) {
                sizeButtonsContainer.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
            }
            
            // Add active class to clicked button
            btn.classList.add('active');
            
            // Update price display
            const productCard = btn.closest('.product-card');
            if (productCard) {
                const priceEl = productCard.querySelector('.product-price');
                if (priceEl) {
                    priceEl.textContent = `₹${price.toFixed(2)}`;
                }
            }
            
            // Store selected size in button's data attribute for addToCart
            const addToCartBtn = productCard ? productCard.querySelector('.add-to-cart-btn') : null;
            if (addToCartBtn) {
                addToCartBtn.setAttribute('data-selected-price', price);
                addToCartBtn.setAttribute('data-selected-size', size);
                addToCartBtn.setAttribute('data-selected-size-text', sizeText);
            }
        });
    });
}

function addToCart(productId, button) {
    const product = products.find(p => p.id === productId || p._id === productId);
    if (!product) return;

    // If product has multiple sizes, get selected size from button data attributes
    let selectedPrice = null;
    let selectedSize = null;
    let selectedSizeText = null;
    
    if (product.hasMultiplePrices && product.prices && product.prices.length > 0) {
        // Get selected size from button data attributes
        if (button) {
            selectedPrice = button.getAttribute('data-selected-price');
            selectedSize = button.getAttribute('data-selected-size');
            selectedSizeText = button.getAttribute('data-selected-size-text');
            
            // If no size selected, use first size as default
            if (!selectedPrice || !selectedSize) {
                const sortedPrices = [...product.prices].sort((a, b) => {
                    const sizeA = parseInt(a.size) || 0;
                    const sizeB = parseInt(b.size) || 0;
                    return sizeA - sizeB;
                });
                if (sortedPrices.length > 0) {
                    selectedPrice = sortedPrices[0].price;
                    selectedSize = sortedPrices[0].size;
                    selectedSizeText = `${sortedPrices[0].size} - ₹${sortedPrices[0].price.toFixed(2)}`;
                }
            } else {
                selectedPrice = parseFloat(selectedPrice);
            }
        }
    }

    addProductToCart(productId, product, selectedPrice, selectedSize, selectedSizeText, button);
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
    
    // Merge with existing cart entry if same product + same size already exists
    const existingItem = cart.items.find(item => {
        if (!item || !item.productId) return false;
        const p = item.productId;
        const sameProduct =
            (p._id && product._id && String(p._id) === String(product._id)) ||
            (p.id && product.id && String(p.id) === String(product.id));
        const sameSize = (item.selectedSize || null) === (finalSize || null);
        return sameProduct && sameSize;
    });

    if (existingItem) {
        // Increase quantity of existing item
        existingItem.quantity = (existingItem.quantity || 0) + 1;
        // Ensure price/size text stay in sync with latest selection
        existingItem.productId.price = finalPrice;
        existingItem.selectedSize = finalSize;
        existingItem.selectedSizeText = finalSizeText;
    } else {
        // First time adding this product(+size) → create new cart entry
        const cartItemId = `ci_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        cart.items.push({
            cartItemId: cartItemId,
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


function renderCart() {
    const cartItems = document.getElementById('cartItems');
    const cartCount = document.getElementById('cartCount');
    
    // Validate cart structure
    if (!cart) {
        cart = { items: [] };
    }
    if (!Array.isArray(cart.items)) {
        cart.items = [];
    }
    
    if (cart.items.length === 0) {
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

    const totalItems = cart.items.reduce((sum, item) => sum + (item.quantity || 1), 0);
    if (cartCount) cartCount.textContent = totalItems;

    if (cartItems) {
        cartItems.innerHTML = cart.items.map((item, index) => {
            try {
                // Get product info - handle both new format (object) and legacy format (ID)
                let product = item.productId;
                
                // If productId is just an ID string, find the product
                if (typeof product === 'string') {
                    product = products.find(p => p.id === product || p._id === product);
                }
                
                if (!product) {
                    return ''; // Skip items with missing product data
                }
                
                let name = product.name || 'Product';
                if (item.selectedSize) {
                    name += ` (${item.selectedSize})`;
                }
                const price = product.price || 0;
                const quantity = item.quantity || 1;
                const itemId = item.cartItemId || (item.selectedSize ? `${product.id}_${item.selectedSize}` : product.id);
                const itemTotal = (price * quantity).toFixed(2);

                return `
                    <div class="cart-item compact" data-item-id="${itemId}">
                        <div class="item-header">
                            <div class="item-name">${name}</div>
                            <div class="unit-price">₹${price.toFixed(2)}</div>
                        </div>

                        <div class="item-controls-row">
                            <div class="qty-wrap">
                                <button class="qty-circle qty-minus" onclick="updateCartQuantity('${itemId}', ${quantity - 1})">-</button>
                                <span class="quantity-number">${quantity}</span>
                                <button class="qty-circle qty-plus" onclick="updateCartQuantity('${itemId}', ${quantity + 1})">+</button>
                            </div>
                            <button class="remove-circle" onclick="removeCartItem('${itemId}')">🗑️</button>
                        </div>

                        <div class="item-footer">
                            <span class="footer-label">Total:</span>
                            <span class="item-total-price">₹${itemTotal}</span>
                        </div>
                    </div>
                `;
            } catch (error) {
                console.error('Error rendering cart item:', error, item);
                return ''; // Skip items that cause errors
            }
        }).filter(Boolean).join('');
    }

    updateCartSummary();
}

function updateCartQuantity(itemId, newQuantity) {
    // Support unique cartItemId entries (format: ci_<timestamp>_nnn)
    if (typeof itemId === 'string' && itemId.startsWith('ci_')) {
        const idx = cart.items.findIndex(it => it.cartItemId === itemId);
        if (newQuantity <= 0) {
            if (idx !== -1) cart.items.splice(idx, 1);
        } else {
            if (idx !== -1) cart.items[idx].quantity = newQuantity;
        }
    } else {
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
    }
    saveCart();
    renderCart();
    updateCartCount();
}

function removeCartItem(itemId) {
    try {
        // Support cartItemId removal if used
        if (typeof itemId === 'string' && itemId.startsWith('ci_')) {
            cart.items = cart.items.filter(item => item.cartItemId !== itemId);
        } else {
            const [productId, size] = itemId.includes('_') ? itemId.split('_') : [itemId, null];
            
            if (size) {
                cart.items = cart.items.filter(item => {
                    const pId = typeof item.productId === 'object' ? item.productId.id : item.productId;
                    return !(pId === productId && item.selectedSize === size);
                });
            } else {
                cart.items = cart.items.filter(item => {
                    const pId = typeof item.productId === 'object' ? item.productId.id : item.productId;
                    return pId !== productId && !item.selectedSize;
                });
            }
        }
        saveCart();
        renderCart();
        updateCartCount();
    } catch (error) {
        console.error('Error removing cart item:', error);
    }
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
    const totalWithTax = subtotal + tax;
    
    // Calculate loyalty discount using mobile app logic
    let discount = 0;
    if (currentLoyaltyPoints > 0 && totalWithTax >= minOrderAmount) {
        // Number of steps achieved
        const steps = Math.floor((totalWithTax - minOrderAmount) / perUnitValue) + 1;
        discount = Math.min(steps, currentLoyaltyPoints); // Cap at available points
    }
    
    // Override with manually entered points if applicable
    if (pointsToUse > 0) {
        discount = Math.min(pointsToUse, discount, currentLoyaltyPoints);
    }
    
    const total = Math.max(0, subtotal + tax - discount);

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

// Inline Loyalty Elements
let inlineCustomerName = null;
let inlineLoyaltyPoints = null;
let inlineLoyaltyDiscount = null;
let loyaltyInlineBox = null;

// Cart Loyalty Elements
let cartInlineCustomerName = null;
let cartInlineLoyaltyPoints = null;
let cartInlineLoyaltyDiscount = null;
let cartLoyaltyInlineBox = null;

// Attach after DOM loaded
window.addEventListener('DOMContentLoaded', () => {
    inlineCustomerName = document.getElementById('inlineCustomerName');
    inlineLoyaltyPoints = document.getElementById('inlineLoyaltyPoints');
    inlineLoyaltyDiscount = document.getElementById('inlineLoyaltyDiscount');
    loyaltyInlineBox = document.getElementById('loyaltyInlineBox');
    
    cartInlineCustomerName = document.getElementById('cartInlineCustomerName');
    cartInlineLoyaltyPoints = document.getElementById('cartInlineLoyaltyPoints');
    cartInlineLoyaltyDiscount = document.getElementById('cartInlineLoyaltyDiscount');
    cartLoyaltyInlineBox = document.getElementById('cartLoyaltyInlineBox');
});

// LIVE Fetch on phone input (for order summary modal)
// Note: Loyalty info is no longer displayed in order summary modal, only in cart section
async function handleInlinePhoneInput(phone) {
    // Order summary modal no longer shows loyalty info, so this function does nothing
    // Loyalty info is only handled in cart section via handleCartPhoneInput
    return;
}

// LIVE Fetch on phone input (for cart sidebar)
async function handleCartPhoneInput(phone) {
    const clean = phone.replace(/[^0-9]/g, '');
    
    // Ensure cart inline elements exist
    if (!cartInlineCustomerName || !cartInlineLoyaltyPoints || !cartInlineLoyaltyDiscount || !cartLoyaltyInlineBox) {
        console.warn('Cart loyalty inline elements not found');
        return;
    }
    
    await updateLoyaltyInfo(clean, {
        customerNameEl: cartInlineCustomerName,
        loyaltyPointsEl: cartInlineLoyaltyPoints,
        loyaltyDiscountEl: cartInlineLoyaltyDiscount,
        loyaltyBoxEl: cartLoyaltyInlineBox
    });
}

// Common function to update loyalty info for both cart and order summary
async function updateLoyaltyInfo(cleanPhone, elements) {
    const { customerNameEl, loyaltyPointsEl, loyaltyDiscountEl, loyaltyBoxEl } = elements;
    
    if (cleanPhone.length < 7) {
        // Reset loyalty + totals when input is too short
        loyaltyDiscount = 0;
        currentCustomerData = null;
        currentLoyaltyPoints = 0;
        if (loyaltyBoxEl) loyaltyBoxEl.style.display = 'none';
        
        // Hide loyalty toggle when phone number is too short
        const loyaltyToggleContainer = document.getElementById('loyaltyToggleContainer');
        if (loyaltyToggleContainer) {
            loyaltyToggleContainer.style.display = 'none';
            // Uncheck toggle if hidden
            const useLoyaltyToggle = document.getElementById('useLoyaltyToggle');
            if (useLoyaltyToggle) {
                useLoyaltyToggle.checked = false;
            }
        }
        
        updateOrderSummaryTotals();
        updateCartSummary();
        return;
    }

    try {
        // Step 1: Fetch customer by phone number
        const customer = await fetchCustomerByPhone(cleanPhone);
        if (!customer) {
            // Customer not found - hide loyalty box
            if (loyaltyBoxEl) loyaltyBoxEl.style.display = 'none';
            
            // Hide loyalty toggle when customer not found
            const loyaltyToggleContainer = document.getElementById('loyaltyToggleContainer');
            if (loyaltyToggleContainer) {
                loyaltyToggleContainer.style.display = 'none';
                // Uncheck toggle if hidden
                const useLoyaltyToggle = document.getElementById('useLoyaltyToggle');
                if (useLoyaltyToggle) {
                    useLoyaltyToggle.checked = false;
                }
            }
            
            currentCustomerData = null;
            currentLoyaltyPoints = 0;
            loyaltyDiscount = 0;
            updateOrderSummaryTotals();
            updateCartSummary();
            return;
        }

        // Step 2: Get customer ID
        const customerId = customer._id || customer.id;
        if (!customerId) {
            console.error('Customer ID not found in customer object');
            if (loyaltyBoxEl) loyaltyBoxEl.style.display = 'none';
            return;
        }

        // Step 3: Use loyalty points from customer data instead of making separate API call
        // The user-by-phone API already returns loyaltyPointsBalance in the response
        const points = customer.loyaltyPointsBalance || 0;
        console.log('Using loyalty points from customer data:', points);

        // Step 4: Calculate discount using the same logic as mobile app
        const subtotal = cart.items.reduce((sum, i) => sum + (i.productId.price * i.quantity), 0);
        const tax = subtotal * 0.05;
        const totalWithTax = subtotal + tax;
        
        // Calculate loyalty discount using mobile app logic
        let discount = 0;
        if (points > 0 && totalWithTax >= minOrderAmount) {
            // Number of steps achieved
            const steps = Math.floor((totalWithTax - minOrderAmount) / perUnitValue) + 1;
            discount = Math.min(steps, points); // Cap discount at available points
        }

        // Step 5: Build friendly customer name
        let customerName = 'Customer';
        if (customer.firstName && customer.lastName) {
            customerName = `${customer.firstName} ${customer.lastName}`;
        } else if (customer.firstName) {
            customerName = customer.firstName;
        } else if (customer.name) {
            customerName = customer.name;
        } else if (customer.username) {
            customerName = customer.username;
        }

        // Step 6: Update UI with customer and loyalty data
        if (customerNameEl) customerNameEl.textContent = customerName;
        if (loyaltyPointsEl) loyaltyPointsEl.textContent = points || 0;
        if (loyaltyDiscountEl) loyaltyDiscountEl.textContent = `₹${discount.toFixed(2)}`;
        if (loyaltyBoxEl) loyaltyBoxEl.style.display = 'block';
        
        // Show/hide loyalty toggle based on points and minimum order amount
        const loyaltyToggleContainer = document.getElementById('loyaltyToggleContainer');
        const cartSubtotal = cart.items.reduce((sum, i) => sum + (i.productId.price * i.quantity), 0);
        const cartTotalWithTax = cartSubtotal + (cartSubtotal * 0.05);
        
        if (loyaltyToggleContainer) {
            // Show toggle if customer has points and meets minimum order amount
            if (points > 0 && cartTotalWithTax >= minOrderAmount) {
                loyaltyToggleContainer.style.display = 'flex';
            } else {
                loyaltyToggleContainer.style.display = 'none';
                // Uncheck toggle if hidden
                const useLoyaltyToggle = document.getElementById('useLoyaltyToggle');
                if (useLoyaltyToggle) {
                    useLoyaltyToggle.checked = false;
                }
            }
        }

        // Step 7: Store in global variables
        currentCustomerData = customer;
        currentLoyaltyPoints = points || 0;
        loyaltyDiscount = 0; // Will be updated when user enters points to use
        pointsToUse = 0; // Reset points to use
        
        // Reset points input
        const cartPointsInput = document.getElementById('cartPointsToUse');
        if (cartPointsInput) {
            cartPointsInput.value = '';
            cartPointsInput.max = points || 0; // Set max to available points
        }

        // Step 8: Update totals
        updateOrderSummaryTotals();
        updateCartSummary();
        
        console.log('Loyalty data updated:', {
            customer: customerName,
            points: points,
            discount: discount
        });
    } catch (error) {
        console.error('Error in updateLoyaltyInfo:', error);
        if (loyaltyBoxEl) loyaltyBoxEl.style.display = 'none';
        
        // Hide loyalty toggle on error
        const loyaltyToggleContainer = document.getElementById('loyaltyToggleContainer');
        if (loyaltyToggleContainer) {
            loyaltyToggleContainer.style.display = 'none';
            // Uncheck toggle if hidden
            const useLoyaltyToggle = document.getElementById('useLoyaltyToggle');
            if (useLoyaltyToggle) {
                useLoyaltyToggle.checked = false;
            }
        }
        
        currentCustomerData = null;
        currentLoyaltyPoints = 0;
        loyaltyDiscount = 0;
        updateOrderSummaryTotals();
        updateCartSummary();
    }
}

function setupCartListeners() {
    const checkoutBtn = document.getElementById('checkoutBtn');
    const clearCartBtn = document.getElementById('clearCartBtn');
    const cartPhoneInput = document.getElementById('cartCustomerPhone');

    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', () => {
            if (!cart || !cart.items || cart.items.length === 0) {
                showCartEmptyModal();
                return;
            }
            showOrderSummaryModal();
        });
    }

    if (clearCartBtn) {
        clearCartBtn.addEventListener('click', () => {
            if (!cart || !cart.items || cart.items.length === 0) {
                return;
            }
            showClearCartModal();
        });
    }

    // Setup cart phone input listener
    if (cartPhoneInput) {
        cartPhoneInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^0-9]/g, '');
            handleCartPhoneInput(e.target.value);
        });
    }

    // Setup cart points to use input listener
    const cartPointsToUseInput = document.getElementById('cartPointsToUse');
    if (cartPointsToUseInput) {
        cartPointsToUseInput.addEventListener('input', (e) => {
            const enteredPoints = parseInt(e.target.value) || 0;
            const maxPoints = currentLoyaltyPoints || 0;
            const subtotal = cart.items.reduce((sum, i) => sum + (i.productId.price * i.quantity), 0);
            const tax = subtotal * 0.05;
            const totalWithTax = subtotal + tax;
            
            // Calculate maximum redeemable points using mobile app logic
            let maxRedeemablePoints = 0;
            if (maxPoints > 0 && totalWithTax >= minOrderAmount) {
                // Number of steps achieved
                const steps = Math.floor((totalWithTax - minOrderAmount) / perUnitValue) + 1;
                maxRedeemablePoints = Math.min(steps, maxPoints); // Cap at available points
            }
            
            // Limit entered points to maximum redeemable points
            const pointsToUseValue = Math.min(enteredPoints, maxRedeemablePoints);
            
            if (enteredPoints > maxRedeemablePoints) {
                e.target.value = maxRedeemablePoints;
            }
            
            pointsToUse = pointsToUseValue;
            loyaltyDiscount = pointsToUseValue;
            
            // Update discount display
            const cartDiscountEl = document.getElementById('cartInlineLoyaltyDiscount');
            if (cartDiscountEl) {
                cartDiscountEl.textContent = `₹${loyaltyDiscount.toFixed(2)}`;
            }
            
            // Update cart summary
            updateCartSummary();
        });
    }
    
    // Setup loyalty toggle listener
    const useLoyaltyToggle = document.getElementById('useLoyaltyToggle');
    if (useLoyaltyToggle) {
        useLoyaltyToggle.addEventListener('change', () => {
            updateCartSummary();
            updateOrderSummaryTotals();
        });
    }
}

// Make functions globally accessible
window.updateCartQuantity = updateCartQuantity;
window.removeCartItem = removeCartItem;

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

// Cart Empty Modal (same style as logout)
function showCartEmptyModal() {
    const modal = document.getElementById('cartEmptyModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function hideCartEmptyModal() {
    const modal = document.getElementById('cartEmptyModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

const closeCartEmptyModalBtn = document.getElementById('closeCartEmptyModal');
const cartEmptyOkBtn = document.getElementById('cartEmptyOkBtn');

if (closeCartEmptyModalBtn) {
    closeCartEmptyModalBtn.addEventListener('click', hideCartEmptyModal);
}

if (cartEmptyOkBtn) {
    cartEmptyOkBtn.addEventListener('click', hideCartEmptyModal);
}

const cartEmptyModal = document.getElementById('cartEmptyModal');
if (cartEmptyModal) {
    const cartOverlay = cartEmptyModal.querySelector('.modal-overlay');
    if (cartOverlay) {
        cartOverlay.addEventListener('click', hideCartEmptyModal);
    }
}

// Clear Cart Modal (same style as logout)
function showClearCartModal() {
    const modal = document.getElementById('clearCartModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function hideClearCartModal() {
    const modal = document.getElementById('clearCartModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function clearCartAndRefresh() {
    cart = { items: [] };
    saveCart();
    renderCart();
    updateCartCount();
}

const closeClearCartModalBtn = document.getElementById('closeClearCartModal');
const cancelClearCartBtn = document.getElementById('cancelClearCartBtn');
const confirmClearCartBtn = document.getElementById('confirmClearCartBtn');

if (closeClearCartModalBtn) {
    closeClearCartModalBtn.addEventListener('click', hideClearCartModal);
}

if (cancelClearCartBtn) {
    cancelClearCartBtn.addEventListener('click', hideClearCartModal);
}

if (confirmClearCartBtn) {
    confirmClearCartBtn.addEventListener('click', () => {
        clearCartAndRefresh();
        hideClearCartModal();
    });
}

const clearCartModal = document.getElementById('clearCartModal');
if (clearCartModal) {
    const clearOverlay = clearCartModal.querySelector('.modal-overlay');
    if (clearOverlay) {
        clearOverlay.addEventListener('click', hideClearCartModal);
    }
}

// Order Summary Modal Functions
function showOrderSummaryModal() {
    const modal = document.getElementById('orderSummaryModal');
    const subtotalEl = document.getElementById('orderSubtotal');
    const taxEl = document.getElementById('orderTax');
    const totalEl = document.getElementById('orderTotal');
    
    // Calculate order totals
    if (!cart || !cart.items || cart.items.length === 0) {
        showCartEmptyModal();
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
    
    // Reset payment method buttons - remove active class from all
    const paymentMethodButtons = modal.querySelectorAll('.payment-method-btn');
    paymentMethodButtons.forEach(btn => {
        btn.classList.remove('active');
    });
    const orderTypeSelect = document.getElementById('orderOrderType');
    if (orderTypeSelect) {
        orderTypeSelect.value = '';
    }
    
    // Reset order type buttons - remove active class from all
    const orderTypeButtons = modal.querySelectorAll('.order-type-btn');
    orderTypeButtons.forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Set default to take-away if no selection
    if (orderTypeButtons.length > 0 && !selectedOrderType) {
        const takeAwayBtn = Array.from(orderTypeButtons).find(btn => btn.getAttribute('data-type') === 'take-away');
        if (takeAwayBtn) {
            takeAwayBtn.classList.add('active');
            if (orderTypeSelect) {
                orderTypeSelect.value = 'take-away';
            }
            selectedOrderType = 'take-away';
        }
    } else if (selectedOrderType) {
        // Restore previous selection
        const selectedBtn = Array.from(orderTypeButtons).find(btn => btn.getAttribute('data-type') === selectedOrderType);
        if (selectedBtn) {
            selectedBtn.classList.add('active');
            if (orderTypeSelect) {
                orderTypeSelect.value = selectedOrderType;
            }
        }
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
    const orderTypeSelect = document.getElementById('orderOrderType');
    const overlay = modal ? modal.querySelector('.modal-overlay') : null;
    
    if (!modal || !closeBtn || !purchaseBtn || !clearBtn) return;
    
    const closeHandler = () => {
        closeOrderSummaryModal();
    };
    
    if (closeBtn) closeBtn.addEventListener('click', closeHandler);
    if (overlay) overlay.addEventListener('click', closeHandler);
    
    // Setup payment method buttons
    const paymentMethodButtons = modal.querySelectorAll('.payment-method-btn');
    if (paymentMethodButtons.length > 0 && paymentMethodSelect) {
        paymentMethodButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                // Remove active class from all buttons
                paymentMethodButtons.forEach(b => b.classList.remove('active'));
                
                // Add active class to clicked button
                btn.classList.add('active');
                
                // Set hidden input value
                const paymentMethod = btn.getAttribute('data-method');
                paymentMethodSelect.value = paymentMethod;
                
                // Update selectedPaymentMethod variable
                selectedPaymentMethod = paymentMethod;
            });
        });
    }

    // Setup loyalty toggle listener to update totals
    const useLoyaltyToggle = document.getElementById('useLoyaltyToggle');
    if (useLoyaltyToggle) {
        useLoyaltyToggle.addEventListener('change', () => {
            updateOrderSummaryTotals();
        });
    }

    
    // Setup order type buttons
    const orderTypeButtons = modal.querySelectorAll('.order-type-btn');
    if (orderTypeButtons.length > 0 && orderTypeSelect) {
        orderTypeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                // Remove active class from all buttons
                orderTypeButtons.forEach(b => b.classList.remove('active'));
                
                // Add active class to clicked button
                btn.classList.add('active');
                
                // Set hidden input value
                const orderType = btn.getAttribute('data-type');
                orderTypeSelect.value = orderType;
                
                // Update selectedOrderType variable
                selectedOrderType = orderType;
            });
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
            const cartPhoneInput = document.getElementById('cartCustomerPhone');
            const phoneValue = cartPhoneInput ? cartPhoneInput.value.trim() : '';
            const cleanPhone = phoneValue.replace(/[^0-9]/g, '');
            if (!cleanPhone || cleanPhone.length < 7) {
                alert('Please enter a valid phone number (minimum 7 digits).');
                if (cartPhoneInput) {
                    cartPhoneInput.classList.add('input-error');
                    setTimeout(() => cartPhoneInput && cartPhoneInput.classList.remove('input-error'), 1500);
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
// Use loyalty discount inline (no modal)
selectedPaymentMethod = paymentMethod.value;
selectedOrderType = orderTypeValue;

// Go to finishing step (save order)
finalizeOrderWithLoyalty();


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
let pointsToUse = 0; // Points entered by user to use

// Old fetchAllUsers function removed - now using /user-by-phone API directly

// Fetch customer by phone number using API
async function fetchCustomerByPhone(phoneNumber) {
    try {
        const userToken = currentUser?.token;
        
        if (!userToken) {
            console.error('No token found. Please login again.');
            return null;
        }

        // Use window.apiClient if available, otherwise fall back to direct fetch
        if (typeof window.apiClient !== 'undefined' && window.apiClient.getCustomerByPhone) {
            // Use the new apiClient through window object
            try {
                // Temporarily set token for this request
                const originalUser = sessionStorage.getItem('user');
                sessionStorage.setItem('user', JSON.stringify({ token: userToken }));
                
                const response = await window.apiClient.getCustomerByPhone(phoneNumber);
                
                // Restore original user data
                if (originalUser) {
                    sessionStorage.setItem('user', originalUser);
                } else {
                    sessionStorage.removeItem('user');
                }
                
                if (!response.success) {
                    if (response.error && response.error.includes('Session expired')) {
                        alert('Session expired. Please login again.');
                        sessionStorage.removeItem('user');
                        window.location.href = 'index.html';
                        return null;
                    }
                    console.error('Failed to fetch customer:', response.error);
                    return null;
                }

                const data = response.data;
            } catch (apiClientError) {
                console.error('apiClient failed, falling back to direct fetch:', apiClientError);
                // Fall back to direct fetch if apiClient fails
                return await fetchCustomerByPhoneFallback(phoneNumber, userToken);
            }
        } else {
            // Fall back to direct fetch if apiClient is not available
            return await fetchCustomerByPhoneFallback(phoneNumber, userToken);
        }
        console.log('User-by-phone API response data:', data);
        
        // Handle different response formats
        let customer = null;
        if (data && (data._id || data.id)) {
            customer = data;
        } else if (data && data.data && (data.data._id || data.data.id)) {
            customer = data.data;
        }

        // Return customer if found
        if (customer) {
            console.log('Customer found via API:', customer);
            return customer;
        }

        console.log(`Customer not found with phone: ${phoneNumber}`);
        return null;
    } catch (error) {
        console.error('Error fetching customer by phone:', error);
        return null;
    }
}

async function fetchLoyaltyPoints(customerId) {
    try {
        const userToken = currentUser?.token;
        if (!userToken) {
            console.error('No token found for loyalty points fetch');
            return 0;
        }

        if (!customerId) {
            console.error('Customer ID is required for loyalty points fetch');
            return 0;
        }

        // Use window.apiClient if available, otherwise fall back to direct fetch
        if (typeof window.apiClient !== 'undefined' && window.apiClient.getLoyaltyPoints) {
            // Use the new apiClient through window object
            try {
                // Temporarily set token for this request
                const originalUser = sessionStorage.getItem('user');
                sessionStorage.setItem('user', JSON.stringify({ token: userToken }));
                
                const response = await window.apiClient.getLoyaltyPoints(customerId);
                
                // Restore original user data
                if (originalUser) {
                    sessionStorage.setItem('user', originalUser);
                } else {
                    sessionStorage.removeItem('user');
                }
                
                if (!response.success) {
                    if (response.error && response.error.includes('Session expired')) {
                        alert('Session expired. Please login again.');
                        sessionStorage.removeItem('user');
                        window.location.href = 'index.html';
                        return 0;
                    }
                    console.error('Failed to fetch loyalty points:', response.error);
                    return 0;
                }

                const data = response.data;
            } catch (apiClientError) {
                console.error('apiClient failed, falling back to direct fetch:', apiClientError);
                // Fall back to direct fetch if apiClient fails
                return await fetchLoyaltyPointsFallback(customerId, userToken);
            }
        } else {
            // Fall back to direct fetch if apiClient is not available
            return await fetchLoyaltyPointsFallback(customerId, userToken);
        }
        console.log('Loyalty points API raw response:', data);

        // Handle different response formats from CRUD API:
        // 1) Direct array: [{ _id, user, points, ... }]
        // 2) { data: [{ _id, user, points, ... }] }
        // 3) Single object: { _id, user, points, ... }
        // 4) { data: { _id, user, points, ... } }
        let points = 0;

        if (Array.isArray(data) && data.length > 0) {
            // Array format - get first record's points
            points = Number(data[0].points) || 0;
            console.log('Extracted points from array:', points);
        } else if (Array.isArray(data.data) && data.data.length > 0) {
            // { data: [...] } format
            points = Number(data.data[0].points) || 0;
            console.log('Extracted points from data array:', points);
        } else if (typeof data.points !== 'undefined') {
            // Single object with points property
            points = Number(data.points) || 0;
            console.log('Extracted points from object:', points);
        } else if (data.data && typeof data.data.points !== 'undefined') {
            // { data: { points: ... } } format
            points = Number(data.data.points) || 0;
            console.log('Extracted points from nested data:', points);
        } else {
            console.warn('Unexpected loyalty points response format:', data);
            points = 0;
        }

        console.log('Final loyalty points value:', points);
        return points;
    } catch (error) {
        console.error('Error fetching loyalty points:', error);
        return 0; // Return 0 on error to allow order to continue
    }
}

// Fallback function for fetching loyalty points using direct fetch
async function fetchLoyaltyPointsFallback(customerId, userToken) {
    try {
        if (!customerId) {
            console.error('Customer ID is required for loyalty points fetch');
            return 0;
        }

        console.log('Fetching loyalty points for customer ID (fallback):', customerId);

        // Use /loyalty-points with user query param
        // Backend must honour ?user query param for staff/admin roles
        const url = `https://api.mr-bakers.com/api/loyalty-points?user=${encodeURIComponent(customerId)}`;
        console.log('Loyalty points API URL:', url);

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
                console.log('No loyalty points record found for customer (returning 0)');
                return 0; // No loyalty points found = 0 points
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
            return 0;
        }

        const data = await response.json();
        console.log('Loyalty points API raw response:', data);
        return data;
    } catch (error) {
        console.error('Error fetching loyalty points (fallback):', error);
        return 0; // Return 0 on error to allow order to continue
    }
}

// Global variables for loyalty rules
let minOrderAmount = 0;
let perUnitValue = 0;

// Fetch minimum order amount for loyalty redemption
async function getMinOrderAmount() {
    try {
        const rule = await fetchPointsRuleByKey('min_order_ammount');
        return rule?.value || 0;
    } catch (error) {
        console.error('Error fetching min order amount:', error);
        return 0;
    }
}

// Fetch per unit value for loyalty calculation
async function getPerUnitValue() {
    try {
        const rule = await fetchPointsRuleByKey('per_unit');
        return rule?.value || 0;
    } catch (error) {
        console.error('Error fetching per unit value:', error);
        return 0;
    }
}

// Load loyalty rules on app initialization
async function loadLoyaltyRules() {
    try {
        minOrderAmount = await getMinOrderAmount();
        perUnitValue = await getPerUnitValue();
        console.log('Loyalty rules loaded:', { minOrderAmount, perUnitValue });
    } catch (error) {
        console.error('Error loading loyalty rules:', error);
    }
}

// Fetch points rule by key (GET /api/rule/:key)
async function fetchPointsRuleByKey(key) {
    try {
        const userToken = currentUser?.token;
        if (!userToken) {
            console.error('No token found. Please login again.');
            return null;
        }

        const response = await fetch(`https://api.mr-bakers.com/api/rule/${encodeURIComponent(key)}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            console.error('Failed to fetch points rule:', response.status, await response.text());
            return null;
        }

        const data = await response.json();
        // Backend might return { data: rule } or just rule
        return data.data || data;
    } catch (error) {
        console.error('Error fetching points rule by key:', error);
        return null;
    }
}

// Fetch all points rules (GET /api/rules)
async function fetchAllPointsRules() {
    try {
        const userToken = currentUser?.token;
        if (!userToken) {
            console.error('No token found. Please login again.');
            return [];
        }

        const response = await fetch('https://api.mr-bakers.com/api/rules', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            console.error('Failed to fetch all points rules:', response.status, await response.text());
            return [];
        }

        const data = await response.json();
        // Could be { data: [...] } or [...]
        if (Array.isArray(data)) return data;
        if (Array.isArray(data.data)) return data.data;
        return [];
    } catch (error) {
        console.error('Error fetching all points rules:', error);
        return [];
    }
}

// Update a points rule by key (PUT /api/rules/:key)
async function updatePointsRuleByKey(key, updatePayload) {
    try {
        const userToken = currentUser?.token;
        if (!userToken) {
            console.error('No token found. Please login again.');
            return null;
        }

        const response = await fetch(`https://api.mr-bakers.com/api/rules/${encodeURIComponent(key)}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`,
                'Accept': 'application/json'
            },
            body: JSON.stringify(updatePayload || {})
        });

        if (!response.ok) {
            console.error('Failed to update points rule:', response.status, await response.text());
            return null;
        }

        const data = await response.json();
        return data.data || data;
    } catch (error) {
        console.error('Error updating points rule by key:', error);
        return null;
    }
}

// Calculate discount from loyalty points (1 point = 1 rupee)
function calculateDiscountFromPoints(points, totalAmount) {
    return Math.min(points, totalAmount);
}

// Update order summary totals based on loyalty toggle state
function updateOrderSummaryTotals() {
    const subtotal = cart.items.reduce((sum, item) =>
        sum + (item.productId.price * item.quantity), 0);
    const tax = subtotal * 0.05;
    const totalWithTax = subtotal + tax;
    
    // Calculate loyalty discount using mobile app logic
    let calculatedDiscount = 0;
    if (currentLoyaltyPoints > 0 && totalWithTax >= minOrderAmount) {
        // Number of steps achieved
        const steps = Math.floor((totalWithTax - minOrderAmount) / perUnitValue) + 1;
        calculatedDiscount = Math.min(steps, currentLoyaltyPoints); // Cap at available points
    }
    
    const useLoyaltyToggle = document.getElementById('useLoyaltyToggle');
    const appliedDiscount = (useLoyaltyToggle && useLoyaltyToggle.checked) 
        ? calculatedDiscount 
        : 0;
    
    const finalTotal = Math.max(0, subtotal + tax - appliedDiscount);
    
    const subtotalEl = document.getElementById('orderSubtotal');
    const taxEl = document.getElementById('orderTax');
    const discountEl = document.getElementById('orderDiscount');
    const totalEl = document.getElementById('orderTotal');
    
    if (subtotalEl) subtotalEl.textContent = `₹${subtotal.toFixed(2)}`;
    if (taxEl) taxEl.textContent = `₹${tax.toFixed(2)}`;
    if (discountEl) discountEl.textContent = `₹${appliedDiscount.toFixed(2)}`;
    if (totalEl) totalEl.textContent = `₹${finalTotal.toFixed(2)}`;
}

// Redeem loyalty points - deduct from customer balance and create redeemed record
async function redeemLoyaltyPoints(customerId, pointsToRedeem, posOrderId) {
    try {
        const userToken = currentUser?.token;
        if (!userToken) {
            console.error('No token found for redeeming points');
            return false;
        }

        // Use window.apiClient if available, otherwise fall back to direct fetch
        if (typeof window.apiClient !== 'undefined' && window.apiClient.redeemLoyaltyPoints) {
            // Use the new apiClient through window object
            try {
                // Temporarily set token for this request
                const originalUser = sessionStorage.getItem('user');
                sessionStorage.setItem('user', JSON.stringify({ token: userToken }));
                
                const response = await window.apiClient.redeemLoyaltyPoints(customerId, pointsToRedeem, posOrderId);
                
                // Restore original user data
                if (originalUser) {
                    sessionStorage.setItem('user', originalUser);
                } else {
                    sessionStorage.removeItem('user');
                }
                
                if (!response.success) {
                    console.error('Failed to redeem loyalty points:', response.error);
                    return false;
                }

                console.log('Points redeemed record created:', response.data);
                return true;
            } catch (apiClientError) {
                console.error('apiClient failed, falling back to direct fetch:', apiClientError);
                // Fall back to direct fetch if apiClient fails
                return await redeemLoyaltyPointsFallback(customerId, pointsToRedeem, posOrderId, userToken);
            }
        } else {
            // Fall back to direct fetch if apiClient is not available
            return await redeemLoyaltyPointsFallback(customerId, pointsToRedeem, posOrderId, userToken);
        }
    } catch (error) {
        console.error('Error redeeming loyalty points:', error);
        return false;
    }
}

// Earn loyalty points after purchase - add points to customer balance
async function earnLoyaltyPoints(customerId, purchaseAmount, posOrderId) {
    try {
        const userToken = currentUser?.token;
        if (!userToken) {
            console.error('No token found for earning points');
            return false;
        }

        if (!customerId || !purchaseAmount || purchaseAmount <= 0) {
            console.log('No purchase amount to earn points from');
            return true; // Not an error, just nothing to do
        }

        if (!posOrderId) {
            console.error('POS Order ID is required to earn points');
            return false;
        }

        // Calculate points to earn (typically 1 point per ₹1 spent, or percentage based)
        // You can adjust this formula based on your business rules
        const pointsToEarn = Math.floor(purchaseAmount); // 1 point per ₹1 spent

        console.log(`Earning ${pointsToEarn} points for customer ${customerId} on order ${posOrderId} (purchase: ₹${purchaseAmount})`);

        // Step 1: Fetch current loyalty points
        const currentPoints = await fetchLoyaltyPoints(customerId);
        const newPointsBalance = currentPoints + pointsToEarn;

        // Step 2: Check if loyalty points record exists
        const loyaltyResponse = await fetch(`https://api.mr-bakers.com/api/loyalty-points?user=${encodeURIComponent(customerId)}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`,
                'Accept': 'application/json'
            }
        });

        if (loyaltyResponse.ok) {
            const loyaltyData = await loyaltyResponse.json();
            let loyaltyRecord = null;

            // Find the loyalty record
            if (Array.isArray(loyaltyData) && loyaltyData.length > 0) {
                loyaltyRecord = loyaltyData[0];
            } else if (Array.isArray(loyaltyData.data) && loyaltyData.data.length > 0) {
                loyaltyRecord = loyaltyData.data[0];
            } else if (loyaltyData._id || loyaltyData.id) {
                loyaltyRecord = loyaltyData;
            } else if (loyaltyData.data && (loyaltyData.data._id || loyaltyData.data.id)) {
                loyaltyRecord = loyaltyData.data;
            }

            if (loyaltyRecord && (loyaltyRecord._id || loyaltyRecord.id)) {
                // Update existing loyalty points record
                const loyaltyId = loyaltyRecord._id || loyaltyRecord.id;
                
                try {
                    const updateResponse = await fetch(`https://api.mr-bakers.com/api/loyalty-points/${loyaltyId}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${userToken}`,
                            'Accept': 'application/json'
                        },
                        body: JSON.stringify({ points: newPointsBalance })
                    });

                    if (updateResponse.ok) {
                        console.log(`Loyalty points updated: ${currentPoints} -> ${newPointsBalance} (+${pointsToEarn})`);
                        return true;
                    } else {
                        console.warn('Could not update loyalty points balance (update may be disabled in backend)');
                        // Try to create new record if update fails
                    }
                } catch (updateError) {
                    console.warn('Error updating loyalty points:', updateError);
                    // Try to create new record if update fails
                }
            }
        }

        // Step 3: If no record exists or update failed, try to create new record
        // Note: Backend may have create disabled, so this might fail
        try {
            const createData = {
                user: customerId,
                points: pointsToEarn
            };

            const createResponse = await fetch('https://api.mr-bakers.com/api/loyalty-points', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${userToken}`,
                    'Accept': 'application/json'
                },
                body: JSON.stringify(createData)
            });

            if (createResponse.ok) {
                console.log(`New loyalty points record created: ${pointsToEarn} points for customer ${customerId}`);
                return true;
            } else {
                const errorText = await createResponse.text();
                console.warn('Could not create loyalty points record (create may be disabled in backend):', createResponse.status, errorText);
                // Still return true as this is not critical for order completion
                return true;
            }
        } catch (createError) {
            console.warn('Error creating loyalty points record:', createError);
            // Still return true as this is not critical for order completion
            return true;
        }

    } catch (error) {
        console.error('Error earning loyalty points:', error);
        // Return true to not block order completion even if points earning fails
        return true;
    }
}

// Fallback function for redeeming loyalty points using direct fetch
async function redeemLoyaltyPointsFallback(customerId, pointsToRedeem, posOrderId, userToken) {
    try {
        if (!customerId) {
            console.error('No customer ID found for redeeming points');
            return false;
        }

        if (!pointsToRedeem || pointsToRedeem <= 0) {
            console.log('No points to redeem');
            return true; // Not an error, just nothing to do
        }

        if (!posOrderId) {
            console.error('POS Order ID is required to redeem points');
            return false;
        }

        console.log(`Redeeming ${pointsToRedeem} points for customer ${customerId} on order ${posOrderId}`);

        // Step 1: Create points-redeemed record
        const redeemedData = {
            user: customerId,
            points: pointsToRedeem,
            type: 'pos',
            posOrder: posOrderId
        };

        const redeemedResponse = await fetch('https://api.mr-bakers.com/api/points-redeemed', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`,
                'Accept': 'application/json'
            },
            body: JSON.stringify(redeemedData)
        });

        if (!redeemedResponse.ok) {
            const errorText = await redeemedResponse.text();
            console.error('Failed to create points-redeemed record:', redeemedResponse.status, errorText);
            return false;
        }

        const redeemedResult = await redeemedResponse.json();
        console.log('Points redeemed record created:', redeemedResult);
        return true;
    } catch (error) {
        console.error('Error redeeming loyalty points (fallback):', error);
        return false;
    }
}

// Generate bill preview after POS order is saved (Order Summary flow)
function generateBillPreview(savedOrder) {
    try {
        // Phone from cart section (single source of truth)
        const cartPhoneInput = document.getElementById('cartCustomerPhone');
        const phoneNumber = cartPhoneInput ? cartPhoneInput.value.trim() : '';

        // Calculate amounts from current cart
        const subtotal = cart.items.reduce((sum, item) =>
            sum + (item.productId.price * item.quantity), 0);
        const tax = subtotal * 0.05;

        // Apply loyalty discount if any
        const discount = loyaltyDiscount || 0;
        const total = Math.max(0, subtotal + tax - discount);

        // Close order summary modal before showing bill
        const orderModal = document.getElementById('orderSummaryModal');
        if (orderModal) {
            orderModal.style.display = 'none';
        }

        // Reuse existing bill generator (opens bill modal)
        generateBill(phoneNumber, discount, subtotal, tax, total);
    } catch (err) {
        console.error('Error generating bill preview:', err);
        alert('Bill generation failed. Order may be saved, please check Recent Orders.');
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
            
            // Use loyalty points from customer data instead of making separate API call
            // The user-by-phone API already returns loyaltyPointsBalance in the response
            const points = customer.loyaltyPointsBalance || 0;
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
    // Calculate totals
    const subtotal = cart.items.reduce((sum, item) => {
        const price = item.productId.price || 0;
        const quantity = item.quantity || 0;
        return sum + (price * quantity);
    }, 0);
    const tax = subtotal * 0.05;
    const total = Math.max(0, subtotal + tax - discount);
    
    try {
        // Save POS order to backend for all payment methods
        if (selectedPaymentMethod) {
            // Save POS order - wait for response
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

    // After bill is generated and shown, clear cart and reset state for next order
    resetCartAndState();
}

function resetCartAndState() {
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

    // Reset cart-side customer UI
    const cartPhoneInput = document.getElementById('cartCustomerPhone');
    if (cartPhoneInput) {
        cartPhoneInput.value = '';
    }

    const loyaltyBox = document.getElementById('cartLoyaltyInlineBox');
    const nameEl = document.getElementById('cartInlineCustomerName');
    const pointsEl = document.getElementById('cartInlineLoyaltyPoints');
    const discountEl = document.getElementById('cartInlineLoyaltyDiscount');
    const pointsInput = document.getElementById('cartPointsToUse');

    if (nameEl) nameEl.textContent = '';
    if (pointsEl) pointsEl.textContent = '0';
    if (discountEl) discountEl.textContent = '₹0.00';
    if (pointsInput) {
        pointsInput.value = '';
        pointsInput.max = 0;
    }
    if (loyaltyBox) {
        loyaltyBox.style.display = 'none';
    }
}

function closeBillModal() {
    const billModal = document.getElementById('billModal');
    if (billModal) {
        billModal.style.display = 'none';
    }
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
    
    // Simple print: open browser/Electron print dialog for current window
    if (printBtn) {
        printBtn.addEventListener('click', () => {
            window.print(); // Electron will show the print window (select printer / PDF)
        });
    }
}
async function finalizeOrderWithLoyalty() {
    try {
        const subtotal = cart.items.reduce((sum, item) =>
            sum + (item.productId.price * item.quantity), 0);

        const tax = subtotal * 0.05;
        
        // Calculate loyalty discount using mobile app logic
        const totalWithTax = subtotal + tax;
        let calculatedDiscount = 0;
        if (currentLoyaltyPoints > 0 && totalWithTax >= minOrderAmount) {
            // Number of steps achieved
            const steps = Math.floor((totalWithTax - minOrderAmount) / perUnitValue) + 1;
            calculatedDiscount = Math.min(steps, currentLoyaltyPoints); // Cap at available points
        }
        
        // Use pointsToUse from cart input (or from order summary modal toggle)
        const useLoyaltyToggle = document.getElementById('useLoyaltyToggle');
        let finalDiscount = 0;
        
        // Check if points are entered in cart section
        if (pointsToUse > 0) {
            // Use points from cart input, capped at calculated discount
            finalDiscount = Math.min(pointsToUse, calculatedDiscount);
        } else if (useLoyaltyToggle && useLoyaltyToggle.checked) {
            // Use calculated discount from mobile app logic
            finalDiscount = calculatedDiscount;
        }

        // Calculate final total with discount applied
        const totalCost = Math.max(0, subtotal + tax - finalDiscount);

        // Save POS order first to get order ID
        const saved = await savePosOrderToBackend(
            selectedPaymentMethod,
            selectedOrderType,
            cart,
            currentUser,
            finalDiscount
        );

        // Get customer ID from cart phone input
        const cartPhoneInput = document.getElementById('cartCustomerPhone');
        const phoneNumber = cartPhoneInput ? cartPhoneInput.value.trim() : '';
        let customerId = null;
        
        // If customer data exists, use it; otherwise fetch by phone
        if (currentCustomerData) {
            customerId = currentCustomerData._id || currentCustomerData.id;
        } else if (phoneNumber && phoneNumber.length >= 7) {
            // Fetch customer by phone if not already loaded
            const customer = await fetchCustomerByPhone(phoneNumber);
            if (customer) {
                customerId = customer._id || customer.id;
            }
        }

        // If discount was applied, redeem the points using points-redeemed API
        if (finalDiscount > 0 && customerId && saved) {
            const posOrderId = saved._id || saved.id;
            
            if (posOrderId) {
                const redeemed = await redeemLoyaltyPoints(customerId, finalDiscount, posOrderId);
                if (redeemed) {
                    console.log(`Successfully redeemed ${finalDiscount} points for order ${posOrderId}`);
                    // Update displayed points if still visible
                    if (inlineLoyaltyPoints) {
                        const newPoints = Math.max(0, currentLoyaltyPoints - finalDiscount);
                        inlineLoyaltyPoints.textContent = newPoints;
                        currentLoyaltyPoints = newPoints;
                    }
                    if (cartInlineLoyaltyPoints) {
                        const newPoints = Math.max(0, currentLoyaltyPoints - finalDiscount);
                        cartInlineLoyaltyPoints.textContent = newPoints;
                        currentLoyaltyPoints = newPoints;
                    }
                } else {
                    console.warn('Failed to redeem points, but order was saved');
                }
            }
        }

        // Earn loyalty points for the customer after purchase (based on final amount paid)
        if (customerId && saved) {
            const posOrderId = saved._id || saved.id;
            // Earn points based on final amount paid (after discount)
            const earned = await earnLoyaltyPoints(customerId, totalCost, posOrderId);
            if (earned) {
                console.log(`Successfully earned points for order ${posOrderId}`);
                // Refresh loyalty points display if customer is still viewing
                if (phoneNumber && phoneNumber.length >= 7) {
                    // Refresh points display
                    await handleCartPhoneInput(phoneNumber);
                }
            } else {
                console.warn('Failed to earn points, but order was saved');
            }
        }

        // After save → show bill
        generateBillPreview(saved);

    } catch (err) {
        console.error("Finalize Order Error:", err);
        // If order save failed (e.g., token invalid), still allow bill printing
    }
};

// Fallback function for fetching customer by phone using direct fetch
async function fetchCustomerByPhoneFallback(phoneNumber, userToken) {
    // Clean phone number - remove spaces, dashes, and other non-numeric characters
    // Keep only digits for consistent API calls
    const cleanPhoneNumber = phoneNumber.trim().replace(/[^0-9]/g, '');
    
    if (!cleanPhoneNumber || cleanPhoneNumber.length < 7) {
        console.error('Invalid phone number format');
        return null;
    }

    console.log('Fetching customer by phone number (fallback):', cleanPhoneNumber);
    console.log('Original phone number:', phoneNumber);
    
    // Use the /user-by-phone/:phoneNumber API endpoint
    // Router: router.get('/user-by-phone/:phoneNumber', requireAuth, allowRoles('staff', 'admin', 'superadmin'), getUserByPhoneNumber);
    const url = `https://api.mr-bakers.com/api/user-by-phone/${cleanPhoneNumber}`;
    
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
}

// Fallback function for fetching customer by phone using direct fetch
async function fetchCustomerByPhoneFallback(phoneNumber, userToken) {
    // Clean phone number - remove spaces, dashes, and other non-numeric characters
    // Keep only digits for consistent API calls
    const cleanPhoneNumber = phoneNumber.trim().replace(/[^0-9]/g, '');
    
    if (!cleanPhoneNumber || cleanPhoneNumber.length < 7) {
        console.error('Invalid phone number format');
        return null;
    }

    console.log('Fetching customer by phone number (fallback):', cleanPhoneNumber);
    console.log('Original phone number:', phoneNumber);
    
    // Use the /user-by-phone/:phoneNumber API endpoint
    // Router: router.get('/user-by-phone/:phoneNumber', requireAuth, allowRoles('staff', 'admin', 'superadmin'), getUserByPhoneNumber);
    const url = `https://api.mr-bakers.com/api/user-by-phone/${cleanPhoneNumber}`;
    
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
}
