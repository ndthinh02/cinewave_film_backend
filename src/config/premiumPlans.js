export const premiumPlans = Object.freeze([
  {
    planCode: 'MONTHLY',
    name: 'Premium 1 tháng',
    price: 2000,
    durationDays: 30,
    badge: null,
  },
  {
    planCode: 'QUARTERLY',
    name: 'Premium 3 tháng',
    price: 5000,
    durationDays: 90,
    badge: 'PHỔ BIẾN NHẤT',
  },
  {
    planCode: 'YEARLY',
    name: 'Premium 1 năm',
    price: 8000,
    durationDays: 365,
    badge: 'TIẾT KIỆM NHẤT',
  },
]);

export const findPlan = code =>
  premiumPlans.find(plan => plan.planCode === code);