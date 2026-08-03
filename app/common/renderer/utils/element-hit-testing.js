import {parseCoordinates} from './other.js';

/**
 * Finds every element in the parsed page source whose bounds contain the given point, ordered
 * most specific first: descendants before their ancestors, and later siblings (typically
 * rendered on top) before earlier ones. Overlapping widgets (e.g. a Stack, or a custom-painted
 * touch target layered over other content) commonly produce more than one match at the same
 * point - there's no way to tell which one the user meant from the coordinate alone.
 *
 * Pass-through ancestors that share their child's exact bounds are collapsed out (see
 * 'collapsePassThroughAncestors') - without this, the list routinely stretches all the way up
 * to the root of the tree, since structural/inherited-widget wrappers are common and add
 * nothing distinguishable at a single point.
 *
 * @param {object} sourceJSON parsed page source tree (see 'xmlToJSON')
 * @param {number} x point X coordinate, in raw (unscaled) device pixels
 * @param {number} y point Y coordinate, in raw (unscaled) device pixels
 * @returns {object[]} matching element nodes, most specific first (empty if none matched)
 */
export function findAllElementsAtPoint(sourceJSON, x, y) {
  return collapsePassThroughAncestors(collectElementsAtPoint(sourceJSON, x, y));
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

/**
 * Recursive collection step behind 'findAllElementsAtPoint' - see there for the ordering
 * guarantee and root-exclusion rule. Kept separate so the exported function can post-process
 * the full list (collapsing pass-through ancestors) without re-running the tree walk.
 *
 * @param {object} sourceJSON parsed page source tree (see 'xmlToJSON')
 * @param {number} x point X coordinate, in raw (unscaled) device pixels
 * @param {number} y point Y coordinate, in raw (unscaled) device pixels
 * @returns {object[]} matching element nodes, most specific first (empty if none matched)
 */
function collectElementsAtPoint(sourceJSON, x, y) {
  if (!sourceJSON) {
    return [];
  }

  const matches = [];
  if (sourceJSON.children) {
    for (let i = sourceJSON.children.length - 1; i >= 0; i--) {
      matches.push(...collectElementsAtPoint(sourceJSON.children[i], x, y));
    }
  }

  // The root source node has an empty path, and isn't a meaningful tap target on its own
  if (!sourceJSON.path) {
    return matches;
  }

  const {x1, y1, x2, y2} = parseCoordinates(sourceJSON);
  const isWithinBounds = x1 !== undefined && x2 > x1 && y2 > y1 && x >= x1 && x <= x2 && y >= y1 && y <= y2;

  if (isWithinBounds) {
    matches.push(sourceJSON);
  }

  return matches;
}

// Attributes that make an element identifiable well enough to act on later - either as a
// display label (see 'getElementDisplayName') or as a durable locator a generated test script
// could use (the Flutter driver's own finder-type priority: tooltip, then semanticLabel, then
// key, then text - see 'appium_handler.dart#_handleGetFinderType' - plus the equivalent
// Android/iOS attribute names). A same-bounds pass-through wrapper (e.g. a Flutter 'Semantics'
// node) commonly carries one of these even when the RenderObject-level widget it wraps doesn't.
const IDENTIFYING_ATTRIBUTES = [
  'tooltip',
  'semanticLabel',
  'key',
  'text',
  'name',
  'label',
  'content-desc',
  'resource-id',
];

/**
 * @param {object} element parsed page source element node
 * @returns {boolean} whether the element has any attribute that could identify it later
 */
function hasIdentifyingAttribute(element) {
  const attributes = element.attributes || {};
  return IDENTIFYING_ATTRIBUTES.some((name) => {
    const value = attributes[name];
    // Guards against the Flutter driver's own 'null' string quirk (an absent 'key' is
    // serialized as the literal text "null", not an empty attribute) as well as the usual ''
    return value && value !== 'null';
  });
}

/**
 * Collapses pass-through ancestors out of a most-specific-first match list: consecutive
 * elements are grouped into a run while each one is a direct ancestor (by path) of the
 * previous element in the list *and* its bounds are pixel-identical to that element's. Such
 * ancestors (e.g. Flutter's Directionality/MediaQuery/Theme/Semantics/RepaintBoundary, or
 * similar structural elements on other platforms) contribute nothing spatially distinguishable
 * at the clicked point, and are the usual reason a hit-test chain stretches all the way up to
 * the root of the tree.
 *
 * Deliberately keyed on the ancestor relationship rather than bounds alone: two *siblings*
 * that happen to share identical bounds (e.g. overlapping items in a Stack) are a real
 * ambiguity the caller needs to disambiguate, not noise to collapse.
 *
 * Each run collapses to whichever element in it has an identifying attribute (see
 * 'hasIdentifyingAttribute'), not just the most specific one - a RenderObject-level widget is
 * often the deepest match at a point but has no usable name/key/label of its own, while a
 * same-bounds 'Semantics'/'Tooltip'-style ancestor just above it may be the only one that does.
 * Falls back to the most specific element when nothing in the run is identifiable.
 *
 * @param {object[]} elements match list from 'collectElementsAtPoint', most specific first
 * @returns {object[]} one element per distinct on-screen target, most specific run first
 */
function collapsePassThroughAncestors(elements) {
  const result = [];
  let run = [];
  let previous = null;

  const flushRun = () => {
    if (run.length > 0) {
      result.push(run.find(hasIdentifyingAttribute) ?? run[0]);
      run = [];
    }
  };

  for (const element of elements) {
    if (previous) {
      const prevBounds = parseCoordinates(previous);
      const bounds = parseCoordinates(element);
      const isSameBounds =
        prevBounds.x1 === bounds.x1 &&
        prevBounds.y1 === bounds.y1 &&
        prevBounds.x2 === bounds.x2 &&
        prevBounds.y2 === bounds.y2;
      const isAncestor = previous.path.startsWith(`${element.path}.`);

      if (!isSameBounds || !isAncestor) {
        flushRun();
      }
    }

    run.push(element);
    previous = element;
  }
  flushRun();

  return result;
}
