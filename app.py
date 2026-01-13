from flask import Flask, render_template, request, jsonify, send_file
import cv2
import numpy as np
import base64
import io
from PIL import Image, ImageEnhance, ImageDraw, ImageFont
import datetime
import os

app = Flask(__name__)

# --- CONFIGURATION ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FONT_DIR = os.path.join(BASE_DIR, "fonts")

# --- UTILITIES ---
class FontManager:
    FONTS = {
        "Default": "arial.ttf", "Pacifico": "Pacifico.ttf", 
        "Lobster": "Lobster.ttf", "Times New Roman": "times.ttf"
        # Add your other fonts here
    }
    @staticmethod
    def get_font(font_name, size):
        filename = FontManager.FONTS.get(font_name, "arial.ttf")
        path = os.path.join(FONT_DIR, filename)
        try: return ImageFont.truetype(path, size)
        except: return ImageFont.load_default()

class ImageProcessor:
    @staticmethod
    def apply_filter(image, filter_name):
        # Convert PIL to CV2
        cv_img = np.array(image)
        cv_img = cv_img[:, :, ::-1].copy() # RGB to BGR

        # --- Filter Logic (Same as before) ---
        if filter_name == "Black & White":
            gray = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)
            cv_img = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
        elif filter_name == "Sepia":
            kernel = np.array([[0.272, 0.534, 0.131], [0.349, 0.686, 0.168], [0.393, 0.769, 0.189]])
            cv_img = cv2.transform(cv_img, kernel)
        elif filter_name == "Vintage":
            cv_img = cv2.convertScaleAbs(cv_img, alpha=0.9, beta=10)
            kernel = np.array([[0.272, 0.534, 0.131], [0.349, 0.686, 0.168], [0.300, 0.600, 0.200]])
            cv_img = cv2.transform(cv_img, kernel)
        # ... Add other filters (Cool, Warm, etc.) here ...

        # Back to PIL
        cv_img = cv_img[:, :, ::-1].copy()
        return Image.fromarray(cv_img)

    @staticmethod
    def create_strip(images, layout, bg_color, note_config):
        # Simplified Template Logic
        if layout == "classic_strip": w, h = 450, 2400
        else: w, h = 600, 1800
        
        final_img = Image.new('RGB', (w, h), bg_color)
        draw = ImageDraw.Draw(final_img)
        text_color = 'white' if bg_color == 'black' else 'black'
        
        # Calculate Dimensions
        margin = 20
        bottom_reserved = 400 if layout == "classic_strip" else 300
        avail_h = h - bottom_reserved
        count = 4 if layout != "3_strip" else 3
        
        photo_w = w - (2 * margin)
        photo_h = (avail_h - ((count + 1) * margin)) // count
        
        # Paste Photos
        for i, img in enumerate(images[:count]):
            # Resize and Crop Center
            img_ratio = img.width / img.height
            target_ratio = photo_w / photo_h
            if img_ratio > target_ratio:
                new_h = photo_h
                new_w = int(photo_h * img_ratio)
            else:
                new_w = photo_w
                new_h = int(photo_w / img_ratio)
            
            resized = img.resize((int(new_w), int(new_h)), Image.Resampling.LANCZOS)
            # Center Crop
            left = (resized.width - photo_w) // 2
            top = (resized.height - photo_h) // 2
            cropped = resized.crop((left, top, left + photo_w, top + photo_h))
            
            y = margin + i * (photo_h + margin)
            final_img.paste(cropped, (margin, y))

        # Add Text
        if note_config.get('text'):
            font = FontManager.get_font(note_config.get('font'), 60)
            # Simple centering for web demo
            bbox = draw.textbbox((0, 0), note_config['text'], font=font)
            text_w = bbox[2] - bbox[0]
            draw.text(((w - text_w)/2, h - 200), note_config['text'], fill=text_color, font=font)
            
        return final_img

# --- ROUTES ---
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/process_strip', methods=['POST'])
def process_strip():
    data = request.json
    images_data = data.get('images', [])
    options = data.get('options', {})
    
    # 1. Decode Base64 Images
    pil_images = []
    for img_str in images_data:
        # Remove "data:image/jpeg;base64," prefix
        header, encoded = img_str.split(",", 1)
        data = base64.b64decode(encoded)
        img = Image.open(io.BytesIO(data))
        
        # Apply Filter per image
        img = ImageProcessor.apply_filter(img, options.get('filter', 'Normal'))
        pil_images.append(img)
    
    # 2. Generate Strip
    final_strip = ImageProcessor.create_strip(
        pil_images, 
        options.get('layout', 'classic_strip'),
        options.get('bg_color', 'white'),
        options.get('note', {})
    )
    
    # 3. Save to Buffer
    img_io = io.BytesIO()
    final_strip.save(img_io, 'PNG')
    img_io.seek(0)
    
    # 4. Return as Base64 string to display immediately
    final_b64 = base64.b64encode(img_io.getvalue()).decode()
    return jsonify({'status': 'success', 'image': f"data:image/png;base64,{final_b64}"})

if __name__ == '__main__':
    # Use 0.0.0.0 for hosting compatibility
    app.run(debug=True, host='0.0.0.0', port=5000)