"use strict";
const element = id => document.getElementById(id);
const form = element("releaseForm");
const storageKey = "releaseharbor.plan.v1";
const checksByCategory = {
  engineering: ["tests", "codeReview", "build"],
  security: ["dependencies", "secrets", "access"],
  operations: ["backup", "monitoring", "rollback", "runbook"],
  customer: ["notes", "support"]
};
const allCheckIds = Object.values(checksByCategory).flat();
const sampleDate = new Date();
sampleDate.setDate(sampleDate.getDate() + 3);
const dateValue = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
const sample = {
  releaseName: "The next good thing",
  version: "1.0.0",
  owner: "Release team",
  releaseDate: dateValue(sampleDate),
  checks: {tests:true,codeReview:true,build:true,dependencies:true,secrets:true,access:true,backup:false,monitoring:true,rollback:true,runbook:false,notes:true,support:false}
};
let assessment = null;
let lastBuild = null;
let toastTimer;
let assessing = false;
const titleCase = value => value ? String(value).charAt(0).toUpperCase()+String(value).slice(1) : "Not supplied";

function toast(message) {
  element("toast").textContent = message;
  element("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { element("toast").hidden = true; }, 3300);
}

function notify(message, error=false) {
  element("formMessage").textContent = message;
  element("formMessage").classList.toggle("error", error);
}

function makeNode(tag, className, text) {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}

function readPlan() {
  const checks = {};
  allCheckIds.forEach(id => { checks[id] = form.elements.namedItem(id).checked; });
  return {
    releaseName: element("releaseName").value,
    version: element("releaseVersion").value,
    owner: element("releaseOwner").value,
    releaseDate: element("releaseDate").value,
    checks
  };
}

function fillPlan(plan) {
  element("releaseName").value = typeof plan.releaseName === "string" ? plan.releaseName : sample.releaseName;
  element("releaseVersion").value = typeof plan.version === "string" ? plan.version : sample.version;
  element("releaseOwner").value = typeof plan.owner === "string" ? plan.owner : sample.owner;
  element("releaseDate").value = typeof plan.releaseDate === "string" ? plan.releaseDate : sample.releaseDate;
  allCheckIds.forEach(id => { form.elements.namedItem(id).checked = typeof plan.checks?.[id] === "boolean" ? plan.checks[id] : sample.checks[id]; });
  updateCounts();
}

function updateCounts() {
  Object.entries(checksByCategory).forEach(([category,ids]) => {
    const completed = ids.filter(id => form.elements.namedItem(id).checked).length;
    element(`${category}Count`).textContent = `${completed} / ${ids.length}`;
  });
}

function isCurrentAssessment() {
  return assessment !== null && JSON.stringify(readPlan()) === JSON.stringify(assessment.input);
}

function markChanges() {
  updateCounts();
  if (!assessment) return;
  const current = isCurrentAssessment();
  document.querySelector(".assessment-panel").classList.toggle("stale", !current);
  element("assessmentState").textContent = current ? "API ASSESSED" : "PLAN CHANGED";
  element("metricScoreHint").textContent = current ? "Calculated from your checklist" : "Previous score · assess again";
  element("metricGateHint").textContent = current ? "Assessment of your current plan" : "Plan changed · assess again";
  element("timelineHint").textContent = current ? `Suggested milestones for ${assessment.data.releaseName}` : "Previous timeline · assess your updated plan.";
  element("assessmentFootnote").textContent = current ? "An educational readiness plan. This does not approve or deploy a release." : "This assessment belongs to an earlier plan. Assess again to check your changes.";
  notify(current ? "Your plan matches the latest API assessment." : "Your plan changed. Assess it again for an updated score and timeline.");
}

function formatDate(value) {
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("en",{day:"numeric",month:"short",timeZone:"UTC"}).format(parsed);
}

function renderAssessment(data, input) {
  assessment = {data,input,assessedAt:new Date().toISOString()};
  const score = Number(data.score);
  element("metricScore").textContent = `${score}%`;
  element("metricGate").textContent = data.status;
  element("metricChecks").textContent = `${data.completed} / ${data.total}`;
  element("readinessScore").textContent = score;
  element("scoreArc").setAttribute("stroke-dashoffset", String(420.973 * (1-Math.max(0,Math.min(100,score))/100)));
  element("assessmentStatus").textContent = data.status;
  element("assessmentRecommendation").textContent = data.recommendation;
  element("blockerCount").textContent = data.blockers.length === 1 ? "1 TO RESOLVE" : `${data.blockers.length} TO RESOLVE`;
  const list = element("blockerList");
  list.replaceChildren();
  if (data.blockers.length === 0) list.append(makeNode("li","clear","All four essential release gates are checked."));
  else data.blockers.forEach(blocker => { list.append(makeNode("li","",blocker.label)); });
  const panel = document.querySelector(".assessment-panel");
  panel.classList.toggle("blocked", data.blockers.length > 0);
  panel.classList.toggle("ready", data.status === "Ready to rehearse");
  const timeline = element("timelineCards");
  timeline.replaceChildren();
  data.timeline.forEach((milestone,index) => {
    const card = makeNode("article","timeline-card");
    const step = makeNode("div","timeline-step");
    step.append(makeNode("span","",String(index+1).padStart(2,"0")),makeNode("span","",formatDate(milestone.date)));
    card.append(step,makeNode("h3","",milestone.title || milestone.phase),makeNode("p","",milestone.description));
    timeline.append(card);
  });
  markChanges();
}

async function requestJson(path, options={}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(path,{...options,signal:controller.signal,cache:"no-store",headers:{Accept:"application/json",...options.headers}});
    let payload;
    try { payload = await response.json(); } catch { throw new Error("The API returned an unreadable response. Check the running application."); }
    if (!response.ok) throw new Error(payload.error?.message || `The API rejected the request (HTTP ${response.status}).`);
    return {payload,status:response.status};
  } finally { clearTimeout(timeout); }
}

