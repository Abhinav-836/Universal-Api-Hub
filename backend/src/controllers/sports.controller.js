const { validationResult } = require('express-validator');
const SportsService = require('../services/sports.service');
const { withUsageLog } = require('../utils/apiHandler');

const sportsHandler = withUsageLog(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { league = 'soccer', team, date } = req.query;
  const pageSize = parseInt(req.query.pageSize || '10', 10);

  const payload = await SportsService.fetchSchedule({
    userId: req.user.id,
    league,
    team,
    date,
    pageSize,
  });
  res.json({ success: true, sports: payload });
});

module.exports = { sportsHandler };