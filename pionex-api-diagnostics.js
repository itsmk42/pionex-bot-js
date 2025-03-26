const axios = require('axios');
require('dotenv').config();

// Load API keys from environment variables
const apiKey = process.env.PIONEX_API_KEY;
const secretKey = process.env.PIONEX_SECRET_KEY;

console.log('Starting Pionex API diagnostics...');
console.log(`API Key present: ${apiKey ? 'Yes' : 'No'}`);
console.log(`Secret Key present: ${secretKey ? 'Yes' : 'No'}`);

// Try multiple potential Pionex API URLs
const possibleUrls = [
  'https://api.pionex.com',
  'https://api.pionex.com/api/v1',
  'https://api.pionex.us',  // US version
  'https://api.pionex.co',  // Another possible domain
  'https://api-sg.pionex.com',  // Singapore
  'https://api-eu.pionex.com',  // Europe
];

// Check Pionex website to get the real API URL
(async () => {
  console.log('\nAttempting to fetch the correct API URL from Pionex website...');
  try {
    const response = await axios.get('https://www.pionex.com');
    console.log('Status:', response.status);
    
    // Extract scripts to look for API URLs
    const html = response.data;
    const apiUrlMatches = html.match(/https:\/\/api[^"'\s]+pionex[^"'\s]+/g);
    
    if (apiUrlMatches && apiUrlMatches.length > 0) {
      console.log('Potential API URLs found in website:');
      apiUrlMatches.forEach(url => console.log(`- ${url}`));
      
      // Add these to our test list
      possibleUrls.push(...apiUrlMatches);
    } else {
      console.log('No API URLs found in website source');
    }
  } catch (error) {
    console.log('Error fetching Pionex website:', error.message);
  }
  
  // Try each potential URL
  console.log('\nTesting potential API endpoints...');
  
  for (const baseUrl of possibleUrls) {
    try {
      console.log(`\nTrying ${baseUrl}...`);
      
      // Try a simple request that might not require auth
      const publicResponse = await axios.get(`${baseUrl}/market/tickers`);
      console.log(`SUCCESS! ${baseUrl}/market/tickers responded with status ${publicResponse.status}`);
      console.log(`First few bytes of response: ${JSON.stringify(publicResponse.data).substring(0, 150)}...`);
      
      // Test an authenticated endpoint
      if (apiKey && secretKey) {
        // This is just a template - will need to be adjusted based on actual Pionex auth mechanism
        try {
          const timestamp = Date.now().toString();
          const authResponse = await axios.get(`${baseUrl}/account/assets`, {
            headers: {
              'API-KEY': apiKey,
              'API-TIMESTAMP': timestamp,
              // Include other required auth headers
            }
          });
          console.log(`Authenticated endpoint test: SUCCESS! Status ${authResponse.status}`);
        } catch (authError) {
          console.log(`Authenticated endpoint test failed: ${authError.message}`);
          if (authError.response) {
            console.log(`Status: ${authError.response.status}, Data: ${JSON.stringify(authError.response.data)}`);
          }
        }
      }
      
    } catch (error) {
      console.log(`Failed: ${error.message}`);
      if (error.response) {
        console.log(`Status: ${error.response.status}, Data: ${JSON.stringify(error.response.data)}`);
      }
    }
  }
  
  console.log('\nDiagnostic complete. Check the results above to identify working endpoints.');
})();