import {parseCoordinates} from './other.js';

/**
 * Finds the most specific element in the parsed page source whose bounds contain the given
 * point. Later siblings are checked first, since they are typically rendered on top, and
 * descendants are preferred over their ancestors.
 *
 * @param {object} sourceJSON parsed page source tree (see 'xmlToJSON')
 * @param {number} x point X coordinate, in raw (unscaled) device pixels
 * @param {number} y point Y coordinate, in raw (unscaled) device pixels
 * @returns {object|null} the matching element node, or null if none was found
 */
export function findElementAtPoint(sourceJSON, x, y) {
  if (!sourceJSON) {
    return null;
  }

  if (sourceJSON.children) {
    for (let i = sourceJSON.children.length - 1; i >= 0; i--) {
      const match = findElementAtPoint(sourceJSON.children[i], x, y);
      if (match) {
        return match;
      }
    }
  }

  // The root source node has an empty path, and isn't a meaningful tap target on its own
  if (!sourceJSON.path) {
    return null;
  }

  const {x1, y1, x2, y2} = parseCoordinates(sourceJSON);
  const isWithinBounds =
    x1 !== undefined && x2 > x1 && y2 > y1 && x >= x1 && x <= x2 && y >= y1 && y <= y2;

  return isWithinBounds ? sourceJSON : null;
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
