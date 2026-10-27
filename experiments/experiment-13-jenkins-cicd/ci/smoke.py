"""Exercise the built runtime through HTTP inside an isolated temporary container."""
import json
import os
from pathlib import Path
import subprocess
import time


def docker(*args, check=True):
    return subprocess.run(['docker', *args], check=check, text=True, capture_output=True)


def main():
    image = os.environ['RELEASE_IMAGE']
    name = 'releaseharbor-smoke-' + os.environ['BUILD_NUMBER']
    script = r'''
      const assert = require('node:assert/strict');
      (async()=>{
        const base='http://127.0.0.1:8000';
        const health=await fetch(base+'/healthz');
        assert.equal(health.status,200);
        const version=(await (await fetch(base+'/api/version')).json()).data;
        assert.equal(version.gitSha,process.env.EXPECTED_SOURCE_SHA);
        assert.equal(version.buildNumber,process.env.EXPECTED_BUILD_NUMBER);
        const checks=Object.fromEntries(['tests','codeReview','build','dependencies','secrets','access','backup','monitoring','rollback','runbook','notes','support'].map(id=>[id,true]));
        const body={releaseName:'Harbor launch',version:'1.0.0',owner:'Demo team',releaseDate:'2026-11-02',checks};
        const post=payload=>fetch(base+'/api/assess',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        const ready=await post(body); assert.equal(ready.status,200);
        const result=(await ready.json()).data; assert.equal(result.score,100);assert.equal(result.blockers.length,0);
        checks.tests=false;
        const blocked=(await (await post(body)).json()).data; assert.equal(blocked.blockers.length,1);assert.equal(blocked.status,'Hold for blockers');
        const invalid=await post({...body,version:'not-semver'});assert.equal(invalid.status,400);
        console.log(JSON.stringify({healthHttpStatus:200,version,readyScore:result.score,criticalBlockersAfterToggle:blocked.blockers.length,invalidInputHttpStatus:invalid.status}));
      })().catch(error=>{console.error(error.message);process.exit(1)});
    '''
    try:
        docker('run', '-d', '--name', name, '--network', 'none', '--read-only',
               '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m', '--cap-drop', 'ALL',
               '--security-opt', 'no-new-privileges:true', '--memory', '128m', image)
        last = None
        for attempt in range(20):
            result = docker('exec', '-e', 'EXPECTED_SOURCE_SHA=' + os.environ['SOURCE_SHA'],
                            '-e', 'EXPECTED_BUILD_NUMBER=' + os.environ['BUILD_NUMBER'],
                            name, 'node', '-e', script, check=False)
            if result.returncode == 0:
                report = json.loads(result.stdout)
                Path('reports/container-smoke.json').write_text(json.dumps(report, indent=2) + '\n')
                print('Container HTTP smoke test passed: health, build identity, readiness assessment, blockers and validation.')
                return
            last = result.stderr.strip()
            time.sleep(1)
        raise RuntimeError('Runtime smoke checks failed: ' + str(last)[:300])
    finally:
        docker('rm', '-f', name, check=False)


if __name__ == '__main__':
    main()
