const escapeAttr = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function unavailablePage(pathname: string, search: string): string {
  const href = escapeAttr(pathname + search);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Teepee</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>:root{color-scheme:light dark}body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;box-sizing:border-box;text-align:center;font:16px/1.5 system-ui,sans-serif}a{font-weight:600}</style>
</head><body><p>That didn't load. It's probably the connection.</p><a href="${href}">Try again</a></body></html>
`;
}
