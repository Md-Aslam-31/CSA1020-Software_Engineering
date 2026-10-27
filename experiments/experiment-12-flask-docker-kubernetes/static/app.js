"use strict";
const byId = (id) => document.getElementById(id);
const example = {origin:"Chennai",destination:"Bengaluru",distance_km:350,weight_kg:2.5,service:"express"};
let lastPayload = null;
let toastTimer;
const money = (value) => new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(value);
const titleCase = (value) => value ? value.charAt(0).toUpperCase()+value.slice(1) : "—";
function message(id,text,error=false){byId(id).textContent=text;byId(id).classList.toggle("error",error);}
function node(tag,className,text){const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=text;return element;}
function toast(text){byId("toast").textContent=text;byId("toast").hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{byId("toast").hidden=true;},2600);}
function selectService(code){byId("service").value=code;document.querySelectorAll("[data-service]").forEach(button=>{const selected=button.dataset.service===code;button.classList.toggle("selected",selected);button.setAttribute("aria-pressed",String(selected));});}
function tripBody(includeService=true){const body={origin:byId("origin").value,destination:byId("destination").value,distance_km:byId("distance").value===""?null:Number(byId("distance").value),weight_kg:byId("weight").value===""?null:Number(byId("weight").value)};if(includeService)body.service=byId("service").value;return body;}
function showResponse(result){
  lastPayload=result.payload;
  byId("responseJson").textContent=JSON.stringify(result.payload,null,2);
  byId("responseStatus").textContent=result.status+" "+result.statusText+" · "+result.ms+" ms";
  byId("responseStatus").classList.toggle("error",!result.ok);
  byId("responseInstance").textContent="Instance: "+(result.payload.meta?.served_by||result.instance||"—");
  byId("responseRequestId").textContent="Request ID: "+(result.payload.meta?.request_id||result.requestId||"—");
  byId("copyResponse").disabled=false;
}
async function api(path,method="GET",body=null){
  const started=performance.now();
  const options={method,headers:{Accept:"application/json"},cache:"no-store"};
  if(body!==null){options.headers["Content-Type"]="application/json";options.body=JSON.stringify(body);}
  const response=await fetch(path,options);
  const payload=await response.json();
  const result={payload,ok:response.ok,status:response.status,statusText:response.statusText,ms:Math.round(performance.now()-started),instance:response.headers.get("X-Instance-ID"),requestId:response.headers.get("X-Request-ID")};
  byId("lastLatency").textContent=result.ms+" ms";
  return result;
}
function showEstimate(quote){
  byId("emptyEstimate").hidden=true;
  byId("estimateContent").hidden=false;
  byId("estimateBadge").textContent=quote.service_name;
  byId("estimateRoute").textContent=quote.origin+" → "+quote.destination;
  byId("estimatePrice").textContent=money(quote.total);
  byId("estimateTime").textContent="Illustrative arrival estimate · "+quote.estimated_hours+" hours";
  byId("baseCost").textContent=money(quote.breakdown.base);
  byId("distanceCost").textContent=money(quote.breakdown.distance);
  byId("weightCost").textContent=money(quote.breakdown.weight);
  byId("quoteId").textContent=quote.quote_id;
}
function showComparison(data){
  const container=byId("comparisonCards");
  container.replaceChildren();
  data.quotes.forEach(quote=>{
    const card=node("article","comparison-card");
    card.append(node("h4","",quote.service_name),node("div","comparison-price",money(quote.total)),node("div","comparison-time",quote.estimated_hours+" illustrative hours"));
    if(quote.service===data.cheapest)card.append(node("span","comparison-tag","LOWEST ESTIMATE"));
    if(quote.service===data.fastest)card.append(node("span","comparison-tag","QUICKEST ESTIMATE"));
    container.append(card);
  });
  byId("comparisonPanel").hidden=false;
}
async function submitQuote(compare=false){
  const primary=byId("quoteButton"),secondary=byId("compareButton");
  primary.disabled=true;secondary.disabled=true;
  const oldText=primary.textContent;primary.textContent=compare?"Comparing…":"Calculating…";
  message("formMessage","Sending your request…");
  const path=compare?"/api/v1/compare":"/api/v1/quotes";
  byId("lastQuotePath").textContent=path;
  try{
    const result=await api(path,"POST",tripBody(!compare));
    showResponse(result);
    byId("quoteHttpStatus").textContent="HTTP "+result.status+" · "+result.ms+" ms";
    if(!result.ok){message("formMessage",result.payload.error?.message||"The API rejected this request.",true);return;}
    if(compare){showComparison(result.payload.data);const selected=result.payload.data.quotes.find(quote=>quote.service===byId("service").value);showEstimate(selected);message("formMessage","All three services compared using your parcel details.");}
    else{showEstimate(result.payload.data);byId("comparisonPanel").hidden=true;message("formMessage","Your estimate is ready. Rates and timings are illustrative.");}
  }catch(error){message("formMessage","Could not reach the API. Check that the container or Kubernetes service is running.",true);byId("quoteHttpStatus").textContent="Connection failed";}
  finally{primary.disabled=false;secondary.disabled=false;primary.textContent=oldText;}
}
byId("quoteForm").addEventListener("submit",event=>{event.preventDefault();submitQuote(false);});
byId("compareButton").addEventListener("click",()=>submitQuote(true));
document.querySelectorAll("[data-service]").forEach(button=>button.addEventListener("click",()=>selectService(button.dataset.service)));
byId("loadSample").addEventListener("click",()=>{
  byId("origin").value=example.origin;byId("destination").value=example.destination;byId("distance").value=example.distance_km;byId("weight").value=example.weight_kg;selectService(example.service);
  message("formMessage","Example loaded. Adjust any detail, then request an estimate.");toast("Example parcel details loaded");
});
function endpointChanged(){
  const isPost=byId("endpoint").value.startsWith("POST");
  byId("requestBodyWrap").hidden=!isPost;byId("getHint").hidden=isPost;
  if(isPost){const sample={...example};if(byId("endpoint").value.endsWith("/compare"))delete sample.service;byId("requestBody").value=JSON.stringify(sample,null,2);}
  message("explorerMessage","");
}
byId("endpoint").addEventListener("change",endpointChanged);
byId("sendRequest").addEventListener("click",async()=>{
  const choice=byId("endpoint").value;
  const space=choice.indexOf(" "),method=choice.slice(0,space),path=choice.slice(space+1);
  let body=null;
  if(method==="POST"){try{body=JSON.parse(byId("requestBody").value);}catch{message("explorerMessage","Request JSON is not valid. Correct it before sending.",true);return;}}
  byId("sendRequest").disabled=true;message("explorerMessage","Sending request…");
  try{const result=await api(path,method,body);showResponse(result);message("explorerMessage",result.ok?"Response received from the API.":(result.payload.error?.message||"The request was rejected."),!result.ok);}
  catch{message("explorerMessage","Could not reach the API. Check the running service.",true);}
  finally{byId("sendRequest").disabled=false;}
});
byId("copyResponse").addEventListener("click",async()=>{
  if(lastPayload===null)return;
  try{await navigator.clipboard.writeText(JSON.stringify(lastPayload,null,2));toast("JSON response copied");}
  catch{toast("Copy is unavailable. You can select the response text directly.");}
});
async function runtime(){
  byId("refreshRuntime").disabled=true;
  try{
    const result=await api("/api/v1/status");
    if(!result.ok)throw new Error("Status unavailable");
    const data=result.payload.data;
    byId("connectionDot").className="connection-dot online";byId("connectionLabel").textContent="API connected";
    byId("apiStatus").textContent="Ready";byId("environment").textContent=titleCase(data.mode);
    byId("endpointLabel").textContent="Port "+(location.port||(location.protocol==="https:"?"443":"80"));
    byId("runtimeMode").textContent=titleCase(data.mode);byId("runtimeNamespace").textContent=data.namespace;byId("runtimeVersion").textContent=data.version;
    byId("runtimeInstance").textContent=data.instance;byId("runtimeInstance").title=data.instance;
    message("runtimeMessage","Runtime information refreshed from "+data.instance+".");
  }catch{
    byId("connectionDot").className="connection-dot offline";byId("connectionLabel").textContent="API unavailable";byId("apiStatus").textContent="Unavailable";
    message("runtimeMessage","The runtime could not be reached. Start the API and refresh this section.",true);
  }finally{byId("refreshRuntime").disabled=false;}
}
byId("refreshRuntime").addEventListener("click",runtime);
document.querySelectorAll(".nav-link").forEach(link=>link.addEventListener("click",()=>{document.querySelectorAll(".nav-link").forEach(other=>other.classList.toggle("active",other===link));}));
async function initialize(){
  endpointChanged();
  await runtime();
  try{const result=await api("/api/v1/services");if(result.ok)byId("serviceCount").textContent=result.payload.data.count;else byId("serviceCount").textContent="Unavailable";}
  catch{byId("serviceCount").textContent="Unavailable";}
}
initialize();
