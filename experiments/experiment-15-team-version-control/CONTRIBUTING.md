# Working on KitCrew

Use Git and Node.js 22 or later. No package installation or external service is required.

1. Clone the private repository while signed in to an authorized GitHub account.
2. Open a module issue with acceptance criteria and a role label.
3. Create `feature/<module-name>` from updated `main`.
4. Keep commits small. Run `npm test --prefix app` before pushing.
5. Open a pull request with `Closes #issue-number`, describe behavior and review the actual diff.
6. Respond to review comments with commits. Never mark untested work complete.
7. Fetch current main and merge `origin/main` into the feature branch. If Git reports a conflict, inspect both versions, manually combine their requirements, run regression checks, stage resolved files and commit the merge.
8. Re-review the new head and wait for the Node module check to pass. Merge with a merge commit so module history remains visible.

In a real team, another maintainer should review the work. This educational demonstration uses only Emadfar007, with explicit self-review COMMENT submissions and automated checks. GitHub does not allow authors to approve their own pull requests. No independent approval or enforced branch-protection rule is claimed.

Keep credentials and personal information out of commits. Preserve module branches for assessment. Local sample checkout data stays in the browser and can be reset or exported.
