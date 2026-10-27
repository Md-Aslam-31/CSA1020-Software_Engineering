const PRIORITY = Object.freeze({high:0,medium:1,low:2});
const ROOT_KEYS = ['planName','startDate','dailyMinutes','horizonDays','subjects'];
const SUBJECT_KEYS = ['id','name','minutes','priority'];

export class InputError extends Error {
  constructor(message,status=400,code='INVALID_INPUT') {
    super(message); this.status=status; this.code=code;
  }
}

function exactObject(value,keys,label) {
  if(value===null || typeof value!=='object' || Array.isArray(value)) throw new InputError(`${label} must be a JSON object.`);
  const missing=keys.filter(key=>!Object.hasOwn(value,key));
  const unknown=Object.keys(value).filter(key=>!keys.includes(key));
  if(missing.length) throw new InputError(`${label} is missing required fields: ${missing.join(', ')}.`);
  if(unknown.length) throw new InputError(`${label} contains unsupported fields: ${unknown.join(', ')}.`);
}

function text(value,label,min,max) {
  if(typeof value!=='string') throw new InputError(`${label} must be text.`);
  const result=value.trim();
  if(result.length<min || result.length>max || /[\u0000-\u001f\u007f]/u.test(result)) throw new InputError(`${label} must contain ${min}–${max} characters without control characters.`);
  return result;
}

function integer(value,label,min,max) {
  if(!Number.isInteger(value) || value<min || value>max) throw new InputError(`${label} must be a whole JSON number from ${min} to ${max}.`);
  return value;
}

function calendarDate(value) {
  if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new InputError('startDate must use YYYY-MM-DD.');
  const date=new Date(`${value}T12:00:00.000Z`);
  if(Number.isNaN(date.valueOf()) || date.toISOString().slice(0,10)!==value || value<'1900-01-01' || value>'2100-12-31') throw new InputError('startDate must be a real calendar date from 1900 through 2100.');
  return value;
}

function addDays(iso,count) {
  const date=new Date(`${iso}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate()+count);
  return date.toISOString().slice(0,10);
}

export function validatePlan(payload) {
  exactObject(payload,ROOT_KEYS,'Request');
  const planName=text(payload.planName,'planName',2,80);
  const startDate=calendarDate(payload.startDate);
  const dailyMinutes=integer(payload.dailyMinutes,'dailyMinutes',30,480);
  const horizonDays=integer(payload.horizonDays,'horizonDays',1,14);
  if(!Array.isArray(payload.subjects) || payload.subjects.length<1 || payload.subjects.length>6) throw new InputError('subjects must contain from 1 to 6 subjects.');
  const ids=new Set();
  const subjects=payload.subjects.map((subject,index)=>{
    const label=`subjects[${index}]`;
    exactObject(subject,SUBJECT_KEYS,label);
    const id=text(subject.id,`${label}.id`,1,32);
    if(!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) throw new InputError(`${label}.id must use letters, numbers, underscores or hyphens.`);
    if(ids.has(id)) throw new InputError('Each subject must have a unique id.');
    ids.add(id);
    const name=text(subject.name,`${label}.name`,2,60);
    const minutes=integer(subject.minutes,`${label}.minutes`,15,3000);
    if(typeof subject.priority!=='string' || !Object.hasOwn(PRIORITY,subject.priority)) throw new InputError(`${label}.priority must be high, medium or low.`);
    return {id,name,minutes,priority:subject.priority};
  });
  return {planName,startDate,dailyMinutes,horizonDays,subjects};
}

export function createPlan(payload) {
  const input=validatePlan(payload);
  const ordered=input.subjects.map((subject,index)=>({...subject,index,remaining:subject.minutes,planned:0})).sort((a,b)=>PRIORITY[a.priority]-PRIORITY[b.priority] || a.index-b.index);
  const days=Array.from({length:input.horizonDays},(_,index)=>({date:addDays(input.startDate,index),dayNumber:index+1,capacityMinutes:input.dailyMinutes,plannedMinutes:0,freeMinutes:input.dailyMinutes,sessions:[]}));
  let active=0;
  for(const day of days) {
    let room=input.dailyMinutes;
    while(room>0 && active<ordered.length) {
      const subject=ordered[active];
      const minutes=Math.min(room,subject.remaining);
      day.sessions.push({subjectId:subject.id,name:subject.name,priority:subject.priority,minutes});
      day.plannedMinutes+=minutes;subject.remaining-=minutes;subject.planned+=minutes;room-=minutes;
      if(subject.remaining===0) active++;
    }
    day.freeMinutes=room;
  }
  const subjects=ordered.sort((a,b)=>a.index-b.index).map(subject=>({id:subject.id,name:subject.name,priority:subject.priority,targetMinutes:subject.minutes,plannedMinutes:subject.planned,remainingMinutes:subject.remaining}));
  const totalTargetMinutes=input.subjects.reduce((sum,subject)=>sum+subject.minutes,0);
  const plannedMinutes=days.reduce((sum,day)=>sum+day.plannedMinutes,0);
  const remainingMinutes=totalTargetMinutes-plannedMinutes;
  const totalCapacityMinutes=input.dailyMinutes*input.horizonDays;
  const warnings=remainingMinutes?[`${remainingMinutes} requested minutes do not fit this sprint. Increase your daily capacity or planning days, or reduce the targets.`]:[];
  return {planName:input.planName,startDate:input.startDate,dailyMinutes:input.dailyMinutes,horizonDays:input.horizonDays,totalTargetMinutes,plannedMinutes,remainingMinutes,totalCapacityMinutes,utilizationPercent:Math.round(plannedMinutes/totalCapacityMinutes*100),days,subjects,warnings};
}
