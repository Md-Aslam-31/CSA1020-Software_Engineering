import com.cloudbees.plugins.credentials.CredentialsScope
import com.cloudbees.plugins.credentials.SystemCredentialsProvider
import com.cloudbees.plugins.credentials.domains.Domain
import com.cloudbees.plugins.credentials.impl.UsernamePasswordCredentialsImpl
import groovy.json.JsonSlurper
import hudson.model.Item
import hudson.model.Node
import hudson.model.BooleanParameterDefinition
import hudson.model.ParametersDefinitionProperty
import hudson.plugins.git.BranchSpec
import hudson.plugins.git.GitSCM
import hudson.plugins.git.UserRemoteConfig
import hudson.plugins.git.extensions.impl.PathRestriction
import hudson.security.GlobalMatrixAuthorizationStrategy
import hudson.security.HudsonPrivateSecurityRealm
import hudson.security.csrf.DefaultCrumbIssuer
import hudson.util.Secret
import jenkins.install.InstallState
import jenkins.model.Jenkins
import jenkins.model.JenkinsLocationConfiguration
import jenkins.plugins.git.GitHooksConfiguration
import org.jenkinsci.plugins.plaincredentials.impl.StringCredentialsImpl
import org.jenkinsci.plugins.matrixauth.AuthorizationType
import org.jenkinsci.plugins.matrixauth.PermissionEntry
import org.jenkinsci.plugins.workflow.cps.CpsScmFlowDefinition
import org.jenkinsci.plugins.workflow.job.WorkflowJob

// Seed a new local lab without storing credentials in this image or repository.
// The marker prevents a subsequent container start from replacing administrator
// accounts or an authorization policy that the user has since customized.
def controller = Jenkins.get()
def bootstrapMarker = new File(controller.rootDir, '.releaseharbor-bootstrap-v1')
if (!bootstrapMarker.exists()) {
    def passwordFile = new File('/run/secrets/jenkins_admin_password')
    if (!passwordFile.isFile()) {
        throw new IllegalStateException('Mount the Jenkins administrator password secret before first startup.')
    }
    def adminName = System.getenv('ADMIN_USER') ?: 'emad'
    def adminPassword = passwordFile.getText('UTF-8').trim()
    if (!(adminName ==~ /[a-zA-Z][a-zA-Z0-9_.-]{0,63}/) || adminPassword.length() < 20) {
        throw new IllegalStateException('Administrator name is invalid or the password secret is too short.')
    }

    def realm = new HudsonPrivateSecurityRealm(false)
    realm.createAccount(adminName, adminPassword)
    controller.setSecurityRealm(realm)

    def authorization = new GlobalMatrixAuthorizationStrategy()
    authorization.add(Jenkins.ADMINISTER, new PermissionEntry(AuthorizationType.USER, adminName))
    // Read-only local demonstration access, as selected for this experiment.
    // Anonymous users cannot build, configure, run scripts, or read credentials.
    authorization.add(Jenkins.READ, new PermissionEntry(AuthorizationType.USER, 'anonymous'))
    authorization.add(Item.READ, new PermissionEntry(AuthorizationType.USER, 'anonymous'))
    controller.setAuthorizationStrategy(authorization)
    controller.setCrumbIssuer(new DefaultCrumbIssuer(false))
    controller.setSlaveAgentPort(-1)
    controller.setNumExecutors(1)
    controller.setLabelString('docker-lab')
    controller.setMode(Node.Mode.NORMAL)
    controller.setNoUsageStatistics(true)
    controller.setSystemMessage('ReleaseHarbor CI/CD Lab | Docker build, automated tests, image publication and verified Render deployment. Local demonstration controller; trusted repository only.')
    JenkinsLocationConfiguration.get().setUrl(System.getenv('JENKINS_URL') ?: 'http://127.0.0.1:8090/')
    JenkinsLocationConfiguration.get().save()
    controller.setInstallState(InstallState.INITIAL_SETUP_COMPLETED)
    controller.save()
    bootstrapMarker.setText('Initialized securely from mounted secrets.\n', 'UTF-8')
}

