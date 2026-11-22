import { RECORDS_KEY } from './records.js';
import { STORAGE_KEY } from './quotes.js';
import { problemIds, getProblem, stageProblems } from './problemBank.js';
import { pointerKey, registry, assertActive, profileKey, workspaceStorage, workspaceLock } from './workspaceStorage.js';
export { workspaceStorage, registry };

const readDocuments = () => ({records:workspaceStorage.getItem(RECORDS_KEY), quotes:workspaceStorage.getItem(STORAGE_KEY)});

export async function localGuard() {
  assertActive();
  // Problem entries are immutable and add-only; IDs identify the exact set.
  const ids = await problemIds();
  assertActive();
  return { ids, ...readDocuments() };
}

export const captureLocal = (guard) => workspaceLock(async () => {
  const current = await localGuard();
  if (guard) checkGuard(guard, current);
  const {ids, ...docs} = current;
  // Yield one immutable entry at a time, so an over-budget bank does not all
  // have to be read into memory before encoding rejects it.
  return {...docs, problems:(async function* () { for (const id of ids) yield await getProblem(id); })()};
});

function checkGuard(expected, actual) {
  if (!expected || JSON.stringify(expected) !== JSON.stringify(actual))
    throw new Error('이 브라우저의 데이터가 바뀌었어요. 다시 비교해 주세요.');
}
export const requireUnchanged = async guard => checkGuard(guard, await localGuard());

// Keep all participating local writers out until the inspected upload finishes.
export const withUnchangedLocal = (guard, run) => workspaceLock(async () => {
  await requireUnchanged(guard);
  return run();
});

function activate(id, backups) {
  assertActive();
  localStorage.setItem(pointerKey, JSON.stringify({id, backups, epoch:crypto.randomUUID()}));
}
const backup = id => ({id, at:new Date().toISOString()});

export const importLocal = (data, expected, {verifyRemote, afterActivate} = {}) => workspaceLock(async () => {
  await requireUnchanged(expected);
  const id = crypto.randomUUID();
  const keys = [[RECORDS_KEY,data.records],[STORAGE_KEY,data.quotes]];
  try {
    for (const [key, raw] of keys) if (raw !== null) localStorage.setItem(profileKey(id, key), raw);
    await stageProblems(id, data.problems);
    await requireUnchanged(expected);
    if (verifyRemote) await verifyRemote();
    // The lock keeps local problem IDs stable; recheck the documents and epoch
    // without yielding again after the remote check.
    checkGuard(expected, {ids:expected.ids, ...readDocuments()});
    const current = registry();
    activate(id, [backup(current.id), ...current.backups]);
  } catch (error) {
    for (const [key] of keys) { try { localStorage.removeItem(profileKey(id, key)); } catch {} }
    if (data.problems.length) {
      try { indexedDB.deleteDatabase(profileKey(id, 'lean-problem-bank')); } catch {}
    }
    throw error;
  }
  // A baseline is only a hint. Never discard the active copy if recording it fails.
  try { afterActivate?.(id); } catch {}
  return id;
});

export const restoreLocal = id => workspaceLock(() => {
  const current = registry();
  if (!current.backups.some(b => b.id === id)) throw new Error('백업이 없어요.');
  activate(id, [backup(current.id), ...current.backups.filter(b => b.id !== id)]);
});
