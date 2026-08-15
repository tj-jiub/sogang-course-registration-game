from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

out_dir = Path(__file__).resolve().parent
configs = [
    ("grade-a.png", "잘했어", "#1b7a4b", "#dff7e8", "#0f4f32"),
    ("grade-b.png", "애인", "#9b3f8c", "#fbe7ff", "#5c245d"),
    ("grade-c.png", "22점", "#d97706", "#fff4db", "#7c3d00"),
    ("grade-d.png", "대학교 갈수있", "#5a2a2a", "#f3e7e7", "#2f1414"),
]

for filename, text, bg, panel, text_color in configs:
    img = Image.new("RGB", (600, 360), bg)
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle((40, 40, 560, 320), radius=28, fill=panel)
    draw.rounded_rectangle((60, 60, 540, 300), radius=22, outline=text_color, width=3)

    try:
        title_font = ImageFont.truetype("C:/Windows/Fonts/malgun.ttf", 72)
        sub_font = ImageFont.truetype("C:/Windows/Fonts/malgun.ttf", 36)
    except Exception:
        title_font = ImageFont.load_default()
        sub_font = ImageFont.load_default()

    bbox = draw.textbbox((0, 0), text, font=title_font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    x = (600 - tw) / 2
    y = (360 - th) / 2 - 10
    draw.text((x, y), text, font=title_font, fill=text_color)

    label = "RESULT"
    bbox2 = draw.textbbox((0, 0), label, font=sub_font)
    tw2 = bbox2[2] - bbox2[0]
    draw.text(((600 - tw2) / 2, 36), label, font=sub_font, fill=text_color)

    img.save(out_dir / filename, format="PNG")
    print(f"saved {out_dir / filename}")
