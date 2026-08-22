#!/usr/bin/env python3
# Генерация фирменных картинок через GigaChat (text2image).
# Ключ и корневой сертификат Минцифры берём из уже настроенного проекта.
import json, os, re, ssl, urllib.request, uuid

KEY = 'MDFhMDBiNzctNzQyNS03MTM0LWE3NWQtYjJjYTI5MTliNDBlOmE2MDM5YjNiLTMzNDgtNGZhMi04NDQyLTU0MmIyMTliNTg0Yg=='
CA  = '/Users/mybook/Claude/Projects/Мирный/Блог 2026-08-12/mirny-blog/certs/russian_trusted_root_ca.pem'
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets')

ctx = ssl.create_default_context(cafile=CA)


def post(url, data, headers):
    req = urllib.request.Request(url, data=data, headers=headers, method='POST')
    with urllib.request.urlopen(req, context=ctx, timeout=180) as r:
        return json.loads(r.read())


def token():
    h = {'Authorization': 'Basic ' + KEY, 'RqUID': str(uuid.uuid4()),
         'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json'}
    return post('https://ngw.devices.sberbank.ru:9443/api/v2/oauth',
                b'scope=GIGACHAT_API_PERS', h)['access_token']


def image(tok, prompt, name):
    payload = {'model': 'GigaChat-2',
               'messages': [{'role': 'system', 'content': 'Ты художник. Рисуй изображение по запросу.'},
                            {'role': 'user', 'content': prompt}],
               'function_call': 'auto'}
    h = {'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json', 'Accept': 'application/json'}
    res = post('https://gigachat.devices.sberbank.ru/api/v1/chat/completions',
               json.dumps(payload, ensure_ascii=False).encode('utf-8'), h)
    content = res['choices'][0]['message'].get('content', '')
    m = re.search(r'src="([^"]+)"', content)
    if not m:
        print('  нет картинки в ответе:', content[:200])
        return None
    req = urllib.request.Request(
        'https://gigachat.devices.sberbank.ru/api/v1/files/%s/content' % m.group(1),
        headers={'Authorization': 'Bearer ' + tok, 'Accept': 'application/jpg'})
    with urllib.request.urlopen(req, context=ctx, timeout=180) as r:
        data = r.read()
    path = os.path.join(OUT, name)
    open(path, 'wb').write(data)
    print('  сохранено:', name, len(data) // 1024, 'КБ')
    return path


JOBS = [
    ('logo.jpg',
     'Логотип мобильной игры «Счастливчик»: стилизованный четырёхлистный клевер, вписанный в круглую '
     'игровую фишку с насечками по краю. Плоская векторная иконка, толстые контуры, без текста и букв. '
     'Палитра: глубокий индиго и фиолетовый фон, акценты золотой, бирюзовый и малиновый, мягкое неоновое '
     'свечение. Строго по центру, симметрично, однотонный тёмный фон, стиль премиального мобильного приложения.'),
    ('bg-lobby.jpg',
     'Абстрактный тёмный фон для экрана мобильной игры: глубокий сине-фиолетовый градиент, парящие '
     'полупрозрачные игровые фишки и цифры, мягкие световые пятна бирюзового и малинового цвета, лёгкие '
     'частицы. Без текста, без людей, размытая глубина, много свободного тёмного пространства сверху.'),
    ('bg-table.jpg',
     'Абстрактная текстура игрового стола, вид сверху: тёмное сине-фиолетовое сукно с тонким геометрическим '
     'узором из концентрических кругов и лучей, золотые тонкие линии, мягкое свечение по центру. '
     'Без текста, без предметов, премиальный минимализм.'),
]


def main():
    os.makedirs(OUT, exist_ok=True)
    tok = token()
    print('токен получен')
    for name, prompt in JOBS:
        print('генерирую', name)
        try:
            image(tok, prompt, name)
        except Exception as e:
            print('  ошибка:', e)


if __name__ == '__main__':
    main()
