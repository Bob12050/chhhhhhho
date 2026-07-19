**Comparison Target**
- Reference: `docs/qa/town-option3-reference.png`
- Implementation: `docs/qa/town-option3-npc-hud-implementation.png`
- Side-by-side: `docs/qa/town-option3-npc-hud-comparison.png`
- Viewport: 390 x 844

**Visual Match**
- The guild and item shop anchor the upper edge with a centered north route.
- A broad, pale circular-stone plaza is the dominant first-screen surface.
- The compass mosaic, canal, perimeter trees, benches, lamps, and planters follow option 3's composition and pixel density.
- Service NPCs stay around the perimeter, use the selected mint interaction marker, and now share the concept's compact chibi scale, limited shading, and crisp pixel clusters.
- The town removes the combat cluster while retaining the movement control, quest tracker, map, inventory, HP, MP, level, and EXP.
- The status strip now uses the concept's slim navy frame, pale outline, peach HP fill, cyan MP fill, and restrained purple dividers.

**Blocking QA**
- P0: none.
- P1: none.
- P2: resolved. The prior high-frequency storybook background, painterly NPCs, ornate status frame, crowded center, clipped edge NPCs, and mismatched collision layout were replaced or corrected.
- Interaction routes: automated reachability covers every service NPC and the north gate from the default spawn.

**P3 Follow-up Notes**
- Live values remain slightly larger than the concept so late-game HP and MP totals stay legible on narrow phones.
- Player job sprites remain more detailed than the NPCs; that is a separate character-art pass and does not block this town/HUD match.

final result: passed
