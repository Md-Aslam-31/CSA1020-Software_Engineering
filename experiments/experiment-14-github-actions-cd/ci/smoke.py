"""Test the exact runtime image locally before any registry publication."""
import json
import os
from pathlib import Path
import re
import subprocess
import time


def docker(*args, check=True):
    return subprocess.run(['docker', *args], check=check, capture_output=True, text=True, timeout=40)


def main():
    image = os.environ['RELEASE_IMAGE']
    suffix = re.sub(r'[^a-zA-Z0-9_.-]', '-', os.environ.get('GITHUB_RUN_ID', os.environ['BUILD_NUMBER']))
    name = 'focuslane-exp14-smoke-' + suffix
    script = r'''
      const assert = require('node:assert/strict');
      (async()=>{
        const base='http://127.0.0.1:8000';
        const get=path=>fetch(base+path,{signal:AbortSignal.timeout(5000)});
        const health=await get('/healthz');assert.equal(health.status,200);
        const vr=await get('/api/version');assert.equal(vr.status,200);
        const version=(await vr.json()).data;
        assert.equal(version.application,'FocusLane');
        assert.equal(version.gitSha,process.env.EXPECTED_SOURCE_SHA);
        assert.equal(String(version.buildNumber),process.env.EXPECTED_BUILD_NUMBER);
        const body={planName:'Exam preparation',startDate:'2026-11-02',dailyMinutes:90,horizonDays:3,
          subjects:[{id:'math',name:'Mathematics',minutes:90,priority:'medium'},
                    {id:'cs',name:'Computer Science',minutes:120,priority:'high'},
                    {id:'writing',name:'Writing',minutes:45,priority:'low'}]};
        const post=payload=>fetch(base+'/api/plan',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify(payload),signal:AbortSignal.timeout(5000)});
        const response=await post(body);assert.equal(response.status,200);
        const plan=(await response.json()).data;
        assert.equal(plan.totalTargetMinutes,255);assert.equal(plan.plannedMinutes,255);
        assert.equal(plan.remainingMinutes,0);assert.equal(plan.totalCapacityMinutes,270);
        assert.equal(plan.utilizationPercent,94);
        assert.deepEqual(plan.days.map(day=>day.plannedMinutes),[90,90,75]);
        assert.deepEqual(plan.days.map(day=>day.date),['2026-11-02','2026-11-03','2026-11-04']);
        assert.equal(plan.days[0].sessions[0].subjectId,'cs');
        assert(plan.days.every(day=>day.plannedMinutes<=day.capacityMinutes));
        const invalid=await post({...body,dailyMinutes:0});assert.equal(invalid.status,400);
        console.log(JSON.stringify({healthHttpStatus:200,version,planHttpStatus:200,
          plannedMinutes:plan.plannedMinutes,dailyMinutes:plan.days.map(day=>day.plannedMinutes),
          highPriorityFirst:true,invalidInputHttpStatus:invalid.status}));
      })().catch(()=>{console.error('Container HTTP contract or expected build identity did not match.');process.exit(1)});
    '''
    try:
        docker('run', '-d', '--name', name, '--network', 'none', '--read-only',
               '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m', '--cap-drop', 'ALL',
               '--security-opt', 'no-new-privileges=true', '--memory', '128m', image)
        for _ in range(20):
            result = docker('exec', '-e', 'EXPECTED_SOURCE_SHA=' + os.environ['SOURCE_SHA'],
                            '-e', 'EXPECTED_BUILD_NUMBER=' + os.environ['BUILD_NUMBER'],
                            name, 'node', '-e', script, check=False)
            if result.returncode == 0:
                report = json.loads(result.stdout)
                Path('reports').mkdir(exist_ok=True)
                Path('reports/container-smoke.json').write_text(json.dumps(report, indent=2) + '\n')
                print('Runtime image passed HTTP health, expected identity, scheduling and validation checks.')
                return
            time.sleep(1)
        raise RuntimeError('Runtime image failed the HTTP contract or expected build identity checks.')
    finally:
        docker('rm', '-f', name, check=False)


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, ValueError, subprocess.SubprocessError):
        raise SystemExit('Container verification failed; publication is blocked.') from None
