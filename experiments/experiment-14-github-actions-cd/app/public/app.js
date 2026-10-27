"use strict";
const element=id=>document.getElementById(id);
const draftKey="focuslane.draft.v1";
let assessment=null;
let assessedSignature=null;
let runtimeData=null;
let generation=0;
let toastTimer;
function makeNode(tag,className,text){const result=document.createElement(tag);if(className)result.className=className;if(text!==undefined)result.textContent=text;return result;}
function message(text,error=false){element("formMessage").textContent=text;element("formMessage").classList.toggle("error",error);}
function toast(text){element("toast").textContent=text;element("toast").hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{element("toast").hidden=true;},3000);}
function minutesLabel(value){const minutes=Number(value);if(!Number.isFinite(minutes))return "—";const hours=Math.floor(minutes/60),remaining=minutes%60;return hours?(hours+"h"+(remaining?" "+remaining+"m":"")):minutes+"m";}
function dateLabel(date,options){return new Intl.DateTimeFormat("en-GB",{...options,timeZone:"UTC"}).format(new Date(date+"T12:00:00Z"));}
function sample(){const date=new Date();date.setDate(date.getDate()+1);const iso=[date.getFullYear(),String(date.getMonth()+1).padStart(2,"0"),String(date.getDate()).padStart(2,"0")].join("-");return {planName:"A little progress, every day",startDate:iso,dailyMinutes:90,horizonDays:5,subjects:[{id:"software",name:"Software engineering",minutes:120,priority:"high"},{id:"mathematics",name:"Mathematics",minutes:90,priority:"medium"},{id:"design",name:"Design systems",minutes:60,priority:"low"}]};}
function numeric(input){return input.value===""?null:Number(input.value);}
function readPlan(){return {planName:element("planName").value,startDate:element("startDate").value,dailyMinutes:numeric(element("dailyMinutes")),horizonDays:numeric(element("horizonDays")),subjects:[...element("subjectRows").children].map(row=>({id:row.dataset.subjectId,name:row.querySelector('[data-field="name"]').value,minutes:numeric(row.querySelector('[data-field="minutes"]')),priority:row.querySelector('[data-field="priority"]').value}))};}
function signature(){return JSON.stringify(readPlan());}
function isCurrent(){return assessment!==null&&signature()===assessedSignature;}
function updateSubjectControls(){const rows=[...element("subjectRows").children];element("subjectCount").textContent=rows.length+" / 6";element("addSubject").disabled=rows.length>=6;rows.forEach((row,index)=>{row.querySelector("button").disabled=rows.length<=1;row.querySelector("button").setAttribute("aria-label","Remove subject "+(index+1));row.querySelector('[data-field="name"]').setAttribute("aria-label","Subject "+(index+1)+" name");row.querySelector('[data-field="minutes"]').setAttribute("aria-label","Subject "+(index+1)+" target minutes");row.querySelector('[data-field="priority"]').setAttribute("aria-label","Subject "+(index+1)+" priority");});}
function subjectRow(subject){
  const row=makeNode("div","subject-row");row.dataset.subjectId=subject.id;
  const nameLabel=makeNode("label","","Subject name"),name=makeNode("input");name.type="text";name.maxLength=60;name.autocomplete="off";name.placeholder="What are you working on?";name.dataset.field="name";name.value=subject.name;
  const minutesLabelNode=makeNode("label","","Target / minutes"),time=makeNode("input");time.type="number";time.min="15";time.max="3000";time.step="1";time.inputMode="numeric";time.dataset.field="minutes";time.value=subject.minutes??"";
  const priorityLabel=makeNode("label","","Priority"),priority=makeNode("select");priority.dataset.field="priority";[["high","High"],["medium","Medium"],["low","Low"]].forEach(([value,label])=>{const option=makeNode("option","",label);option.value=value;priority.append(option);});priority.value=subject.priority;
  const remove=makeNode("button","remove-subject","×");remove.type="button";remove.addEventListener("click",()=>{if(element("subjectRows").children.length<=1)return;row.remove();updateSubjectControls();markChanged();});
  nameLabel.append(name);minutesLabelNode.append(time);priorityLabel.append(priority);row.append(nameLabel,minutesLabelNode,priorityLabel,remove);return row;
}
function fillPlan(plan){element("planName").value=plan.planName;element("startDate").value=plan.startDate;element("dailyMinutes").value=plan.dailyMinutes??"";element("horizonDays").value=plan.horizonDays??"";element("subjectRows").replaceChildren(...plan.subjects.map(subjectRow));updateSubjectControls();}
function markChanged(){
  const current=isCurrent();element("summaryResult").closest("aside").classList.toggle("stale",assessment!==null&&!current);element("scheduleNotice").hidden=assessment===null||current;
  if(assessment&&!current){element("assessmentBadge").textContent="PLAN CHANGED";element("plannedMetricHint").textContent="Previous plan · generate again";element("summaryFootnote").textContent="These results belong to an earlier plan. Generate again to check your changes.";message("Plan changed. Find your focus again to update the schedule.");}
  else if(current){element("assessmentBadge").textContent="API PLANNED";element("plannedMetricHint").textContent="Calculated from your current plan";element("summaryFootnote").textContent="Your plan is a starting point. Make space for breaks and adjust as you go.";}
}
function renderSchedule(data){
  const cards=data.days.map(day=>{
    const card=makeNode("article","day-card"),head=makeNode("div","day-head");head.append(makeNode("span","day-number",String(day.dayNumber).padStart(2,"0")),makeNode("span","",dateLabel(day.date,{month:"short",day:"numeric"})));card.append(head,makeNode("h3","",dateLabel(day.date,{weekday:"long"})),makeNode("p","day-date",dateLabel(day.date,{month:"long",day:"numeric"})));
    if(day.sessions.length){const sessions=makeNode("div","session-list");day.sessions.forEach(session=>{const block=makeNode("div","study-session priority-"+session.priority);block.append(makeNode("div","session-name",session.name),makeNode("div","session-duration",minutesLabel(session.minutes)+" · "+session.priority+" priority"));sessions.append(block);});card.append(sessions);}
    else card.append(makeNode("p","day-quiet","A little breathing room."),makeNode("p","day-quiet-note","Keep this space for breaks, revision, or whatever your day needs."));
    const total=makeNode("div","day-total");total.append(makeNode("span","","PLANNED"),makeNode("strong","",minutesLabel(day.plannedMinutes)+" / "+minutesLabel(day.capacityMinutes)));const bar=makeNode("progress");bar.max=day.capacityMinutes;bar.value=day.plannedMinutes;bar.setAttribute("aria-label",dateLabel(day.date,{weekday:"long",month:"long",day:"numeric"})+" planned time");const room=makeNode("div","day-room");room.append(makeNode("span","","ROOM LEFT"),makeNode("strong","",minutesLabel(day.freeMinutes)));card.append(total,bar,room);return card;
  });
  element("scheduleGrid").replaceChildren(...cards);element("scheduleDescription").textContent=data.planName+" · "+data.horizonDays+" days from "+dateLabel(data.startDate,{day:"numeric",month:"long"});
}
function renderAssessment(data){
  element("targetMetric").textContent=minutesLabel(data.totalTargetMinutes);element("plannedMetric").textContent=minutesLabel(data.plannedMinutes);element("capacityMetric").textContent=minutesLabel(data.totalCapacityMinutes);
  element("summaryEmpty").hidden=true;element("summaryResult").hidden=false;element("utilizationValue").textContent=data.utilizationPercent;element("utilizationProgress").value=data.utilizationPercent;
  element("summaryOutcome").textContent=data.remainingMinutes>0?"Your goals need a little more room. Extend your plan or adjust a subject’s target.":"Every subject has a place. Leave yourself room to breathe.";
  element("summaryPlanned").textContent=minutesLabel(data.plannedMinutes);element("summaryRemaining").textContent=minutesLabel(data.remainingMinutes);element("summaryDaily").textContent=minutesLabel(data.dailyMinutes);
  element("warnings").replaceChildren(...data.warnings.map(warning=>makeNode("p","",warning)));renderSchedule(data);markChanged();
}
async function generatePlan(){
  const seq=++generation,body=readPlan(),snapshot=JSON.stringify(body),button=element("generatePlan");button.disabled=true;button.textContent="Finding your focus…";message("Putting the pieces together with the API…");
  try{const response=await fetch("/api/plan",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(body)});const payload=await response.json();if(seq!==generation)return;
    if(!response.ok){message(payload.error?.message||"The API could not plan these details.",true);return;}
    assessment=payload.data;assessedSignature=snapshot;renderAssessment(payload.data);if(isCurrent())message("Your schedule is ready · HTTP "+response.status+". Higher priorities get the first available time.");
  }catch{if(seq===generation)message("The API could not be reached. Check that the application is running, then try again.",true);}
  finally{if(seq===generation){button.disabled=false;button.replaceChildren(document.createTextNode("Find my focus "),makeNode("span","","↗"));button.lastElementChild.setAttribute("aria-hidden","true");}}
}
async function refreshRuntime(){
  element("refreshBuild").disabled=true;element("runtimeMessage").textContent="Reading /api/version…";element("runtimeMessage").classList.remove("error");
  try{const response=await fetch("/api/version",{headers:{Accept:"application/json"},cache:"no-store"});if(!response.ok)throw new Error("Runtime unavailable");const payload=await response.json();runtimeData=payload.data;
    const mode=runtimeData.mode?runtimeData.mode.charAt(0).toUpperCase()+runtimeData.mode.slice(1):"—";element("connectionDot").className="status-dot online";element("connectionText").textContent="API connected";element("environmentMetric").textContent=mode;element("buildMetric").textContent="Run "+runtimeData.buildNumber+" · app "+runtimeData.version;
    element("runtimeApplication").textContent=runtimeData.application;element("runtimeMode").textContent=mode;element("runtimeVersion").textContent=runtimeData.version;element("runtimeBuild").textContent=runtimeData.buildNumber;element("runtimeCommit").textContent=runtimeData.gitSha;element("runtimeMessage").textContent="Actual metadata from the running API · HTTP "+response.status+".";
  }catch{element("connectionDot").className="status-dot offline";element("connectionText").textContent="API unavailable";element("environmentMetric").textContent="Unavailable";element("buildMetric").textContent="Refresh to try again";element("runtimeMessage").textContent="Build details could not be reached. Check the running application.";element("runtimeMessage").classList.add("error");}
  finally{element("refreshBuild").disabled=false;}
}
element("planForm").addEventListener("submit",event=>{event.preventDefault();generatePlan();});element("planForm").addEventListener("input",markChanged);element("planForm").addEventListener("change",markChanged);
element("addSubject").addEventListener("click",()=>{if(element("subjectRows").children.length>=6)return;const id="subject-"+Date.now().toString(36)+Math.random().toString(36).slice(2,5);const row=subjectRow({id,name:"",minutes:60,priority:"medium"});element("subjectRows").append(row);updateSubjectControls();markChanged();row.querySelector("input").focus();});
element("saveDraft").addEventListener("click",()=>{try{localStorage.setItem(draftKey,JSON.stringify(readPlan()));toast("Draft saved in this browser");}catch{toast("Browser storage is unavailable. You can export your plan instead.");}});
element("resetSample").addEventListener("click",()=>{fillPlan(sample());markChanged();let cleared=true;try{localStorage.removeItem(draftKey);}catch{cleared=false;}generatePlan();toast(cleared?"Sample restored and saved draft cleared":"Sample restored. Browser storage is unavailable.");});
element("exportPlan").addEventListener("click",()=>{const plan=readPlan(),current=isCurrent();const exported={application:"FocusLane",exportedAt:new Date().toISOString(),note:"Study-planning data. Adjust your estimates, priorities and breaks as needed.",plan,schedule:current?assessment:null,scheduleStatus:current?"Matches the current plan":"Generate the current plan to include its schedule",runningApplication:runtimeData};try{const url=URL.createObjectURL(new Blob([JSON.stringify(exported,null,2)],{type:"application/json"}));const link=makeNode("a");link.href=url;link.download=(plan.planName.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,55)||"focuslane-plan")+".json";document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);toast(current?"Plan exported with its API schedule":"Plan exported. Generate it to include a current schedule.");}catch{toast("Export could not start. Your plan is still here.");}});
element("refreshBuild").addEventListener("click",refreshRuntime);document.querySelectorAll(".nav-link").forEach(link=>link.addEventListener("click",()=>{document.querySelectorAll(".nav-link").forEach(other=>other.classList.toggle("active",other===link));}));
function restoreDraft(){try{const parsed=JSON.parse(localStorage.getItem(draftKey)||"null");if(!parsed||typeof parsed.planName!=="string"||typeof parsed.startDate!=="string"||!Array.isArray(parsed.subjects)||parsed.subjects.length<1||parsed.subjects.length>6)return false;const ids=new Set();for(const item of parsed.subjects){if(!item||typeof item.id!=="string"||!item.id.match(/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/)||ids.has(item.id)||typeof item.name!=="string"||!["high","medium","low"].includes(item.priority))return false;ids.add(item.id);}fillPlan(parsed);return true;}catch{return false;}}
fillPlan(sample());const restored=restoreDraft();refreshRuntime();generatePlan();if(restored)toast("Your saved draft is back. Checking it with the API…");
