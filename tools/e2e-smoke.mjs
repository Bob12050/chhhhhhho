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
const SCROLL_ONLY = process.argv.includes('--scroll-only');
const VIEWPORT_HEIGHT = Number.parseInt(process.env.E2E_VIEWPORT_HEIGHT ?? '720', 10);
const JOB_TREE_SCREENSHOT = process.env.E2E_JOB_TREE_SCREENSHOT;

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

async function waitForScene(page, sceneKey, timeout = 30000) {
  await page.waitForFunction(
    (key) => window.__test?.activeScenes().includes(key),
    sceneKey,
    { timeout },
  );
}

async function activateTextWhenReady(page, sceneKey, label, timeout = 10000) {
  await page.waitForFunction(
    ([key, text]) => window.__test?.activateText(key, text) === true,
    [sceneKey, label],
    { polling: 100, timeout },
  );
}

/** Hold one movement key until the intended map/coordinate milestone is reached. */
async function moveUntil(page, key, goal, timeout = 8000) {
  await page.keyboard.down(key);
  try {
    await page.waitForFunction(
      ({ mapId, axis, lt, gt }) => {
        const state = window.__test?.snapshot();
        if (!state || state.mapId !== mapId) return false;
        if (!axis) return true;
        const value = state[axis];
        return (lt === undefined || value < lt) && (gt === undefined || value > gt);
      },
      goal,
      { polling: 50, timeout },
    );
  } catch {
    // The assertion below records the final coordinate with a useful message.
  } finally {
    await page.keyboard.up(key);
  }
}

