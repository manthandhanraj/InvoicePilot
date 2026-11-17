from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from pypdf import PdfReader, PdfWriter

root = Path(__file__).resolve().parents[1]
samples = root / 'samples'
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 30)
title = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 46)
image = Image.new('RGB', (1190, 1684), '#fcfcf8')
draw = ImageDraw.Draw(image)
draw.text((100, 110), 'NORTHSTAR SUPPLIES INC', font=title, fill='#1b322b')
draw.text((100, 215), 'INVOICE', font=title, fill='#1b322b')
lines = ['Vendor: Northstar Supplies Inc', 'Invoice Number: NS-3092', 'Invoice Date: 2026-11-14', 'PO Number: PO-2026-042', 'Currency: USD', 'Subtotal: 500.00', 'Tax: 50.00', 'Grand Total: 550.00']
for index, line in enumerate(lines):
    draw.text((100, 345 + index * 67), line, font=font, fill='#283b31')
draw.line((100, 1410, 1090, 1410), fill='#909b89', width=2)
draw.text((100, 1440), 'Synthetic invoice - InvoicePilot test input', font=font, fill='#6c7862')
image.save(samples / 'northstar-complete-scan.pdf', 'PDF', resolution=144)
image.save(samples / 'northstar-invoice.png')
image.save(samples / 'northstar-invoice.jpg', quality=90)

qa = root / '.local' / 'browser-fixtures'
qa.mkdir(parents=True, exist_ok=True)
writer = PdfWriter()
writer.append(str(samples / 'northstar-formatted.pdf'))
writer.add_blank_page(width=595, height=842)
writer.write(qa / 'invoice-with-blank-page.pdf')
writer = PdfWriter()
for _ in range(11):
    writer.add_blank_page(width=595, height=842)
writer.write(qa / 'too-many-pages.pdf')
writer = PdfWriter()
writer.append(str(samples / 'aster-inv-1048.pdf'))
writer.encrypt('test-only-password')
writer.write(qa / 'encrypted-invoice.pdf')
(qa / 'broken-invoice.pdf').write_bytes(b'%PDF-1.4\nThis is deliberately not a valid PDF.')
(qa / 'not-an-invoice.txt').write_text('Not a supported invoice document.', encoding='utf-8')
print('Generated complete scan, PNG/JPEG and isolated browser-error fixtures.')
