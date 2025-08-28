// Test the process route locally
const fetch = require('node-fetch');

async function testProcessRoute() {
  try {
    console.log('Testing process route...');
    
    const response = await fetch('http://localhost:3000/api/cron/process', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer fsc-reddit-bot-cron-secret-2025`,
        'Content-Type': 'application/json'
      }
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers));
    
    const text = await response.text();
    console.log('Response body:', text);
    
    if (!response.ok) {
      console.error('❌ Request failed');
    } else {
      console.log('✅ Request successful');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testProcessRoute();