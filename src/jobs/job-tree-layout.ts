export interface JobTreeVerticalLayout {
  firstRowY: number;
  headerY: number;
  cardHeight: number;
  rowGap: number;
  boardBottom: number;
}

const FIRST_ROW_Y = 248;
const HEADER_Y = 198;
const BOTTOM_PADDING = 10;
const MINIMUM_GAP = 6;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Fit all five job rows above the fixed footer on every supported phone height. */
export function buildJobTreeVerticalLayout(viewBottom: number): JobTreeVerticalLayout {
  const availableToBottom = viewBottom - BOTTOM_PADDING - FIRST_ROW_Y;
  const fittingCardHeight = (availableToBottom - MINIMUM_GAP * 4) / 4.5;
  const cardHeight = clamp(Math.floor(fittingCardHeight), 58, 74);
  const fittingRowGap = (availableToBottom - cardHeight / 2) / 4;
  const rowGap = clamp(Math.floor(fittingRowGap), cardHeight + MINIMUM_GAP, 92);
  const contentBottom = FIRST_ROW_Y + rowGap * 4 + cardHeight / 2;

  return {
    firstRowY: FIRST_ROW_Y,
    headerY: HEADER_Y,
    cardHeight,
    rowGap,
    boardBottom: Math.min(viewBottom, contentBottom + BOTTOM_PADDING),
  };
}
