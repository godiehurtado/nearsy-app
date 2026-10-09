export const DELETE_CONFIRMATION_WORD = 'DELETE';

/** Exact, case-sensitive match; only surrounding whitespace is forgiven. */
export function isDeleteConfirmationText(input: string): boolean {
  return input.trim() === DELETE_CONFIRMATION_WORD;
}
