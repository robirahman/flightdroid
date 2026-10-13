import type { ParsedFlight } from '../lib/types';
import { flightsFromNodes, type Node } from './schema';

function itemValue(el: Element): unknown {
  if (el.hasAttribute('itemscope')) return toNode(el);
  const tag = el.tagName.toLowerCase();
  if (tag === 'meta') return el.getAttribute('content') ?? '';
  if (tag === 'time') return el.getAttribute('datetime') ?? el.textContent?.trim();
  if (tag === 'a' || tag === 'link') return el.getAttribute('href') ?? '';
  return el.getAttribute('content') ?? el.textContent?.trim() ?? '';
}

/** Converts an itemscope element into a JSON-LD-like node. */
function toNode(scope: Element): Node {
  const node: Node = {};
  const type = scope.getAttribute('itemtype');
  if (type) node['@type'] = type;
  const walk = (el: Element) => {
    for (const child of el.children) {
      const props = child.getAttribute('itemprop');
      if (props) {
        const value = itemValue(child);
        for (const p of props.split(/\s+/)) {
          const existing = node[p];
          node[p] = existing === undefined ? value : Array.isArray(existing) ? [...existing, value] : [existing, value];
        }
      }
      // Nested scopes own their own properties.
      if (!child.hasAttribute('itemscope')) walk(child);
    }
  };
  walk(scope);
  return node;
}

export function parseMicrodata(doc: Document): ParsedFlight[] {
  const roots = [...doc.querySelectorAll('[itemscope]')].filter((el) => !el.hasAttribute('itemprop'));
  return flightsFromNodes(roots.map(toNode));
}
