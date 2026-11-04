// Fixed so they never clash with dev (3001/4001) or live (3000/4000). Override both through
// the environment to run two E2E suites at once, e.g. from two worktrees.
export const E2E_WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3101);
export const E2E_API_PORT = Number(process.env.E2E_API_PORT ?? 4101);
