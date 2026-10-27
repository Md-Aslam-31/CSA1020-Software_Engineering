import test from 'node:test';
import assert from 'node:assert/strict';
import {validateItems,resolveNow} from '../modules/validation.mjs';

test('catalog validation rejects duplicate equipment identities',()=>{
  const item={id:'camera',name:'Camera',category:'Video',description:'Studio camera',total:3};
  assert.throws(()=>validateItems([item,{...item}]),/invalid or duplicate/);
});
test('time validation rejects invalid dates and preserves the supplied instant',()=>{
  assert.throws(()=>resolveNow('invalid-date'),/not valid/);
  assert.equal(resolveNow('2026-10-26T12:00:00Z').toISOString(),'2026-10-26T12:00:00.000Z');
});
