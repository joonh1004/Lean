# Lean (린)

기대고 의지할 수 있는 개인 작업 공간. React + Vite 기반 PC 웹 시안입니다.

## 실행
```bash
npm ci
npm run dev
```
터미널에 표시된 로컬 주소를 엽니다. HTML 파일을 직접 더블클릭하는 방식은 지원하지 않습니다.

## 빌드 및 테스트
```bash
npm test
npx playwright install chromium
npx playwright test
npm run build -- --base ./
```
생성된 dist 폴더의 내용을 정적 웹 호스팅에 배포합니다. GitHub 저장소에 소스를 올리는 것과 GitHub Pages로 사이트를 공개하는 것은 별도 작업입니다.

## 파일
- index.html: React 시작 문서
- src/: 모든 React JSX, JavaScript, CSS 원본
- tests/: 단위·브라우저 테스트
- package.json, package-lock.json: 의존성 및 실행 명령
- playwright.config.cjs: 브라우저 테스트 설정

## 현재 기능과 한계
명언 관리·하루 진입, 오늘 화면, 할 일/일정 캘린더와 CRUD, 폴더·메모·링크 저장소 및 기록 연결을 포함합니다.
태그 UI, 실제 파일 업로드, 서버 저장·로그인·백업·기기 동기화, Figma 산출물, 모바일 최적화는 이 전달본에서 보장하지 않습니다.
데이터는 접속한 브라우저와 origin의 localStorage에 저장됩니다. 브라우저 데이터를 삭제하면 유실될 수 있으며 다른 주소로 배포해도 자동 이전되지 않습니다.
이 소스에는 개발용 샘플 및 테스트용 문구가 있습니다. 실행 중인 브라우저의 실제 사용자 기록·프로필·자격증명은 포함하지 않습니다.

## 전달본
기존 프로젝트 personal-workspace의 검증된 스냅샷입니다. 내부 패키지명 및 화면의 Workspace 표기는 기존 구현을 유지했습니다.
