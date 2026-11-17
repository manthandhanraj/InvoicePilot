from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
image = Image.new('RGB', (1190, 1684), '#fcfcf8')
draw = ImageDraw.Draw(image)
font_path = Path('C:/Windows/Fonts/arial.ttf')
font = ImageFont.truetype(str(font_path), 28)
title = ImageFont.truetype(str(font_path), 44)
draw.text((100, 110), 'NORTHSTAR SUPPLIES INC', font=title, fill='#1b322b')
draw.text((100, 215), 'INVOICE', font=title, fill='#1b322b')
lines = ['Vendor: Northstar Supplies Inc', 'Invoice Number: NS-3091', 'Invoice Date: 2026-11-08', 'PO Number: PO-2026-042', 'Currency: USD', 'Description: Office stationery', 'Amount to be confirmed by supplier']
for index, line in enumerate(lines):
    draw.text((100, 345 + index * 67), line, font=font, fill='#283b31')
draw.line((100, 1410, 1090, 1410), fill='#909b89', width=2)
draw.text((100, 1440), 'Synthetic scanned invoice - InvoicePilot demo', font=font, fill='#6c7862')
image.save(root / 'samples' / 'northstar-scan.pdf', 'PDF', resolution=144)
print('Generated a real image-only PDF for OCR testing.')
