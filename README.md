# 서강대 수강신청 클릭 연습 게임

빌드 도구 없는 순수 HTML/CSS/JS 웹게임.

## 로컬 실행

**index.html을 더블클릭하면 안 됩니다.** (브라우저가 `file://`로 열면 모듈이 로드되지 않아 로그인 버튼이 눌러도 반응 없음)

가장 쉬운 방법: 이 폴더 안의 **`run.bat`을 더블클릭**하면 로컬 서버가 뜨고 브라우저가 자동으로 열립니다.

수동으로 하려면:

npx --yes serve .

명령어가 알려주는 주소(예: `http://localhost:3000`)로 브라우저에서 접속.

## 배포

이 프로젝트는 정적 사이트 + 서버리스 랭킹 API 구성을 그대로 Vercel에 올릴 수 있습니다.

1. GitHub에 push
2. Vercel에서 이 저장소를 프로젝트로 연결
3. 기본 설정 그대로 사용
4. 필요하면 환경 변수 없이도 동작하며, 서버가 재시작하면 메모리 기반 랭킹은 초기화됩니다.

- 정적 페이지: `/` root
- 랭킹 API: `/api/leaderboard?mode=reaction` 또는 `?mode=mash`
- POST 예시:
  `curl -X POST http://localhost:3000/api/leaderboard -H "Content-Type: application/json" -d '{"mode":"reaction","entry":{"nickname":"테스터","score":98,"timestamp":1710000000000}}'`

## 로컬 실행

npm run dev

이 명령은 Vercel 로컬 서버를 실행해 정적 페이지와 `/api/leaderboard`를 함께 제공합니다.

## 테스트

npm test

Node 22 이상 필요 (Node 내장 테스트 러너 사용).
`js/scoring.js`, `js/queueSim.js`, `js/storage.js`의 순수 로직만 Node 테스트로 검증한다.
`js/main.js`, `js/resultCard.js`는 브라우저에서 수동으로 검증한다.
