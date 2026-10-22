# LearnLoop · Course Progress Lab

A small JavaScript project for practicing the complete Git/GitHub contribution workflow. Track six sample lessons, see completion and remaining study time, and retain your progress in the current browser.

![LearnLoop checks](https://github.com/Emadfar007/learnloop-collaboration-demo/actions/workflows/tests.yml/badge.svg)

## Try the local demo

Requires Node.js 22 or newer. There are no npm dependencies or installation steps.

```sh
node scripts/serve.js
```

Open **http://127.0.0.1:4829/learning-progress/**. Check individual lessons, finish all lessons, or reset the sample course. Progress is local browser data; this demo has no account, server database, real course enrollment, or deployment.

## Workspace views

| Menu | What it opens |
| --- | --- |
| Learning path | The six-lesson checklist and course overview |
| My progress | Live completion totals, lesson status, and the next lesson to practice |
| Workflow guide | Six practical steps for the fork, branch, pull request, feedback, and merge workflow |

The selected menu item follows the current view. Each view has a shareable local URL using `#learning-path`, `#my-progress`, or `#workflow-guide`; browser Back, Forward, and refresh retain the selected view. Lesson completion is shared across views and saved in the same browser. Use the guide's practice and progress links to continue the course.

## Test the feature

```sh
node --test
```

The built-in Node.js tests cover empty, new, partially completed, and finished courses, immutable input, invalid records, fractional and zero durations, non-finite values, and duration overflow. The GitHub Actions workflow also checks JavaScript syntax on feature pushes and pull requests targeting `main`.

## Feature scope

| Component | Responsibility |
| --- | --- |
| `src/progress.js` | Pure calculation of completion percentage, lesson counts, and remaining minutes |
| `learning-progress/` | Accessible dashboard with lesson controls and browser-local progress |
| `test/progress.test.js` | Automated checks for behavior and invalid inputs |
| `scripts/serve.js` | Loopback-only static preview server |
| `.github/workflows/tests.yml` | Tests and syntax checks in GitHub Actions |

## Progress API

```js
import { calculateCourseProgress } from './src/progress.js';

calculateCourseProgress([
  { id: 'intro', durationMinutes: 0.25, completed: true },
  { id: 'practice', durationMinutes: 1.5, completed: false }
]);
// { totalLessons: 2, completedLessons: 1, percentComplete: 50,
//   remainingMinutes: 1.5, totalMinutes: 1.75, status: 'in-progress' }
```

Completion is **lesson-count based**, rounded to the nearest whole percentage. Durations do not weight the percentage. Remaining minutes sum unfinished lesson durations without rounding. Each lesson needs a unique non-empty string ID, a finite non-negative numeric duration, and a boolean completion value. Zero and fractional durations are valid; non-finite values, sparse arrays, duplicate IDs, and combined-duration overflow are rejected. Empty courses return zero progress with `not-started` status, and the calculation never modifies its inputs.

## Collaboration

The exercise uses `feature/course-progress-dashboard` in this public fork and a pull request into **this fork's `main` branch**. Review comments, follow-up commits, and the merge provide a visible contribution history. See [CONTRIBUTING.md](CONTRIBUTING.md) for the repeatable workflow.

Only **Emadfar007** is used for this exercise. Review feedback is explicitly a self-review informed by independent assistant code inspection. GitHub does not permit authors to approve their own pull request, so this exercise does not claim an independent human approval.

## Upstream sample

This is a fork of [octocat/Spoon-Knife](https://github.com/octocat/Spoon-Knife), GitHub's public fork demonstration repository. Its original `index.html` and `styles.css` remain available in the repository. The text below is the original sample README.

### Well hello there!

This repository is meant to provide an example for *forking* a repository on GitHub.

Creating a *fork* is producing a personal copy of someone else's project. Forks act as a sort of bridge between the original repository and your personal copy. You can submit *Pull Requests* to help make other people's projects better by offering your changes up to the original project. Forking is at the core of social coding at GitHub.

After forking this repository, you can make some changes to the project, and submit [a Pull Request](https://github.com/octocat/Spoon-Knife/pulls) as practice.

For some more information on how to fork a repository, [check out our guide, "Forking Projects""](http://guides.github.com/overviews/forking/). Thanks! :sparkling_heart:
