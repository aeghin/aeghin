/**
 * How an organization presents itself in the mail it sends.
 *
 * Volunteers have a relationship with their organization, not with the
 * platform, so everything an organization sends goes out under its own name.
 * "Aeghin" is reserved for mail about the vendor relationship itself —
 * billing, account, receipts — which nothing sends today.
 */

const SUPPORT_ADDRESS = "support@aeghin.com";

/**
 * The `from:` header, with the display name quoted.
 *
 * Quoted because an organization name is validated only for length (3–20
 * characters, no character restrictions), so "Smith, Jones & Co" is a name
 * somebody can legitimately pick — and an unquoted comma in a From header
 * reads as an address separator, turning one sender into two malformed ones.
 * Backslashes and quotes are escaped, per RFC 5322's quoted-string rules.
 *
 * A blank name falls back to the platform: a valid header from the wrong
 * sender beats a malformed one from the right sender.
 */
export function organizationSender(organizationName: string): string {
  const escaped = organizationName.trim().replace(/[\\"]/g, (char) => `\\${char}`);

  return escaped
    ? `"${escaped}" <${SUPPORT_ADDRESS}>`
    : `Aeghin <${SUPPORT_ADDRESS}>`;
}

/**
 * The letter on the tile an email shows when the organization has no logo.
 *
 * Split with `Array.from` rather than `charAt`, so a name starting with an
 * emoji or any non-BMP character yields that whole character instead of half
 * a surrogate pair.
 */
export function organizationInitial(organizationName: string): string {
  const [first] = Array.from(organizationName.trim());

  return first ? first.toLocaleUpperCase() : "";
}
