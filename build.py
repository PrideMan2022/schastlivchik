#!/usr/bin/env python3
"""Собирает автономные версии: стили, ядро и логотип вшиваются в html,
чтобы файл открывался двойным кликом без сервера."""
import io, os, base64, re

root = os.path.dirname(os.path.abspath(__file__))
css  = io.open(os.path.join(root, 'styles.css'), encoding='utf-8').read()
core = io.open(os.path.join(root, 'core.js'),   encoding='utf-8').read()
logo = io.open(os.path.join(root, 'assets/logo.svg'), encoding='utf-8').read()
logo_uri = 'data:image/svg+xml;base64,' + base64.b64encode(logo.encode('utf-8')).decode()

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
