import dialogueJson from '@/data/defs/dialogue.json';

/**
 * Dialogue definitions (data-driven). A dialogue is a speaker + a list of
 * lines, with optional end-of-conversation choices. Choices and the dialogue
 * itself may set a flag (used by quests / job unlocks).
 */
export interface DialogueChoice {
  text: string;
  setFlag?: string;
  /** Optional quest accepted when this choice is selected. */
  acceptQuest?: string;
}

export interface DialogueDef {
  id: string;
  speaker: string;
  lines: string[];
  choices?: DialogueChoice[];
  setFlag?: string;
}

interface DialogueFile {
  dialogues: DialogueDef[];
}

const dialogues = new Map<string, DialogueDef>();
for (const d of (dialogueJson as unknown as DialogueFile).dialogues) dialogues.set(d.id, d);

export function getDialogue(id: string): DialogueDef | undefined {
  return dialogues.get(id);
}

export function allDialogues(): DialogueDef[] {
  return [...dialogues.values()];
}
