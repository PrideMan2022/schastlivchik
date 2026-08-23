/* ============================================================
   СЧАСТЛИВЧИК — ядро: хранилище, экономика, магазин, тикеты.
   Один модуль на игру и админку (общий localStorage).
   ============================================================ */
(function (root) {
'use strict';

const K_USER = 'schastlivchik.user.v2';   // профиль игрока
const K_CORE = 'schastlivchik.core.v2';   // покупки, жалобы, возвраты, журнал

/* ---------- случайность ---------- */
function rand(){
  if (typeof crypto !== 'undefined' && crypto.getRandomValues){
    const u = new Uint32Array(1); crypto.getRandomValues(u); return u[0] / 4294967296;
  }
  return Math.random();
}
const rnd = (a, b) => a + Math.floor(rand() * (b - a + 1));
const uid = p => (p || 'id') + '-' + Date.now().toString(36) + '-' + Math.floor(rand()*1e6).toString(36);

/* ---------- хранилище ---------- */
function read(key, def){
  try { const r = JSON.parse(localStorage.getItem(key) || 'null'); return r ? Object.assign({}, def, r) : JSON.parse(JSON.stringify(def)); }
  catch(e){ return JSON.parse(JSON.stringify(def)); }
}
function write(key, val){ try{ localStorage.setItem(key, JSON.stringify(val)); }catch(e){} }

/* Встроенные аватары: игрок либо выбирает иконку, либо грузит своё фото. */
const ICONS = ['🦊','🐻','🐼','🦁','🐯','🐺','🦉','🦅','🐙','🦈','🐳','🦄','🐝','🦋','🐢','🐸',
  '🍀','⭐','🔥','💎','👑','🎩','🚀','🎯'];
const ICON_BG = ['#6c5ce7','#22d3ee','#ff5fa2','#34d399','#ffc24b','#ff7a18','#4f8cff','#a78bfa'];

/* Версии правовых документов. При изменении текста поднимаем версию —
   приложение попросит принять её заново, а согласие запишется с датой. */
const DOCS = {
  terms:   { v: '1.0', date: '23.08.2026', file: 'terms.html',   title: 'Пользовательское соглашение' },
  privacy: { v: '1.0', date: '23.08.2026', file: 'privacy.html', title: 'Политика конфиденциальности' },
  refund:  { v: '1.0', date: '23.08.2026', file: 'refund.html',  title: 'Правила покупок и возвратов' },
  rules:   { v: '1.0', date: '23.08.2026', file: 'game-rules.html', title: 'Правила игры' }
};

const USER_DEF = {
  id: null, nick: 'Игрок', email: '', registered: false,
  consents: {},        // {terms:{v,at}, privacy:{v,at}, age18:{v,at}}
  avatar: { type: 'icon', value: '🍀', bg: '#6c5ce7' },
  coins: 1000, blocked: false, blockReason: '',
  played: 0, wins: 0, top1: 0, best: 0, streak: 0, bestStreak: 0,
  betSum: 0, winSum: 0, freq: null, hist: [], botProfit: {},
  sound: true, seen: false, createdAt: 0,
  /* удержание: ежедневные награды, уровень, задания дня */
  daily: { streak: 0, lastDay: '', claimedToday: false },
  xp: 0, level: 1, quests: { day: '', list: [] }, starterBought: false
};
const SETTINGS_VERSION = 5;   // поднимаем, когда меняем значения по умолчанию
const CORE_DEF = {
  settingsVersion: SETTINGS_VERSION,
  orders: [], tickets: [], refunds: [], payouts: [], audit: [],
  houseFee: 0, charity: 0, revenue: 0, paidOut: 0,
  adminPass: '1234',
  settings: {
    refundDays: 14,
    /* Курс вывода. Покупка идёт примерно по 12 монет за рубль (990 ₽ за 12 000),
       вывод — по 15 монет за рубль: разница ~20% и есть комиссия сервиса. */
    rate: 15,
    minPayout: 500,     // как в исходных записях: от 500 ₽
    maxPayout: 5000,    // до 5000 ₽ за заявку
    winOnly: true,      // выводить можно только чистый выигрыш, не купленные монеты
    /* Рубильник вывода. Выключен: монеты остаются игровой валютой и обратно
       в деньги не превращаются — модель, которой не нужна игорная лицензия.
       Включение делает приложение азартной игрой с денежными выплатами. */
    payoutsEnabled: false
  }
};

let U = read(K_USER, USER_DEF);
let C = read(K_CORE, CORE_DEF);
/* Настройки хранятся целым объектом, поэтому старые значения переживали
   обновление приложения. Версия настроек чинит это. */
if (C.settingsVersion !== SETTINGS_VERSION){
  C.settings = JSON.parse(JSON.stringify(CORE_DEF.settings));
  C.settingsVersion = SETTINGS_VERSION;
  write(K_CORE, C);
}
if (!U.id){ U.id = uid('u'); U.createdAt = Date.now(); }
if (!U.freq || U.freq.length !== 51) U.freq = new Array(51).fill(0);

/* Пишем сразу, без отложенного сохранения: админка перечитывает хранилище
   на каждой перерисовке, и отложенная запись затирала бы свежие решения. */
function saveUser(){ write(K_USER, U); }
function saveCore(){ write(K_CORE, C); }
let wiped = false;
function flush(){ if (wiped) return; write(K_USER, U); write(K_CORE, C); }
function reload(){ U = read(K_USER, USER_DEF); C = read(K_CORE, CORE_DEF);
  if (C.settingsVersion !== SETTINGS_VERSION){
    C.settings = JSON.parse(JSON.stringify(CORE_DEF.settings)); C.settingsVersion = SETTINGS_VERSION; }
  if (!U.freq || U.freq.length !== 51) U.freq = new Array(51).fill(0); }

/* ---------- журнал действий ---------- */
function log(actor, action, detail, ref){
  C.audit.unshift({ id: uid('a'), t: Date.now(), actor: actor, action: action, detail: detail || '', ref: ref || '' });
  if (C.audit.length > 400) C.audit.length = 400;
  saveCore();
}

/* ---------- магазин монет ----------
   Монеты покупаются за реальные деньги, но НЕ обмениваются обратно:
   это игровая валюта, а не ставка на деньги. Возврат возможен только
   деньгами через заявку на возврат покупки.                        */
/* Ценовая лестница построена по трём правилам рынка казуальных игр:
   вход ниже 100 ₽, цена за 1000 монет падает с ростом пакета (89 → 50 ₽),
   дорогой пакет служит якорем, на фоне которого средние выглядят выгодно.
   Держим цены ниже привычных для жанра ценовых точек 99/490/990/2490/4900. */
const PACKS = [
  { id: 'p1', coins: 1000,  price: 89,   bonus: 0,   label: 'Проба'    },
  { id: 'p2', coins: 5500,  price: 399,  bonus: 10,  label: 'Ходовой'  },
  { id: 'p3', coins: 12000, price: 749,  bonus: 20,  label: 'Выгодный' },
  { id: 'p4', coins: 32500, price: 1790, bonus: 30,  label: 'Крупный'  },
  { id: 'p5', coins: 70000, price: 3490, bonus: 42,  label: 'Максимум' }
];
/* Набор новичка: разовое предложение первых трёх суток, монет вдвое больше
   обычного за те же деньги. Никакой случайности — состав фиксирован и виден
   до оплаты, поэтому это обычная покупка, а не лутбокс. */
const STARTER = { id: 'starter', coins: 2500, price: 99, label: 'Набор новичка', hours: 72 };
function starterAvailable(){
  if (U.starterBought) return false;
  return (Date.now() - U.createdAt) < STARTER.hours * 3600000;
}
function starterLeft(){
  return Math.max(0, U.createdAt + STARTER.hours * 3600000 - Date.now());
}
/* Выгода дня: один пакет со скидкой 20%. Выбирается по дате, а не случайно —
   все игроки видят одно и то же предложение, и его нельзя «перекрутить». */
function dealToday(){
  const d = new Date(), key = d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate();
  const pack = PACKS[key % (PACKS.length - 1) + 1];      // «Пробу» не скидываем
  return { packId: pack.id, price: Math.round(pack.price * 0.8 / 10) * 10, off: 20 };
}
function priceOf(packId){
  const pack = PACKS.find(p => p.id === packId);
  if (!pack) return 0;
  const deal = dealToday();
  return deal.packId === packId ? deal.price : pack.price;
}
const METHODS = [
  { id: 'card', n: 'Банковская карта' }, { id: 'sbp', n: 'СБП' },
  { id: 'yoo',  n: 'ЮKassa кошелёк'  }, { id: 'sber', n: 'SberPay' }
];

/* Заказ живёт по статусам: created → paid → (refund_requested) → refunded
   либо created → failed. В бою статус меняет вебхук платёжной системы,
   здесь — эмуляция подтверждения.                                        */
function createOrder(packId, method){
  const pack = packId === STARTER.id ? STARTER : PACKS.find(p => p.id === packId);
  if (!pack) return { ok: false, err: 'Пакет не найден' };
  if (packId === STARTER.id && !starterAvailable()) return { ok: false, err: 'Предложение больше недоступно' };
  if (U.blocked) return { ok: false, err: 'Аккаунт заблокирован: ' + (U.blockReason || 'обратитесь в поддержку') };
  const price = packId === STARTER.id ? STARTER.price : priceOf(packId);
  const o = {
    id: uid('ord'), userId: U.id, nick: U.nick, packId: pack.id, label: pack.label,
    coins: pack.coins, price: price, method: method || 'card',
    status: 'created', createdAt: Date.now(), paidAt: 0, refundedAt: 0,
    receipt: 'ЧК-' + String(rnd(100000, 999999))
  };
  C.orders.unshift(o); saveCore();
  log('система', 'заказ создан', pack.coins + ' монет за ' + pack.price + ' ₽', o.id);
  return { ok: true, order: o };
}
/* Эмуляция ответа платёжного шлюза. ok=false — «оплата не прошла». */
function confirmOrder(orderId, ok){
  const o = C.orders.find(x => x.id === orderId);
  if (!o || o.status !== 'created') return { ok: false, err: 'Заказ недоступен' };
  if (!ok){ o.status = 'failed'; saveCore(); log('система','оплата отклонена','', o.id); return { ok: false, err: 'Платёж отклонён банком' }; }
  o.status = 'paid'; o.paidAt = Date.now();
  U.coins += o.coins; C.revenue += o.price;
  if (o.packId === STARTER.id) U.starterBought = true;
  saveUser(); saveCore();
  log('система', 'оплата принята', o.coins + ' монет зачислено, ' + o.price + ' ₽', o.id);
  return { ok: true, order: o };
}

/* ---------- заявки на возврат денег ---------- */
function requestRefund(orderId, reason){
  const o = C.orders.find(x => x.id === orderId);
  if (!o) return { ok: false, err: 'Заказ не найден' };
  if (o.status !== 'paid') return { ok: false, err: 'Возврат возможен только по оплаченному заказу' };
  const days = (Date.now() - o.paidAt) / 86400000;
  if (days > C.settings.refundDays) return { ok: false, err: 'Срок возврата истёк (' + C.settings.refundDays + ' дней)' };
  if (C.refunds.some(r => r.orderId === orderId && r.status === 'new'))
    return { ok: false, err: 'Заявка по этому заказу уже на рассмотрении' };
  const r = { id: uid('rf'), orderId: o.id, userId: U.id, nick: U.nick, sum: o.price,
              coins: o.coins, reason: (reason || '').slice(0, 500), status: 'new',
              createdAt: Date.now(), decidedAt: 0, decidedBy: '', comment: '' };
  C.refunds.unshift(r); o.status = 'refund_requested'; saveCore();
  log('игрок', 'заявка на возврат', o.price + ' ₽: ' + r.reason, r.id);
  return { ok: true, refund: r };
}
/* Решение модератора. approve=true — деньги возвращаем, монеты списываем. */
function decideRefund(refundId, approve, comment, admin){
  const r = C.refunds.find(x => x.id === refundId);
  if (!r || r.status !== 'new') return { ok: false, err: 'Заявка уже обработана' };
  const o = C.orders.find(x => x.id === r.orderId);
  r.status = approve ? 'approved' : 'rejected';
  r.decidedAt = Date.now(); r.decidedBy = admin || 'модератор'; r.comment = comment || '';
  if (approve){
    if (o){ o.status = 'refunded'; o.refundedAt = Date.now(); }
    C.revenue -= r.sum;
    if (isSelf(r.userId)){                       // списываем непотраченные монеты
      const take = Math.min(U.coins, r.coins);
      U.coins -= take; r.coinsTaken = take; saveUser();
    }
    log(admin || 'модератор', 'возврат одобрен', r.sum + ' ₽ по заказу ' + r.orderId, r.id);
  } else {
    if (o) o.status = 'paid';
    log(admin || 'модератор', 'возврат отклонён', comment || '', r.id);
  }
  saveCore();
  return { ok: true, refund: r };
}

/* ---------- жалобы ---------- */
const TICKET_TOPICS = ['Спорный раунд', 'Не зачислены монеты', 'Ошибка в приложении', 'Поведение игрока', 'Другое'];
function createTicket(topic, text, snapshot){
  if (!text || text.trim().length < 5) return { ok: false, err: 'Опишите проблему подробнее' };
  const t = { id: uid('tk'), userId: U.id, nick: U.nick, topic: topic || 'Другое',
              text: text.trim().slice(0, 1000), snapshot: snapshot || null, status: 'new',
              createdAt: Date.now(), answeredAt: 0, answer: '', compensation: 0, by: '' };
  C.tickets.unshift(t); saveCore();
  log('игрок', 'жалоба', t.topic + ': ' + t.text.slice(0, 80), t.id);
  return { ok: true, ticket: t };
}
/* Решение по жалобе: ответ, необязательная компенсация монетами, блокировка. */
function resolveTicket(ticketId, verdict, answer, compensation, admin){
  const t = C.tickets.find(x => x.id === ticketId);
  if (!t) return { ok: false, err: 'Тикет не найден' };
  t.status = verdict;                      // 'resolved' | 'rejected' | 'in_work'
  t.answer = (answer || '').slice(0, 1000);
  t.answeredAt = Date.now(); t.by = admin || 'модератор';
  const comp = Math.max(0, Math.round(compensation || 0));
  if (comp && verdict === 'resolved'){
    t.compensation = comp;
    if (isSelf(t.userId)){ U.coins += comp; saveUser(); }
  }
  saveCore();
  log(admin || 'модератор', 'жалоба ' + verdict, (comp ? 'компенсация ' + comp + ' монет. ' : '') + t.answer.slice(0, 80), t.id);
  return { ok: true, ticket: t };
}
function isSelf(id){ return id === U.id; }

/* ---------- профиль игрока ---------- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zа-я]{2,}$/i;
function validEmail(v){ return EMAIL_RE.test(String(v || '').trim()); }
/* avatar: {type:'icon', value:'🦊', bg:'#6c5ce7'} либо {type:'photo', value:'data:image/...'} */
function setProfile(nick, email, avatar){
  nick = String(nick || '').trim().slice(0, 24);
  email = String(email || '').trim().slice(0, 120);
  if (nick.length < 2) return { ok: false, err: 'Ник — минимум два символа' };
  if (!validEmail(email)) return { ok: false, err: 'Проверьте адрес почты' };
  const first = !U.registered;
  U.nick = nick; U.email = email;
  if (avatar) U.avatar = avatar;
  U.registered = true; U.seen = true;
  saveUser();
  /* ник хранится и в уже созданных заявках — чтобы модератор видел актуальное имя */
  [C.orders, C.tickets, C.refunds].forEach(list =>
    list.forEach(x => { if (x.userId === U.id) x.nick = nick; }));
  saveCore();
  log(first ? 'игрок' : nick, first ? 'регистрация' : 'профиль изменён', nick + ' · ' + email, U.id);
  return { ok: true };
}
/* Согласия фиксируются с версией документа и датой — это доказательство
   того, что игрок принял именно ту редакцию, что действовала на тот момент. */
function acceptDocs(list){
  const at = Date.now();
  (list || []).forEach(k => { U.consents[k] = { v: (DOCS[k] || {}).v || '1.0', at: at }; });
  saveUser();
}
function consentsOk(){
  return ['terms', 'privacy', 'age18'].every(k => {
    const c = U.consents[k];
    if (!c) return false;
    const need = (DOCS[k] || {}).v;
    return !need || c.v === need;     // документ обновился — попросим принять заново
  });
}

/* Выгрузка всех данных игрока — право на переносимость по 152-ФЗ. */
function exportData(){
  const my = list => list.filter(x => x.userId === U.id);
  return {
    выгружено: new Date().toISOString(),
    профиль: { id: U.id, ник: U.nick, почта: U.email, зарегистрирован: new Date(U.createdAt).toISOString(),
               монет: U.coins, аватар: U.avatar && U.avatar.type },
    согласия: U.consents,
    статистика: { раундов: U.played, в_призах: U.wins, первых_мест: U.top1,
                  поставлено: U.betSum, выиграно: U.winSum },
    раунды: U.hist,
    покупки: my(C.orders).map(o => ({ чек: o.receipt, монет: o.coins, сумма: o.price,
                                      способ: o.method, статус: o.status, дата: new Date(o.createdAt).toISOString() })),
    обращения: my(C.tickets).map(t => ({ тема: t.topic, текст: t.text, статус: t.status,
                                         ответ: t.answer, дата: new Date(t.createdAt).toISOString() })),
    возвраты: my(C.refunds).map(r => ({ сумма: r.sum, причина: r.reason, статус: r.status,
                                        дата: new Date(r.createdAt).toISOString() }))
  };
}

/* Удаление аккаунта: профиль стирается полностью, а платёжные записи
   обезличиваются — их нельзя удалить, они нужны для бухгалтерии и чеков. */
function deleteAccount(){
  const id = U.id;
  [C.orders, C.tickets, C.refunds, C.payouts].forEach(list =>
    list.forEach(x => {
      if (x.userId !== id) return;
      x.nick = 'удалённый игрок'; x.email = ''; x.anonymized = true;
      if (x.text) x.text = '[удалено по запросу игрока]';
      if (x.reason) x.reason = '[удалено по запросу игрока]';
      if (x.requisites) x.requisites = '';
      if (x.snapshot) x.snapshot = null;
    }));
  log('игрок', 'удаление аккаунта', 'профиль стёрт, записи обезличены', id);
  saveCore();
  localStorage.removeItem(K_USER);
  U = JSON.parse(JSON.stringify(USER_DEF));
  U.id = uid('u'); U.createdAt = Date.now(); U.freq = new Array(51).fill(0); U.consents = {};
  saveUser();
  return { ok: true };
}

/* Фото ужимается до 160 px и кладётся в localStorage как data:URL. */
function photoToAvatar(file, cb){
  if (!file || !/^image\//.test(file.type)) return cb({ ok: false, err: 'Нужен файл изображения' });
  if (file.size > 8 * 1024 * 1024) return cb({ ok: false, err: 'Файл больше 8 МБ' });
  const fr = new FileReader();
  fr.onerror = () => cb({ ok: false, err: 'Не удалось прочитать файл' });
  fr.onload = () => {
    const img = new Image();
    img.onerror = () => cb({ ok: false, err: 'Не удалось открыть изображение' });
    img.onload = () => {
      const S0 = 160, cv = document.createElement('canvas');
      cv.width = cv.height = S0;
      const side = Math.min(img.width, img.height);           // обрезаем по центру в квадрат
      cv.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2,
                                    side, side, 0, 0, S0, S0);
      cb({ ok: true, avatar: { type: 'photo', value: cv.toDataURL('image/jpeg', .82) } });
    };
    img.src = fr.result;
  };
  fr.readAsDataURL(file);
}

/* ---------- блокировка ---------- */
function setBlocked(userId, blocked, reason, admin){
  if (isSelf(userId)){ U.blocked = !!blocked; U.blockReason = reason || ''; saveUser(); }
  log(admin || 'модератор', blocked ? 'аккаунт заблокирован' : 'блокировка снята', reason || '', userId);
  return { ok: true };
}

/* ---------- вывод монет ----------
   Выводится только чистый выигрыш (winSum - betSum), а не купленные монеты:
   иначе кошелёк превращается в обменник и приложение попадает под правила
   азартных игр с денежными выплатами.                                      */
function withdrawable(){
  const net = Math.max(0, U.winSum - U.betSum);
  const reserved = C.payouts
    .filter(p => p.userId === U.id && (p.status === 'new' || p.status === 'approved'))
    .reduce((a, p) => a + p.coins, 0);
  const base = C.settings.winOnly ? Math.min(U.coins, net) : U.coins;
  return Math.max(0, base - reserved);
}
function coinsToRub(coins){ return Math.floor(coins / C.settings.rate); }
function rubToCoins(rub){ return Math.round(rub * C.settings.rate); }

function requestPayout(rub, method, requisites){
  const st = C.settings;
  rub = Math.floor(+rub || 0);
  if (!st.payoutsEnabled) return { ok:false, err:'Вывод отключён: монеты остаются игровой валютой' };
  if (U.blocked) return { ok:false, err:'Аккаунт заблокирован: ' + (U.blockReason || 'обратитесь в поддержку') };
  if (!U.registered || !validEmail(U.email)) return { ok:false, err:'Сначала заполните профиль и почту' };
  if (rub < st.minPayout) return { ok:false, err:'Минимальная выплата — ' + st.minPayout + ' ₽' };
  if (rub > st.maxPayout) return { ok:false, err:'Максимальная выплата — ' + st.maxPayout + ' ₽ за заявку' };
  const need = rubToCoins(rub);
  if (need > withdrawable())
    return { ok:false, err:'Доступно к выводу ' + coinsToRub(withdrawable()) + ' ₽ — выводится только выигрыш' };
  const req = String(requisites || '').trim().slice(0, 40);
  if (req.replace(/\D/g, '').length < 4) return { ok:false, err:'Укажите реквизиты для выплаты' };
  const p = {
    id: uid('po'), userId: U.id, nick: U.nick, email: U.email,
    coins: need, sum: rub, method: method || 'card',
    requisites: mask(req), status: 'new',
    createdAt: Date.now(), decidedAt: 0, decidedBy: '', comment: ''
  };
  U.coins -= need;                       // резервируем сразу, чтобы нельзя было потратить дважды
  C.payouts.unshift(p); saveUser(); saveCore();
  log('игрок', 'заявка на вывод', rub + ' ₽ (' + need + ' монет) · ' + p.requisites, p.id);
  return { ok:true, payout:p };
}
/* Реквизиты не храним целиком — только хвост, этого хватает для сверки. */
function mask(v){
  const d = v.replace(/\s/g, '');
  return d.length <= 4 ? d : '••••' + d.slice(-4);
}
/* Решение модератора: approved → выплачено, rejected → монеты возвращаются игроку. */
function decidePayout(id, approve, comment, adminName){
  const p = C.payouts.find(x => x.id === id);
  if (!p || p.status !== 'new') return { ok:false, err:'Заявка уже обработана' };
  p.status = approve ? 'paid' : 'rejected';
  p.decidedAt = Date.now(); p.decidedBy = adminName || 'модератор'; p.comment = comment || '';
  if (approve){ C.paidOut += p.sum; }
  else if (isSelf(p.userId)){ U.coins += p.coins; saveUser(); }
  saveCore();
  log(adminName || 'модератор', approve ? 'выплата проведена' : 'вывод отклонён',
      p.sum + ' ₽ · ' + (comment || ''), p.id);
  return { ok:true, payout:p };
}

/* ---------- ежедневная награда ----------
   Заходишь каждый день — цепочка растёт, награда вместе с ней. Пропустил
   день — цепочка начинается заново. Седьмой день даёт крупный бонус.      */
const DAILY = [100, 150, 250, 400, 600, 900, 2000];
const dayKey = d => { const x = d ? new Date(d) : new Date();
  return x.getFullYear() + '-' + (x.getMonth()+1) + '-' + x.getDate(); };

function dailyState(){
  const today = dayKey(), yest = dayKey(Date.now() - 86400000);
  const d = U.daily || (U.daily = { streak: 0, lastDay: '', claimedToday: false });
  if (d.lastDay !== today) d.claimedToday = false;
  const nextStreak = d.lastDay === yest ? d.streak + 1 : (d.lastDay === today ? d.streak : 1);
  const idx = Math.min(nextStreak, DAILY.length) - 1;
  return { canClaim: !d.claimedToday, streak: d.streak, nextStreak: nextStreak,
           reward: DAILY[idx], day: idx + 1, table: DAILY };
}
function claimDaily(){
  const st = dailyState();
  if (!st.canClaim) return { ok: false, err: 'Награда за сегодня уже получена' };
  const d = U.daily;
  d.streak = st.nextStreak; d.lastDay = dayKey(); d.claimedToday = true;
  U.coins += st.reward; saveUser();
  log('система', 'ежедневная награда', st.reward + ' монет, день ' + st.day, U.id);
  return { ok: true, reward: st.reward, streak: d.streak, day: st.day };
}

/* ---------- уровень ----------
   Опыт капает за каждый сыгранный раунд и за призовые места. На каждом
   уровне выдаём монеты — ещё один повод вернуться завтра.               */
function levelNeed(lvl){ return 100 + (lvl - 1) * 120; }
function addXp(n){
  U.xp = (U.xp || 0) + n;
  let gained = 0, coins = 0;
  while (U.xp >= levelNeed(U.level)){
    U.xp -= levelNeed(U.level); U.level++;
    gained++; coins += 100 + U.level * 50;
  }
  if (gained){ U.coins += coins; log('система', 'новый уровень', 'уровень ' + U.level + ', +' + coins + ' монет', U.id); }
  saveUser();
  return { levels: gained, coins: coins, level: U.level, xp: U.xp, need: levelNeed(U.level) };
}

/* ---------- задания дня ----------
   Три простые цели, обновляются раз в сутки. Выполнил — забрал монеты.   */
const QUEST_POOL = [
  { id: 'play5',   text: 'Сыграть 5 раундов',            goal: 5,  reward: 150, kind: 'play' },
  { id: 'play12',  text: 'Сыграть 12 раундов',           goal: 12, reward: 350, kind: 'play' },
  { id: 'prize2',  text: 'Дважды попасть в призы',       goal: 2,  reward: 300, kind: 'prize' },
  { id: 'first1',  text: 'Занять первое место',          goal: 1,  reward: 400, kind: 'first' },
  { id: 'table100',text: 'Сыграть на столе от 100 монет', goal: 3, reward: 250, kind: 'stake100' },
  { id: 'win800',  text: 'Выиграть 800 монет за день',   goal: 800,reward: 300, kind: 'won' }
];
function questsToday(){
  const today = dayKey();
  if (!U.quests || U.quests.day !== today){
    const pool = QUEST_POOL.slice();
    const list = [];
    while (list.length < 3 && pool.length){
      list.push(Object.assign({ progress: 0, done: false, claimed: false },
                              pool.splice(rnd(0, pool.length - 1), 1)[0]));
    }
    U.quests = { day: today, list: list };
    saveUser();
  }
  return U.quests.list;
}
/* Событие раунда двигает прогресс всех подходящих заданий. */
function questProgress(ev){
  const list = questsToday();
  list.forEach(q => {
    if (q.done) return;
    let inc = 0;
    if (q.kind === 'play') inc = 1;
    else if (q.kind === 'prize' && ev.place) inc = 1;
    else if (q.kind === 'first' && ev.place === 1) inc = 1;
    else if (q.kind === 'stake100' && ev.stake >= 100) inc = 1;
    else if (q.kind === 'won' && ev.won > 0) inc = ev.won;
    if (!inc) return;
    q.progress = Math.min(q.goal, q.progress + inc);
    if (q.progress >= q.goal) q.done = true;
  });
  saveUser();
  return list;
}
function claimQuest(id){
  const q = questsToday().find(x => x.id === id);
  if (!q || !q.done || q.claimed) return { ok: false, err: 'Задание ещё не выполнено' };
  q.claimed = true; U.coins += q.reward; saveUser();
  log('система', 'награда за задание', q.text + ' · +' + q.reward, U.id);
  return { ok: true, reward: q.reward };
}

/* ---------- экономика раунда ---------- */
/* Возвращает распределение банка. Доли 70/20/5, комиссия 5%,
   копейки округления и невостребованные доли — первому месту.   */
function payout(players, roll, stake){
  const list = players.slice().sort((a, b) => {
    const da = Math.abs(a.pick - roll), db = Math.abs(b.pick - roll);
    return da !== db ? da - db : a.readyAt - b.readyAt;
  });
  const pot = list.length * stake;
  const fee = Math.round(pot * 0.05);
  const shares = [0.70, 0.20, 0.05];
  let paid = 0;
  list.forEach((p, i) => { p.place = i < 3 ? i + 1 : 0; p.won = i < 3 ? Math.floor(pot * shares[i]) : 0; paid += p.won; });
  const rest = pot - fee - paid;
  if (rest > 0 && list[0]){ list[0].won += rest; paid += rest; }
  return { list: list, pot: pot, fee: fee, paid: paid };
}
function registerFee(fee){ C.houseFee += fee; C.charity += fee * 0.10; saveCore(); }

root.Core = {
  PACKS, METHODS, TICKET_TOPICS, ICONS, ICON_BG, DOCS,
  STARTER, starterAvailable, starterLeft, dealToday, priceOf,
  setProfile, photoToAvatar, validEmail,
  acceptDocs, consentsOk, exportData, deleteAccount,
  DAILY, dailyState, claimDaily, addXp, levelNeed, questsToday, questProgress, claimQuest,
  get user(){ return U; }, get core(){ return C; },
  saveUser, saveCore, flush, reload, log, uid, rnd, rand,
  createOrder, confirmOrder, requestRefund, decideRefund,
  withdrawable, coinsToRub, rubToCoins, requestPayout, decidePayout,
  createTicket, resolveTicket, setBlocked, payout, registerFee,
  resetUser(){ const id = U.id; U = JSON.parse(JSON.stringify(USER_DEF)); U.id = id;
               U.freq = new Array(51).fill(0); U.createdAt = Date.now(); flush(); },
  resetAll(){ wiped = true; localStorage.removeItem(K_USER); localStorage.removeItem(K_CORE); reload(); wiped = false; },
  get wiped(){ return wiped; }
};
})(window);
