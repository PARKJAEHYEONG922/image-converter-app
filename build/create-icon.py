from PIL import Image, ImageDraw, ImageFont
import os

# Create 256x256 icon
size = (256, 256)
img = Image.new('RGBA', size, (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Draw gradient background
for y in range(256):
    # Gradient from purple to blue
    r = int(102 + (118 - 102) * y / 256)
    g = int(126 + (75 - 126) * y / 256)
    b = int(234 + (162 - 234) * y / 256)
    draw.rectangle([(0, y), (256, y + 1)], fill=(r, g, b, 255))

# Draw white rounded rectangle
draw.rounded_rectangle([(50, 50), (206, 206)], radius=20, fill=(255, 255, 255, 200))

# Draw AI text
try:
    font = ImageFont.truetype("arial.ttf", 60)
except:
    font = ImageFont.load_default()

text = "AI"
bbox = draw.textbbox((0, 0), text, font=font)
text_width = bbox[2] - bbox[0]
text_height = bbox[3] - bbox[1]
text_x = (256 - text_width) // 2
text_y = 90
draw.text((text_x, text_y), text, fill=(102, 126, 234, 255), font=font)

# Draw subtitle
try:
    small_font = ImageFont.truetype("arial.ttf", 20)
except:
    small_font = ImageFont.load_default()

subtitle = "Image Converter"
bbox = draw.textbbox((0, 0), subtitle, font=small_font)
text_width = bbox[2] - bbox[0]
text_x = (256 - text_width) // 2
draw.text((text_x, 150), subtitle, fill=(118, 75, 162, 255), font=small_font)

# Save as PNG
img.save('icon.png', 'PNG')
print('Icon created: icon.png')