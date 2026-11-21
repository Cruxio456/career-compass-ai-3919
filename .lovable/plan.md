# Polar Jobs account, usage, and subscription

## What to build
- Add a clearly confirmed account-deletion action in the account menu. Delete the signed-in user’s career profile, roadmap, interview records, usage records, and account, then sign them out.
- Track actual AI input/output token counts per feature without storing prompts or resume/job-posting text. Show this month’s usage and the plan allowance in the account menu.
- Offer one subscription only: ₹100 per month. Set its allowance from the user’s answer; do not create extra tiers.
- Enable Paddle’s test environment with the user’s confirmation. Live payments remain unavailable until Paddle verification.

## Technical details
- Use authenticated TanStack server functions. Load privileged account deletion and usage writes only inside verified handlers.
- Add an owner-readable usage table with explicit grants and row-level security; keep resume and job-posting content transient.
- Keep product setup and checkout behind the monthly-allowance answer; Paddle’s test environment can be enabled now.
- Verify token reporting, account deletion safeguards, app rendering, tests, and the latest preview build result.