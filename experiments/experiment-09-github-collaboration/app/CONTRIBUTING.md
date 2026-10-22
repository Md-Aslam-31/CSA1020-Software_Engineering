# Contributing to LearnLoop

Start a focused feature branch, keep changes small, and include evidence that the behavior works.

1. Fork the repository and clone your fork.
2. Add the original repository as `upstream` and fetch its `main` branch.
3. Create a feature branch: `git switch -c feature/short-description`.
4. Implement the change and run `node --test`.
5. Review `git diff`, commit, and push the feature branch.
6. Open a pull request with a clear problem, resulting behavior, and validation evidence.
7. Discuss actionable review feedback and push additional commits to the same branch.
8. Merge only after review concerns are addressed and the checks pass.

In normal team work, ask a different GitHub user to review and approve the pull request. GitHub does not allow an author to approve their own pull request. A single-account exercise can record a **self-review**, but it must not present that as independent human approval.

Use precise feedback such as “Please cover fractional lecture durations so the estimate stays accurate,” then link the commit that responds to it. Avoid fabricated conversations or approvals.

This fork is a practice environment. The experiment's feature pull request targets this fork's `main`; it is not a request for the upstream `octocat` maintainers to merge the change.
