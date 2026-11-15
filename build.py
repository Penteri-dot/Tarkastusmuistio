# Kokoaa src/-kansion osat valmiiksi tiedostoiksi dist/-kansioon.
import os, shutil, subprocess
OUT = '.'
core = open('src/core.js').read().replace('/* @@WIDTHS@@ */', open('src/widths.js').read())
html = open('src/shell.html').read().replace('/*@@CORE@@*/', core).replace('/*@@UI@@*/', open('src/ui.js').read())
open('index.html', 'w').write(html)
for f in ['sw.js', 'manifest.webmanifest', 'icon.svg']: shutil.copy('src/' + f, f)
for size in (180, 512):
    subprocess.run(['google-chrome', '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
        f'--window-size={size},{size}', f'--screenshot={os.path.abspath("icon-%d.png" % size)}',
        'file://' + os.path.abspath('src/icon-page.html') + f'?s={size}'], capture_output=True)
os.makedirs('test/out', exist_ok=True); open('test/core.built.js', 'w').write(core)
print('ok', len(html))
