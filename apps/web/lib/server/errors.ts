/** Errors shared by every backend. Services throw these; actions turn them into form messages. */

/** A refused action with a message safe to show the user (optionally tied to a form field). */
export class CommandError extends Error {
  readonly field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.name = "CommandError";
    this.field = field;
  }
}

/** The caller lacks a permission, or the database refused on their behalf. */
export class AccessError extends Error {
  constructor(permission: string) {
    super(`Not permitted: ${permission}`);
    this.name = "AccessError";
  }
}
