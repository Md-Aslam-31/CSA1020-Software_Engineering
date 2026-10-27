export const CHECKS = Object.freeze([
  {id:'tests',label:'Automated tests pass',category:'engineering',critical:true},
  {id:'codeReview',label:'Changes have been reviewed',category:'engineering',critical:false},
  {id:'build',label:'Reproducible container build',category:'engineering',critical:true},
  {id:'dependencies',label:'Dependencies reviewed',category:'security',critical:false},
  {id:'secrets',label:'No credentials in the release',category:'security',critical:true},
  {id:'access',label:'Access permissions checked',category:'security',critical:false},
  {id:'backup',label:'Recovery data prepared',category:'operations',critical:false},
  {id:'monitoring',label:'Health checks and monitoring ready',category:'operations',critical:false},
  {id:'rollback',label:'Rollback procedure verified',category:'operations',critical:true},
  {id:'runbook',label:'Operations runbook updated',category:'operations',critical:false},
  {id:'notes',label:'Release notes prepared',category:'customer',critical:false},
  {id:'support',label:'Support handover complete',category:'customer',critical:false}
]);

const CATEGORIES = Object.freeze([
  {id:'engineering',label:'Engineering'},
  {id:'security',label:'Security'},
  {id:'operations',label:'Operations'},
  {id:'customer',label:'Customer'}
]);
const BODY_KEYS = ['releaseName','version','owner','releaseDate','checks'];

export class InputError extends Error {
  constructor(message,status=400,code='INVALID_INPUT') {
    super(message); this.status=status; this.code=code;
  }
}

function objectWithKeys(value,expected,label) {
  if(value===null || typeof value!=='object' || Array.isArray(value)) throw new InputError(`${label} must be a JSON object.`);
  const keys=Object.keys(value);
  const missing=expected.filter(key=>!Object.hasOwn(value,key));
  const unknown=keys.filter(key=>!expected.includes(key));
  if(missing.length) throw new InputError(`${label} is missing required fields: ${missing.join(', ')}.`);
  if(unknown.length) throw new InputError(`${label} contains unsupported fields: ${unknown.join(', ')}.`);
}

function text(value,label,min,max) {
  if(typeof value!=='string') throw new InputError(`${label} must be text.`);
  const cleaned=value.trim();
  if(cleaned.length<min || cleaned.length>max || /[\u0000-\u001f\u007f]/u.test(cleaned)) throw new InputError(`${label} must contain ${min}–${max} characters without control characters.`);
  return cleaned;
}

function dateString(value) {
  if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new InputError('releaseDate must use YYYY-MM-DD.');
  const date=new Date(`${value}T12:00:00.000Z`);
  if(Number.isNaN(date.valueOf()) || date.toISOString().slice(0,10)!==value || value<'1900-01-01' || value>'2100-12-31') throw new InputError('releaseDate must be a real calendar date from 1900 through 2100.');
  return value;
}

export function validateAssessment(payload) {
  objectWithKeys(payload,BODY_KEYS,'Request');
  const releaseName=text(payload.releaseName,'releaseName',2,80);
  const owner=text(payload.owner,'owner',2,60);
  const version=text(payload.version,'version',5,40);
  const semver=version.match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/);
  if(!semver || semver[4]?.split('.').some(part=>/^\d+$/.test(part)&&part.length>1&&part[0]==='0')) throw new InputError('version must be a semantic version such as 1.0.0 or 1.0.0-rc.1.');
  const releaseDate=dateString(payload.releaseDate);
  objectWithKeys(payload.checks,CHECKS.map(check=>check.id),'checks');
  for(const check of CHECKS) if(typeof payload.checks[check.id]!=='boolean') throw new InputError(`checks.${check.id} must be true or false.`);
  return {releaseName,version,owner,releaseDate,checks:{...payload.checks}};
}

function relativeDate(iso,days) {
  const date=new Date(`${iso}T12:00:00.000Z`); date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
}

export function assessRelease(payload) {
  const input=validateAssessment(payload);
  const completed=CHECKS.filter(check=>input.checks[check.id]).length;
  const score=Math.round(completed/CHECKS.length*100);
  const blockers=CHECKS.filter(check=>check.critical && !input.checks[check.id]).map(({id,label,category})=>({id,label,category}));
  const categories=CATEGORIES.map(category=>{
    const members=CHECKS.filter(check=>check.category===category.id);
    const done=members.filter(check=>input.checks[check.id]).length;
    return {...category,completed:done,total:members.length,score:Math.round(done/members.length*100)};
  });
  const status=blockers.length?'Hold for blockers':completed===CHECKS.length?'Ready to rehearse':'Needs attention';
  const recommendation=blockers.length?`Resolve ${blockers.length} critical ${blockers.length===1?'check':'checks'} before rehearsing the release.`:completed===CHECKS.length?'All planning checks are complete. Rehearse your deployment and observe the result.':`Complete the remaining ${CHECKS.length-completed} ${CHECKS.length-completed===1?'check':'checks'} and review the plan with your team.`;
  const timeline=[
    {phase:'prepare',date:relativeDate(input.releaseDate,-2),title:'Prepare the handover',description:'Review outstanding checks, release notes and recovery instructions.'},
    {phase:'rehearse',date:relativeDate(input.releaseDate,-1),title:'Rehearse the release',description:'Run the pipeline in a test environment and verify the health checks.'},
    {phase:'release',date:input.releaseDate,title:'Planned release window',description:'Use your approved deployment process; this planning tool does not deploy software.'},
    {phase:'observe',date:relativeDate(input.releaseDate,1),title:'Observe and learn',description:'Review metrics, support feedback and the release outcome.'}
  ];
  return {releaseName:input.releaseName,version:input.version,owner:input.owner,releaseDate:input.releaseDate,score,status,completed,total:CHECKS.length,blockers,categories,timeline,recommendation};
}
