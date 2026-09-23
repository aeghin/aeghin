/**
 * Clerk keeps a name exactly as it was typed. This raises the first letter of
 * each word and never lowers anything, so "john smith" becomes "John Smith"
 * while "McDonald" survives intact.
 */
export function capitalizeName(name: string): string {
  return name.replace(/(^|\s)(\S)/g, (_, space: string, letter: string) => space + letter.toUpperCase());
}
