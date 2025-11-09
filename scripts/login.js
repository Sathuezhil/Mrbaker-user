// Login API integration
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorMessage = document.getElementById('errorMessage');
    const loginBtn = e.target.querySelector('button[type="submit"]');
    
    if (!username || !password) {
        errorMessage.textContent = 'Please enter username/email/phone and password';
        errorMessage.classList.add('show');
        setTimeout(() => {
            errorMessage.classList.remove('show');
        }, 3000);
        return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in...';
    errorMessage.classList.remove('show');
    
    try {
        // Make login API request with identifier and password
        // Backend accepts 'identifier' which can be: username, email, or phone
        // Based on User schema: username (sparse), email (required), phone (required, Number)
        // JSON.stringify automatically handles proper JSON formatting with quotes
        const requestBody = {
            identifier: String(username).trim(),
            password: String(password).trim()
        };
        
        console.log('Login Request Body:', JSON.stringify(requestBody));
        
        const response = await fetch('https://api.mr-bakers.com/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        // Parse response
        let data;
        try {
            data = await response.json();
        } catch (parseError) {
            const text = await response.text();
            console.error('Non-JSON response:', text);
            throw new Error('Invalid response from server');
        }

        // Log response for debugging
        console.log('Login API Response:', data);
        console.log('Response Status:', response.status);

        // Check if login was successful
        if (!response.ok) {
            const errorMsg = data.message || data.error || data.error_message || data.msg || 'Login failed';
            throw new Error(errorMsg);
        }

        // Extract branchId from response - based on User schema: branchId (ObjectId ref to Branch)
        // Try multiple possible locations in response
        const branchId = data.branchId ||        // Direct camelCase (matches schema)
                        data.branch_id ||       // Snake case
                        data.user?.branchId ||  // Nested in user object
                        data.user?.branch_id || // Nested snake case
                        data.branch?.id ||      // Branch object with id
                        data.data?.branchId ||  // Nested in data
                        data.data?.branch_id ||
                        (data.branch && typeof data.branch === 'object' ? Object.values(data.branch)[0] : null);
        
        console.log('Extracted Branch ID:', branchId);
        console.log('Full data structure:', JSON.stringify(data, null, 2));

        if (!branchId) {
            // Still save user data even if branch-id not found, might be in user data
            console.warn('Branch ID not found in expected locations, checking full response...');
            // Save full response for debugging
            sessionStorage.setItem('lastLoginResponse', JSON.stringify(data));
            throw new Error('Branch ID not found in login response. Check console for details.');
        }

        // Save user data with branchId
        // Based on User schema: id, username, email, phone, role, branchId, etc.
        const userData = {
            id: data.id || data.user_id || data.user?.id || data._id || username,
            username: data.username || data.user?.username || username,
            email: data.email || data.user?.email || null,
            phone: data.phone || data.user?.phone || null,
            firstName: data.firstName || data.user?.firstName || data.first_name || null,
            lastName: data.lastName || data.user?.lastName || data.last_name || null,
            role: data.role || data.user?.role || 'customer',
            branchId: branchId,
            loggedIn: true,
            token: data.token || data.access_token || data.auth_token || null,
            userData: data // Store full response for future use
        };
        
        sessionStorage.setItem('user', JSON.stringify(userData));
        console.log('User data saved:', userData);
        
        // Redirect to products page
        window.location.href = 'product.html';
    } catch (error) {
        console.error('Login error:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack
        });
        
        // Show user-friendly error message
        const displayMessage = error.message || 'Login failed. Please check your credentials.';
        errorMessage.textContent = displayMessage;
        errorMessage.classList.add('show');
        loginBtn.disabled = false;
        loginBtn.textContent = 'Login';
    }
});

// Check if already logged in
document.addEventListener('DOMContentLoaded', () => {
    // Clear any persisted login state from previous app sessions
    if (localStorage.getItem('user')) {
        localStorage.removeItem('user');
    }
    if (localStorage.getItem('lastLoginResponse')) {
        localStorage.removeItem('lastLoginResponse');
    }

    const user = sessionStorage.getItem('user');
    if (user && JSON.parse(user).loggedIn) {
        window.location.href = 'product.html';
        return;
    }
    
    // Remove register link
    const registerLink = document.getElementById('registerLink');
    if (registerLink) {
        registerLink.parentElement.style.display = 'none';
    }
});
