# Experiment 9: Git and GitHub Collaboration with LearnLoop

## Aim

Demonstrate a complete fork, branch, feature, pull request, feedback, follow-up, and merge workflow through a working LearnLoop course-progress dashboard.

**Account and approval scope:** all GitHub actions use **Emadfar007**. Review comments are disclosed **author self-review informed by independent assistant code inspection**. GitHub prevents authors from approving their own pull requests, so this exercise does not claim a second collaborator or independent human approval. An owner merge targets the user's fork, not octocat's upstream repository. [GitHub review documentation](https://docs.github.com/en/pull-requests/how-tos/review-pull-requests/approving-a-pull-request-with-required-reviews).

## Tools Required

- Git and GitHub using the **Emadfar007** account.
- Node.js 24, npm scripts, and the built-in Node test runner.
- JavaScript, HTML, and CSS for the local dashboard.
- GitHub Actions for automated checks; browser for local testing and screenshots.
- Independent assistant code inspection supporting transparent author self-review.

## Algorithm

1. Fork the public [octocat/Spoon-Knife](https://github.com/octocat/Spoon-Knife) demonstration repository into [Emadfar007/learnloop-collaboration-demo](https://github.com/Emadfar007/learnloop-collaboration-demo). The starting source revision is `d0dd1f61b33d64e29d8bc1372a94ef6a2fee76a9`. A fork is a separate repository connected to its upstream source. [GitHub fork documentation](https://docs.github.com/en/pull-requests/reference/forks).
2. Clone the fork and create `feature/course-progress-dashboard`. Use the fork as the push destination and the fork's own `main` as the pull-request base.
3. Build the LearnLoop dashboard for **six lessons totaling 90 minutes**. Provide completion checkboxes, lesson-based percentage, completed/total counts, remaining minutes, Complete All, Reset, and browser-local saved progress. Keep website testing on localhost.
4. Add a pure JavaScript progress calculator, input validation, automated tests, API documentation, and GitHub Actions checks. Create and push the initial feature commit [d23b135](https://github.com/Emadfar007/learnloop-collaboration-demo/commit/d23b1354f48953248f13df546f3262eac4bd8bfd).
5. Open [pull request #1](https://github.com/Emadfar007/learnloop-collaboration-demo/pull/1) from `feature/course-progress-dashboard` into the fork's `main`, with the feature summary and validation evidence.
6. Inspect the actual diff independently and post **two real inline author self-review comments**, explicitly identifying the supporting assistant inspection. Review feedback addresses readable text contrast and progress-calculator boundary coverage/API clarity.
7. Implement the feedback in follow-up commit [15c6058](https://github.com/Emadfar007/learnloop-collaboration-demo/commit/15c6058d21aebe458259cb55ea0c7bfc84ad45df): improve contrast, add edge-case tests, and clarify the documented API. Reply to both review comments with the fixes and resolve both threads after checking the revision.
8. Run the tests at the PR #1 final-head checkpoint: **13 pass**. Confirm [GitHub Actions run 38582664261](https://github.com/Emadfar007/learnloop-collaboration-demo/actions/runs/38582664261) succeeds.
9. Verify the actual dashboard workflow:

| Browser action | Completed lessons | Progress | Remaining time |
|---|---:|---:|---:|
| Initial or Reset | 0/6 | 0% | 90 minutes |
| Complete three lessons | 3/6 | 50% | 45 minutes |
| Reload saved progress | 3/6 | 50% | 45 minutes |
| Uncheck the branch lesson | 2/6 | 33% | 63 minutes |
| Complete All | 6/6 | 100% | 0 minutes |

The percentage is based on completed lesson count, not duration; remaining time is calculated from unfinished lessons. Progress survives reload in the same browser.

10. Merge the reviewed pull request into the fork's `main` on **14 October 2026** through a disclosed owner merge. The verified merge commit is [1ab5010](https://github.com/Emadfar007/learnloop-collaboration-demo/commit/1ab501074eff730819c2fdf29a247707d1a8f64e). PR #1 is closed and marked merged. **At the merge checkpoint**, fetching `origin/main` confirmed both feature commits were retained and its tree matched the feature branch exactly; the original root `index.html` and `styles.css` were unchanged from the upstream source.

**Verified PR #1 workflow:** at the merge checkpoint, the fork, feature, pull request, two review threads, follow-up changes, 13 passing tests, successful final-head CI, browser workflow, and merge into the user's fork were confirmed.

11. Replace the three menu links with distinct **Learning path**, **My progress**, and **Workflow guide** views in follow-up commit [0677064](https://github.com/Emadfar007/learnloop-collaboration-demo/commit/06770640fd383f80c77d4012450ccbd030b88357), proposed through [pull request #2](https://github.com/Emadfar007/learnloop-collaboration-demo/pull/2). Learning path shows the lesson checklist; My progress calculates the six-lesson summary and next lesson; Workflow guide explains six Git steps with links to practice each lesson.
12. Verify **16 browser checkpoints** covering selected menu, page title, URL hash, focus, Back/Forward, view refresh, keyboard Enter, and the legacy `#progress` link redirecting to `#my-progress`. The guide's lesson-4 practice link focuses its checkbox, and Continue learning focuses the first unfinished lesson. Checking a fourth lesson gives **67%, 4/6 complete, and 25 minutes remaining**; Complete All gives **100%, 6/6, and 0 minutes**; Reset gives **0%, 0/6, and 90 minutes**. Restoring the first three completed lessons survives reload at **50%, 3/6, and 45 minutes**. The follow-up passes **13 Node tests**, syntax checks, and diff checks; independent source inspection found no issues. Confirm the successful final-head [GitHub Actions run 38585883515](https://github.com/Emadfar007/learnloop-collaboration-demo/actions/runs/38585883515), then merge PR #2 into the fork's `main` on **14 October 2026** as [676e3d8](https://github.com/Emadfar007/learnloop-collaboration-demo/commit/676e3d888b73d529d49d6ee7ffa3b21952e8c0dc). At this follow-up merge checkpoint, the updated local main matched the remote main.

## Output Screenshots

1. **Public fork:** the repository's relationship to octocat/Spoon-Knife.

![Public GitHub fork](screenshots/01-public-fork.jpg)

2. **Feature branch:** the course-progress feature branch with its initial implementation and follow-up changes.

![Feature branch in the fork](screenshots/02-feature-branch.jpg)

3. **Working dashboard:** the local LearnLoop course-progress interface.

![LearnLoop course-progress dashboard](screenshots/03-course-dashboard.jpg)

4. **Open pull request:** the feature proposes changes into the fork's own main branch.

![Open pull request](screenshots/04-open-pull-request.jpg)

5. **Review feedback:** genuine inline author self-review comments disclose the independent assistant inspection.

![Disclosed author self-review feedback](screenshots/05-self-review-feedback.jpg)

6. **Follow-up commits:** the pull-request history contains the initial implementation and the review-response commit.

![Initial and follow-up feature commits](screenshots/06-follow-up-commits.jpg)

7. **Passing checks:** the final-head GitHub Actions run succeeds after the follow-up changes.

![Successful final-head automated checks](screenshots/07-passing-checks.jpg)

8. **Merged pull request:** GitHub confirms PR #1 was merged into the user's fork main branch.

![Pull request merged into the fork](screenshots/08-merged-pull-request.jpg)

9. **My progress:** a dedicated progress summary and next-lesson view, separate from the learning checklist.

![Dedicated My progress view](screenshots/09-progress-view.jpg)

10. **Workflow guide excerpt:** the guide introduces six detailed Git workflow steps with lesson-practice links; later steps continue below the visible area.

![Dedicated Workflow guide view](screenshots/10-workflow-guide.jpg)

## Result

Implemented a working local LearnLoop dashboard and demonstrated a genuine GitHub feature-review workflow in [pull request #1](https://github.com/Emadfar007/learnloop-collaboration-demo/pull/1). Two inline self-review comments were addressed in a follow-up commit and both threads resolved. **At the PR #1 merge checkpoint, all 13 tests passed**, final-head GitHub Actions checks succeeded, and the dashboard's completion, reset, and reload-persistence flows were verified.

PR #1 was merged into **Emadfar007/learnloop-collaboration-demo's main** as commit [1ab5010](https://github.com/Emadfar007/learnloop-collaboration-demo/commit/1ab501074eff730819c2fdf29a247707d1a8f64e). **At the merge checkpoint**, the remote main branch contained both feature commits and the verified feature tree. The dashboard remains available for local testing. This single-account exercise demonstrates transparent author self-review and a completed owner merge; it does not constitute independent human approval.

The navigation follow-up provides three distinct working views with correct history, refresh, keyboard, and focus behavior. All **16 browser checkpoints** and **13 Node tests** passed, including next-lesson guidance and saved progress. Its final-head [GitHub Actions run](https://github.com/Emadfar007/learnloop-collaboration-demo/actions/runs/38585883515) succeeded, and [PR #2](https://github.com/Emadfar007/learnloop-collaboration-demo/pull/2) was merged into the fork's main as [676e3d8](https://github.com/Emadfar007/learnloop-collaboration-demo/commit/676e3d888b73d529d49d6ee7ffa3b21952e8c0dc). Local main matched remote main at that checkpoint.

The runnable application source is included in [app/](app/), matching LearnLoop revision `676e3d888b73d529d49d6ee7ffa3b21952e8c0dc`. From this experiment directory, run `node app/scripts/serve.js`, then open [LearnLoop locally](http://127.0.0.1:4829/learning-progress/). Run `node --test app/test/progress.test.js` to check the bundled calculator tests.
