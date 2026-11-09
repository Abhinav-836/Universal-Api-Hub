// backend/src/utils/billingContext.js
// Remembers, for the length of one API request, whose wallet pays for AI
// calls made while handling it. LlmService reads it after every successful
// OpenRouter call, so no function in between needs a userId parameter.
const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

/**
 * Run fn with a billing context { userId, endpoint }. The same object is
 * shared, so the caller can read ctx.chargedPaise (total paise charged) after.
 */
const runWithBilling = (ctx, fn) => {
  if (typeof ctx.chargedPaise !== 'number') ctx.chargedPaise = 0;
  return storage.run(ctx, fn);
};
const currentBilling = () => storage.getStore() || null;

module.exports = { runWithBilling, currentBilling };
