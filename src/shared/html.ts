/** Minimal HTML helpers shared by each feed's events page. */

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Wraps a body fragment in a consistent, minimal page shell. */
export function renderPage(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    max-width: 960px;
    margin: 2.5rem auto;
    padding: 0 1.25rem;
    line-height: 1.55;
    color: #1a1d21;
  }
  h1 { font-size: 1.5rem; margin-bottom: 0.3rem; }
  .meta { color: #5a6270; font-size: 0.9rem; margin-bottom: 1.5rem; }
  table { width: 100%; border-collapse: collapse; }
  th, td {
    text-align: left;
    padding: 0.55rem 0.75rem;
    border-bottom: 1px solid #e2e5ea;
    vertical-align: top;
    font-size: 0.92rem;
  }
  th {
    text-transform: uppercase;
    font-size: 0.72rem;
    letter-spacing: 0.04em;
    color: #5a6270;
  }
  a { color: #0e6f68; }
  .empty { color: #5a6270; font-style: italic; }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>
`;
}
