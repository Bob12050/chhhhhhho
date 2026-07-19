**Comparison Target**
- Reference: `docs/qa/town-option3-reference.png`
- Implementation: `docs/qa/town-option3-implementation.png`
- Side-by-side: `docs/qa/town-option3-comparison.png`
- Viewport: 390 x 844

**Visual Match**
- The guild and item shop anchor the upper edge with a centered north route.
- A broad, pale circular-stone plaza is the dominant first-screen surface.
- The compass mosaic, canal, perimeter trees, benches, lamps, and planters follow option 3's composition and pixel density.
- Service NPCs stay around the perimeter and use the selected mint interaction marker.
- The town removes the combat cluster while retaining the movement control, quest tracker, map, inventory, HP, MP, level, and EXP.

**Blocking QA**
- P0: none.
- P1: none.
- P2: resolved. The prior high-frequency storybook background, crowded center, clipped edge NPCs, and mismatched collision layout were replaced or corrected.
- Interaction routes: automated reachability covers every service NPC and the north gate from the default spawn.

**P3 Follow-up Notes**
- The status frame remains slightly more ornate than the concept so existing live values and the rest of the game's HUD language stay consistent.
- Existing character art is retained; its detail level is a little higher than the town background's deliberately chunky pixel clusters.

final result: passed
