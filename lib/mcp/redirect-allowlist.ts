/**
 * Where an OAuth client may send the Traveller back to after the consent
 * screen (ADR 0071). Registration is open (RFC 7591, so Claude can register
 * itself), which means a client's name and redirect URIs are self-asserted.
 * Without this list anyone could register an app called "Claude" that
 * returns codes to their own site. lib/auth.ts applies it at registration and
 * at authorise.
 *
 * Allowed: https on claude.ai, claude.com, anthropic.com or any subdomain of
 * them, plus any extra hosts in MCP_REDIRECT_HOSTS (comma-separated, same
 * subdomain rule). And plain http on loopback with any port, which Claude
 * Code uses for its local callback.
 */
const DEFAULT_REDIRECT_HOSTS = ["claude.ai", "claude.com", "anthropic.com"] as const;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function redirectHosts(env: Record<string, string | undefined> = process.env): string[] {
  const extra = (env.MCP_REDIRECT_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase().replace(/^\.+|\.+$/g, ""))
    .filter(Boolean);
  return [...DEFAULT_REDIRECT_HOSTS, ...extra];
}

const onHost = (hostname: string, host: string) => hostname === host || hostname.endsWith(`.${host}`);

export function isAllowedRedirectUri(uri: string, env: Record<string, string | undefined> = process.env): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.username || url.password || uri.includes("#")) return false;
  const hostname = url.hostname.toLowerCase();
  if (url.protocol === "http:") return LOOPBACK_HOSTS.has(hostname);
  if (url.protocol !== "https:") return false;
  return redirectHosts(env).some((host) => onHost(hostname, host));
}
