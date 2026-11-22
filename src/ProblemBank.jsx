import React, { useEffect, useRef, useState } from 'react';
import { getProblem, inside, listProblems, overlaps, renderPreview, reviewGate, saveProblem, unconfiguredProvider } from './problemBank.js';
import './problem-bank.css';

const fields = [['x', 'X'], ['y', 'Y'], ['w', '너비'], ['h', '높이']];
const imageFormats = new Set(['image/png', 'image/jpeg', 'image/webp']);
const hwpxOrigin = /^http:\/\/127\.0\.0\.1:\d+$/;
const position = r => `X ${r.x}, Y ${r.y}, ${r.w} × ${r.h} px`;
const statusReason = status => status === 'retained' ? '정답 표시가 남아 있어요.' :
  status === 'unknown' ? '정답 표시 상태가 미확인이에요.' : '근거가 있는 자동 판정이 없어요.';

function useBlobUrl(blob) {
  const [current, setCurrent] = useState(null);
  useEffect(() => {
    if (!blob) { setCurrent(null); return; }
    const url = URL.createObjectURL(blob);
    setCurrent({ blob, url });
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  return current?.blob === blob ? current?.url : null;
}

export default function ProblemBank() {
  const [entries, setEntries] = useState([]);
  const [subjectFilter, setSubjectFilter] = useState('');
  const [selected, setSelected] = useState(null);
  const [source, setSource] = useState(null);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [answerStatus, setAnswerStatus] = useState('unknown');
  const [edits, setEdits] = useState(null);
  const [past, setPast] = useState([]);
  const [rect, setRect] = useState({});
  const [revision, setRevision] = useState(0);
  const [approval, setApproval] = useState(null);
  const [rendered, setRendered] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const drag = useRef(null);
  const mounted = useRef(false);
  const provider = unconfiguredProvider;
  const originalUrl = useBlobUrl(source?.file);
  const preview = rendered?.revision === revision ? rendered.blob : null;
  const previewUrl = useBlobUrl(preview);
  const decision = null; // No live provider runs in this local path.
  const gate = reviewGate({ revision, concerns: edits?.kept || [], answerStatus, decision, approvedRevision: approval });
  const canSave = !busy && preview && gate.canSave && title.trim() && subject.trim();

  useEffect(() => {
    mounted.current = true;
    listProblems().then(items => { if (mounted.current) setEntries(items); },
      () => { if (mounted.current) setError('저장된 문제 목록을 읽지 못했어요.'); });
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!source || !edits) return;
    let live = true;
    // The same blob that appears here is saved and sent to the local HWPX writer.
    Promise.resolve().then(() => renderPreview(source.image, edits.crop, edits.marks, edits.kept)).then(
      blob => { if (live) setRendered({ revision, blob }); },
      () => { if (live) setError('미리보기를 만들지 못했어요. 더 작은 이미지를 사용해 주세요.'); },
    );
    return () => { live = false; };
  }, [source, edits, revision]);

  function revise() {
    setApproval(null);
    setRevision(v => v + 1);
    setError('');
    setStatus('');
  }

  async function importImage(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    if (!imageFormats.has(file.type) || file.size > 20 * 1024 * 1024) {
      setError('20MB 이하의 PNG, JPEG, WebP 이미지를 선택해 주세요.');
      return;
    }
    setBusy(true);
    setError('');
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const w = image.naturalWidth, h = image.naturalHeight;
      if (!w || !h || Math.max(w, h) > 10000 || w * h > 16000000) {
        setError('한 변 10,000px 이하, 총 1,600만 픽셀 이하의 이미지를 선택해 주세요.');
        return;
      }
      const full = { x: 0, y: 0, w, h };
      setSource({ file, image, full });
      setSelected(null);
      setTitle(file.name.replace(/\.[^.]+$/, '').slice(0, 100));
      setAnswerStatus('unknown');
      setRect({});
      setPast([]);
      setEdits({ crop: full, marks: [], kept: [] });
      revise();
    } catch {
      setError('이미지를 읽지 못했어요. 파일 형식을 확인해 주세요.');
    } finally {
      URL.revokeObjectURL(url);
      setBusy(false);
    }
  }

  function apply(kind) {
    const nextRect = Object.fromEntries(fields.map(([key]) => [key, Number(rect[key])]));
    if (!Object.values(nextRect).every(Number.isInteger) || nextRect.w < 1 || nextRect.h < 1 || !inside(nextRect, source.full)) {
      setError('원본 이미지 안에 들어가는 영역을 지정해 주세요.');
      return;
    }
    let next = edits;
    if (kind === 'crop') {
      if (edits.kept.some(r => !inside(r, nextRect))) {
        setError('유지하기로 한 영역을 모두 포함해 잘라 주세요.');
        return;
      }
      next = { ...edits, crop: nextRect };
    } else if (!inside(nextRect, edits.crop)) {
      setError('현재 자르기 범위 안에 영역을 지정해 주세요.');
      return;
    } else if (kind === 'mask') {
      if (edits.kept.some(r => overlaps(r, nextRect))) {
        setError('원본 유지 영역과 겹쳐요. 인쇄를 보호하려면 제거 영역을 줄여 주세요.');
        return;
      }
      next = { ...edits, marks: [...edits.marks, nextRect] };
    } else {
      next = { ...edits, kept: [...edits.kept, nextRect] };
    }
    setPast([...past, edits]);
    setEdits(next);
    setAnswerStatus('unknown');
    revise();
  }

  function undo() {
    setEdits(past.at(-1));
    setPast(past.slice(0, -1));
    setAnswerStatus('unknown');
    revise();
  }

  function point(e) {
    const r = e.currentTarget.getBoundingClientRect();
    return [Math.max(0, Math.min(source.full.w, Math.round((e.clientX - r.left) * source.full.w / r.width))),
      Math.max(0, Math.min(source.full.h, Math.round((e.clientY - r.top) * source.full.h / r.height)))];
  }
  function selectRect(e) {
    if (!drag.current) return;
    const [x, y] = drag.current, [x2, y2] = point(e);
    setRect({ x: Math.min(x, x2), y: Math.min(y, y2), w: Math.abs(x - x2), h: Math.abs(y - y2) });
  }

  async function save() {
    if (!canSave) return;
    const entry = {
      id: crypto.randomUUID(), title: title.trim(), subject: subject.trim().normalize('NFC'),
      original: source.file, originalName: source.file.name, cleaned: preview,
      revision, approvedRevision: approval, reviewMode: gate.automatic ? 'automatic' : 'manual',
      answerStatus, automaticEligible: gate.automatic, decision, edits,
      savedAt: new Date().toISOString(),
    };
    setBusy(true);
    setError('');
    try {
      await saveProblem(entry);
      setEntries(current => [entry, ...current].map(({ id, title, subject, savedAt }) => ({ id, title, subject, savedAt })));
      setSubjectFilter('');
      setSelected(entry);
      setSource(null);
      setEdits(null);
      setRendered(null);
      setPast([]);
      setStatus('문제를 저장했어요.');
    } catch {
      setError('문제를 저장하지 못했어요. 저장 공간을 확인한 뒤 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  async function open(id) {
    setBusy(true);
    setError('');
    try { setSelected(await getProblem(id)); }
    catch { setError('저장된 문제를 읽지 못했어요.'); }
    finally { setBusy(false); }
  }

  const numericRect = Object.fromEntries(fields.map(([key]) => [key, Number(rect[key])]));
  const overlay = source && Object.values(numericRect).every(Number.isInteger) && numericRect.w > 0 && numericRect.h > 0 && inside(numericRect, source.full);
  const subjects = [...new Set(entries.map(item => item.subject))].sort((a, b) => a.localeCompare(b, 'ko'));
  return <section className="problem-bank" aria-labelledby="problem-bank-heading">
    <h2 id="problem-bank-heading">문제은행</h2>
    <p>문제 이미지를 가져와 여백과 표식을 정리하고 과목별로 저장하세요. 원본은 그대로 보관해요.</p>
    <p className="pb-note">{provider.name} 실시간 연동 미설정 · 이미지 편집과 HWPX 변환은 로컬에서만 수행해요. 기기 동기화에서 직접 클라우드에 복사하면 저장한 문제의 원본과 정리 이미지가 전송돼요.</p>
    <label>문제 이미지 <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={importImage} /></label>
    {error && <p role="alert" className="field-error">{error}</p>}
    {status && <p role="status">{status}</p>}
    {source && <fieldset disabled={busy} className="pb-edit">
      <legend>문제 정리</legend>
      <div className="pb-row">
        <label>문제 제목 <input value={title} maxLength={100} onChange={e => setTitle(e.target.value)} /></label>
        <label>과목 <input value={subject} maxLength={50} onChange={e => setSubject(e.target.value)} /></label>
      </div>
      <div className="pb-pair">
        <figure><figcaption>원본 · {source.full.w} × {source.full.h} px</figcaption>
          <div className="pb-source" onPointerDown={e => {
            if (e.button !== 0 || busy) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = point(e); selectRect(e);
          }} onPointerMove={selectRect} onPointerUp={e => { selectRect(e); drag.current = null; }}
            onPointerCancel={() => { drag.current = null; }}>
            {originalUrl && <img src={originalUrl} alt="원본 이미지" draggable={false} />}
            {overlay && <span className="pb-selection" style={{ left: `${100 * rect.x/source.full.w}%`, top: `${100 * rect.y/source.full.h}%`, width: `${100 * rect.w/source.full.w}%`, height: `${100 * rect.h/source.full.h}%` }} />}
          </div>
        </figure>
        <figure><figcaption>정리 미리보기 · {edits.crop.w} × {edits.crop.h} px</figcaption>
          {preview && previewUrl ? <img src={previewUrl} alt="정리 미리보기" /> : <p>미리보기 생성 중</p>}
        </figure>
      </div>
      <p>원본에서 드래그하거나 좌표를 입력하세요. 자르기는 선택한 사각형만 남겨요. 제거는 흰 배경 위에서 인쇄와 겹치지 않는 표식에만 사용하세요.</p>
      <div className="pb-row pb-coords">{fields.map(([key, label]) => <label key={key}>{`영역 ${label}`}
        <input type="number" min={key === 'w' || key === 'h' ? 1 : 0} step="1" value={rect[key] ?? ''} onChange={e => setRect({ ...rect, [key]: e.target.value })} />
      </label>)}</div>
      <div className="pb-row">
        <button onClick={() => apply('crop')}>이 영역으로 자르기</button>
        <button onClick={() => apply('mask')}>확실한 표식 제거</button>
        <button onClick={() => apply('keep')}>불확실 영역 원본 유지</button>
        <button disabled={!past.length} onClick={undo}>마지막 편집 취소</button>
      </div>
      <div className="pb-review">
        <h3>저장 전 검토</h3>
        <p>{gate.automatic ? '이 미리보기를 뒷받침하는 자동 판정 근거가 있어요.' : `검토 필요 · 자동 판정 근거 없음 (현재 미리보기 전체: ${position(edits.crop)})`}</p>
        {Boolean(edits.kept.length || edits.marks.length) && <ul>
          {edits.kept.map((r, i) => <li key={`keep${i}`}>인쇄와 겹치거나 표식인지 불확실: 원본 유지 · {position(r)}</li>)}
          {edits.marks.map((r, i) => <li key={`mask${i}`}>수동 표식 제거 · {position(r)}</li>)}
        </ul>}
        <div className="pb-row"><label>정답 표시 상태 <select value={answerStatus} onChange={e => {
          setAnswerStatus(e.target.value); setApproval(null);
        }}>
          <option value="unknown">미확인</option><option value="none">남은 정답 표시 없음</option>
          <option value="retained">정답 표시가 남아 있음 (자동 사용 제외)</option>
        </select></label></div>
        <div className="pb-row">
          {!gate.automatic && <button disabled={!preview || !previewUrl || approval === revision} onClick={() => setApproval(revision)}>현재 미리보기 승인</button>}
          {approval === revision && <span>현재 버전 승인됨</span>}
          <button className="pb-primary" disabled={!canSave} onClick={save}>최종 저장</button>
        </div>
      </div>
    </fieldset>}
    <section className="pb-list" aria-label="저장된 문제 목록">
      <h3>저장된 문제</h3>
      <label>과목 필터 <select value={subjectFilter} onChange={e => { setSubjectFilter(e.target.value); setSelected(null); }}>
        <option value="">전체 과목</option>{subjects.map(name => <option key={name}>{name}</option>)}
      </select></label>
      <ul>{entries.filter(item => !subjectFilter || item.subject === subjectFilter).map(item => <li key={item.id}>
        <button disabled={busy} aria-pressed={selected?.id === item.id} onClick={() => open(item.id)}>{item.title}</button> <span>{item.subject}</span>
      </li>)}</ul>
      {!entries.length && <p>저장된 문제가 없어요.</p>}
      {selected && <SavedProblem key={selected.id} entry={selected} />}
    </section>
  </section>;
}

function SavedProblem({ entry }) {
  const original = useBlobUrl(entry.original);
  const cleaned = useBlobUrl(entry.cleaned);
  const origin = window.location.origin;
  const endpoint = hwpxOrigin.test(origin) ? `${origin}/api/problem-hwpx` : null;
  const [capability, setCapability] = useState('checking');
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const filename = (entry.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '') || '문제');

  useEffect(() => {
    if (!endpoint) return;
    const controller = new AbortController();
    async function check() {
      let available = false;
      try {
        const response = await fetch(endpoint, {
          method: 'HEAD', mode: 'same-origin', redirect: 'error', cache: 'no-store', signal: controller.signal,
        });
        available = response.status === 204 && response.headers.get('X-Lean-Hwpx') === '1';
      } catch {
        // A missing, unreachable or redirected converter is unavailable.
      }
      if (!controller.signal.aborted) setCapability(available ? 'ready' : 'unavailable');
    }
    check();
    return () => controller.abort();
  }, [endpoint]);

  async function downloadHwpx() {
    if (!endpoint || window.location.origin !== origin || capability !== 'ready' || exporting) return;
    setExporting(true);
    setError('');
    try {
      const response = await fetch(endpoint, { method: 'POST', body: entry.cleaned, mode: 'same-origin', redirect: 'error' });
      if (!response.ok || response.headers.get('content-type') !== 'application/hwp+zip') throw new Error();
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filename}.hwpx`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch {
      setError('HWPX를 만들지 못했어요. 로컬 미리보기 서버의 LEAN_HWPX_PYTHON 설정을 확인해 주세요. 정리 이미지는 계속 다운로드할 수 있어요.');
    } finally { setExporting(false); }
  }
  return <article className="pb-saved">
    <h4>{entry.title}</h4>
    <p>과목: {entry.subject}</p>
    <p>{entry.automaticEligible ? '자동 사용 가능' : `자동 사용 제외 · ${statusReason(entry.answerStatus)}`}</p>
    <div className="pb-pair">
      <figure><figcaption>저장된 원본</figcaption>{original && <img src={original} alt="저장된 원본 이미지" />}</figure>
      <figure><figcaption>저장된 정리 이미지</figcaption>{cleaned && <img src={cleaned} alt="저장된 정리 이미지" />}</figure>
    </div>
    <div className="pb-row pb-downloads">
      {original && <a href={original} download={entry.originalName}>원본 이미지 다운로드</a>}
      {cleaned && <a href={cleaned} download={`${filename}.png`}>정리 이미지 다운로드</a>}
      <button disabled={!endpoint || capability !== 'ready' || exporting} onClick={downloadHwpx}>HWPX 다운로드</button>
    </div>
    {!endpoint ? <p className="pb-note">HWPX는 이 PC의 로컬 Vite 서버(http://127.0.0.1)에서만 변환하고 다운로드할 수 있어요.</p>
      : capability === 'checking' ? <p className="pb-note">로컬 HWPX 변환기를 확인하고 있어요.</p>
      : capability === 'unavailable' ? <p className="pb-note">로컬 HWPX 변환기를 사용할 수 없어요. Vite 서버의 LEAN_HWPX_PYTHON 설정을 확인해 주세요. 이미지 다운로드는 계속 사용할 수 있어요.</p>
      : null}
    {error && <p role="alert" className="field-error">{error}</p>}
  </article>;
}
