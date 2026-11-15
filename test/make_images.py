# Tekee testikuvat test/run.js:ää varten (vaatii Pillow-kirjaston).
from PIL import Image, ImageDraw
import base64, io, json
def img(color, w, h):
    im = Image.new('RGB', (w, h), color); ImageDraw.Draw(im).rectangle([20, 20, w-20, h-20], outline='white', width=8)
    b = io.BytesIO(); im.save(b, 'JPEG', quality=80); return 'data:image/jpeg;base64,' + base64.b64encode(b.getvalue()).decode()
json.dump({'a': img((40,90,140),1600,1200), 'b': img((150,60,40),1200,1600), 'c': img((60,120,60),1600,900), 'sig': img((255,255,255),600,200)}, open('test/imgs.json', 'w'))
Image.new('RGB', (2000, 1500), (90,130,170)).save('test/photo.jpg')
