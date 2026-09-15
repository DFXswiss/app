// Temporary type bridge for the call-queue "Phone Call Times" column.
//
// The customer's preferred phone-call time is delivered by the API on each CallQueueItem
// (backend: CallQueueItem DTO). The shared client type in @dfx.swiss/core does not carry the
// field yet; until it is added there (DFXswiss/packages#180) this augmentation lets the
// compliance call-queue screen read `item.phoneCallTimes` type-safely. Remove this file once
// @dfx.swiss/core exposes phoneCallTimes on CallQueueItem.
import '@dfx.swiss/core';

declare module '@dfx.swiss/core' {
  interface CallQueueItem {
    /** Customer's preferred phone-call time slots, raw and semicolon-separated (e.g. "H9To10;H10To11"). */
    phoneCallTimes?: string;
  }
}
