import tutorialJson from '@/data/defs/tutorial.json';
import type { GameEvents } from '@/core/event-bus';

/**
 * First-run guided tutorial (data-driven). A short chain of coach cards shown
 * once for a new save — "はじめはこれをしよう" onboarding. Steps are pure data
 * (id / copy / which HUD element to point at / optional auto-advance event) so
 * the flow can grow without touching scene code. Completion is stored in the
 * save under FLAG so it never replays.
 */

/** HUD element a step points its arrow at (resolved to a coord by the coach). */
export type TutorialAnchor = 'none' | 'stick' | 'attack' | 'bag';

/** Events that can auto-advance a step (player did the thing on their own). */
export type TutorialAdvanceEvent = Extract<keyof GameEvents, 'enemy:died' | 'ui:open-inventory'>;

export interface TutorialStep {
  /** Immutable string id (never the display text). */
  id: string;
  title: string;
  body: string;
  anchor: TutorialAnchor;
  /** If set, performing this action advances the step (a tap always works too). */
  advanceOn?: TutorialAdvanceEvent;
}

interface TutorialFile {
  introVersion: number;
  steps: TutorialStep[];
}

const data = tutorialJson as TutorialFile;

/** Save flag marking the intro tutorial as seen (so it plays only once). */
export const TUTORIAL_DONE_FLAG = 'tutorial.intro.done';

export function introSteps(): TutorialStep[] {
  return data.steps;
}

export function introVersion(): number {
  return data.introVersion;
}
