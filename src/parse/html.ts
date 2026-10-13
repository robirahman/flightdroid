const BLOCK = new Set(['p', 'div', 'br', 'tr', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'section', 'header', 'footer', 'ul', 'ol', 'hr', 'blockquote']);
const CELL = new Set(['td', 'th']);

/** Readable text from an HTML email: blocks become lines, table cells become " | "-separated columns. */
export function htmlToText(doc: Document): string {
  const parts: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      parts.push(node.textContent ?? '');
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = (node as Element).tagName.toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'head' || tag === 'title') return;
    if (BLOCK.has(tag)) parts.push('\n');
    for (const child of node.childNodes) walk(child);
    if (BLOCK.has(tag)) parts.push('\n');
    else if (CELL.has(tag)) parts.push(' | ');
  };
  walk(doc.body ?? doc.documentElement);
  return normalizeText(parts.join(''));
}

export function normalizeText(text: string): string {
  return text
    .replace(/ |​|‌| | /g, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').replace(/^(\s*\|\s*)+|(\s*\|\s*)+$/g, '').replace(/(\s*\|\s*){2,}/g, ' | ').trim())
    .filter(Boolean)
    .join('\n');
}
