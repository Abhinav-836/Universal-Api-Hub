const { API_COST_WEIGHTS } = require('../utils/constants');

const attachApiContext = (slug) => (req, _res, next) => {
  req.apiSlug = slug;
  req.apiCost = API_COST_WEIGHTS[slug] ?? 1;
  next();
};

module.exports = { attachApiContext };