// Repository hooks are never needed to check out this public HTTPS repository.
def hookConfiguration = GitHooksConfiguration.get()
hookConfiguration.setAllowedOnController(false)
hookConfiguration.setAllowedOnAgents(false)
hookConfiguration.save()

// Credentials are imported only when their IDs do not already exist. They are
// encrypted by Jenkins in its persistent home. The optional source file must
// remain outside version control and must not be printed or archived.
def seedFile = new File('/run/secrets/seed_credentials')
if (seedFile.isFile()) {
    def seed = new JsonSlurper().parse(seedFile, 'UTF-8')
    def provider = SystemCredentialsProvider.getInstance()
    def store = provider.getStore()
    def existingIds = provider.getCredentials().collect { it.id }.toSet()
    def dockerUsername = seed.DockerHubUsername?.toString()
    def dockerToken = seed.DockerHubToken?.toString()
    if (dockerUsername || dockerToken) {
        if (!dockerUsername || !dockerToken) {
            throw new IllegalStateException('Both Docker Hub credential fields are required.')
        }
        if (!existingIds.contains('dockerhub')) {
            store.addCredentials(Domain.global(), new UsernamePasswordCredentialsImpl(
                CredentialsScope.GLOBAL, 'dockerhub', 'Docker Hub image publication', dockerUsername, dockerToken))
        }
    }
    def renderHook = seed.RenderDeployHook?.toString()
    if (renderHook && !existingIds.contains('render-deploy-hook')) {
        def parsedHook = new URI(renderHook)
        if (parsedHook.scheme != 'https' || parsedHook.host != 'api.render.com' ||
            !parsedHook.path.startsWith('/deploy/srv-') || !parsedHook.query?.contains('key=')) {
            throw new IllegalStateException('The Render deploy-hook secret is not a recognized HTTPS deploy hook.')
        }
        store.addCredentials(Domain.global(), new StringCredentialsImpl(
            CredentialsScope.GLOBAL, 'render-deploy-hook', 'Render demo service deploy hook', Secret.fromString(renderHook)))
    }
    provider.save()
}

// The job is loaded from Git, not an embedded copy of its Jenkinsfile. The first
// authenticated manual run activates the Jenkinsfile's commit polling trigger.
// Bootstrap deliberately schedules no builds before credentials are installed.
def jobName = 'ReleaseHarbor-CICD'
if (controller.getItem(jobName) == null) {
    def job = controller.createProject(WorkflowJob, jobName)
    def remote = new UserRemoteConfig('https://github.com/Emadfar007/CSA1020---Software-Engineering.git', null, null, null)
    def includedPaths = '^experiments/experiment-13-jenkins-cicd/(app/.*|ci/.*|Dockerfile|\\.dockerignore|Jenkinsfile|compose\\.yaml)$'
    def scm = new GitSCM([remote], [new BranchSpec('*/main')], false, [], null, null, [new PathRestriction(includedPaths, '')])
    def definition = new CpsScmFlowDefinition(scm, 'experiments/experiment-13-jenkins-cicd/Jenkinsfile')
    definition.setLightweight(false)
    job.setDefinition(definition)
    job.setDescription('ReleaseHarbor — a real pipeline loaded from Git. Tests must pass before the Docker image is published and deployed to the separate free Render demo service. Commits are detected by SCM polling after the first run. Jenkins remains local to this computer.')
    job.setQuietPeriod(0)
    job.save()
}
controller.save()

// Parameter definitions are needed before the first SCM-loaded build can be
// requested with buildWithParameters. Start with cloud deployment unchecked so
// the tested image can seed a new image-backed service before its hook exists.
def configuredJob = controller.getItem(jobName)
if (configuredJob.getProperty(ParametersDefinitionProperty) == null) {
    configuredJob.addProperty(new ParametersDefinitionProperty([
        new BooleanParameterDefinition('PUBLISH_IMAGE', true, 'Publish the tested image to Docker Hub.'),
        new BooleanParameterDefinition('DEPLOY_CLOUD', false, 'Deploy after the free cloud service and secret are configured.'),
        new BooleanParameterDefinition('DEMONSTRATE_TEST_GATE', false, 'Deliberately fail a test gate.')
    ]))
    configuredJob.save()
}
