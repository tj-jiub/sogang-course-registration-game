function wrapText(ctx, text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function drawResultCard(canvas, { grade, overallScore }) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  const maxTextWidth = width - 80;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#8b1a1a";
  ctx.fillRect(0, 0, width, 80);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 24px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("서강대 수강신청 클릭 연습", width / 2, 48);

  // 배지 원은 textBaseline "middle"로 정확히 중앙에 랭크 글자를 앉힌다.
  const badgeCenterY = 190;
  ctx.fillStyle = grade.color ?? "#5c1010";
  ctx.beginPath();
  ctx.arc(width / 2, badgeCenterY, 55, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 60px sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(grade.rank ?? "", width / 2, badgeCenterY);
  ctx.textBaseline = "alphabetic";

  // 이 아래로는 내용 길이에 따라 줄 수가 달라질 수 있어(긴 등급명/설명),
  // 매번 다음 줄 위치를 누적해서 계산한다 — 고정 좌표로 겹치는 일이 없도록.
  let y = badgeCenterY + 55 + 50;

  ctx.font = "36px sans-serif";
  ctx.fillText(grade.emoji ?? "", width / 2, y);
  y += 50;

  ctx.fillStyle = "#5c1010";
  ctx.font = "bold 40px sans-serif";
  for (const line of wrapText(ctx, grade.name, maxTextWidth)) {
    ctx.fillText(line, width / 2, y);
    y += 46;
  }
  y += 14;

  ctx.fillStyle = "#333333";
  ctx.font = "20px sans-serif";
  for (const line of wrapText(ctx, grade.desc, maxTextWidth)) {
    ctx.fillText(line, width / 2, y);
    y += 28;
  }
  y += 20;

  ctx.font = "18px sans-serif";
  ctx.fillText(`종합 점수: ${Math.round(overallScore)}점`, width / 2, y);

  ctx.fillStyle = "#999999";
  ctx.font = "14px sans-serif";
  ctx.fillText(
    "비공식 연습용 게임 · 서강대학교 종합정보시스템과 무관",
    width / 2,
    height - 30
  );
}
