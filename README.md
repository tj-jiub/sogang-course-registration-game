# 서강대 수강신청 클릭 연습 게임

빌드 도구 없는 순수 HTML/CSS/JS 웹게임.

## 로컬 실행

npx --yes serve .

## 테스트

npm test

Node 22 이상 필요 (Node 내장 테스트 러너 사용).
`js/scoring.js`, `js/queueSim.js`, `js/storage.js`의 순수 로직만 Node 테스트로 검증한다.
`js/main.js`, `js/resultCard.js`는 브라우저에서 수동으로 검증한다.
