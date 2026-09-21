/**
 * What the customer has shown and said so far, carried from the camera / microphone to the booking.
 * In memory only: a draft is one attempt to get help, not something to keep.
 */
export type Draft = {
  photoUri?: string;
  /** The 224x224 RGB tensor of that photo, kept so the civic rail can fingerprint it without re-shooting. */
  rgb?: Uint8Array;
  voiceUri?: string;
  transcript?: string;
  /** How sure the phone was of the category, 0-1. Stored with the job for later model evaluation. */
  visionConf?: number;
};

let draft: Draft = {};

export const setDraft = (patch: Draft) => {
  draft = { ...draft, ...patch };
};
export const peekDraft = (): Draft => draft;
export const clearDraft = () => {
  draft = {};
};