async function assessPlan() {
  if (assessing) return;
  assessing = true;
  const input = readPlan();
  const button = element("assessButton");
  button.disabled = true;
  button.textContent = "Checking the essentials…";
  notify("Sending your plan to the API…");
  try {
    const result = await requestJson("/api/assess",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)});
    renderAssessment(result.payload.data,input);
    if (isCurrentAssessment()) notify(`Assessment received · HTTP ${result.status}. Your readiness and timeline are up to date.`);
    element("connectionDot").className = "online";
    element("connectionText").textContent = "API connected";
  } catch(error) {
    notify(error.name === "AbortError" ? "The API took too long to respond. Try assessing again." : error.message,true);
  } finally {
    assessing = false;
    button.disabled = false;
    button.replaceChildren(document.createTextNode("Assess my release "),makeNode("span","","↗"));
    button.querySelector("span").setAttribute("aria-hidden","true");
  }
}

async function refreshBuild() {
  const button = element("refreshBuild");
  button.disabled = true;
  element("buildMessage").textContent = "Reading metadata from /api/version…";
  element("buildMessage").classList.remove("error");
  try {
    const result = await requestJson("/api/version");
    const data = result.payload.data;
    lastBuild = data;
    element("buildApplication").textContent = data.application;
    element("buildVersion").textContent = data.version;
    element("buildMode").textContent = titleCase(data.mode);
    element("buildNumber").textContent = data.buildNumber || "Not supplied";
    element("buildCommit").textContent = data.gitSha || "Not supplied";
    element("metricEnvironment").textContent = titleCase(data.mode);
    element("metricBuild").textContent = `Build ${data.buildNumber || "not supplied"} · app ${data.version}`;
    element("buildMessage").textContent = `Actual metadata from the running API · HTTP ${result.status}.`;
    element("connectionDot").className = "online";
    element("connectionText").textContent = "API connected";
  } catch(error) {
    element("buildMessage").textContent = error.name === "AbortError" ? "The API did not respond in time. Try refreshing again." : error.message;
    element("buildMessage").classList.add("error");
    element("connectionDot").className = "offline";
    element("connectionText").textContent = "API unavailable";
    if (!lastBuild) element("metricEnvironment").textContent = "Unavailable";
  } finally { button.disabled = false; }
}

form.addEventListener("submit",event => { event.preventDefault(); assessPlan(); });
form.addEventListener("input",markChanges);
form.addEventListener("change",markChanges);
element("refreshBuild").addEventListener("click",refreshBuild);
element("saveDraft").addEventListener("click",() => {
  try {
    localStorage.setItem(storageKey,JSON.stringify({schemaVersion:1,savedAt:new Date().toISOString(),plan:readPlan()}));
    toast("Draft saved in this browser");
  } catch { toast("Draft could not be saved. Browser storage may be unavailable."); }
});
element("resetPlan").addEventListener("click",() => {
  fillPlan(sample);
  let removed = true;
  try { localStorage.removeItem(storageKey); } catch { removed = false; }
  markChanges();
  toast(removed ? "Sample restored and saved draft cleared" : "Sample restored. Browser storage could not be cleared.");
  assessPlan();
});
element("exportPlan").addEventListener("click",() => {
  const plan = readPlan();
  const current = isCurrentAssessment();
  const file = {
    application:"ReleaseHarbor",
    exportedAt:new Date().toISOString(),
    note:"Educational planning data. This does not approve or deploy a release.",
    plan,
    assessment:current ? assessment.data : null,
    assessmentStatus:current ? "Matches the current plan" : "Not assessed for the current plan",
    assessedAt:current ? assessment.assessedAt : null,
    runningApplication:lastBuild
  };
  try {
    const blob = new Blob([JSON.stringify(file,null,2)],{type:"application/json"});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    const filename = plan.releaseName.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,50) || "release-plan";
    anchor.download = `${filename}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url),5000);
    toast(current ? "Release plan exported with its API assessment" : "Plan exported. Assess the current plan to include a readiness result.");
  } catch { toast("Export could not start. Your plan remains in this workspace."); }
});
document.querySelectorAll(".nav-link").forEach(link => link.addEventListener("click",() => {
  document.querySelectorAll(".nav-link").forEach(other => other.classList.toggle("active",other === link));
}));

function initialize() {
  fillPlan(sample);
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored !== null) {
      const saved = JSON.parse(stored);
      if (saved.schemaVersion === 1 && saved.plan && typeof saved.plan === "object") {
        fillPlan(saved.plan);
        toast("Your saved draft is back. Checking it with the API…");
      } else { toast("Saved draft format was not recognized. The sample is loaded."); }
    }
  } catch { toast("Saved draft could not be read. The sample is loaded."); }
  refreshBuild();
  assessPlan();
}
initialize();
