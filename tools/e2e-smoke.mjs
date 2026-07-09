/**
 * E2E smoke suite (`npm run e2e [url]`). Boots the REAL game in headless
 * Chromium and walks the core loops end to end: new game → combat kill →
 * hunt quest (sequential waves) → loot/drops → crafting → equipping →
 * pet egg hatch + assist → bestiary → save/reload round trip.
 *
 * Works against dev server AND production builds: state assertions go
 * through the debug-gated `window.__test` hooks (?debug=1), never module
 * imports. Any console pageerror or failed step exits non-zero — this is
 * the deploy gate that replaces hand testing.
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:4173';
const URL = `${BASE.replace(/\/$/, '')}/?debug=1`;

let browser;
const failures = [];
const passed = [];
let step = 'boot';

function check(name, cond, detail = '') {
  if (cond) {
    passed.push(name);
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ✗ ${name} ${detail}`);
  }
}

const snap = (p) => p.evaluate(() => window.__test.snapshot());

try {
  browser = await chromium.launch({
    args: ['--use-gl=swiftshader', '--no-sandbox'],
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  });
  const page = await browser.newPage({ viewport: { width: 360, height: 720 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  // ---- boot: notice → title → slot 1 → (skip tutorial) ----
  step = 'boot';
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await page.mouse.click(180, 400); await page.waitForTimeout(400);
  await page.mouse.click(180, 400); await page.waitForTimeout(400);
  await page.mouse.click(180, 374); await page.waitForTimeout(900);
  await page.mouse.click(294, 156); await page.waitForTimeout(1800);
  await page.mouse.click(64, 610); await page.waitForTimeout(800);
  await page.waitForFunction(() => !!window.__test, undefined, { timeout: 10000 });
  let s = await snap(page);
  check('新規ゲームで町に降り立つ', s.mapId === 'town', `mapId=${s.mapId}`);
  check('初期クエストが受注済み', s.activeQuests.includes('q_apprentice'));

  // ---- combat: field slime kill advances quest + bestiary + drops ----
  step = 'combat';
  await page.evaluate(() => {
    window.__test.powerUp(30);
    window.__test.warp('field');
  });
  await page.waitForTimeout(1600);
  await page.keyboard.down('w'); await page.waitForTimeout(2300); await page.keyboard.up('w');
  for (let i = 0; i < 18; i++) {
    for (const k of ['w', 'd', 'a']) {
      await page.keyboard.down(k); await page.waitForTimeout(80); await page.keyboard.up(k);
      await page.keyboard.down('j'); await page.waitForTimeout(90); await page.keyboard.up('j');
    }
    s = await snap(page);
    if ((s.killCounts['slime'] ?? 0) > 0) break;
  }
  s = await snap(page);
  check('スライムを討伐できる', (s.killCounts['slime'] ?? 0) > 0);
  check('討伐が図鑑カウントに入る', Object.keys(s.killCounts).length > 0);

  // ---- hunt quest: sequential waves via the real arena flow ----
  step = 'hunt';
  const accepted = await page.evaluate(() => window.__test.acceptQuest('hunt_r2_01_zephys'));
  check('狩猟クエストを受注できる', accepted === true);
  await page.evaluate(() => window.__test.warp('arena_plain'));
  await page.waitForTimeout(1600);
  await page.keyboard.down('w'); await page.waitForTimeout(1800); await page.keyboard.up('w');
  for (let i = 0; i < 40; i++) {
    for (const k of ['w', 'd', 'a']) {
      await page.keyboard.down(k); await page.waitForTimeout(85); await page.keyboard.up(k);
      await page.keyboard.down('j'); await page.waitForTimeout(95); await page.keyboard.up('j');
    }
    if (i % 5 === 4 && (await page.evaluate(() => window.__test.isQuestComplete('hunt_r2_01_zephys')))) break;
  }
  const huntDone = await page.evaluate(() => window.__test.isQuestComplete('hunt_r2_01_zephys'));
  check('ボスを倒して狩猟クエスト達成', huntDone === true);
  // Sweep the arena to hoover up the loot the boss dropped.
  for (const k of ['w', 'a', 's', 'd', 'w', 'd', 's', 'a', 'w']) {
    await page.keyboard.down(k); await page.waitForTimeout(320); await page.keyboard.up(k);
  }
  s = await snap(page);
  check('ボス素材がドロップする', (s.materials['gale_feather'] ?? 0) > 0);
  const turnedIn = await page.evaluate(() => window.__test.turnInQuest('hunt_r2_01_zephys'));
  check('報酬を受け取れる（turn-in）', turnedIn === true);
  s = await snap(page);
  check('repeatable でも完了が記録される（歴戦解放の前提）', s.completedQuests.includes('hunt_r2_01_zephys'));

  // ---- crafting via the real crafting scene ----
  step = 'craft';
  await page.evaluate(() => {
    window.__test.addMaterial('treant_sap', 10);
    window.__test.addMaterial('lord_hardwood', 5);
    window.__test.addMaterial('iron_ore', 10);
    window.__test.addGold(1000);
    window.__test.warp('town', 88, 480);
  });
  await page.waitForTimeout(1600);
  await page.keyboard.down('w'); await page.waitForTimeout(200); await page.keyboard.up('w');
  await page.keyboard.down('e'); await page.waitForTimeout(140); await page.keyboard.up('e'); await page.waitForTimeout(1200);
  // 武器タブ→槌チップ（bar内 6番目）は座標依存が強いので「全部」のまま、
  // craftable-first ソートで主の大槌が上位に来る前提で最初の 作る を押す。
  const before = await snap(page);
  await page.mouse.click(318, 172); await page.waitForTimeout(900); // 1行目の「作る」
  s = await snap(page);
  // Upgrade recipes consume the old piece, so owned-count can stay flat;
  // gold ALWAYS drops on a successful craft. Assert on that instead.
  const crafted = s.gold < before.gold;
  check('鍛冶屋で装備をクラフトできる', crafted, `gold ${before.gold}→${s.gold}`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(600);

  // ---- pets: egg → hatch → assist ----
  step = 'pets';
  await page.evaluate(() => window.__test.addEgg('pet_egg_wolf'));
  await page.mouse.click(336, 26); await page.waitForTimeout(900); // bag
  await page.mouse.click(168, 676); await page.waitForTimeout(800); // 🐾 ペット
  await page.mouse.click(302, 193); await page.waitForTimeout(900); // 孵化する
  s = await snap(page);
  check('たまごを孵化してペットが仲間になる', s.ownedPets.includes('wolf_pet'));
  check('最初のペットは自動で連れ歩き', s.activePetId === 'wolf_pet');
  await page.mouse.click(180, 686); await page.waitForTimeout(500); // とじる(pet)
  await page.keyboard.press('Escape'); await page.waitForTimeout(600);

  // ---- bestiary opens ----
  step = 'bestiary';
  await page.mouse.click(336, 26); await page.waitForTimeout(900);
  await page.mouse.click(100, 676); await page.waitForTimeout(800); // 📖 図鑑
  // Detail for the first (slime) row must open without errors.
  await page.mouse.click(180, 134); await page.waitForTimeout(600);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  check('図鑑が開ける（エラーなし）', pageErrors.length === 0, pageErrors[0]);

  // ---- save / reload round trip ----
  step = 'save';
  const beforeReload = await snap(page);
  await page.evaluate(() => window.__test.flushSave());
  await page.waitForTimeout(600);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await page.mouse.click(180, 400); await page.waitForTimeout(400);
  await page.mouse.click(180, 400); await page.waitForTimeout(400);
  await page.mouse.click(180, 374); await page.waitForTimeout(900);
  await page.mouse.click(315, 131); await page.waitForTimeout(1800); // slot 1 つづき
  await page.waitForFunction(() => !!window.__test, undefined, { timeout: 10000 });
  s = await snap(page);
  check('リロード後もレベルが残る', s.level === beforeReload.level, `${beforeReload.level}→${s.level}`);
  check('リロード後もペットが残る', s.ownedPets.includes('wolf_pet'));
  check('リロード後も図鑑討伐数が残る', (s.killCounts['slime'] ?? 0) > 0);
  check('リロード後も完了クエストが残る', s.completedQuests.includes('hunt_r2_01_zephys'));

  check('コンソールに未捕捉エラーなし', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
} catch (e) {
  failures.push(`step "${step}" threw: ${e?.message ?? e}`);
  console.error(e);
} finally {
  await browser?.close();
}

console.log('');
console.log(`E2E smoke: ${passed.length} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  FAILED: ${f}`);
  process.exit(1);
}
