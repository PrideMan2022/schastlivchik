/* Вероятность дойти от стартового банка до цели.
   Механика ровно как в игре: стол на 10 человек, уникальные числа 1..50,
   поэтому шанс занять 1/2/3 место — по 10%. Выплаты 70/20/5 от банка (10 ставок):
   1-е место: +6 ставок чистыми, 2-е: +1, 3-е: -0.5, иначе: -1.
   Считаем оптимальную стратегию (value iteration): на каждом балансе выбираем
   ставку, максимизирующую шанс дойти до цели. Это верхняя граница для игрока. */

const STEP = 5;                    // сетка в монетах (кратна половине минимальной ставки)
const GOAL = 500000 / STEP;        // цель в шагах
const STAKES = [10, 50, 100, 500, 1000].map(s => ({
  s,
  win1: (6 * s) / STEP,            // первое место
  win2: (1 * s) / STEP,            // второе
  lose3: (0.5 * s) / STEP,         // третье: половина ставки назад
  lose: s / STEP                   // без приза
}));
const P1 = .1, P2 = .1, P3 = .1, P0 = .7;

const V = new Float64Array(GOAL + 1);
for (let i = 0; i <= GOAL; i++) V[i] = i / GOAL;   // стартовое приближение

const cap = i => (i >= GOAL ? 1 : V[i]);
let iter = 0, diff = 1;
while (diff > 1e-13 && iter < 4000) {
  diff = 0; iter++;
  for (let i = 1; i < GOAL; i++) {
    let best = 0;
    for (const b of STAKES) {
      if (b.lose > i) continue;                       // ставка не по карману
      const v = P1 * cap(i + b.win1) + P2 * cap(i + b.win2)
              + P3 * V[i - b.lose3] + P0 * V[i - b.lose];
      if (v > best) best = v;
    }
    const d = Math.abs(best - V[i]);
    if (d > diff) diff = d;
    V[i] = best;
  }
}

const at = coins => V[Math.round(coins / STEP)];
const pct = p => (p * 100).toPrecision(3) + '%';
const one = p => (p > 0 ? '1 к ' + Math.round(1 / p).toLocaleString('ru-RU') : 'практически ноль');

console.log('итераций:', iter, '\n');
console.log('Оптимальная игра (всегда самая крупная посильная ставка), цель 500 000 монет:');
[10, 100, 500, 1000, 5000, 10000, 50000, 100000].forEach(c =>
  console.log('  из ' + String(c).padStart(6) + ' монет: ' + pct(at(c)).padStart(12) + '   ' + one(at(c))));

/* Для сравнения — осторожная игра: всегда минимальная ставка 10. */
const W = new Float64Array(GOAL + 1);
for (let i = 0; i <= GOAL; i++) W[i] = i / GOAL;
const b = STAKES[0], capW = i => (i >= GOAL ? 1 : W[i]);
for (let k = 0; k < 4000; k++) {
  let d = 0;
  for (let i = 1; i < GOAL; i++) {
    if (b.lose > i) { W[i] = 0; continue; }
    const v = P1 * capW(i + b.win1) + P2 * capW(i + b.win2) + P3 * W[i - b.lose3] + P0 * W[i - b.lose];
    const dd = Math.abs(v - W[i]); if (dd > d) d = dd;
    W[i] = v;
  }
  if (d < 1e-14) break;
}
const atW = coins => W[Math.round(coins / STEP)];
console.log('\nОсторожная игра (всегда по 10 монет), из 10 монет:', atW(10).toExponential(3));
console.log('Сколько раундов в среднем живёт банк из 10 монет при ставке 10: ~',
  Math.round(10 / (0.05 * 10)), 'раундов');
