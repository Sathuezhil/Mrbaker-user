// Script to check login credentials in MongoDB
// Make sure you have mongodb package installed: npm install mongodb
// Update the connection string and database/collection names below

const { MongoClient } = require('mongodb');

// MongoDB Connection String - UPDATE THIS with your MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = 'mr_bakers'; // Update with your database name
const COLLECTION_NAME = 'logins'; // Update with your collection name (could be 'users', 'login', etc.)

async function checkMongoDBLogins() {
    let client;
    
    try {
        console.log('🔌 Connecting to MongoDB...');
        console.log('Connection String:', MONGODB_URI);
        console.log('Database:', DATABASE_NAME);
        console.log('Collection:', COLLECTION_NAME);
        console.log('='.repeat(60));
        
        client = new MongoClient(MONGODB_URI);
        await client.connect();
        console.log('✅ Connected to MongoDB!\n');
        
        const db = client.db(DATABASE_NAME);
        const collection = db.collection(COLLECTION_NAME);
        
        // Get all login records
        console.log('📋 Fetching login records...\n');
        const logins = await collection.find({}).toArray();
        
        if (logins.length === 0) {
            console.log('⚠️  No login records found in collection:', COLLECTION_NAME);
            console.log('\n💡 Trying common collection names...');
            
            // Try common collection names
            const commonNames = ['users', 'user', 'login', 'accounts', 'account'];
            for (const name of commonNames) {
                try {
                    const testCollection = db.collection(name);
                    const count = await testCollection.countDocuments();
                    if (count > 0) {
                        console.log(`\n✅ Found collection "${name}" with ${count} records`);
                        const records = await testCollection.find({}).limit(5).toArray();
                        console.log('Sample records:', JSON.stringify(records, null, 2));
                    }
                } catch (e) {
                    // Collection doesn't exist
                }
            }
        } else {
            console.log(`✅ Found ${logins.length} login record(s):\n`);
            
            // Display login records (hide passwords for security)
            logins.forEach((login, index) => {
                console.log(`--- Login ${index + 1} ---`);
                const displayLogin = { ...login };
                
                // Hide password if it exists
                if (displayLogin.password) {
                    displayLogin.password = '***HIDDEN***';
                }
                if (displayLogin.pwd) {
                    displayLogin.pwd = '***HIDDEN***';
                }
                
                console.log(JSON.stringify(displayLogin, null, 2));
                console.log();
            });
            
            // Show available field names
            if (logins.length > 0) {
                console.log('📌 Available field names in login records:');
                const allFields = new Set();
                logins.forEach(login => {
                    Object.keys(login).forEach(key => allFields.add(key));
                });
                console.log(Array.from(allFields).join(', '));
                console.log();
                
                // Check for username/user_name/email fields
                const firstLogin = logins[0];
                const usernameFields = ['user_name', 'username', 'email', 'userName', 'user', 'login'];
                const foundUsernameFields = usernameFields.filter(field => firstLogin.hasOwnProperty(field));
                
                if (foundUsernameFields.length > 0) {
                    console.log('✅ Username field(s) found:', foundUsernameFields.join(', '));
                    console.log('   Example value:', firstLogin[foundUsernameFields[0]]);
                } else {
                    console.log('⚠️  Common username fields not found. Check the field names above.');
                }
            }
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        
        if (error.message.includes('authentication failed')) {
            console.log('\n💡 Authentication failed. Check your MongoDB credentials.');
        } else if (error.message.includes('ECONNREFUSED')) {
            console.log('\n💡 Connection refused. Make sure MongoDB is running and the connection string is correct.');
        } else if (error.message.includes('Cannot find module')) {
            console.log('\n💡 MongoDB driver not found. Install it with: npm install mongodb');
        }
    } finally {
        if (client) {
            await client.close();
            console.log('\n✅ MongoDB connection closed.');
        }
    }
}

// Run the check
checkMongoDBLogins().catch(console.error);

