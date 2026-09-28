-- Universal API Hub - Seed Data
-- Run AFTER all migrations. Never run standalone.

INSERT INTO apis (slug, name, description, endpoint, category, cost, cost_weight, min_plan) VALUES
    ('chat',           'AI Chat',            'AI-powered text responses using language models',               '/api/v1/chat',          'llm',     3, 3, 'free'),
    ('weather',        'Weather Data',       'Real-time weather data for any city worldwide',                 '/api/v1/weather',       'utility', 1, 1, 'free'),
    ('image-analyze',  'Image Analysis',     'Analyze and describe image content using AI vision',            '/api/v1/image/analyze', 'vision',  5, 5, 'pro'),
    ('translate',      'Text Translation',   'Translate text between 50+ languages instantly',                '/api/v1/translate',     'llm',     2, 2, 'pro'),
    ('sentiment',      'Sentiment Analysis', 'Detect sentiment and emotion from text',                        '/api/v1/sentiment',     'llm',     2, 2, 'premium'),
    ('summarize',      'Text Summarizer',    'Summarize long documents and articles',                         '/api/v1/summarize',     'llm',     3, 3, 'premium'),
    ('geocode',        'Geocoding',          'Convert addresses to coordinates and vice versa',               '/api/v1/geocode',       'utility', 1, 1, 'premium'),
    ('news',           'News API',           'Search headlines, publishers, and breaking stories by topic.', '/api/v1/news',          'news',    2, 2, 'free'),
    ('sports',         'Sports API',         'Fetch fixtures, scores, teams, and schedule summaries.',        '/api/v1/sports',        'sports',  2, 2, 'pro'),
    ('llm-chat',       'LLM Chat API',       'OpenAI-compatible chat completions for advanced assistants.',   '/api/v1/llm/chat',      'llm',     5, 5, 'premium'),
    ('stock-quote',    'Stock Quote',        'Real-time stock price, change, volume, and daily range',       '/api/v1/stocks/quote',  'market',  2, 2, 'free'),
    ('stock-search',   'Stock Search',       'Find stocks by company name or symbol keywords',                '/api/v1/stocks/search', 'market',  1, 1, 'free'),
    ('forex',          'Forex Rates',        'Live foreign exchange rates (e.g., USD/EUR, GBP/JPY)',          '/api/v1/forex',         'market',  2, 2, 'free'),
    ('crypto',         'Crypto Rates',       'Cryptocurrency prices in fiat (BTC/USD, ETH/EUR, etc.)',        '/api/v1/crypto',        'market',  2, 2, 'free')
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- NOTES: Plan Limits Reference (must match src/utils/constants.js)
-- ============================================================
-- Free:    10 cost units/day,  2 APIs,    2 switches/day
-- Pro:     50 cost units/day,  8 APIs,    5 switches/day
-- Premium: 200 cost units/day, unlimited, unlimited
-- ============================================================