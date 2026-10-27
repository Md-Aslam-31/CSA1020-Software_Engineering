# Experiment 13 — ReleaseHarbor: Jenkins CI/CD with Docker

## Aim

To set up a local Jenkins pipeline that automatically checks out application commits, builds Docker images, runs automated tests, publishes a tested image to Docker Hub, and deploys that exact image to a free Render web service.

The sample application, **ReleaseHarbor**, helps a team prepare a release through editable release details, twelve readiness checks, critical blockers, a timeline, saved browser drafts and JSON export. The checklist is a planning aid; Jenkins performs the actual CI/CD work.

## Tools Required

| Tool | Use in this experiment |
|---|---|
| Docker Desktop and Docker Compose | Run Jenkins and its separate Docker build daemon |
| Jenkins LTS 2.580.1 with Pipeline, Git, JUnit and credentials plugins | Orchestrate stages, detect commits, report tests and protect credentials |
| Node.js 24 and its built-in test runner | Run the dependency-free app and 21 domain/HTTP tests |
| Git and GitHub | Store source code, Dockerfile and Jenkinsfile |
| Docker Hub | Store build-specific images and digests |
| Render Free web service | Run the tested container in the cloud |
| PowerShell and Chrome | Start the local lab and verify the interface |

Application: [ReleaseHarbor](https://releaseharbor-exp13.onrender.com/). Local job: [ReleaseHarbor-CICD](http://127.0.0.1:8090/job/ReleaseHarbor-CICD/). Images: [Docker Hub](https://hub.docker.com/r/coastrider7/csa1020-exp13-releaseharbor/tags). Source: [CSA1020 Software Engineering](https://github.com/Emadfar007/CSA1020---Software-Engineering).

### Quick access links

| What to open | Link |
| --- | --- |
| Open the deployed application | [ReleaseHarbor - cloud app](https://releaseharbor-exp13.onrender.com/) |
| Use the application sections | [Release workspace](https://releaseharbor-exp13.onrender.com/#workspace) · [Release timeline](https://releaseharbor-exp13.onrender.com/#timeline) · [Build details](https://releaseharbor-exp13.onrender.com/#build) |
| Check the deployed build | [Version and source JSON](https://releaseharbor-exp13.onrender.com/api/version) · [Health check](https://releaseharbor-exp13.onrender.com/healthz) |
| Open local Jenkins | [Jenkins dashboard](http://127.0.0.1:8090/) · [ReleaseHarbor CI/CD job](http://127.0.0.1:8090/job/ReleaseHarbor-CICD/) |
| Follow the latest passing pipeline | [Latest successful build](http://127.0.0.1:8090/job/ReleaseHarbor-CICD/lastSuccessfulBuild/) · [Test results](http://127.0.0.1:8090/job/ReleaseHarbor-CICD/lastSuccessfulBuild/testReport/) · [Console log](http://127.0.0.1:8090/job/ReleaseHarbor-CICD/lastSuccessfulBuild/console) |
| Open the recorded experiment build | [Successful build #7](http://127.0.0.1:8090/job/ReleaseHarbor-CICD/7/) |
| Manage the deployed service | [Render dashboard - sign-in required](https://dashboard.render.com/web/srv-dbflq8vb9u1s73de444g) |
| Find the published images | [Docker Hub image and tags](https://hub.docker.com/r/coastrider7/csa1020-exp13-releaseharbor/tags) |
| Source and pipeline configuration | [Experiment folder](https://github.com/Emadfar007/CSA1020---Software-Engineering/tree/main/experiments/experiment-13-jenkins-cicd) · [Jenkinsfile](https://github.com/Emadfar007/CSA1020---Software-Engineering/blob/main/experiments/experiment-13-jenkins-cicd/Jenkinsfile) · [Local Jenkins Compose setup](https://github.com/Emadfar007/CSA1020---Software-Engineering/blob/main/experiments/experiment-13-jenkins-cicd/compose.yaml) |
| View the output | [All nine screenshots](https://github.com/Emadfar007/CSA1020---Software-Engineering/tree/main/experiments/experiment-13-jenkins-cicd/screenshots) · [Build and deployment evidence](https://github.com/Emadfar007/CSA1020---Software-Engineering/tree/main/experiments/experiment-13-jenkins-cicd/evidence) |
| Open the experiment collection | [All experiments](https://github.com/Emadfar007/CSA1020---Software-Engineering) |

The cloud app opens from any device. The Jenkins links require this laptop, Docker Desktop and both Jenkins lab containers. Viewing the recorded results is available without login; managing Jenkins or triggering builds uses the existing Jenkins login. If stopped, run `docker start releaseharbor-exp13-docker-1 releaseharbor-exp13-jenkins-1`. Render management requires sign-in. A sleeping Render Free app can take time to wake.

## Algorithm

1. **Create the sample application.** Implement `GET /healthz`, `GET /api/version` and `POST /api/assess`. Validate release fields, semantic versions, dates and checkbox values. Calculate completion and missing critical checks. Serve the interface with bounded JSON requests and browser protection headers. Save drafts in the browser, without a database.

2. **Containerize it.** Use the multi-stage [Dockerfile](Dockerfile): `test` includes tests, while `runtime` contains only the application. Run as the non-root `node` user. Bake the source SHA and Jenkins build number into the runtime image; expose them through `/api/version` and Build details.

   For independent local testing, run from this experiment directory:

   ```powershell
   docker build --target test -t releaseharbor-tests:local .
   docker run --rm --network none releaseharbor-tests:local node --test
   docker build --target runtime -t releaseharbor:local .
   docker run -d --name releaseharbor-local -p 127.0.0.1:8091:8000 releaseharbor:local
   ```

3. **Start Jenkins locally.** With Docker running, execute:

   ```powershell
   ./scripts/start-lab.ps1
   ```

   The script creates an administrator password in a restricted directory outside the repository, builds Jenkins and starts the [Compose stack](compose.yaml). Open `http://127.0.0.1:8090/`. Administrator username: `emad`. The script prints the private password-file location, never its value. Jenkins binds only to loopback, retains CSRF protection, and permits anonymous access only for reading the demonstration job.

   When restarting an existing lab, reuse its original private directory with `./scripts/start-lab.ps1 -SecretsDirectory <original-private-directory>`. The script refuses to create a replacement password file for existing Jenkins data.

4. **Connect the build environment.** Jenkins communicates over TLS with a dedicated Docker-in-Docker daemon and persistent image/cache volume. The host Docker socket is not mounted. This teaching setup uses a privileged DinD container and should run only trusted pipeline code. Existing experiment containers are outside this build daemon.

5. **Configure credentials and source control.** In Jenkins' global credentials store, add username/password ID `dockerhub` and secret-text ID `render-deploy-hook`. Use the Docker Hub account owning the configured repository and the deploy hook for this demo service. Jenkins encrypts credentials and masks their values during use. Keep passwords, tokens, hook URLs and seed files out of Git and archived artifacts.

   The bootstrap creates `ReleaseHarbor-CICD` using **Pipeline script from SCM**, the Software Engineering repository, branch `main`, and script path `experiments/experiment-13-jenkins-cicd/Jenkinsfile`.

6. **Bootstrap the cloud target once.** Run **Build with Parameters** with `PUBLISH_IMAGE=true`, `DEPLOY_CLOUD=false`, and `DEMONSTRATE_TEST_GATE=false`. After checks pass, create an **Existing Image** web service in Render using the published image. Select **Free — $0/month**, set `APP_MODE=cloud`, `PORT=10000`, and health-check path `/healthz`. Add no database, disk or paid resource. Store its deploy hook in Jenkins, then enable `DEPLOY_CLOUD` for normal builds. The supplied Jenkinsfile targets the verified service URL.

7. **Run the pipeline.** The [Jenkinsfile](Jenkinsfile) executes these stages:

   | Stage | Verification performed |
   |---|---|
   | Checkout | Read source SHA and branch; clear previous generated reports |
   | Build test image | Build the Docker `test` target |
   | Automated tests | Produce JUnit XML; reject empty, skipped-only or failing test runs |
   | Build release image | Build the runtime target with expected SHA/build identity |
   | Container smoke test | Check HTTP health, expected Jenkins identity, calculation, blockers and invalid input |
   | Publish image | On `main`, authenticate temporarily, push a build-specific tag and record its digest |
   | Deploy to Render | On `main`, deploy the exact digest and verify cloud health plus expected SHA/build number |

   Concurrent builds are disabled, builds have a timeout, and JUnit results and fingerprinted verification artifacts are retained. Temporary registry configuration is removed after publishing. A failed stage prevents subsequent publication or deployment.

8. **Trigger builds through commits.** `pollSCM('* * * * *')` checks Git once per minute. Application, CI, Dockerfile, Jenkinsfile and Compose changes are included; report-only updates, screenshots and other experiments are excluded. Commit and push a source change:

   ```powershell
   git add experiments/experiment-13-jenkins-cicd/app/
   git commit -m "Update ReleaseHarbor application"
   git push origin main
   ```

   The verified trigger is SCM polling. The computer, Docker and Jenkins must be running for detection and execution. The cloud application can remain hosted while the local controller is stopped.

9. **Demonstrate failure prevention and delivery.** Build **#5** used `DEMONSTRATE_TEST_GATE=true`. Its deliberate gate failure stopped publishing and deployment. Build **#7** later started with **“Started by an SCM change”**, passed all stages and deployed the new image. Earlier setup runs remain in Jenkins history; not every historical run succeeded.

10. **Verify and preserve evidence.** Build #7 executed **21 tests, zero failures and zero skipped tests**. Source SHA: `0772e7b013680b7ec975f5a6fb155a36eaae49d5`. Image: `coastrider7/csa1020-exp13-releaseharbor:build-7-0772e7b01368`. Digest: `sha256:e8d0ca8279fcc546c168ea414d93a6278777c8ce980f8bbd289001ef840c1766`. Render deploy `dep-dbflt8qjnfac73cs2evg` served the matching SHA/build with HTTP 200 health.

    Evidence: [pipeline console](evidence/build-07-console.txt), [SCM trigger](evidence/build-07-trigger.json), [test summary](evidence/build-07-test-summary.json), [container checks](evidence/build-07-container-smoke.json), [cloud verification](evidence/build-07-cloud-deployment.json), and [gate failure](evidence/test-gate-console.txt).

**Free hosting and duration:** the service uses Free compute with no database, disk, paid add-on or scheduled keep-alive. Render's current free web-service offering has no fixed trial-expiry date. It sleeps after 15 idle minutes and shares 750 free instance-hours per calendar month with the workspace. Bandwidth and other limits apply. This does not guarantee unlimited always-on availability or unchanged lifetime platform terms. See [Render's free-service documentation](https://render.com/docs/free).

References: [Jenkins with Docker](https://www.jenkins.io/doc/book/installing/docker/), [Pipeline syntax](https://www.jenkins.io/doc/book/pipeline/syntax/), [Render image deployment](https://render.com/docs/deploying-an-image), and [deploy hooks](https://render.com/docs/deploy-hooks).

## Output Screenshots

**1. Cloud application workspace.** ReleaseHarbor running from the deployed container.

![ReleaseHarbor cloud workspace](screenshots/01-cloud-workspace.jpg)

**2. Readiness and blockers.** An editable plan assessed by the API, including a missing critical check.

![Release assessment and critical blockers](screenshots/02-readiness-and-blockers.jpg)

**3. Cloud build identity.** Source SHA and Jenkins build number reported by the running image.

![Cloud build identity](screenshots/03-cloud-build-identity.jpg)

**4. Successful Jenkins pipeline.** Build #7 completes build, test, publish and deployment stages.

![Successful Jenkins pipeline](screenshots/04-jenkins-success.jpg)

**5. Automated test results.** Jenkins records 21 passing application tests.

![Jenkins test results](screenshots/05-test-results.jpg)

**6. Commit-triggered build.** Jenkins identifies the SCM change that started the run.

![SCM-triggered Jenkins build](screenshots/06-commit-trigger.jpg)

**7. Failure gate.** The intentional test-gate demonstration prevents publication and deployment.

![Intentional deployment gate failure](screenshots/07-test-gate.jpg)

**8. Render deployment.** The separate Free image-backed service is live.

![Live Render container deployment](screenshots/08-render-live.jpg)

**9. Published image.** Docker Hub contains the build-specific ReleaseHarbor image.

![Docker Hub release image](screenshots/09-dockerhub-image.jpg)

## Result

A working Docker-based CI/CD pipeline was implemented with local Jenkins and a separate Free Render service. A Git commit automatically triggered build **#7**, which passed **21 tests** and HTTP checks, published a versioned image, and deployed its exact digest. The cloud application's source SHA, build number and health matched the Jenkins release. An intentional failure also demonstrated that later publishing and deployment stages are blocked.

The submission includes the application, Dockerfile, Jenkinsfile, local setup, deployment helpers, screenshots and actual verification records. Jenkins remains local; Render hosts the app under its free-service limits. ReleaseHarbor's checklist is an educational planning tool and does not itself approve or deploy software.
