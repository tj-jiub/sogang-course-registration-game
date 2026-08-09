export function drawResultCard(canvas, { grade, overallScore }) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#8b1a1a";
  ctx.fillRect(0, 0, width, 80);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 24px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("서강대 수강신청 클릭 연습", width / 2, 48);

  ctx.fillStyle = grade.color ?? "#5c1010";
  ctx.beginPath();
  ctx.arc(width / 2, height / 2 - 140, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 64px sans-serif";
  ctx.fillText(grade.rank ?? "", width / 2, height / 2 - 122);

  ctx.fillStyle = "#5c1010";
  ctx.font = "bold 48px sans-serif";
  ctx.fillText(`${grade.emoji ?? ""} ${grade.name}`, width / 2, height / 2 - 40);

  ctx.fillStyle = "#333333";
  ctx.font = "20px sans-serif";
  ctx.fillText(grade.desc, width / 2, height / 2 + 10);

  ctx.font = "18px sans-serif";
  ctx.fillText(`종합 점수: ${Math.round(overallScore)}점`, width / 2, height / 2 + 50);

  ctx.fillStyle = "#999999";
  ctx.font = "14px sans-serif";
  ctx.fillText(
    "비공식 연습용 게임 · 서강대학교 종합정보시스템과 무관",
    width / 2,
    height - 30
  );
}
