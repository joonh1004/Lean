// Keep the original workspace untouched; downloaded workspaces start in a new
// namespace and become visible only after all writes finish, via one pointer.
export const pointerKey = 'lean.sync.workspace.v1';
const legacy = 'legacy';
const validId = id => id === legacy || (typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id));
function readPointer(raw) {
  if (raw === null) return {id:legacy, backups:[]};
  const value = JSON.parse(raw);
  if (!validId(value?.id) || !validId(value.epoch) || !Array.isArray(value.backups) ||
    !value.backups.every(b => validId(b?.id) && typeof b.at === 'string') ||
    new Set([value.id, ...value.backups.map(b => b.id)]).size !== 1 + value.backups.length) {
    throw new Error('로컬 작업공간 설정을 읽을 수 없어요.');
  }
  return value;
}
let initialPointer, initialError;
try { initialPointer = typeof window === 'undefined' ? null : localStorage.getItem(pointerKey); }
catch (error) { initialError = error; }
export function registry() {
  if (initialError) throw initialError;
  return readPointer(initialPointer);
}
export function assertActive() {
  if (initialError) throw initialError;
  if (localStorage.getItem(pointerKey) !== initialPointer) throw new Error('작업공간이 바뀌었어요. 이 탭을 새로고침해 주세요.');
}
export function profileKey(id, key) { return id === legacy ? key : `lean.profile.${id}.${key}`; }
export const workspaceStorage = {
  getItem: key => localStorage.getItem(profileKey(registry().id, key)),
  setItem(key, value) { assertActive(); localStorage.setItem(profileKey(registry().id, key), value); },
  removeItem(key) { assertActive(); localStorage.removeItem(profileKey(registry().id, key)); },
};
export function workspaceLock(run) {
  if (!navigator.locks) throw new Error('이 브라우저는 안전한 작업공간 변경을 지원하지 않아요.');
  return navigator.locks.request('lean-workspace-change-v1', run);
}

// Only synchronous localStorage transactions can use the browser-only fallback.
export function localWrite(run) {
  const guarded = () => { assertActive(); return run(); };
  return navigator.locks ? workspaceLock(guarded) : guarded();
}
