// =============================================================================
// The Vestaboard operations we use, transcribed from their app's traffic.
//
// Their schema is versioned in the field names (`listInspirationV2`) while the
// operation names are not, and several queries alias the versioned field back
// to an unversioned one. Both queries below are kept byte-compatible with what
// the app sends, minus the `__typename` selections we have no use for.
// =============================================================================

/** A message: the 6x22 grid of Vestaboard character codes, plus its id. */
export interface VestaboardMessage {
  id: string
  characters: number[][]
  isFavorited?: boolean
}

/** A curated "pick" — the editorial messages behind Today's Picks. */
export interface VestaboardPick {
  id: string
  date?: string
  created: number
  attribution: string | null
  likeCount: number
  isLikedByMe: boolean
  /** Signed S3 URL for the source's icon; expires, so don't cache it. */
  mediumIcon: string | null
  message: VestaboardMessage
}

/** A community feed item. Same shape as a pick plus its author. */
export interface VestaboardFeedItem extends Omit<VestaboardPick, 'date'> {
  personId: string | null
}

/** One row of the home-screen feed: exactly one of `pick`/`feedItem` is set. */
export interface VestaboardInspirationItem {
  id: string
  pick: VestaboardPick | null
  feedItem: VestaboardFeedItem | null
}

export interface ListInspirationResult {
  listInspirationV2: {
    items: VestaboardInspirationItem[]
    /**
     * Opaque cursor, e.g.
     * `PICK:<uuid>|INSPIRATION:FLAGSHIP:2026-08-11 08:00:00:1786406399997`.
     * Pass it straight back as `input.cursor`.
     */
    nextCursor: string | null
  }
}

export interface ListTodaysPicksResult {
  listTodaysPicks: {
    picks: VestaboardPick[]
  }
}

/** `boardStyle` selects art matched to the physical board's flap colour. */
export type VestaboardBoardStyle = 'black' | 'white'

export const LIST_INSPIRATION = `query ListInspiration($input: ListInspirationInputV2!) {
  listInspirationV2(input: $input) {
    items {
      id
      pick {
        id
        date
        created
        attribution
        likeCount
        isLikedByMe
        mediumIcon: icon(size: Medium)
        message { id characters isFavorited }
      }
      feedItem {
        id
        created
        attribution
        likeCount
        isLikedByMe
        personId
        mediumIcon: icon(size: Medium)
        message { id characters isFavorited }
      }
    }
    nextCursor
  }
}`

export const LIST_TODAYS_PICKS = `query ListTodaysPicks($input: TodaysPicksInputV2) {
  listTodaysPicks: listTodaysPicksV2(input: $input) {
    picks {
      id
      attribution
      created
      likeCount
      isLikedByMe
      mediumIcon: icon(size: Medium)
      message { id characters isFavorited }
    }
  }
}`

/** Normalize either arm of an inspiration item into the pick-ish shape. */
export function inspirationEntry(item: VestaboardInspirationItem): VestaboardPick | null {
  return item.pick ?? item.feedItem ?? null
}
