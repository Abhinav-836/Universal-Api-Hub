// backend/src/controllers/news.controller.js
const NewsService = require('../services/news.service');
const { withUsageLog, markMock } = require('../utils/apiHandler');

const newsHandler = withUsageLog(async (req, res) => {
  const { q, category, country = 'us' } = req.query;
  const pageSize = parseInt(req.query.pageSize || '10', 10);
  const page = parseInt(req.query.page || '1', 10);

  const payload = await NewsService.fetchHeadlines({
    userId: req.user.id,
    q,
    category,
    country: String(country).toLowerCase(),
    pageSize,
    page,
  });

  if (payload.source === 'mock') markMock(res);
  res.json({ success: true, news: payload });
});

module.exports = { newsHandler };