try {
  browser = await chromium.launch({
    args: ['--use-gl=swiftshader', '--no-sandbox'],
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  });
  const page = await browser.newPage({ viewport: { width: 360, height: VIEWPORT_HEIGHT } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  // ---- boot: first-run notice → title → slot 1 → elder quest → skip tutorial ----
  step = 'boot';
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(
    () => window.__test?.activeScenes().some((key) => key === 'Notice' || key === 'Title'),
    undefined,
    { timeout: 30000 },
  );
  const openingScenes = await page.evaluate(() => window.__test.activeScenes());
  if (openingScenes.includes('Notice')) {
    await page.mouse.click(180, 400);
  }
  await waitForScene(page, 'Title');
  await activateTextWhenReady(page, 'Title', 'ゲームをはじめる');
  await waitForScene(page, 'SaveSelect');
  await activateTextWhenReady(page, 'SaveSelect', 'はじめる');
  await waitForScene(page, 'CharacterSelect');
  await activateTextWhenReady(page, 'CharacterSelect', '男性');
  await activateTextWhenReady(page, 'CharacterSelect', 'この姿で始める');
  await waitForScene(page, 'Dialogue', 20000);
  // Advance the three elder lines via the scene's keyboard contract, then
  // activate the choice by label. Coordinate taps here were brittle whenever
  // the logical height or device letterbox changed.
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('e'); await page.waitForTimeout(120);
  }
  await activateTextWhenReady(page, 'Dialogue', '依頼を受ける');
  await page.waitForFunction(
    () => !window.__test.activeScenes().includes('Dialogue')
      && window.__test.activeScenes().includes('World'),
    undefined,
    { timeout: 10000 },
  );
  await activateTextWhenReady(page, 'UI', 'スキップ');
  await page.waitForTimeout(500);
  let s = await snap(page);
  check('新規ゲームで町に降り立つ', s.mapId === 'town', `mapId=${s.mapId}`);
  const townTexture = await page.evaluate(() =>
    window.__test.textureSize('art.map.town.storybook'));
  check(
    '町背景がHD版1280×1920で読み込まれる',
    townTexture?.width === 1280 && townTexture?.height === 1920,
    JSON.stringify(townTexture),
  );
  const npcTextures = await page.evaluate(() => [
    'gen.npc.merchant',
    'gen.npc.smith',
    'gen.npc.guild',
    'gen.npc.elder',
    'gen.npc.villager',
    'gen.npc.quest',
  ].map((key) => ({ key, size: window.__test.textureSize(key) })));
  check(
    '町NPC6役がHD版192×192で読み込まれる',
    npcTextures.every(({ size }) => size?.width === 192 && size?.height === 192),
    JSON.stringify(npcTextures),
  );
  const slimeTextures = await page.evaluate(() => ({
    normal: window.__test.textureSize('gen.enemy.slime'),
    royal: window.__test.textureSize('gen.enemy.slime_royal'),
  }));
  check(
    '通常スライムと王冠スライムの外見が分離されている',
    slimeTextures.normal?.width === 96
      && slimeTextures.normal?.height === 96
      && slimeTextures.royal?.width === 96
      && slimeTextures.royal?.height === 96,
    JSON.stringify(slimeTextures),
  );
  const materialIconKeys = [
    'jelly', 'pelt', 'ore', 'metal', 'herb', 'wood_sap', 'fang', 'claw',
    'horn', 'wing', 'feather', 'scale', 'carapace', 'core', 'orb', 'crystal',
    'spore', 'machine', 'sand', 'proof',
  ].map((kind) => `gen.icon.material.${kind}`);
  const materialIconSizes = await page.evaluate((keys) =>
    keys.map((key) => ({ key, size: window.__test.textureSize(key) })), materialIconKeys);
  check(
    '素材分類20種の単色ドットアイコンを読み込める',
    materialIconSizes.every(({ size }) => size?.width === 16 && size?.height === 16),
    JSON.stringify(materialIconSizes),
  );
  const firstTierLooks = [
    ['fighter', 'gen.char.fighter', 'art.char.fighter.diagonal', 768, 3456, 768, 1152],
    ['mage', 'gen.char.mage', 'art.char.mage.diagonal', 768, 3456, 768, 1152],
    ['priest', 'gen.char.priest', 'art.char.priest.diagonal', 768, 3456, 768, 1152],
    ['thief', 'gen.char.thief', 'art.char.thief.diagonal', 768, 3456, 768, 1152],
    ['pet_raiser', 'gen.char.pet_raiser', 'art.char.pet_raiser.diagonal', 768, 3456, 768, 1152],
  ];
  let allFirstTierLooks = true;
  for (const [id, cardinalKey, diagonalKey, cardinalW, cardinalH, diagonalW, diagonalH] of firstTierLooks) {
    const result = await page.evaluate(([jobId, cardinal, diagonal]) => ({
      changed: window.__test.forceJob(jobId),
      cardinal: window.__test.textureSize(cardinal),
      diagonal: window.__test.textureSize(diagonal),
    }), [id, cardinalKey, diagonalKey]);
    allFirstTierLooks &&= result.changed
      && result.cardinal?.width === cardinalW
      && result.cardinal?.height === cardinalH
      && result.diagonal?.width === diagonalW
      && result.diagonal?.height === diagonalH;
  }
  check('一次職5種の通常・斜め外見を読み込める', allFirstTierLooks);
  const adventurerLooks = await page.evaluate(() => ({
    cardinal: window.__test.textureSize('gen.player.body'),
    diagonal: window.__test.textureSize('art.player.body.diagonal'),
  }));
  check(
    '初期冒険者の通常・斜め外見もHDで読み込める',
    adventurerLooks.cardinal?.width === 768
      && adventurerLooks.cardinal?.height === 3456
      && adventurerLooks.diagonal?.width === 768
      && adventurerLooks.diagonal?.height === 1152,
    JSON.stringify(adventurerLooks),
  );
  const maleLooks = [
    ['adventurer', 'art.player.body.male', 'art.player.body.male.diagonal'],
    ['fighter', 'art.char.fighter.male', 'art.char.fighter.male.diagonal'],
    ['mage', 'art.char.mage.male', 'art.char.mage.male.diagonal'],
    ['priest', 'art.char.priest.male', 'art.char.priest.male.diagonal'],
    ['thief', 'art.char.thief.male', 'art.char.thief.male.diagonal'],
    ['pet_raiser', 'art.char.pet_raiser.male', 'art.char.pet_raiser.male.diagonal'],
    ['samurai', 'art.char.samurai.male', 'art.char.samurai.male.diagonal'],
    ['sorcerer', 'art.char.sorcerer.male', 'art.char.sorcerer.male.diagonal'],
    ['holy_knight', 'art.char.holy_knight.male', 'art.char.holy_knight.male.diagonal'],
    ['ninja', 'art.char.ninja.male', 'art.char.ninja.male.diagonal'],
    ['ranger', 'art.char.ranger.male', 'art.char.ranger.male.diagonal'],
    ['sword_kaiser', 'art.char.sword_kaiser.male', 'art.char.sword_kaiser.male.diagonal'],
    ['grand_magia', 'art.char.grand_magia.male', 'art.char.grand_magia.male.diagonal'],
    ['shield_saber', 'art.char.shield_saber.male', 'art.char.shield_saber.male.diagonal'],
    ['avengista', 'art.char.avengista.male', 'art.char.avengista.male.diagonal'],
    ['dual_star', 'art.char.dual_star.male', 'art.char.dual_star.male.diagonal'],
    ['aramikagura', 'art.char.aramikagura.male', 'art.char.aramikagura.male.diagonal'],
    ['alvride', 'art.char.alvride.male', 'art.char.alvride.male.diagonal'],
    ['nirvadio', 'art.char.nirvadio.male', 'art.char.nirvadio.male.diagonal'],
    ['noxtia', 'art.char.noxtia.male', 'art.char.noxtia.male.diagonal'],
    ['oltarie', 'art.char.oltarie.male', 'art.char.oltarie.male.diagonal'],
  ];
  let allMaleLooks = true;
  for (const [, cardinalKey, diagonalKey] of maleLooks) {
    const result = await page.evaluate(([cardinal, diagonal]) => ({
      cardinal: window.__test.textureSize(cardinal),
      diagonal: window.__test.textureSize(diagonal),
    }), [cardinalKey, diagonalKey]);
    allMaleLooks &&= result.cardinal?.width === 768
      && result.cardinal?.height === 3456
      && result.diagonal?.width === 768
      && result.diagonal?.height === 1152;
  }
  check('男性21職の通常・斜め外見をHDで読み込める', allMaleLooks);
  await page.evaluate(() => {
    window.__test.forceGender('male');
    window.__test.forceJob('fighter');
  });
  s = await snap(page);
  check('男性を選んだまま転職できる', s.gender === 'male' && s.jobId === 'fighter');
  await page.evaluate(() => window.__test.forceJob('adventurer'));
  check('初期クエストが受注済み', s.activeQuests.includes('q_apprentice'));
  check(
    '町では北門への矢印と距離が出る',
    s.questGuide?.active === true
      && s.questGuide.mapId === 'town'
      && s.questGuide.hint === '北門へ'
      && s.questGuide.distance > 0,
    JSON.stringify(s.questGuide),
  );

  // Debug mode must be reachable from the same settings screen that enables it.
  await activateTextWhenReady(page, 'UI', 'もちもの');
  await waitForScene(page, 'Inventory');
  const inventoryView = await page.evaluate(() => window.__test.sceneScroll('Inventory'));
  const footerY = (inventoryView?.height ?? 720) - 88;
  const dragStartY = Math.min((inventoryView?.viewBottom ?? 604) - 80, footerY - 120);
  await page.mouse.move(222, dragStartY);
  await page.mouse.down();
  for (const y of [dragStartY + 45, dragStartY + 90, footerY]) {
    await page.mouse.move(222, y);
    await page.waitForTimeout(18);
  }
  await page.mouse.up();
  await page.waitForTimeout(100);
  const scenesAfterInventorySwipe = await page.evaluate(() => window.__test.activeScenes());
  check(
    'もちものをスクロールしてペット上で離しても誤作動しない',
    scenesAfterInventorySwipe.includes('Inventory')
      && !scenesAfterInventorySwipe.includes('PetScreen'),
    `active=${scenesAfterInventorySwipe.join(',')}`,
  );
  await activateTextWhenReady(page, 'Inventory', '設定');
  await waitForScene(page, 'Options');
  await activateTextWhenReady(page, 'Options', 'デバッグメニューを開く');
  await waitForScene(page, 'Debug');
  check('設定からデバッグメニューを開ける', true);
  await activateTextWhenReady(page, 'Debug', 'とじる');
  await waitForScene(page, 'Options');
  check(
    'デバッグメニューを閉じると設定へ戻る',
    !(await page.evaluate(() => window.__test.activeScenes().includes('Debug'))),
  );
  await activateTextWhenReady(page, 'Options', 'デバッグメニューを開く');
  await waitForScene(page, 'Debug');
  await activateTextWhenReady(page, 'Debug', '周回バランスラボ');
  await waitForScene(page, 'BalanceLab');
  const menuBefore = await page.evaluate(() => window.__test.sceneScroll('BalanceLab'));
  await page.mouse.move(180, 620);
  await page.mouse.down();
  for (const y of [580, 530, 480, 430, 380, 330]) {
    await page.mouse.move(180, y);
    await page.waitForTimeout(18);
  }
  await page.mouse.up();
  await page.waitForTimeout(100);
  const menuAfter = await page.evaluate(() => window.__test.sceneScroll('BalanceLab'));
  check(
    '縦長メニューを指に追従してスクロールできる',
    (menuAfter?.y ?? 0) > (menuBefore?.y ?? 0) + 80,
    JSON.stringify({ before: menuBefore, after: menuAfter }),
  );
  await page.mouse.move(180, 330);
  await page.mouse.down();
  for (const y of [370, 420, 470, 520, 570]) {
    await page.mouse.move(180, y);
    await page.waitForTimeout(18);
  }
  await page.mouse.up();
  await page.waitForTimeout(100);
  const menuAfterReverse = await page.evaluate(() => window.__test.sceneScroll('BalanceLab'));
  check(
    '縦長メニューが2回目の逆方向スワイプにも反応する',
    (menuAfterReverse?.y ?? 0) < (menuAfter?.y ?? 0) - 50,
    JSON.stringify({ first: menuAfter, second: menuAfterReverse }),
  );
  await page.keyboard.press('Escape');
  await waitForScene(page, 'Debug');
  await activateTextWhenReady(page, 'Debug', '職業ツリー');
  await waitForScene(page, 'JobChange');
  check('転職画面が4列職業ツリーで開く', true);
  if (JOB_TREE_SCREENSHOT) {
    await page.locator('canvas').screenshot({ path: JOB_TREE_SCREENSHOT });
  }
  const canvasBounds = await page.evaluate(() => {
    const rect = document.querySelector('canvas')?.getBoundingClientRect();
    return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
  });
  const treeBefore = await page.evaluate(() => window.__test.sceneScroll('JobChange'));
  await page.mouse.move(325, 500);
  await page.mouse.down();
  for (const x of [285, 240, 195, 150, 105, 65]) {
    await page.mouse.move(x, 500);
    await page.waitForTimeout(18);
  }
  const treeDuring = await page.evaluate(() => window.__test.sceneScroll('JobChange'));
  await page.mouse.up();
  await page.waitForTimeout(100);
  const treeAfter = await page.evaluate(() => window.__test.sceneScroll('JobChange'));
  check(
    '職業ツリーを指に追従して横スクロールできる',
    (treeAfter?.x ?? 0) > (treeBefore?.x ?? 0) + 80,
    JSON.stringify({ canvasBounds, before: treeBefore, during: treeDuring, after: treeAfter }),
  );
  await page.mouse.move(65, 500);
  await page.mouse.down();
  for (const x of [105, 150, 195, 240, 285]) {
    await page.mouse.move(x, 500);
    await page.waitForTimeout(18);
  }
  await page.mouse.up();
  await page.waitForTimeout(100);
  const treeAfterReverse = await page.evaluate(() => window.__test.sceneScroll('JobChange'));
  check(
    '職業ツリーが2回目の逆方向スワイプにも反応する',
    (treeAfterReverse?.x ?? 0) < (treeAfter?.x ?? 0) - 50,
    JSON.stringify({ first: treeAfter, second: treeAfterReverse }),
  );
  await activateTextWhenReady(page, 'JobChange', 'とじる');
  await waitForScene(page, 'World');

  if (SCROLL_ONLY) {
    check('スクロール確認中に未捕捉エラーなし', pageErrors.length === 0, pageErrors[0]);
    await browser.close();
    browser = undefined;
    console.log('');
    console.log(`E2E scroll: ${passed.length} passed, ${failures.length} failed`);
    if (failures.length) {
      for (const failure of failures) console.log(`  FAILED: ${failure}`);
      process.exit(1);
    }
    process.exit(0);
  }

  // The painted fountain and the storefronts must not join into a full-width
  // invisible wall. Reproduce the phone report: walk up its narrow left lane.
  await page.evaluate(() => window.__test.warp('town', 250, 550));
  await page.waitForTimeout(900);
  await page.keyboard.down('w');
  await page.waitForFunction(() => window.__test.snapshot().y < 430, undefined, { timeout: 6000 }).catch(() => {});
  await page.keyboard.up('w');
  s = await snap(page);
  check('噴水広場の左通路を通過できる', s.y < 430, `y=${Math.round(s.y)}`);

  // A defeat used to return the player beside the curved southern scenery,
  // where a stale touch or tight collision could leave the new actor stuck.
  await page.evaluate(() => window.__test.warp('town', 320, 735));
  await page.waitForTimeout(700);
  await page.keyboard.down('w'); await page.waitForTimeout(650); await page.keyboard.up('w');
  s = await snap(page);
  check('死亡復帰地点からすぐ歩き出せる', s.y < 700, `y=${Math.round(s.y)}`);

  const secondTierLooks = [
    ['samurai', 'gen.char.samurai', 'art.char.samurai.diagonal'],
    ['sorcerer', 'gen.char.sorcerer', 'art.char.sorcerer.diagonal'],
    ['holy_knight', 'gen.char.holy_knight', 'art.char.holy_knight.diagonal'],
    ['ninja', 'gen.char.ninja', 'art.char.ninja.diagonal'],
    ['ranger', 'gen.char.ranger', 'art.char.ranger.diagonal'],
  ];
  let allSecondTierLooks = true;
  for (const [id, cardinalKey, diagonalKey] of secondTierLooks) {
    const result = await page.evaluate(([jobId, cardinal, diagonal]) => ({
      changed: window.__test.forceJob(jobId),
      cardinal: window.__test.textureSize(cardinal),
      diagonal: window.__test.textureSize(diagonal),
    }), [id, cardinalKey, diagonalKey]);
    allSecondTierLooks &&= result.changed
      && result.cardinal?.width === 768
      && result.cardinal?.height === 3456
      && result.diagonal?.width === 768
      && result.diagonal?.height === 1152;
  }
  check('2次職5種の通常・斜め外見を読み込める', allSecondTierLooks);

  const thirdTierLooks = [
    ['sword_kaiser', 'gen.char.sword_kaiser', 'art.char.sword_kaiser.diagonal'],
    ['grand_magia', 'gen.char.grand_magia', 'art.char.grand_magia.diagonal'],
    ['shield_saber', 'gen.char.shield_saber', 'art.char.shield_saber.diagonal'],
    ['avengista', 'gen.char.avengista', 'art.char.avengista.diagonal'],
    ['dual_star', 'gen.char.dual_star', 'art.char.dual_star.diagonal'],
  ];
  let allThirdTierLooks = true;
  for (const [id, cardinalKey, diagonalKey] of thirdTierLooks) {
    const result = await page.evaluate(([jobId, cardinal, diagonal]) => ({
      changed: window.__test.forceJob(jobId),
      cardinal: window.__test.textureSize(cardinal),
      diagonal: window.__test.textureSize(diagonal),
    }), [id, cardinalKey, diagonalKey]);
    allThirdTierLooks &&= result.changed
      && result.cardinal?.width === 768
      && result.cardinal?.height === 3456
      && result.diagonal?.width === 768
      && result.diagonal?.height === 1152;
  }
  check('3次職5種の通常・斜め外見を読み込める', allThirdTierLooks);

  const fourthTierLooks = [
    ['aramikagura', 'gen.char.aramikagura', 'art.char.aramikagura.diagonal'],
    ['alvride', 'gen.char.alvride', 'art.char.alvride.diagonal'],
    ['nirvadio', 'gen.char.nirvadio', 'art.char.nirvadio.diagonal'],
    ['noxtia', 'gen.char.noxtia', 'art.char.noxtia.diagonal'],
    ['oltarie', 'gen.char.oltarie', 'art.char.oltarie.diagonal'],
  ];
  let allFourthTierLooks = true;
  for (const [id, cardinalKey, diagonalKey] of fourthTierLooks) {
    const result = await page.evaluate(([jobId, cardinal, diagonal]) => ({
      changed: window.__test.forceJob(jobId),
      cardinal: window.__test.textureSize(cardinal),
      diagonal: window.__test.textureSize(diagonal),
    }), [id, cardinalKey, diagonalKey]);
    allFourthTierLooks &&= result.changed
      && result.cardinal?.width === 768
      && result.cardinal?.height === 3456
      && result.diagonal?.width === 768
      && result.diagonal?.height === 1152;
  }
  check('4次職5種の通常・斜め外見を読み込める', allFourthTierLooks);

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
  await activateTextWhenReady(page, 'UI', 'もちもの');
  await waitForScene(page, 'Inventory');
  await activateTextWhenReady(page, 'Inventory', 'とじる');
  await page.waitForTimeout(500);
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
  // This suite validates combat flow, drops, quests and persistence rather
  // than rank-2 balance. Extra durability keeps boss movement/attack RNG from
  // killing the automation player before its keyboard path reaches melee.
  await page.evaluate(() => window.__test.powerUp(60));
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
      await moveUntil(page, 'd', { mapId: 'field', axis: 'x', gt: 430 });
      const wideField = await snap(page);
      check('草原を旧マップ幅より右まで探索できる', wideField.x > 430, `x=${Math.round(wideField.x)}`);

      await page.evaluate(() => window.__test.warp('field', 72, 444));
      await page.waitForTimeout(600);
      await moveUntil(page, 'a', { mapId: 'forest' });
      const sideExit = await snap(page);
      check('広い草原の横道から森へ移動できる', sideExit.mapId === 'forest', `mapId=${sideExit.mapId}`);
      const forestTexture = await page.evaluate(() =>
        window.__test.textureSize('art.map.forest.storybook'));
      check(
        '森背景がHD版1280×1920で読み込まれる',
        forestTexture?.width === 1280 && forestTexture?.height === 1920,
        JSON.stringify(forestTexture),
      );
      await page.evaluate(() => window.__test.warp('forest', 320, 884));
      await page.waitForTimeout(500);
      await moveUntil(page, 'w', { mapId: 'forest', axis: 'y', lt: 790 });
      const forestEntry = await snap(page);
      check(
        '森の入口から中央の戦闘路へ進める',
        forestEntry.mapId === 'forest' && forestEntry.y < 790,
        `mapId=${forestEntry.mapId} y=${Math.round(forestEntry.y)}`,
      );
      await page.evaluate(() => window.__test.warp('forest', 180, 560));
      await page.waitForTimeout(500);
      await moveUntil(page, 'w', { mapId: 'forest', axis: 'y', lt: 440 });
      const forestLeftLoop = await snap(page);
      check(
        '森の大樹左側を回り込んで探索できる',
        forestLeftLoop.mapId === 'forest' && forestLeftLoop.y < 440,
        `mapId=${forestLeftLoop.mapId} y=${Math.round(forestLeftLoop.y)}`,
      );
      await page.evaluate(() => window.__test.warp('forest', 455, 520));
      await page.waitForTimeout(700);
      await moveUntil(page, 'w', { mapId: 'forest', axis: 'y', lt: 390 });
      const forestLoop = await snap(page);
      check(
        '森の大樹右側を回り込んで探索できる',
        forestLoop.mapId === 'forest' && forestLoop.y < 390,
        `mapId=${forestLoop.mapId} y=${Math.round(forestLoop.y)}`,
      );
      await page.evaluate(() => window.__test.warp('forest', 320, 884));
      await page.waitForTimeout(500);
      await moveUntil(page, 's', { mapId: 'field' });
      const forestExit = await snap(page);
      check('森の南口から草原へ戻れる', forestExit.mapId === 'field', `mapId=${forestExit.mapId}`);
      await page.evaluate(() => window.__test.warp('dungeon'));
      await page.waitForTimeout(700);
      const dungeonTexture = await page.evaluate(() =>
        window.__test.textureSize('art.map.dungeon.storybook'));
      check(
        '洞窟背景がHD版1280×1920で読み込まれる',
        dungeonTexture?.width === 1280 && dungeonTexture?.height === 1920,
        JSON.stringify(dungeonTexture),
      );
      await page.evaluate(() => window.__test.warp('dungeon', 320, 884));
      await page.waitForTimeout(500);
      await moveUntil(page, 'w', { mapId: 'dungeon', axis: 'y', lt: 790 });
      const dungeonEntry = await snap(page);
      check(
        '洞窟の南入口から中央路へ進める',
        dungeonEntry.mapId === 'dungeon' && dungeonEntry.y < 790,
        `mapId=${dungeonEntry.mapId} y=${Math.round(dungeonEntry.y)}`,
      );
      await page.evaluate(() => window.__test.warp('dungeon', 320, 340));
      await page.waitForTimeout(500);
      await moveUntil(page, 'w', { mapId: 'dungeon', axis: 'y', lt: 230 });
      const dungeonNorth = await snap(page);
      check(
        '洞窟の中央路を北の封印門前まで進める',
        dungeonNorth.mapId === 'dungeon' && dungeonNorth.y < 230,
        `mapId=${dungeonNorth.mapId} y=${Math.round(dungeonNorth.y)}`,
      );
      await page.evaluate(() => window.__test.warp('dungeon', 320, 340));
      await page.waitForTimeout(500);
      await moveUntil(page, 'd', { mapId: 'dungeon', axis: 'x', gt: 430 });
      const crystalBranch = await snap(page);
      check(
        '洞窟の水晶泉側へ分岐して探索できる',
        crystalBranch.mapId === 'dungeon' && crystalBranch.x > 430,
        `mapId=${crystalBranch.mapId} x=${Math.round(crystalBranch.x)}`,
      );
      await page.evaluate(() => window.__test.warp('dungeon', 200, 520));
      await page.waitForTimeout(500);
      await moveUntil(page, 'w', { mapId: 'dungeon', axis: 'y', lt: 400 });
      const mineBranch = await snap(page);
      check(
        '洞窟の採掘坑道を北へ通り抜けられる',
        mineBranch.mapId === 'dungeon' && mineBranch.y < 400,
        `mapId=${mineBranch.mapId} y=${Math.round(mineBranch.y)}`,
      );
      await page.evaluate(() => window.__test.warp('dungeon', 78, 328));
      await page.waitForTimeout(500);
      await moveUntil(page, 'd', { mapId: 'dungeon', axis: 'x', gt: 190 });
      const canyonEntrance = await snap(page);
      check(
        '渓谷側の横穴から洞窟中央へ入れる',
        canyonEntrance.mapId === 'dungeon' && canyonEntrance.x > 190,
        `mapId=${canyonEntrance.mapId} x=${Math.round(canyonEntrance.x)}`,
      );
      await page.evaluate(() => window.__test.warp('canyon'));
      await page.waitForTimeout(700);
      const canyonTexture = await page.evaluate(() =>
        window.__test.textureSize('art.map.canyon.storybook'));
      check(
        '渓谷背景がHD版1280×1920で読み込まれる',
        canyonTexture?.width === 1280 && canyonTexture?.height === 1920,
        JSON.stringify(canyonTexture),
      );
      await page.evaluate(() => window.__test.warp('canyon', 320, 785));
      await page.waitForTimeout(400);
      await moveUntil(page, 'w', { mapId: 'dungeon' });
      const caveMouth = await snap(page);
      check('渓谷の洞穴から洞窟へ戻れる', caveMouth.mapId === 'dungeon', `mapId=${caveMouth.mapId}`);
      await page.evaluate(() => window.__test.warp('canyon', 320, 820));
      await page.waitForTimeout(400);
      // The trail runs through the narrow gap between the west wall and mesa.
      // Move into the middle of that gap before turning north.
      await moveUntil(page, 'a', { mapId: 'canyon', axis: 'x', lt: 150 });
      await moveUntil(page, 'w', { mapId: 'canyon', axis: 'y', lt: 760 });
      const mesaTrail = await snap(page);
      check(
        '洞窟前広場から左の高台道へ上がれる',
        mesaTrail.mapId === 'canyon' && mesaTrail.x < 210 && mesaTrail.y < 760,
        `mapId=${mesaTrail.mapId} x=${Math.round(mesaTrail.x)} y=${Math.round(mesaTrail.y)}`,
      );
      await page.evaluate(() => window.__test.warp('canyon', 555, 575));
      await page.waitForTimeout(400);
      await moveUntil(page, 'a', { mapId: 'canyon', axis: 'x', lt: 440 });
      const lowerBridge = await snap(page);
      check(
        '渓谷の下側吊り橋を渡れる',
        lowerBridge.mapId === 'canyon' && lowerBridge.x < 440,
        `mapId=${lowerBridge.mapId} x=${Math.round(lowerBridge.x)}`,
      );
      await page.evaluate(() => window.__test.warp('canyon', 550, 335));
      await page.waitForTimeout(400);
      await moveUntil(page, 'a', { mapId: 'canyon', axis: 'x', lt: 435 });
      const upperBridge = await snap(page);
      check(
        '渓谷の上側吊り橋を渡れる',
        upperBridge.mapId === 'canyon' && upperBridge.x < 435,
        `mapId=${upperBridge.mapId} x=${Math.round(upperBridge.x)}`,
      );
      await page.evaluate(() => window.__test.warp('canyon', 320, 174));
      await page.waitForTimeout(400);
      await moveUntil(page, 'w', { mapId: 'volcano' });
      const volcanoPass = await snap(page);
      check('渓谷上部から火山へ進める', volcanoPass.mapId === 'volcano', `mapId=${volcanoPass.mapId}`);
      const volcanoTexture = await page.evaluate(() =>
        window.__test.textureSize('art.map.volcano.storybook'));
      check(
        '火山背景がHD版1280×1920で読み込まれる',
        volcanoTexture?.width === 1280 && volcanoTexture?.height === 1920,
        JSON.stringify(volcanoTexture),
      );
      await page.evaluate(() => window.__test.warp('volcano', 320, 900));
      await page.waitForTimeout(400);
      await moveUntil(page, 'w', { mapId: 'canyon' });
      const canyonGate = await snap(page);
      check('火山南門から渓谷へ戻れる', canyonGate.mapId === 'canyon', `mapId=${canyonGate.mapId}`);
      await page.evaluate(() => window.__test.warp('volcano', 230, 420));
      await page.waitForTimeout(400);
      await moveUntil(page, 'w', { mapId: 'volcano', axis: 'y', lt: 310 });
      const obsidianTrail = await snap(page);
      check(
        '火山の黒曜石遺跡を北へ抜けられる',
        obsidianTrail.mapId === 'volcano' && obsidianTrail.y < 310,
        `mapId=${obsidianTrail.mapId} x=${Math.round(obsidianTrail.x)} y=${Math.round(obsidianTrail.y)}`,
      );
      await page.evaluate(() => window.__test.warp('volcano', 450, 700));
      await page.waitForTimeout(400);
      await moveUntil(page, 'w', { mapId: 'volcano', axis: 'y', lt: 570 });
      const lowerLavaBridge = await snap(page);
      check(
        '火山右側の下段溶岩橋を北へ渡れる',
        lowerLavaBridge.mapId === 'volcano' && lowerLavaBridge.y < 570,
        `mapId=${lowerLavaBridge.mapId} x=${Math.round(lowerLavaBridge.x)} y=${Math.round(lowerLavaBridge.y)}`,
      );
      await page.evaluate(() => window.__test.warp('volcano', 450, 440));
      await page.waitForTimeout(400);
      await moveUntil(page, 'w', { mapId: 'volcano', axis: 'y', lt: 330 });
      const upperLavaBridge = await snap(page);
      check(
        '火山右側の上段溶岩橋を北へ渡れる',
        upperLavaBridge.mapId === 'volcano' && upperLavaBridge.y < 330,
        `mapId=${upperLavaBridge.mapId} x=${Math.round(upperLavaBridge.x)} y=${Math.round(upperLavaBridge.y)}`,
      );
      await page.evaluate(() => window.__test.warp('volcano', 320, 145));
      await page.waitForTimeout(400);
      await moveUntil(page, 's', { mapId: 'volcano', axis: 'y', gt: 220 });
      const snowGateLanding = await snap(page);
      check(
        '雪原側の火山入口から南へ進める',
        snowGateLanding.mapId === 'volcano' && snowGateLanding.y > 220,
        `mapId=${snowGateLanding.mapId} y=${Math.round(snowGateLanding.y)}`,
      );
      await page.evaluate(() => window.__test.warp('snowfield'));
      await page.waitForTimeout(700);
      const snowfieldTexture = await page.evaluate(() =>
        window.__test.textureSize('art.map.snowfield.storybook'));
      check(
        '雪原背景がHD版1280×1920で読み込まれる',
        snowfieldTexture?.width === 1280 && snowfieldTexture?.height === 1920,
        JSON.stringify(snowfieldTexture),
      );
      await page.evaluate(() => window.__test.warp('snowfield', 320, 795));
      await page.waitForTimeout(400);
      await moveUntil(page, 's', { mapId: 'volcano' });
      const volcanoGate = await snap(page);
      check('雪原南門から火山へ戻れる', volcanoGate.mapId === 'volcano', `mapId=${volcanoGate.mapId}`);
      await page.evaluate(() => window.__test.warp('snowfield', 320, 790));
      await page.waitForTimeout(400);
      await moveUntil(page, 'w', { mapId: 'snowfield', axis: 'y', lt: 660 });
      const snowRoad = await snap(page);
      check(
        '雪原の中央街道を北へ進める',
        snowRoad.mapId === 'snowfield' && snowRoad.y < 660,
        `mapId=${snowRoad.mapId} x=${Math.round(snowRoad.x)} y=${Math.round(snowRoad.y)}`,
      );
      await page.evaluate(() => window.__test.warp('snowfield', 270, 450));
      await page.waitForTimeout(400);
      await moveUntil(page, 'a', { mapId: 'snowfield', axis: 'x', lt: 170 });
      const frozenLake = await snap(page);
      check(
        '凍った湖を横断できる',
        frozenLake.mapId === 'snowfield' && frozenLake.x < 170,
        `mapId=${frozenLake.mapId} x=${Math.round(frozenLake.x)} y=${Math.round(frozenLake.y)}`,
      );
      await page.evaluate(() => window.__test.warp('snowfield', 565, 550));
      await page.waitForTimeout(400);
      await moveUntil(page, 'w', { mapId: 'snowfield', axis: 'y', lt: 430 });
      const shrineTrail = await snap(page);
      check(
        '氷晶神殿の右側を北へ抜けられる',
        shrineTrail.mapId === 'snowfield' && shrineTrail.y < 430,
        `mapId=${shrineTrail.mapId} x=${Math.round(shrineTrail.x)} y=${Math.round(shrineTrail.y)}`,
      );
      await page.evaluate(() => window.__test.warp('snowfield', 470, 545));
      await page.waitForTimeout(400);
      await moveUntil(page, 'w', { mapId: 'snowfield', axis: 'y', lt: 500 });
      const shrineSteps = await snap(page);
      check(
        '氷晶神殿の正面階段へ上がれる',
        shrineSteps.mapId === 'snowfield' && shrineSteps.y < 500,
        `mapId=${shrineSteps.mapId} x=${Math.round(shrineSteps.x)} y=${Math.round(shrineSteps.y)}`,
      );
      await page.evaluate(() => window.__test.warp('snowfield', 320, 145));
      await page.waitForTimeout(400);
      await moveUntil(page, 's', { mapId: 'snowfield', axis: 'y', gt: 220 });
      const desertGateLanding = await snap(page);
      check(
        '砂漠側の雪原入口から南へ進める',
        desertGateLanding.mapId === 'snowfield' && desertGateLanding.y > 220,
        `mapId=${desertGateLanding.mapId} y=${Math.round(desertGateLanding.y)}`,
      );
      await page.evaluate(() => window.__test.warp('desert'));
      await page.waitForTimeout(700);
      const desertTexture = await page.evaluate(() =>
        window.__test.textureSize('art.map.desert.storybook'));
      check(
        '砂漠背景がHD版1280×1920で読み込まれる',
        desertTexture?.width === 1280 && desertTexture?.height === 1920,
        JSON.stringify(desertTexture),
      );
      await page.evaluate(() => window.__test.warp('desert', 320, 790));
      await page.waitForTimeout(400);
      await moveUntil(page, 's', { mapId: 'snowfield' });
      const snowfieldGate = await snap(page);
      check('砂漠南門から雪原へ戻れる', snowfieldGate.mapId === 'snowfield', `mapId=${snowfieldGate.mapId}`);
      await page.evaluate(() => window.__test.warp('desert', 320, 790));
      await page.waitForTimeout(400);
      await moveUntil(page, 'w', { mapId: 'desert', axis: 'y', lt: 660 });
      const caravanRoad = await snap(page);
      check(
        '砂漠の隊商街道を北へ進める',
        caravanRoad.mapId === 'desert' && caravanRoad.y < 660,
        `mapId=${caravanRoad.mapId} x=${Math.round(caravanRoad.x)} y=${Math.round(caravanRoad.y)}`,
      );
      await page.evaluate(() => window.__test.warp('desert', 250, 650));
      await page.waitForTimeout(400);
      await moveUntil(page, 'w', { mapId: 'desert', axis: 'y', lt: 490 });
      const oasisMarket = await snap(page);
      check(
        'オアシス市場の東岸を北へ抜けられる',
        oasisMarket.mapId === 'desert' && oasisMarket.y < 490,
        `mapId=${oasisMarket.mapId} x=${Math.round(oasisMarket.x)} y=${Math.round(oasisMarket.y)}`,
      );
      // Start on the right half of the narrow stone lane so nearby enemy
      // movement cannot nudge the test collider into the west wall.
      await page.evaluate(() => window.__test.warp('desert', 455, 650));
      await page.waitForTimeout(400);
      await moveUntil(page, 'w', { mapId: 'desert', axis: 'y', lt: 490 });
      const quicksandBank = await snap(page);
      check(
        '流砂西岸の石道を北へ抜けられる',
        quicksandBank.mapId === 'desert' && quicksandBank.y < 490,
        `mapId=${quicksandBank.mapId} x=${Math.round(quicksandBank.x)} y=${Math.round(quicksandBank.y)}`,
      );
      await page.evaluate(() => window.__test.warp('desert', 320, 300));
      await page.waitForTimeout(400);
      await moveUntil(page, 'w', { mapId: 'desert', axis: 'y', lt: 210 });
      const palacePlaza = await snap(page);
      check(
        '星見宮殿前の広場まで進める',
        palacePlaza.mapId === 'desert' && palacePlaza.y < 210,
        `mapId=${palacePlaza.mapId} x=${Math.round(palacePlaza.x)} y=${Math.round(palacePlaza.y)}`,
      );
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
  const arenaTextures = await page.evaluate(() => ({
    plain: window.__test.textureSize('art.map.arena.storybook'),
    grove: window.__test.textureSize('art.map.arena.grove.storybook.v2'),
    volcano: window.__test.textureSize('art.map.arena.volcano.pixel.v1'),
    frost: window.__test.textureSize('art.map.arena.frost.pixel.v1'),
  }));
  for (const [label, texture] of Object.entries(arenaTextures)) {
    check(
      `闘技場背景${label}がHD版1080×2400で読み込まれる`,
      texture?.width === 1080 && texture?.height === 2400,
      JSON.stringify(texture),
    );
  }
  // This step verifies the arena/quest/reward flow, not rank-2 balance.
  // Remove combat RNG from the deploy gate so a slow runner cannot time out.
  await page.evaluate(() => window.__test.powerUp(99));
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
    if (
      i % 5 === 4
      && (await page.evaluate(() => window.__test.snapshot().completedQuests.includes('hunt_r2_01_zephys')))
    ) break;
  }
  s = await snap(page);
  check(
    '勝利時に狩猟クエストがその場で完了する',
    s.completedQuests.includes('hunt_r2_01_zephys') && !s.activeQuests.includes('hunt_r2_01_zephys'),
  );
  // Sweep the arena to hoover up the loot the boss dropped.
  for (const k of ['w', 'a', 's', 'd', 'w', 'd', 's', 'a', 'w']) {
    await page.keyboard.down(k); await page.waitForTimeout(320); await page.keyboard.up(k);
  }
  s = await snap(page);
  check('ボス素材がドロップする', (s.materials['gale_feather'] ?? 0) > 0);
  check('ボス討伐で対応する討伐証を必ず獲得する', (s.materials['hunt_proof_zephys'] ?? 0) === 1);
  const resultOpen = await page.evaluate(() => window.__test.activeScenes().includes('QuestResult'));
  check('勝利後にクエスト結果が表示される', resultOpen);
  await page.keyboard.press('Escape'); await page.waitForTimeout(900); // result always returns to town
  s = await snap(page);
  check('結果画面を閉じると町へ戻る', s.mapId === 'town', `mapId=${s.mapId}`);
  check('repeatable でも完了が記録される（歴戦解放の前提）', s.completedQuests.includes('hunt_r2_01_zephys'));

  // ---- crafting via the real crafting scene ----
  step = 'craft';
  await page.evaluate(() => {
    window.__test.addMaterial('treant_sap', 10);
    window.__test.addMaterial('lord_hardwood', 5);
    window.__test.addMaterial('iron_ore', 10);
    window.__test.addGold(1000);
    // Approach the smith from the open plaza, just above the new west-side post.
    window.__test.warp('town', 180, 395);
  });
  await page.waitForTimeout(1600);
  await page.keyboard.down('e'); await page.waitForTimeout(140); await page.keyboard.up('e'); await page.waitForTimeout(1200);
  await page.waitForFunction(() => window.__test.activeScenes().includes('Crafting'));
  // シリーズ別表示（レア度順）: 初回は「作れるものがある」最初のシリーズが
  // 自動展開され、そこへ自動スクロールする。よって画面上 1行目(136-200)が
  // そのヘッダー、直下(200-276)が最初のレシピ行（craftable-first 順）。
  const before = await snap(page);
  await activateTextWhenReady(page, 'Crafting', '制作');
  await page.waitForTimeout(900);
  s = await snap(page);
  // Upgrade recipes consume the old piece, so owned-count can stay flat;
  // gold ALWAYS drops on a successful craft. Assert on that instead.
  const crafted = s.gold < before.gold;
  check('鍛冶屋で装備をクラフトできる', crafted, `gold ${before.gold}→${s.gold}`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(600);

  // ---- pets: egg → hatch → assist ----
  step = 'pets';
  await page.evaluate(() => {
    // Combat can randomly drop other eggs. Keep this UI scenario stable so
    // the first visible hatch button always belongs to the wolf egg below.
    window.__test.clearPetEggs();
    window.__test.addEgg('pet_egg_wolf');
  });
  await activateTextWhenReady(page, 'UI', 'もちもの');
  await waitForScene(page, 'Inventory');
  await activateTextWhenReady(page, 'Inventory', 'ペット');
  await waitForScene(page, 'PetScreen');
  await activateTextWhenReady(page, 'PetScreen', '孵化する');
  check('ペット画面の孵化ボタンを操作できる', true);
  await page.waitForTimeout(900);
  s = await snap(page);
  check('たまごを孵化してペットが仲間になる', s.ownedPets.includes('wolf_pet'));
  check('最初のペットは自動で連れ歩き', s.activePetId === 'wolf_pet');
  await page.evaluate(() => window.__test.activateText('PetScreen', 'とじる'));
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape'); await page.waitForTimeout(600);

  // ---- regional bestiary + one-time completion reward ----
  step = 'bestiary';
  const grasslandIds = ['slime', 'bat', 'boss_zephys', 'boss_wolf_alpha', 'boss_skoll'];
  for (const enemyId of grasslandIds) {
    await page.evaluate((id) => window.__test.discoverEnemy(id), enemyId);
  }
  const beforeBestiaryReward = await snap(page);
  await activateTextWhenReady(page, 'UI', 'もちもの');
  await waitForScene(page, 'Inventory');
  await activateTextWhenReady(page, 'Inventory', '図鑑');
  await waitForScene(page, 'Bestiary');
  await activateTextWhenReady(page, 'Bestiary', '受け取る');
  await page.waitForTimeout(500);
  const afterBestiaryReward = await snap(page);
  check(
    '地域図鑑の達成報酬を受け取れる',
    afterBestiaryReward.gold === beforeBestiaryReward.gold + 500
      && (afterBestiaryReward.materials['sky_crown'] ?? 0)
        === (beforeBestiaryReward.materials['sky_crown'] ?? 0) + 1,
    `gold ${beforeBestiaryReward.gold}→${afterBestiaryReward.gold}`,
  );
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  check('図鑑が開ける（エラーなし）', pageErrors.length === 0, pageErrors[0]);

  // ---- save / reload round trip ----
  step = 'save';
  const beforeReload = await snap(page);
  await page.evaluate(() => window.__test.flushSave());
  await page.waitForTimeout(600);
  await page.reload({ waitUntil: 'load' });
  await waitForScene(page, 'Title');
  await activateTextWhenReady(page, 'Title', 'つづきから', 20000);
  await waitForScene(page, 'World', 20000);
  s = await snap(page);
  check(
    'リロード後も男性キャラクターが残る',
    s.gender === beforeReload.gender && s.gender === 'male',
    `${beforeReload.gender}→${s.gender}`,
  );
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
process.exit(0);
