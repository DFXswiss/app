// Remove this bridge once @dfx.swiss/core CallQueueItem includes phoneCallTimes.
import '@dfx.swiss/core';

declare module '@dfx.swiss/core' {
  interface CallQueueItem {
    /** Preferred phone-call slots, raw and semicolon-separated, for example "H9To10;H10To11". */
    phoneCallTimes?: string;
  }
}
