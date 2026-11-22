export const unconfiguredProvider = Object.freeze({ name: 'Codex', status: 'unconfigured' });

// A provider decision must describe the same rendered revision, with evidence and no concerns.
// Missing, failed, inferred or overlapping decisions never authorize unattended saving.
export function reviewGate({ revision, concerns, answerStatus, decision, approvedRevision }) {
  const automatic = answerStatus === 'none' && concerns.length === 0 &&
    decision?.status === 'clean' && decision.revision === revision &&
    Array.isArray(decision.evidence) && decision.evidence.some(item => typeof item === 'string' && item.trim()) &&
    Array.isArray(decision.concerns) && decision.concerns.length === 0 &&
    decision.inferred === false && decision.overlappingPrint === false;
  return { automatic, canSave: automatic || approvedRevision === revision };
}

export function inside(inner, outer) {
  return inner.x >= outer.x && inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

export function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function renderPreview(source, crop, marks, kept) {
  const canvas = document.createElement('canvas');
  canvas.width = crop.w;
  canvas.height = crop.h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
  ctx.fillStyle = '#fff';
  for (const r of marks) ctx.fillRect(r.x - crop.x, r.y - crop.y, r.w, r.h);
  for (const r of kept) {
    ctx.clearRect(r.x - crop.x, r.y - crop.y, r.w, r.h);
    ctx.drawImage(source, r.x, r.y, r.w, r.h, r.x - crop.x, r.y - crop.y, r.w, r.h);
  }
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (blob) resolve(blob);
    else reject(new Error('미리보기 이미지를 만들지 못했어요.'));
  }, 'image/png'));
}

function openBank() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('lean-problem-bank', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('problems', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction(mode, perform) {
  const db = await openBank();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('problems', mode);
      const request = perform(tx.objectStore('problems'));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error || request.error);
    });
  } finally {
    db.close();
  }
}

export const saveProblem = entry => transaction('readwrite', store => store.add(entry));
export const listProblems = async () => {
  // Keep the list in React state free of media blobs.
  const db = await openBank();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('problems', 'readonly');
      const items = [];
      tx.objectStore('problems').openCursor().onsuccess = event => {
        const cursor = event.target.result;
        if (!cursor) return;
        const { id, title, subject, savedAt } = cursor.value;
        items.push({ id, title, subject, savedAt });
        cursor.continue();
      };
      tx.oncomplete = () => resolve(items.sort((a, b) => b.savedAt.localeCompare(a.savedAt)));
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
};
export const getProblem = id => transaction('readonly', store => store.get(id));
