require('dotenv').config();
console.log('OPENROUTER_API_KEY:', process.env.OPENROUTER_API_KEY ? '✅ Loaded' : '❌ Missing');
console.log('Key starts with:', process.env.OPENROUTER_API_KEY?.substring(0, 15));