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

  // ---- boot: first-run notice → title → slot 1 → elder quest → skip tutorial ----
  step = 'boot';
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await page.mouse.click(180, 400); await page.waitForTimeout(1200);
  await page.mouse.click(180, 360); await page.waitForTimeout(900);
  await page.mouse.click(294, 156); await page.waitForTimeout(1800);
  // Three elder lines, then tap inside (not on the top edge of) the single
  // 「依頼を受ける」 choice hit area.
  for (let i = 0; i < 3; i++) {
    await page.mouse.click(180, 680); await page.waitForTimeout(220);
  }
  await page.mouse.click(180, 650); await page.waitForTimeout(300);
  await page.waitForTimeout(500);
  await page.mouse.click(64, 610); await page.waitForTimeout(800);
  await page.waitForFunction(() => !!window.__test, undefined, { timeout: 10000 });
  let s = await snap(page);
  check('新規ゲームで町に降り立つ', s.mapId === 'town', `mapId=${s.mapId}`);
  const townTexture = await page.evaluate(() =>
    window.__test.textureSize('art.map.town.storybook'));
  check(
    '町背景が拡張版640×960で読み込まれる',
    townTexture?.width === 640 && townTexture?.height === 960,
    JSON.stringify(townTexture),
  );
  check('初期クエストが受注済み', s.activeQuests.includes('q_apprentice'));
  check(
    '町では北門への矢印と距離が出る',
    s.questGuide?.active === true
      && s.questGuide.mapId === 'town'
      && s.questGuide.hint === '北門へ'
      && s.questGuide.distance > 0,
    JSON.stringify(s.questGuide),
  );

  // The painted fountain and the storefronts must not join into a full-width
  // invisible wall. Reproduce the phone report: walk up its narrow left lane.
  await page.evaluate(() => window.__test.warp('town', 250, 550));
  await page.waitForTimeout(900);
  await page.keyboard.down('w'); await page.waitForTimeout(1650); await page.keyboard.up('w');
  s = await snap(page);
  check('噴水広場の左通路を通過できる', s.y < 430, `y=${Math.round(s.y)}`);

  const advancedJobs = [
    'samurai', 'sorcerer', 'holy_knight', 'ninja', 'ranger',
    'sword_kaiser', 'grand_magia', 'shield_saber', 'avengista', 'dual_star',
    'aramikagura', 'alvride', 'nirvadio', 'noxtia', 'oltarie',
  ];
  let allAdvancedLooks = true;
  for (const id of advancedJobs) {
    const changed = await page.evaluate((jobId) => window.__test.forceJob(jobId), id);
    await page.waitForTimeout(50);
    s = await snap(page);
    allAdvancedLooks &&= changed && s.jobId === id;
  }
  check('2・3・4次職15種の外見を切り替えられる', allAdvancedLooks);
  await page.evaluate(() => window.__test.forceJob('adventurer'));

  // The footer used to place 「とじる」 directly over 「ペット」, so a
  // single tap closed Inventory and launched PetScreen at the same time.
  await page.mouse.click(250, 28); await page.waitForTimeout(500);
  await page.mouse.click(180, 676); await page.waitForTimeout(500);
  const scenesAfterBagClose = await page.evaluate(() => window.__test.activeScenes());
  check(
    'もちものの閉じるボタンがペット画面へ貫通しない',
    scenesAfterBagClose.includes('World')
      && !scenesAfterBagClose.includes('Inventory')
      && !scenesAfterBagClose.includes('PetScreen'),
    `active=${scenesAfterBagClose.join(',')}`,
  );

  // ---- combat: field slime kill advances quest + bestiary + drops ----
  step = 'combat';
  await page.evaluate(() => window.__test.powerUp(30));
  // ランダムウォークだと足の速いコウモリを先に倒してスライムに一度も
  // 当たらないレースがあった（フレークの正体）。マップを入り直して
  // スポーン座標 (320,720) の真下へワープ→全方向斬りの決定的手順にする。
  for (let attempt = 0; attempt < 8; attempt++) {
    await page.evaluate(() => window.__test.warp('town'));
    await page.waitForTimeout(500);
    await page.evaluate(() => window.__test.warp('field', 320, 760));
    await page.waitForTimeout(900);
    if (attempt === 0) {
      const fieldGuide = await snap(page);
      check(
        '草原では最寄りのスライムへ案内が切り替わる',
        fieldGuide.questGuide?.active === true
          && fieldGuide.questGuide.mapId === 'field'
          && fieldGuide.questGuide.hint.includes('スライム'),
        JSON.stringify(fieldGuide.questGuide),
      );
      check(
        '近くの通常敵にターゲットHP表示が出る',
        fieldGuide.combatTarget?.active === true
          && fieldGuide.combatTarget.enemyId === 'slime'
          && fieldGuide.combatTarget.current === fieldGuide.combatTarget.max,
        JSON.stringify(fieldGuide.combatTarget),
      );
      await page.keyboard.down('d'); await page.waitForTimeout(1600); await page.keyboard.up('d');
      const wideField = await snap(page);
      check('草原を旧マップ幅より右まで探索できる', wideField.x > 430, `x=${Math.round(wideField.x)}`);

      await page.evaluate(() => window.__test.warp('field', 72, 444));
      await page.waitForTimeout(600);
      await page.keyboard.down('a'); await page.waitForTimeout(900); await page.keyboard.up('a');
      await page.waitForTimeout(900);
      const sideExit = await snap(page);
      check('広い草原の横道から森へ移動できる', sideExit.mapId === 'forest', `mapId=${sideExit.mapId}`);
      await page.evaluate(() => window.__test.warp('field', 320, 760));
      await page.waitForTimeout(900);
    }
    for (let lap = 0; lap < 3; lap++) {
      for (const k of ['w', 'a', 's', 'd']) {
        await page.keyboard.down(k); await page.waitForTimeout(110); await page.keyboard.up(k);
        await page.keyboard.down('j'); await page.waitForTimeout(120); await page.keyboard.up('j');
      }
    }
    s = await snap(page);
    if ((s.killCounts['slime'] ?? 0) > 0) break;
  }
  check('スライムを討伐できる', (s.killCounts['slime'] ?? 0) > 0);
  check('討伐が図鑑カウントに入る', Object.keys(s.killCounts).length > 0);
  for (let i = 0; i < 5; i++) await page.evaluate(() => window.__test.recordKill('slime'));
  await page.waitForTimeout(350);
  s = await snap(page);
  check(
    '討伐進捗通知が目標達成を伝える',
    s.questProgress?.enemyId === 'slime'
      && s.questProgress.current === s.questProgress.total
      && s.questProgress.complete === true,
    JSON.stringify(s.questProgress),
  );
  check(
    '達成後は町への帰還案内に切り替わる',
    s.questGuide?.active === true && s.questGuide.hint.includes('町へ'),
    JSON.stringify(s.questGuide),
  );
  await page.evaluate(() => window.__test.warp('town', 320, 800));
  await page.waitForTimeout(900);
  s = await snap(page);
  check(
    '町では掲示板への報告案内に切り替わる',
    s.questGuide?.active === true && s.questGuide.hint.includes('掲示板'),
    JSON.stringify(s.questGuide),
  );

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
  await page.keyboard.press('Escape'); await page.waitForTimeout(700); // close quest result
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
    // Approach from the road above the fountain; the painted fountain is solid.
    window.__test.warp('town', 145, 335);
  });
  await page.waitForTimeout(1600);
  await page.keyboard.down('e'); await page.waitForTimeout(140); await page.keyboard.up('e'); await page.waitForTimeout(1200);
  await page.waitForFunction(() => window.__test.activeScenes().includes('Crafting'));
  // シリーズ別表示（レア度順）: 初回は「作れるものがある」最初のシリーズが
  // 自動展開され、そこへ自動スクロールする。よって画面上 1行目(136-200)が
  // そのヘッダー、直下(200-276)が最初のレシピ行（craftable-first 順）。
  const before = await snap(page);
  await page.mouse.click(318, 236); await page.waitForTimeout(900); // 展開済み1本目の「作る」
  s = await snap(page);
  // Upgrade recipes consume the old piece, so owned-count can stay flat;
  // gold ALWAYS drops on a successful craft. Assert on that instead.
  const crafted = s.gold < before.gold;
  check('鍛冶屋で装備をクラフトできる', crafted, `gold ${before.gold}→${s.gold}`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(600);

  // ---- pets: egg → hatch → assist ----
  step = 'pets';
  await page.evaluate(() => window.__test.addEgg('pet_egg_wolf'));
  await page.mouse.click(250, 28); await page.waitForTimeout(900); // bag
  await page.mouse.click(248, 676); await page.waitForTimeout(800); // 🐾 ペット
  await page.waitForFunction(() => window.__test.activeScenes().includes('PetScreen'));
  const hatchPressed = await page.evaluate(() => window.__test.activateText('PetScreen', '孵化する'));
  check('ペット画面の孵化ボタンを操作できる', hatchPressed === true);
  await page.waitForTimeout(900);
  s = await snap(page);
  check('たまごを孵化してペットが仲間になる', s.ownedPets.includes('wolf_pet'));
  check('最初のペットは自動で連れ歩き', s.activePetId === 'wolf_pet');
  await page.evaluate(() => window.__test.activateText('PetScreen', 'とじる'));
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape'); await page.waitForTimeout(600);

  // ---- bestiary opens ----
  step = 'bestiary';
  await page.mouse.click(250, 28); await page.waitForTimeout(900);
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
  await page.mouse.click(180, 360); await page.waitForTimeout(1800); // latest save: one-tap continue
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
