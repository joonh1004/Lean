import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewGate } from '../src/problemBank.js';

const current = { revision: 2, concerns: [], answerStatus: 'none', approvedRevision: null };
const clean = { status: 'clean', revision: 2, evidence: ['pixel comparison'], concerns: [], inferred: false, overlappingPrint: false };

test('only evidence for the exact clean revision allows bypass', () => {
  assert.deepEqual(reviewGate({ ...current, decision: clean }), { automatic: true, canSave: true });
  for (const decision of [undefined, { ...clean, status: 'failed' }, { ...clean, evidence: [] },
    { ...clean, revision: 1 }, { ...clean, inferred: true }, { ...clean, overlappingPrint: true },
    { ...clean, concerns: ['uncertain'] }]) {
    assert.deepEqual(reviewGate({ ...current, decision }), { automatic: false, canSave: false });
  }
});

test('kept regions and answer marks require exact revision approval and cannot auto qualify', () => {
  for (const state of [{ concerns: [{ x: 3 }] }, { answerStatus: 'retained' }, { answerStatus: 'unknown' }]) {
    assert.deepEqual(reviewGate({ ...current, ...state, decision: clean, approvedRevision: 2 }),
      { automatic: false, canSave: true });
    assert.deepEqual(reviewGate({ ...current, ...state, decision: clean, approvedRevision: 1 }),
      { automatic: false, canSave: false });
  }
});
