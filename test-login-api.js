// Test script to check API login endpoint and identify correct field names
// Run this with: node test-login-api.js

const https = require('https');

const API_URL = 'https://api.mr-bakers.com/api/login';

// Test different field name combinations
const testCredentials = [
    { user_name: 'test', password: 'test' },
    { username: 'test', password: 'test' },
    { email: 'test', password: 'test' },
    { userName: 'test', password: 'test' },
    { user: 'test', password: 'test' },
    { login: 'test', password: 'test' }
];

function makeRequest(body, fieldName) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        
        const options = {
            hostname: 'api.mr-bakers.com',
            path: '/api/login',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Content-Length': data.length
            }
        };

        const req = https.request(options, (res) => {
            let responseData = '';

            res.on('data', (chunk) => {
                responseData += chunk;
            });

            res.on('end', () => {
                try {
                    const parsed = JSON.parse(responseData);
                    resolve({
                        status: res.statusCode,
                        headers: res.headers,
                        data: parsed,
                        fieldName: fieldName
                    });
                } catch (e) {
                    resolve({
                        status: res.statusCode,
                        headers: res.headers,
                        data: responseData,
                        fieldName: fieldName,
                        parseError: e.message
                    });
                }
            });
        });

        req.on('error', (error) => {
            reject({ error, fieldName });
        });

        req.write(data);
        req.end();
    });
}

async function testLoginAPI() {
    console.log('🔍 Testing API Login Endpoint...\n');
    console.log('URL:', API_URL);
    console.log('='.repeat(60));
    
    for (let i = 0; i < testCredentials.length; i++) {
        const cred = testCredentials[i];
        const fieldName = Object.keys(cred)[0];
        
        console.log(`\n📤 Test ${i + 1}: Using field name "${fieldName}"`);
        console.log('Request body:', JSON.stringify(cred, null, 2));
        
        try {
            const result = await makeRequest(cred, fieldName);
            
            console.log(`✅ Status: ${result.status}`);
            console.log('Response:', JSON.stringify(result.data, null, 2));
            
            // If we get 400 with "Invalid credentials", it means the format is correct!
            if (result.status === 400 && 
                result.data.message && 
                result.data.message.toLowerCase().includes('invalid credential')) {
                console.log('🎯 SUCCESS! This field name format is CORRECT!');
                console.log('   The API accepts this format, but credentials are wrong.');
                console.log(`   Use field name: "${fieldName}"`);
            } else if (result.status === 200 || result.status === 201) {
                console.log('🎉 LOGIN SUCCESSFUL!');
            }
            
        } catch (error) {
            console.log('❌ Error:', error);
        }
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Testing complete!');
    console.log('\n💡 Tip: If you see "Invalid credentials" with status 400,');
    console.log('   that field name format is correct - just use valid credentials!');
}

// Run the test
testLoginAPI().catch(console.error);

