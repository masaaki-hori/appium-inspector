import {parseCoordinates} from './other.js';

/**
 * Finds every element in the parsed page source whose bounds contain the given point, ordered
 * most specific first: descendants before their ancestors, and later siblings (typically
 * rendered on top) before earlier ones. Overlapping widgets (e.g. a Stack, or a custom-painted
 * touch target layered over other content) commonly produce more than one match at the same
 * point - there's no way to tell which one the user meant from the coordinate alone.
 *
 * @param {object} sourceJSON parsed page source tree (see 'xmlToJSON')
 * @param {number} x point X coordinate, in raw (unscaled) device pixels
 * @param {number} y point Y coordinate, in raw (unscaled) device pixels
 * @returns {object[]} matching element nodes, most specific first (empty if none matched)
 */
export function findAllElementsAtPoint(sourceJSON, x, y) {
  if (!sourceJSON) {
    return [];
  }

  const matches = [];
  if (sourceJSON.children) {
    for (let i = sourceJSON.children.length - 1; i >= 0; i--) {
      matches.push(...findAllElementsAtPoint(sourceJSON.children[i], x, y));
    }
  }

  // The root source node has an empty path, and isn't a meaningful tap target on its own
  if (!sourceJSON.path) {
    return matches;
  }

  const {x1, y1, x2, y2} = parseCoordinates(sourceJSON);
  const isWithinBounds =
    x1 !== undefined && x2 > x1 && y2 > y1 && x >= x1 && x <= x2 && y >= y1 && y <= y2;

  if (isWithinBounds) {
    matches.push(sourceJSON);
  }

  return matches;
}

/**
 * The single most specific element at the given point - see 'findAllElementsAtPoint' for the
 * ordering and the common case of more than one match existing at the same point.
 *
 * @param {object} sourceJSON parsed page source tree (see 'xmlToJSON')
 * @param {number} x point X coordinate, in raw (unscaled) device pixels
 * @param {number} y point Y coordinate, in raw (unscaled) device pixels
 * @returns {object|null} the matching element node, or null if none was found
 */
export function findElementAtPoint(sourceJSON, x, y) {
  return findAllElementsAtPoint(sourceJSON, x, y)[0] ?? null;
}

/**
 * Builds a short human-readable label for an element, to show which element was
 * tapped/hovered instead of just its raw coordinates.
 *
 * @param {object} element parsed page source element node
 * @returns {string} display label
 */
export function getElementDisplayName(element) {
  if (!element) {
    return '';
  }
  const {attributes = {}, tagName} = element;
  const identifyingAttr =
    attributes.text ||
    attributes.name ||
    attributes.label ||
    attributes['content-desc'] ||
    attributes['resource-id'] ||
    attributes.id;
  return identifyingAttr ? `${tagName} (${identifyingAttr})` : tagName;
}
