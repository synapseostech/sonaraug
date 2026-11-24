import type { Plan } from "@kito/billing";

/**
 * DEVELOPMENT PLACEHOLDER PLANS. The prices are NOT approved and exist only so
 * checkout can be exercised locally. Every surface that shows them displays a
 * "development price" notice while `priceIsPlaceholder` is true. An administrator
 * sets real prices in /admin/subscriptions before launch.
 */
export const DEV_PLANS: Plan[] = [
  {
    id: "plan_listener_monthly_dev",
    audience: "listener",
    code: "listener-monthly",
    name: "Listener — monthly",
    description: "All premium Medical Chronicles episodes.",
    interval: "monthly",
    amount: 10000,
    currency: "UGX",
    active: true,
    trialDays: 0,
    features: ["Every premium Medical Chronicles episode", "Listening history across devices", "Cancel any time"],
    creatorLimits: null,
    providerPlanId: null,
    priceIsPlaceholder: true,
    sortOrder: 10,
  },
  {
    id: "plan_listener_annual_dev",
    audience: "listener",
    code: "listener-annual",
    name: "Listener — annual",
    description: "A year of premium listening.",
    interval: "annual",
    amount: 100000,
    currency: "UGX",
    active: true,
    trialDays: 0,
    features: ["Everything in monthly", "One payment a year"],
    creatorLimits: null,
    providerPlanId: null,
    priceIsPlaceholder: true,
    sortOrder: 20,
  },
  {
    id: "plan_creator_starter_dev",
    audience: "creator",
    code: "creator-starter",
    name: "Creator — starter",
    description: "Publish one show on Sonara after your application is approved.",
    interval: "monthly",
    amount: 30000,
    currency: "UGX",
    active: true,
    trialDays: 0,
    features: ["1 show", "Up to 50 episodes", "Basic analytics"],
    creatorLimits: { maxShows: 1, maxEpisodes: 50, uploadAllowanceMb: 2000, storageMb: 10000, canPublish: true, analytics: "basic", promotion: false, supportLevel: "standard" },
    providerPlanId: null,
    priceIsPlaceholder: true,
    sortOrder: 30,
  },
];
