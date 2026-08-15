from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

out_path = Path(__file__).with_name('result-preview.png')
W, H = 1200, 630
img = Image.new('RGB', (W, H), '#f5f1eb')
d = ImageDraw.Draw(img)

maroon = '#8b1a1a'
red_dark = '#5c1010'
cream = '#f7f2ea'
text = '#1a1a1a'
muted = '#4b4b4b'
line = '#e4dbd1'

# Font setup with Windows Korean fallback
font_candidates = [
    'C:/Windows/Fonts/malgun.ttf',
    'C:/Windows/Fonts/malgunbd.ttf',
    'C:/Windows/Fonts/gulim.ttc',
    'C:/Windows/Fonts/gulimbd.ttf',
]


def load_font(size: int):
    for path in font_candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()

# Header band
# d.rounded_rectangle([(0, 0), (W, 80)], radius=0, fill=maroon)
d.rectangle([(0, 0), (W, 80)], fill=maroon)
d.text((W / 2, 42), '서강대 수강신청 클릭 연습', fill='white', anchor='mm', font=load_font(36))

# Left badge
badge_center = (240, 270)
badge_size = 100
d.ellipse((badge_center[0] - badge_size, badge_center[1] - badge_size, badge_center[0] + badge_size, badge_center[1] + badge_size), fill='#b3292c')
d.text((badge_center[0], badge_center[1] + 8), 'A', fill='white', anchor='mm', font=load_font(72))

# Right result panel
card_x0, card_y0 = 390, 120
card_w, card_h = 700, 390
d.rounded_rectangle([(card_x0, card_y0), (card_x0 + card_w, card_y0 + card_h)], radius=18, fill='white', outline=line, width=2)

d.text((card_x0 + 34, card_y0 + 32), '사이버럭카', fill=red_dark, font=load_font(44))
d.text((card_x0 + 34, card_y0 + 86), '"입장 속도와 저장 반응이 모두 안정적"', fill=muted, font=load_font(24))

# Stat blocks
stat_y = card_y0 + 150
for i, (label, value, color) in enumerate([
    ('입장', '184ms', '#1b6a5a'),
    ('저장', '212ms', '#b75831'),
    ('합계', 'A', '#8b1a1a'),
]):
    x = card_x0 + 30 + i * 210
    d.rounded_rectangle([(x, stat_y), (x + 150, stat_y + 70)], radius=12, fill=cream, outline=line, width=1)
    d.text((x + 75, stat_y + 18), label, fill=muted, anchor='mm', font=load_font(20))
    d.text((x + 75, stat_y + 48), value, fill=color, anchor='mm', font=load_font(28))

# Transcript rows
rows = [
    ('LCU4030-01', '초급스페인어', '3.00', '완료'),
    ('LCU4035-01', '초급러시아어', '3.00', '완료'),
    ('COR1007-01', '성찰과성장', '1.00', '완료'),
    ('MGI2392', '재무관리', '3.00', '마감'),
]

table_x0 = card_x0 + 30
table_y0 = card_y0 + 245
col_w = [160, 260, 70, 95]
head_fill = '#f1ece6'

for i, label in enumerate(['과목번호', '교과목', '학점', '평가']):
    x = table_x0 + sum(col_w[:i])
    d.rectangle([(x, table_y0), (x + col_w[i], table_y0 + 34)], fill=head_fill)
    d.text((x + col_w[i] / 2, table_y0 + 17), label, fill=text, anchor='mm', font=load_font(18))

for idx, (code, name, credit, status) in enumerate(rows):
    y = table_y0 + 34 + idx * 30
    fill = 'white' if idx % 2 == 0 else '#fbf8f4'
    d.rectangle([(table_x0, y), (table_x0 + sum(col_w), y + 30)], fill=fill, outline=line, width=1)
    d.text((table_x0 + 20, y + 15), code, fill=text, anchor='lm', font=load_font(16))
    d.text((table_x0 + 185, y + 15), name, fill=text, anchor='lm', font=load_font(16))
    d.text((table_x0 + 440, y + 15), credit, fill=text, anchor='mm', font=load_font(16))
    d.text((table_x0 + 510, y + 15), status, fill='#2d8d6d' if status == '완료' else '#9c4b50', anchor='mm', font=load_font(16))

d.text((W / 2, H - 26), '비공식 연습용 게임 · 서강대학교 종합정보시스템과 무관', fill='#666666', anchor='mm', font=load_font(20))
img.save(out_path)
print(f'Generated {out_path} ({img.size[0]}x{img.size[1]})')
