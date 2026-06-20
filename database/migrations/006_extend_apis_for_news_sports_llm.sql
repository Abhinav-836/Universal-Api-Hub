-- Migration 006: Extend APIs table for categorized modules
ALTER TABLE apis
    ADD COLUMN IF NOT EXISTS category VARCHAR(50);

ALTER TABLE apis
    ADD COLUMN IF NOT EXISTS cost INT;

UPDATE apis
SET category = CASE slug
    WHEN 'chat' THEN 'llm'
    WHEN 'translate' THEN 'llm'
    WHEN 'sentiment' THEN 'llm'
    WHEN 'summarize' THEN 'llm'
    WHEN 'image-analyze' THEN 'vision'
    WHEN 'ocr' THEN 'vision'
    WHEN 'weather' THEN 'utility'
    WHEN 'geocode' THEN 'utility'
    ELSE COALESCE(category, 'utility')
END
WHERE category IS NULL;

UPDATE apis
SET cost = COALESCE(cost, cost_weight, 1)
WHERE cost IS NULL;

ALTER TABLE apis
    ALTER COLUMN category SET DEFAULT 'utility',
    ALTER COLUMN category SET NOT NULL,
    ALTER COLUMN cost SET DEFAULT 1,
    ALTER COLUMN cost SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_apis_category ON apis(category);

INSERT INTO apis (slug, name, description, endpoint, category, cost, cost_weight, min_plan)
VALUES
    ('news', 'News API', 'Search and retrieve current headlines and breaking stories.', '/api/v1/news', 'news', 2, 2, 'free'),
    ('sports', 'Sports API', 'Get live fixtures, scores, and schedule summaries.', '/api/v1/sports', 'sports', 2, 2, 'pro'),
    ('llm-chat', 'LLM Chat API', 'OpenAI-compatible chat completions for AI assistants and apps.', '/api/v1/llm/chat', 'llm', 5, 5, 'premium')
ON CONFLICT (slug) DO UPDATE
SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    endpoint = EXCLUDED.endpoint,
    category = EXCLUDED.category,
    cost = EXCLUDED.cost,
    cost_weight = EXCLUDED.cost_weight,
    min_plan = EXCLUDED.min_plan;
