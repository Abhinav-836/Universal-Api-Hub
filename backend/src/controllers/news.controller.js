const { validationResult } = require('express-validator');
const NewsService = require('../services/news.service');
const { withUsageLog } = require('../utils/apiHandler');

const newsHandler = withUsageLog(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { q, category, country = 'us' } = req.query;
  const pageSize = parseInt(req.query.pageSize || '10', 10);
  const page = parseInt(req.query.page || '1', 10);

  const payload = await NewsService.fetchHeadlines({
    userId: req.user.id,
    q,
    category,
    country,
    pageSize,
    page,
  });
  res.json({ success: true, news: payload });
});

module.exports = { newsHandler };