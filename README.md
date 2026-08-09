# 서강대 수강신청 클릭 연습 게임

빌드 도구 없는 순수 HTML/CSS/JS 웹게임.

## 로컬 실행

**index.html을 더블클릭하면 안 됩니다.** (브라우저가 `file://`로 열면 모듈이 로드되지 않아 로그인 버튼이 눌러도 반응 없음)

가장 쉬운 방법: 이 폴더 안의 **`run.bat`을 더블클릭**하면 로컬 서버가 뜨고 브라우저가 자동으로 열립니다.

수동으로 하려면:

npx --yes serve .

명령어가 알려주는 주소(예: `http://localhost:3000`)로 브라우저에서 접속.

## 테스트

npm test

Node 22 이상 필요 (Node 내장 테스트 러너 사용).
`js/scoring.js`, `js/queueSim.js`, `js/storage.js`의 순수 로직만 Node 테스트로 검증한다.
`js/main.js`, `js/resultCard.js`는 브라우저에서 수동으로 검증한다.
