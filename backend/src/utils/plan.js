// backend/src/utils/plan.js
//
// "Paid" means the user bought time on a plan through Razorpay and that time
// hasn't run out. Plans given for free (the beta, or set by hand) have no
// expiry date and don't count as paid.

const hasActivePaidPlan = (user) => {
  if (!user || !user.plan || user.plan === 'free') return false;
  const expires = user.plan_expires_at || user.planExpiresAt;
  if (!expires) return false;
  const t = new Date(expires).getTime();
  return Number.isFinite(t) && t > Date.now();
};

module.exports = { hasActivePaidPlan };
