// 介面端到端檢查 (選用)：用官方範例開局，在網頁上玩完第 1 回合。
// 用法：先 npm run dev，再執行 node tests/e2e/round1.cjs <截圖資料夾>。需要 playwright。
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'));
}
const out = process.argv[2] ?? '.';
const URL = process.env.URL ?? 'http://localhost:5173/';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(URL);
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  const step = async (name, f) => {
    try { await f(); } catch (e) { console.log('FAIL at', name, String(e).split('\n')[0]); await p.screenshot({ path: `${out}/fail.png` }); throw e; }
    await p.waitForTimeout(150);
    // UI-11：結算視窗與階段開場依序關掉 (Enter = 全部顯示 / 繼續)
    for (let k = 0; k < 20 && (await p.locator('.ov-box.resolve, .ov-box.intro').count()); k++) {
      const txt = await p.locator('.ov-box.resolve, .ov-box.intro').first().innerText();
      console.log('[overlay]', txt.replace(/\n/g, ' | ').slice(0, 160));
      await p.keyboard.press('Enter');
      await p.waitForTimeout(80);
    }
    const tb = await p.locator('.turnbar').innerText().catch(() => '');
    console.log(`${name} -> ${tb.replace(/\n/g, ' | ')}`);
  };
  const hand = (n) => p.locator(`.hand .card img[alt="${n}"]`).click();
  // 決定在提示列或決定視窗 (UI-11c)；選項是卡片時點卡片
  const btn = async (t) => {
    const b = p.locator('.turnbar button, .ov-box.decision button', { hasText: t });
    if (await b.count()) return b.first().click();
    return p.locator('.ov-box.decision .dec-cardopt', { hasText: t }).first().locator('.card').click();
  };
  const pa = (n) => p.locator(`.player-area .card img[alt="${n}"]`).click();
  await step('new', () => p.click('text=官方範例開局'));
  await step('explore card', () => btn('Foresight'));
  await step('sel', async () => { await hand('Ember Strike'); await hand('Useful Rage'); await hand('Hasten'); });
  await p.screenshot({ path: `${out}/r1_actionset.png` });
  await step('confirm', () => btn('確認'));
  await p.screenshot({ path: `${out}/r1_p2window.png` });
  await step('shout', () => p.locator('.skill.clickable[title^="Shout"]').click()); // UI-11d：點發光的技能
  await step('pass p2', () => btn('繼續'));
  await p.screenshot({ path: `${out}/r1_cover.png` });
  await step('cover', async () => { await btn('−'); await btn('−'); await btn('確認'); });
  await p.screenshot({ path: `${out}/r1_travel.png` });
  for (const c of ['保存為信標', '保存為信標', '保存為信標', '延後']) await step('t1c ' + c, () => btn(c));
  await step('travel', () => btn('前往'));
  await p.screenshot({ path: `${out}/r1_attack.png` });
  await step('ember', async () => {
    await p.locator('.board .card.effect img[alt="Ember Strike"]').click(); // UI-11d：點發光的卡
    const pick = p.locator('.ov-box.decision button', { hasText: 'MainAttack' });
    if (await pick.count()) await pick.first().click();
  });
  await step('ember2', () => btn('受 2 傷'));
  await step('assign watch', async () => { await pa('Terragard Watchman'); });
  await p.screenshot({ path: `${out}/r1_assign.png` });
  await step('confirm watch', () => btn('確認'));
  await step('assign spell', async () => { await pa('Moltan Spellcaster'); await btn('確認'); });
  await step('shout pull', () => btn('Sol Conspirator'));
  await step('assign consp', async () => { await pa('Sol Conspirator'); await btn('確認'); });
  await step('shout pull2', () => btn('Moltan Spy'));
  await step('pass grow', () => btn('繼續')); // UI-10 第 4 點：XP 夠成長時停下
  await step('attacker', () => pa('Moltan Spy'));
  await p.screenshot({ path: `${out}/r1_defend.png` });
  await step('defend', () => hand('Equal Measure'));
  await step('take', () => btn('承受'));
  await step('rest', () => btn('不休息'));
  await step('order', async () => { await p.locator('.ov-box.decision .card img[alt="Foresight"]').click(); await p.locator('.ov-box.decision .card img[alt="Hasten"]').click(); await p.locator('.ov-box.decision .card img[alt="Ember Strike"]').click(); await btn('確認'); });
  await step('extra', () => btn('完成'));
  await step('pass grow r2', () => btn('繼續')); // 第 2 回合 Staging：XP 夠成長時停下
  await p.screenshot({ path: `${out}/r2.png` });
  const state = await p.evaluate(() => JSON.parse(localStorage.getItem('radiance.save.v1')).game.session.checkpoint.round);
  console.log('checkpoint round', state);
  console.log('errors:', errs.join('\n'));
  if (state !== 2 || errs.length) process.exit(1);
  await b.close();
})();
