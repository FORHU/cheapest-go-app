/**
 * Support Chat limits shared by the server and the two chat boxes.
 *
 * Here rather than in `lib/server/support` so the customer's widget and the Agent's inbox can
 * import the same number the server enforces. A box that lets someone type past the server's
 * limit only finds out at send, as a failed message with no reason given.
 */

/**
 * Longest message accepted. Support questions are prose, not documents, and the ceiling
 * is what stops one paste filling a row, a stream frame and an AI context window at once.
 *
 * In characters as JavaScript counts them (UTF-16 code units), which is also what an input's
 * `maxLength` counts — so the box and the server agree to the character. About 1,000–1,300
 * words of Korean, or 650–800 of English; translated as four or five pieces.
 */
export const MAX_MESSAGE_LENGTH = 4000;

/** How close to the limit before the box starts showing a count. */
export const MESSAGE_COUNTER_FROM = 3500;
