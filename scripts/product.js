// Products data - fetched from API
let products = [];
let allProducts = []; // Store all products for filtering
let categories = [];
let selectedCategoryId = '';
let cart = { items: [] };
let currentUser = null;

function capitalizeWords(text = '') {
    return String(text)
        .split(' ')
        .map(word => word ? word.charAt(0).toUpperCase() + word.slice(1) : '')
        .join(' ');
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

    loadCart();
    await fetchBranchInfo();
    await fetchCategories();
    await fetchProducts();
    updateCartCount();
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
        const chip = createCategoryChip(category._id, category.name, count, selectedCategoryId === category._id);
        chipsContainer.appendChild(chip);
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
        // Fetch from both Foods and Beverage APIs
        const [foodsResponse, beverageResponse] = await Promise.allSettled([
            fetch(`https://api.mr-bakers.com/api/foods/${currentUser.branchId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            }),
            fetch(`https://api.mr-bakers.com/api/beverage`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            })
        ]);

        let allProductsData = [];

        // Process Foods API response
        if (foodsResponse.status === 'fulfilled' && foodsResponse.value.ok) {
            const foodsData = await foodsResponse.value.json();
            const foodsProducts = extractProductsFromResponse(foodsData);
            allProductsData = allProductsData.concat(foodsProducts);
        }

        // Process Beverage API response
        if (beverageResponse.status === 'fulfilled' && beverageResponse.value.ok) {
            const beverageData = await beverageResponse.value.json();
            const beverageProducts = extractProductsFromResponse(beverageData);
            allProductsData = allProductsData.concat(beverageProducts);
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
        
        // Handle price display and size selector for products with multiple sizes
        let priceDisplay = '';
        let sizeSelectorHtml = '';
        
        if (product.hasMultiplePrices && product.prices && product.prices.length > 0) {
            // Sort prices by size (ascending order)
            const sortedPrices = [...product.prices].sort((a, b) => {
                const sizeA = parseInt(a.size) || 0;
                const sizeB = parseInt(b.size) || 0;
                return sizeA - sizeB;
            });
            
            // Build size selector dropdown
            sizeSelectorHtml = `
                <div class="product-size-selector">
                    <label for="size-${product.id}">Size:</label>
                    <select id="size-${product.id}" class="size-select" data-product-id="${product.id}">
                        ${sortedPrices.map((priceItem, index) => 
                            `<option value="${index}" data-price="${priceItem.price}" data-size="${priceItem.size}">
                                ${priceItem.size} - ₹${priceItem.price.toFixed(2)}
                            </option>`
                        ).join('')}
                    </select>
                </div>
            `;
            
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
                ${sizeSelectorHtml}
                <div class="product-footer">
                    <div class="product-price">${priceDisplay}</div>
                    <button class="add-to-cart-btn" data-id="${product.id}">Add to Cart</button>
                </div>
            </div>
        `;
        productsGrid.appendChild(productCard);
    });

    // Add event listeners for size selectors to update price
    document.querySelectorAll('.size-select').forEach(select => {
        select.addEventListener('change', (e) => {
            const selectedOption = select.options[select.selectedIndex];
            const price = parseFloat(selectedOption.getAttribute('data-price'));
            const productId = select.getAttribute('data-product-id');
            const productCard = select.closest('.product-card');
            const priceElement = productCard.querySelector('.product-price');
            if (priceElement) {
                priceElement.textContent = `₹${price.toFixed(2)}`;
            }
        });
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
    
    // Determine the price and size to use
    let cartPrice = product.price || 0;
    let selectedSize = null;
    let selectedSizeText = null;
    
    if (product.hasMultiplePrices && product.prices && product.prices.length > 0) {
        // Get selected size from dropdown
        const sizeSelect = document.getElementById(`size-${productId}`);
        if (sizeSelect) {
            const selectedOption = sizeSelect.options[sizeSelect.selectedIndex];
            cartPrice = parseFloat(selectedOption.getAttribute('data-price'));
            selectedSize = selectedOption.getAttribute('data-size');
            selectedSizeText = selectedOption.textContent.trim();
        } else {
            // Fallback to minimum price if selector not found
            cartPrice = Math.min(...product.prices.map(p => p.price));
        }
    }
    
    // Check if item with same product and size already exists
    const existingItem = cart.items.find(item => {
        const sameProduct = item.productId.id === productId || item.productId._id === productId;
        const sameSize = item.selectedSize === selectedSize;
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
                price: cartPrice,
                prices: product.prices || null,
                hasMultiplePrices: product.hasMultiplePrices || false,
                image: product.image || '',
                categoryName: product.categoryName || '',
                productTypeName: product.productTypeName || ''
            },
            selectedSize: selectedSize,
            selectedSizeText: selectedSizeText,
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
    sessionStorage.removeItem('user');
    window.location.href = 'index.html';
});
