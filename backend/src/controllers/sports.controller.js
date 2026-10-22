// backend/src/controllers/sports.controller.js
const SportsService = require('../services/sports.service');
const { withUsageLog, markMock } = require('../utils/apiHandler');

const sportsHandler = withUsageLog(async (req, res) => {
  const { league = 'soccer', team, date } = req.query;
  const pageSize = parseInt(req.query.pageSize || '10', 10);

  const payload = await SportsService.fetchSchedule({
    userId: req.user.id,
    league,
    team,
    date,
    pageSize,
  });

  if (payload.source === 'mock') markMock(res);
  res.json({ success: true, sports: payload });
});

module.exports = { sportsHandler };