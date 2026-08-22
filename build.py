#!/usr/bin/env python3
"""Собирает автономные версии: стили, ядро и логотип вшиваются в html,
чтобы файл открывался двойным кликом без сервера."""
import io, os, base64, re

root = os.path.dirname(os.path.abspath(__file__))
css  = io.open(os.path.join(root, 'styles.css'), encoding='utf-8').read()
core = io.open(os.path.join(root, 'core.js'),   encoding='utf-8').read()
logo = io.open(os.path.join(root, 'assets/logo.svg'), encoding='utf-8').read()
logo_uri = 'data:image/svg+xml;base64,' + base64.b64encode(logo.encode('utf-8')).decode()

def jpg_uri(name):
    data = open(os.path.join(root, 'assets', name), 'rb').read()
    return 'data:image/jpeg;base64,' + base64.b64encode(data).decode()

# фоны и эмблема вшиваются в css, иначе автономный файл остался бы без картинок
for pic in ('bg-lobby.jpg', 'bg-table.jpg', 'logo.jpg'):
    css = css.replace('assets/' + pic, jpg_uri(pic))

os.makedirs(os.path.join(root, 'dist'), exist_ok=True)
for src_name, dst_name in [('index.html', 'Счастливчик.html'), ('admin.html', 'Счастливчик-админка.html')]:
    s = io.open(os.path.join(root, src_name), encoding='utf-8').read()
    # repl передаём функцией: в css/js есть \s и прочие escape-последовательности
    s = re.sub(r'<link rel="stylesheet" href="styles\.css[^"]*">', lambda m: '<style>\n' + css + '\n</style>', s)
    s = re.sub(r'<script src="core\.js[^"]*"></script>', lambda m: '<script>\n' + core + '\n</script>', s)
    s = re.sub(r'assets/logo\.svg[^"]*', lambda m: logo_uri, s)
    s = re.sub(r'<link rel="manifest"[^>]*>', '', s)
    s = re.sub(r'href="icon\.svg"', lambda m: 'href="' + logo_uri + '"', s)
    s = s.replace('href="admin.html"', 'href="Счастливчик-админка.html"')
    s = s.replace('href="index.html"', 'href="Счастливчик.html"')
    out = os.path.join(root, 'dist', dst_name)
    io.open(out, 'w', encoding='utf-8').write(s)
    print(dst_name, len(s.encode('utf-8')) // 1024, 'КБ')

# правовые страницы: тот же приём — стили и логотип внутрь файла
doc_css = io.open(os.path.join(root, 'doc.css'), encoding='utf-8').read()
for name in ('terms.html', 'privacy.html', 'refund.html', 'game-rules.html'):
    d = io.open(os.path.join(root, name), encoding='utf-8').read()
    d = re.sub(r'<link rel="stylesheet" href="doc\.css[^"]*">', lambda m: '<style>\n' + doc_css + '\n</style>', d)
    d = re.sub(r'assets/logo\.svg[^"]*', lambda m: logo_uri, d)
    d = d.replace('href="index.html"', 'href="Счастливчик.html"')
    io.open(os.path.join(root, 'dist', name), 'w', encoding='utf-8').write(d)
    print(name, len(d.encode('utf-8')) // 1024, 'КБ')
