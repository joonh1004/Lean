import React, { useRef, useState } from 'react';
import { captureLocal, importLocal, localGuard, registry, restoreLocal, withUnchangedLocal } from './syncLocal.js';
import { createSyncRemote, decodeSnapshot, digest, encodeSnapshot, syncStatus } from './syncProtocol.js';
import config from 'virtual:lean-sync-config';
import './sync.css';

const supported = () => window.isSecureContext && navigator.locks && crypto.subtle && window.indexedDB;
const statusText = {
  empty:'클라우드에 아직 저장된 작업공간이 없어요.',
  same:'이 브라우저와 클라우드가 같아요.',
  local:'이 브라우저의 저장된 내용이 변경됐어요.',
  cloud:'클라우드에 더 새 버전이 있어요.',
  conflict:'두 복사본이 다르거나 공통 기준이 없어요. 자동으로 합치지 않아요.',
  unreadable:'현재 클라우드 복사본을 읽을 수 없어요. 일반 전송과 다운로드는 차단했어요.',
};
function readable(payload) {
  if (payload === null) return false;
  try { decodeSnapshot(payload); return true; }
  catch { return false; }
}
const keyFor = (owner, id) => `lean.sync.base.v1.${config.url}.${owner}.${id}`;
function readBase(owner) {
  try { return JSON.parse(localStorage.getItem(keyFor(owner, registry().id))); }
  catch { return null; }
}
function remember(owner, id, revision, payload) {
  // This is only a comparison hint: lack of storage must not hide a completed write.
  try { localStorage.setItem(keyFor(owner, id), JSON.stringify({revision, payload})); } catch {}
}
function saveFile(payload) {
  const url = URL.createObjectURL(new Blob([payload], {type:'application/json'}));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'lean-cloud-backup.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export default function SyncPanel() {
  const dialog = useRef(null), client = useRef(null), working = useRef(false);
  const [user, setUser] = useState(null), [busy, setBusy] = useState(false);
  const [comparison, setComparison] = useState(null), [message, setMessage] = useState(''), [error, setError] = useState('');
  let backups = [];
  try { backups = registry().backups; } catch {}

  async function run(action, onError) {
    if (working.current) return;
    working.current = true;
    setBusy(true); setError(''); setMessage('');
    try { await action(); }
    catch (err) { onError?.(); setError(err instanceof Error ? err.message : '동기화 요청을 완료하지 못했어요. 다시 비교해 주세요.'); }
    finally { working.current = false; setBusy(false); }
  }
  async function signIn(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const inputs = new FormData(form);
    form.reset();
    await run(async () => {
      const { createClient } = await import('@supabase/supabase-js');
      client.current ||= createClient(config.url, config.key, {
        auth:{persistSession:false, detectSessionInUrl:false, autoRefreshToken:true},
        db:{timeout:30000},
      });
      const {data, error} = await client.current.auth.signInWithPassword({email:inputs.get('email').trim(), password:inputs.get('password')});
      if (error || !data.user) throw new Error('로그인하지 못했어요. 계정과 연결 상태를 확인해 주세요.');
      setUser(data.user);
      setComparison(null);
      setMessage('로그인했어요. 비교 또는 전송을 직접 선택하세요.');
    });
  }
  async function signOut() {
    await run(async () => {
      const {error} = await client.current.auth.signOut({scope:'local'});
      if (error) throw new Error('로그아웃 요청이 실패했어요. 탭을 닫거나 새로고침하면 이 탭의 세션이 종료돼요.');
      setUser(null); setComparison(null);
      setMessage('로그아웃했어요. 이 브라우저에 저장된 내용은 그대로예요.');
    });
  }
  const remote = () => createSyncRemote(client.current);
  const invalidate = () => setComparison(null);

  async function compare() {
    invalidate();
    await run(async () => {
      const [cloud, guard] = await Promise.all([remote().read(user.id), localGuard()]);
      const unreadable = cloud.payload !== null && !readable(cloud.payload);
      let previous = null;
      if (unreadable) {
        const backup = await remote().previous(user.id, cloud.revision);
        if (readable(backup)) previous = backup;
      }
      let localPayload = null, localError = '';
      try { localPayload = await encodeSnapshot(await captureLocal(guard)); }
      catch (err) { localError = err.message; }
      const cloudHash = unreadable ? null : await digest(cloud.payload);
      const localHash = await digest(localPayload);
      const status = await withUnchangedLocal(guard, () => {
        const result = unreadable ? 'unreadable' : syncStatus(readBase(user.id), {...cloud, payload:cloudHash}, localHash);
        if (result === 'same') remember(user.id, registry().id, cloud.revision, cloudHash);
        return result;
      });
      setComparison({owner:user.id, cloud, cloudHash, guard, localPayload, localError, previous, status});
    });
  }
  async function send(source) {
    const {cloud, guard, localPayload, previous, status} = comparison;
    const repair = status === 'unreadable';
    if (source === 'previous' && !repair) return;
    const payload = source === 'previous' ? previous : localPayload;
    if (payload === null) return;
    const confirmText = repair
      ? `읽을 수 없는 클라우드 버전 ${cloud.revision}을 ${source === 'previous' ? '검증된 이전 클라우드 백업' : '이 브라우저의 저장된 복사본(문제 원본 포함)'}으로 교체해 복구할까요? 이전 클라우드 백업과 이 브라우저의 데이터는 그대로 둡니다.`
      : cloud.payload === null
        ? '저장된 작업공간 전체(문제 원본 포함)를 Supabase에 처음 복사할까요?'
        : '클라우드 작업공간 전체를 이 브라우저의 복사본으로 교체할까요? 직전 클라우드 복사본 하나만 백업됩니다.';
    if (!window.confirm(confirmText)) return;
    await run(() => withUnchangedLocal(guard, async () => {
      const api = remote();
      const hash = await digest(payload);
      const revision = await api[repair ? 'repair' : 'write'](user.id, cloud.revision, payload);
      if (revision === null) throw new Error('다른 기기가 먼저 저장했어요. 덮어쓰지 않았습니다. 다시 비교해 주세요.');
      if (revision !== cloud.revision + 1) throw new Error('저장 결과를 확인하지 못했어요. 다시 비교해 주세요.');
      const result = await api.read(user.id);
      if (result.revision !== revision || result.payload !== payload)
        throw new Error('전송 이후 클라우드가 바뀌었거나 확인할 수 없어요. 다시 비교해 주세요.');
      if (source === 'local') remember(user.id, registry().id, revision, hash);
      invalidate();
      setMessage(`클라우드 버전 ${revision} ${repair ? '복구' : '저장'}를 확인했어요.`);
    }), invalidate);
  }
  async function download() {
    const {owner, cloud, cloudHash, guard} = comparison;
    if (!window.confirm('저장하지 않은 편집은 사라져요. 지금 저장된 작업공간은 로컬 백업으로 남기고, 비교한 클라우드 버전을 열까요?')) return;
    await run(async () => {
      const verifyAccount = async () => {
        const {data, error} = await client.current.auth.getSession();
        if (error || user.id !== owner || data?.session?.user?.id !== owner)
          throw new Error('동기화 계정을 확인하지 못했어요. 다시 로그인하고 비교해 주세요.');
      };
      await importLocal(decodeSnapshot(cloud.payload), guard, {
        verifyRemote: async () => {
          await verifyAccount();
          const current = await remote().read(owner);
          if (current.revision !== cloud.revision || current.payload !== cloud.payload)
            throw new Error('클라우드가 바뀌었어요. 다시 비교해 주세요.');
          await verifyAccount();
        },
        afterActivate: id => remember(owner, id, cloud.revision, cloudHash),
      });
      location.reload();
    }, invalidate);
  }
  async function savePrevious() {
    await run(async () => {
      const payload = await remote().previous(user.id);
      if (payload === null) { setMessage('이전 클라우드 백업이 아직 없어요.'); return; }
      saveFile(payload);
      setMessage('이전 클라우드 백업 파일을 내보냈어요. 개인 정보가 포함돼 있어요.');
    });
  }

  return <>
    <button type="button" className="sync-launch" onClick={() => dialog.current.showModal()}>기기 동기화</button>
    <dialog ref={dialog} className="sync-panel" aria-labelledby="sync-title"
      onCancel={event => { if (working.current) event.preventDefault(); }}>
      <header><h2 id="sync-title">기기 동기화</h2>
        <button type="button" disabled={busy} onClick={() => dialog.current.close()}>닫기</button></header>
      <p>수동 동기화 · 저장된 캘린더, 메모, 링크, 폴더, 명언, 문제은행 원본 및 정리 이미지가 포함돼요. 저장하지 않은 편집은 포함되지 않아요.</p>
      <p>전송하거나 복원하기 전에 편집을 저장하고 이 앱의 다른 탭을 닫아 주세요.</p>
      {!supported() ? <p>동기화에는 HTTPS(또는 로컬 주소)와 최신 브라우저가 필요해요.</p>
      : !config ? <p>이 빌드에는 클라우드 설정이 없어요. 브라우저 저장은 그대로 사용해요.</p>
      : !user ? <form onSubmit={signIn}>
        <p>이 빌드에 연결된 Supabase 프로젝트의 소유자 계정으로 로그인하세요.</p>
        <label>이메일 <input type="email" name="email" autoComplete="username" required disabled={busy}/></label>
        <label>비밀번호 <input type="password" name="password" autoComplete="current-password" required disabled={busy}/></label>
        <button disabled={busy}>로그인</button>
      </form> : <>
        <p>계정: {user.email || user.id}</p>
        <div className="sync-actions">
          <button onClick={compare} disabled={busy}>저장된 복사본 비교</button>
          <button onClick={savePrevious} disabled={busy}>이전 클라우드 백업 파일 저장</button>
          <button onClick={signOut} disabled={busy}>로그아웃</button>
        </div>
        {comparison && <section aria-label="비교 결과">
          <p role="status">{statusText[comparison.status]} (클라우드 버전 {comparison.cloud.revision})</p>
          {comparison.localError && <p role="alert">이 브라우저에서 전송할 수 없어요: {comparison.localError}</p>}
          <div className="sync-actions">
            {comparison.status === 'unreadable' ? <>
              {comparison.previous !== null && <button onClick={() => send('previous')} disabled={busy}>이전 클라우드 백업으로 클라우드 복구</button>}
              {comparison.localPayload !== null && <button onClick={() => send('local')} disabled={busy}>이 브라우저 복사본으로 클라우드 복구</button>}
              {comparison.previous === null && comparison.localPayload === null && <p>복구에 사용할 수 있는 복사본이 없어요.</p>}
            </> : <>
            {comparison.localPayload !== null && !['same','cloud'].includes(comparison.status) && <button onClick={() => send('local')} disabled={busy}>
              {comparison.status === 'empty' ? '클라우드에 처음 복사' : '이 브라우저 복사본을 클라우드에 저장'}
            </button>}
            {comparison.cloud.payload !== null && comparison.status !== 'same' && <button onClick={download} disabled={busy}>이 브라우저 백업 후 클라우드 복사본 열기</button>}
            </>}
          </div>
        </section>}
      </>}
      {supported() && backups.length > 0 && <section aria-label="로컬 백업">
        <h3>이 브라우저의 백업</h3>
        {backups.map(({id,at}) => <button key={id} disabled={busy} onClick={() => {
          if (window.confirm('저장하지 않은 편집은 사라져요. 현재 작업공간을 백업하고 선택한 로컬 백업을 열까요?'))
            run(async () => { await restoreLocal(id); location.reload(); });
        }}>{new Date(at).toLocaleString()} · {id === 'legacy' ? '기존 브라우저 데이터' : id.slice(0,8)} 열기</button>)}
      </section>}
      {busy && <p role="status">처리 중…</p>}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </dialog>
  </>;
}
