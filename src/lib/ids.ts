/** An id from the address bar goes into an API path only if it looks like the API's own
 * (a UUID): `a/../../api-keys` would otherwise point the request somewhere else. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isId(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID.test(value);
}
