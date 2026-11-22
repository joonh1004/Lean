# 린 로컬 문제은행

## 실행 (Windows PowerShell)

체크아웃 루트에서 실행한다. Node.js/npm과 Python 3.12가 필요하다.

```powershell
npm.cmd ci
py -3.12 -m venv .\artifacts\.venv
$env:LEAN_HWPX_PYTHON = (Resolve-Path .\artifacts\.venv\Scripts\python.exe).Path
& $env:LEAN_HWPX_PYTHON -m pip install python-hwpx==6.12.0 Pillow==13.0.0
npm.cmd run dev -- --strictPort
```

`http://127.0.0.1:5173` → 저장소 → 문제은행. 환경변수 없이도 이미지 정리·승인·저장·PNG 다운로드는 동작한다. HWPX 변환기는 Vite 정적 빌드에 포함되지 않는다. `http://127.0.0.1:<포트>`의 로컬 Vite 개발 서버 또는 `vite preview`에서만 변환기를 확인하며, 이미지 없는 확인 요청에 변환기가 응답한 뒤에만 HWPX 다운로드가 활성화된다. 공개 정적 사이트에서는 변환 요청을 보내지 않는다.

1. PNG·JPEG·WebP 문제 이미지(정지 이미지 기준)를 불러오고 제목과 과목을 입력한다.
2. 원본에서 드래그하거나 좌표를 입력해 남길 영역을 잘라낸다. 흰 배경에서 인쇄와 분리된 표식만 작은 사각형으로 제거한다. 인쇄에 겹치거나 불확실한 곳은 **불확실 영역 원본 유지**로 지정한다. 이미 제거했던 픽셀도 해당 범위는 복원된다. 유지 영역은 자르거나 다시 가릴 수 없다.
3. 원본과 미리보기를 대조하고 정답 표시 상태를 선택한 후 현재 미리보기를 승인한다. 미리보기나 정답 표시 상태가 바뀌면 다시 승인해야 한다. 라이브 Codex 판정이 연결되어 있지 않으므로 현재 로컬 경로는 항상 검토한다. 정답 표시가 남아 있거나 판정 근거가 없는 문항은 자동 사용에서 제외된다.
4. 최종 저장 후 과목 필터로 문항을 열고 원본·정리 이미지 또는 HWPX를 다운로드한다. HWPX는 승인된 정리 PNG를 비율을 유지하는 이미지 블록으로 넣으며 글자와 수식은 편집형 텍스트가 아니다. 브라우저는 한컴을 자동 실행하지 않는다.

문제 기록은 같은 브라우저 프로필·같은 주소/포트의 IndexedDB에 들어간다. 사이트 데이터 초기화·브라우저 저장소 정리 시 유실될 수 있으므로 필요한 파일은 내려받아 둔다. 기존 메모·링크·일정 저장 데이터는 별도로 유지된다. 변환 요청은 같은 PC의 `127.0.0.1`에서만 처리되며 외부 전송이나 서버 파일 저장, OS 열기 기능이 없다.

## 재현 (Windows PowerShell)

위 로컬 서버를 실행한 상태에서 별도 터미널을 열고 체크아웃 루트에서 실행한다. 테스트와 빌드 결과는 Git에서 무시되는 `artifacts` 아래에 기록된다.

```powershell
$python = (Resolve-Path .\artifacts\.venv\Scripts\python.exe).Path
$run = './artifacts/problem-bank-' + [guid]::NewGuid().ToString('N')
node --test (Get-ChildItem tests/*.test.js | ForEach-Object FullName)
npm.cmd run build -- --outDir "$run/build"
npx.cmd playwright install chromium
$env:LEAN_TEST_HWPX = '1'
npx.cmd playwright test --output "$run/recheck" --workers=3
$sample = Get-ChildItem "$run/recheck" -Recurse -Filter fixture.hwpx | Select-Object -First 1
$approved = Join-Path $sample.DirectoryName 'fixture-approved.png'
& $python .\tools\verify_problem_hwpx.py $sample.FullName $approved
```

`fixture-approved.png`은 HWPX를 생성하기 전에 브라우저의 승인된 미리보기에서 직접 가져온 바이트다. 별도 변환이 필요하면 다음처럼 승인된 PNG를 출력 경로에 넣는다(기존 파일을 덮어쓰지 않음).

```powershell
& $python .\tools\export_problem_hwpx.py $approved "$run/portable.hwpx"
& $python .\tools\verify_problem_hwpx.py "$run/portable.hwpx" $approved
```
