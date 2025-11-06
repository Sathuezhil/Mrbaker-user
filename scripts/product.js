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
            
            return {
                _id: item._id,
                id: item._id || item.id,
                name: item.name || '',
                category: item.category || null,
                categoryName: item.category?.name || '',
                productType: item.productType || null,
                productTypeName: item.productType?.name || '',
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
            console.log('Foods API Response:', foodsData);
            const foodsProducts = extractProductsFromResponse(foodsData);
            allProductsData = allProductsData.concat(foodsProducts);
        } else if (foodsResponse.status === 'fulfilled' && !foodsResponse.value.ok) {
            console.warn('Foods API error:', foodsResponse.value.status);
        } else {
            console.warn('Foods API failed:', foodsResponse.reason);
        }

        // Process Beverage API response
        if (beverageResponse.status === 'fulfilled' && beverageResponse.value.ok) {
            const beverageData = await beverageResponse.value.json();
            console.log('Beverage API Response:', beverageData);
            const beverageProducts = extractProductsFromResponse(beverageData);
            allProductsData = allProductsData.concat(beverageProducts);
        } else if (beverageResponse.status === 'fulfilled' && !beverageResponse.value.ok) {
            console.warn('Beverage API error:', beverageResponse.value.status);
        } else {
            console.warn('Beverage API failed:', beverageResponse.reason);
        }

        if (allProductsData.length === 0) {
            productsGrid.innerHTML = '<div class="loading">No products available</div>';
            return;
        }

        // Process all products
        products = processProductItems(allProductsData);

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
        
        // Build image HTML - always show image if URL exists
        // Support all image formats: jpg, jpeg, png, gif, webp, svg, bmp, ico, etc.
        // Also support placeholder URLs like via.placeholder.com
        let imageHtml = '';
        if (product.image && product.image.trim() !== '') {
            // Always try to display the image - placeholder is behind it as fallback
            // Allow all image types - no file type restrictions (jpg, jpeg, png, gif, webp, svg, bmp, ico, etc.)
            // Image should be visible by default, only hide on actual error
            const imageUrl = product.image.trim();
            console.log(`Loading image for ${product.name}:`, imageUrl);
            imageHtml = `
                <div class="product-image-placeholder" style="display: none;"><span>📷</span><span>No Image</span></div>
                <img src="${imageUrl}" alt="${product.name}" class="product-image-img" 
                     onload="console.log('Image loaded successfully:', '${imageUrl}'); this.style.display='block';"
                     onerror="console.error('Image failed to load:', '${imageUrl}'); this.onerror=null; this.style.display='none'; const placeholder = this.previousElementSibling; if(placeholder) placeholder.style.display='flex';">
            `;
        } else {
            // No image URL - show placeholder directly
            console.log(`No image URL for product: ${product.name}`);
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
    localStorage.removeItem('user');
    window.location.href = 'index.html';
});
