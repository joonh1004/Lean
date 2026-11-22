import { parseRecords } from './records.js';
import { parseState } from './quotes.js';

const maxImage = 2 * 1024 * 1024;
const maxSnapshot = 8 * 1024 * 1024;
const formats = new Set(['image/png', 'image/jpeg', 'image/webp']);
const encoder = new TextEncoder();
const invalid = () => new Error('스냅샷 데이터 형식이 올바르지 않아요.');
const tooLarge = () => new Error('동기화 스냅샷은 8 MiB 이하여야 해요.');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validText = value => typeof value === 'string' && !!value.trim();

function validateDocuments(records, quotes) {
  for (const [raw, parse] of [[records, parseRecords], [quotes, parseState]]) {
    if (raw === null) continue;
    if (typeof raw !== 'string') throw invalid();
    if (raw.length > maxSnapshot) throw tooLarge();
    try { parse(raw); } catch { throw invalid(); }
  }
}

function imageType(type, field) {
  return formats.has(type) && (field !== 'cleaned' || type === 'image/png');
}

async function encodeImage(blob, field) {
  if (!(blob instanceof Blob) || !blob.size || !imageType(blob.type, field)) throw invalid();
  if (blob.size > maxImage) throw new Error('동기화 이미지는 각각 2 MiB 이하여야 해요.');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return { type:blob.type, data:btoa(binary), ...(typeof blob.name === 'string' && { name:blob.name, lastModified:blob.lastModified }) };
}

function decodeImage(value, field) {
  if (!object(value) || !imageType(value.type, field) || !validText(value.data) || value.data.length > Math.ceil(maxImage / 3) * 4) throw invalid();
  let bytes;
  try {
    const binary = atob(value.data);
    if (btoa(binary) !== value.data || !binary.length || binary.length > maxImage) throw invalid();
    bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  } catch { throw invalid(); }
  if (Object.hasOwn(value, 'name')) {
    if (typeof value.name !== 'string' || !Number.isSafeInteger(value.lastModified)) throw invalid();
    return new File([bytes], value.name, { type:value.type, lastModified:value.lastModified });
  }
  return new Blob([bytes], {type:value.type});
}

function validateProblems(problems) {
  if (!Array.isArray(problems) || !problems.every(entry => object(entry) &&
    validText(entry.id) && validText(entry.title) && typeof entry.subject === 'string' && validText(entry.savedAt)) ||
    new Set(problems.map(p => p.id)).size !== problems.length) throw invalid();
}

export async function encodeSnapshot({ records, quotes, problems }) {
  validateDocuments(records, quotes);
  const header = {version:1, records, quotes, problems:[]};
  let size = encoder.encode(JSON.stringify(header)).length;
  if (size > maxSnapshot) throw tooLarge();
  for await (const { original, cleaned, ...metadata } of problems) {
    const entry = { ...metadata, original:await encodeImage(original, 'original'), cleaned:await encodeImage(cleaned, 'cleaned') };
    size += encoder.encode(JSON.stringify(entry)).length + (header.problems.length ? 1 : 0);
    if (size > maxSnapshot) throw tooLarge();
    header.problems.push(entry);
  }
  validateProblems(header.problems);
  return JSON.stringify(header);
}

export function decodeSnapshot(payload, { images = true } = {}) {
  if (typeof payload !== 'string') throw invalid();
  if (payload.length > maxSnapshot || encoder.encode(payload).length > maxSnapshot) throw tooLarge();
  let value;
  try { value = JSON.parse(payload); } catch { throw invalid(); }
  if (value?.version !== 1) throw new Error('지원하지 않는 동기화 스냅샷 버전이에요.');
  validateDocuments(value.records, value.quotes);
  validateProblems(value.problems);
  if (images) value.problems = value.problems.map(({ original, cleaned, ...meta }) => ({
    ...meta, original:decodeImage(original, 'original'), cleaned:decodeImage(cleaned, 'cleaned'),
  }));
  return value;
}

export async function digest(payload) {
  if (payload === null) return null;
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(payload));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function syncStatus(base, cloud, local) {
  if (cloud.payload === null) return 'empty';
  if (local === cloud.payload) return 'same';
  if (!base || local === null) return 'conflict';
  if (base.revision === cloud.revision && base.payload === cloud.payload) return 'local';
  return local === base.payload ? 'cloud' : 'conflict';
}

export function syncConfig(url, key) {
  if (typeof url !== 'string' || url !== url.trim() || !/^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.supabase\.co\/?$/.test(url) ||
    typeof key !== 'string' || key !== key.trim() || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return null;
  return {url:url.replace(/\/$/, ''), key};
}

export function createSyncRemote(client) {
  async function send(method, owner, revision, payload) {
    decodeSnapshot(payload);
    const {data, error} = await client.rpc(method, {
      expected_owner:owner, expected_revision:revision, next_payload:payload,
    });
    if (error) throw error;
    return data;
  }
  return {
    async read(owner) {
      const {data, error} = await client.from('lean_sync_workspace').select('revision,payload').eq('owner_id', owner).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('이 계정의 동기화가 설정되지 않았어요.');
      if (!Number.isSafeInteger(data.revision) || data.revision < 0 ||
        (data.revision === 0 ? data.payload !== null : typeof data.payload !== 'string')) throw invalid();
      return data;
    },
    async previous(owner, revision) {
      let query = client.from('lean_sync_workspace').select('previous_payload').eq('owner_id', owner);
      if (revision !== undefined) query = query.eq('revision', revision);
      const {data, error} = await query.maybeSingle();
      if (error) throw error;
      if (!data && revision !== undefined) throw new Error('클라우드가 바뀌었어요. 다시 비교해 주세요.');
      if (!data) throw new Error('이 계정의 동기화가 설정되지 않았어요.');
      return data.previous_payload;
    },
    write: (owner, revision, payload) => send('lean_sync_write', owner, revision, payload),
    repair: (owner, revision, payload) => send('lean_sync_repair', owner, revision, payload),
  };
}
