// =============================================================================
// Vestaboard character codes -> Nemoto flap ids.
//
// Vestaboard messages are a 6x22 grid of *their* character codes, which are a
// different numbering from our flap set (see device-api/src/nemoto-flaps.ts,
// itself mirroring nemoto-fw's FLAPS[64]). Neither table is a shift of the
// other: Vestaboard puts digits at 27..36 as "1234567890" while ours are
// 26..35 as "0123456789", and the two special-character blocks are ordered
// completely differently.
//
// The Vestaboard side of this table was verified against captured API traffic:
// every message the API returned with both `characters` and a `text` field
// reconstructs byte-identically through VESTABOARD_GLYPHS (which exercised the
// letters, `0`, `+`, `:`, `,` and `.`).
// =============================================================================

/** Vestaboard boards are a fixed 6 rows x 22 columns. */
export const VESTABOARD_ROWS = 6
export const VESTABOARD_COLS = 22

/** Nemoto's blank flap — the fallback for anything we can't represent. */
const NEMOTO_BLANK = 56

/** Nemoto's white flap — the closest thing we have to Vestaboard's "filled". */
const NEMOTO_WHITE = 63

/**
 * Vestaboard code -> the character it prints. Colour flaps and the unassigned
 * codes are absent. Used for accessible labels and text previews.
 */
export const VESTABOARD_GLYPHS: Readonly<Record<number, string>> = {
  0: ' ',
  ...Object.fromEntries('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((ch, i) => [i + 1, ch])),
  ...Object.fromEntries('1234567890'.split('').map((ch, i) => [i + 27, ch])),
  37: '!',
  38: '@',
  39: '#',
  40: '$',
  41: '(',
  42: ')',
  44: '-',
  46: '+',
  47: '&',
  48: '=',
  49: ';',
  50: ':',
  52: "'",
  53: '"',
  54: '%',
  55: ',',
  56: '.',
  59: '/',
  60: '?',
  62: '°',
}

/**
 * Vestaboard code -> Nemoto flap id.
 *
 * Codes 43, 45, 51, 57, 58 and 61 are unassigned on Vestaboard and are absent
 * here, as is 70 (black) — we have no black flap, and a blank flap already
 * shows the dark face, so {@link vestaboardCodeToFlap} folds it into the blank.
 */
export const VESTABOARD_TO_FLAP: Readonly<Record<number, number>> = {
  0: NEMOTO_BLANK,
  // A-Z: Vestaboard 1..26 -> flaps 0..25
  ...Object.fromEntries(Array.from({ length: 26 }, (_, i) => [i + 1, i])),
  // Digits: Vestaboard 27..35 are "1".."9" (flaps 27..35), and 36 is "0" (flap 26)
  ...Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i + 27, i + 27])),
  36: 26,
  // Specials, matched by printed glyph
  37: 36, // !
  38: 37, // @
  39: 38, // #
  40: 39, // $
  41: 42, // (
  42: 43, // )
  44: 50, // -
  46: 49, // +
  47: 41, // &
  48: 51, // =
  49: 55, // ;
  50: 44, // :
  52: 53, // '
  53: 45, // "
  54: 40, // %
  55: 48, // ,
  56: 47, // .
  59: 52, // /
  60: 46, // ?
  62: 54, // °
  // Colours: Vestaboard 63..69 -> our ROYGBV + white at 57..63
  63: 57, // poppy red
  64: 58, // orange
  65: 59, // yellow
  66: 60, // green
  67: 61, // parisian blue
  68: 62, // violet
  69: 63, // white
  70: NEMOTO_BLANK, // black -> blank (no black flap; blank reads as the dark face)
  71: NEMOTO_WHITE, // "filled" -> white, the only solid we have
}

/** Translate a single Vestaboard code, falling back to blank when unmappable. */
export function vestaboardCodeToFlap(code: number): number {
  return VESTABOARD_TO_FLAP[code] ?? NEMOTO_BLANK
}

/** Translate a whole Vestaboard 6x22 message into a Nemoto flap grid. */
export function vestaboardToFlaps(characters: number[][]): number[][] {
  return characters.map((row) => row.map(vestaboardCodeToFlap))
}

/**
 * Flatten a Vestaboard message to plain text, one line per row, for labels and
 * search. Colour flaps become spaces; trailing blanks and empty rows are
 * dropped.
 */
export function vestaboardToText(characters: number[][]): string {
  return characters
    .map((row) =>
      row
        .map((code) => VESTABOARD_GLYPHS[code] ?? ' ')
        .join('')
        .trimEnd(),
    )
    .filter((line) => line.trim().length > 0)
    .join('\n')
}

/**
 * Fit a Vestaboard-sized grid onto a board of different dimensions, centring it
 * and padding or cropping as needed.
 *
 * Nemoto grids are configurable, and the firmware rejects a frame whose
 * dimensions don't match the device's. Ours is 22x6 like a Vestaboard, so this
 * is normally a pass-through; it exists so a re-mapped grid degrades into
 * something sensible rather than an error.
 */
export function fitFlapGrid(
  grid: number[][],
  width: number,
  height: number,
  blank = NEMOTO_BLANK,
): number[][] {
  const srcHeight = grid.length
  const srcWidth = grid[0]?.length ?? 0
  if (srcHeight === height && srcWidth === width) return grid.map((row) => [...row])

  // Negative offsets crop the source; positive ones centre it in the target.
  const rowOffset = Math.floor((height - srcHeight) / 2)
  const colOffset = Math.floor((width - srcWidth) / 2)

  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      const srcY = y - rowOffset
      const srcX = x - colOffset
      if (srcY < 0 || srcY >= srcHeight || srcX < 0 || srcX >= srcWidth) return blank
      return grid[srcY][srcX] ?? blank
    }),
  )
}
