import {describe, expect, it} from 'vitest';

import {
  findAllElementsAtPoint,
  findElementAtPoint,
  getElementDisplayName,
} from '../../app/common/renderer/utils/element-hit-testing.js';

// Two non-overlapping branches, so descendant lookup can be tested in isolation
// from sibling z-order handling
const buildNestedSource = () => ({
  tagName: 'android.widget.FrameLayout',
  path: '',
  attributes: {bounds: '[0,0][200,200]'},
  children: [
    {
      tagName: 'android.widget.LinearLayout',
      path: '0',
      attributes: {bounds: '[0,0][100,100]'},
      children: [
        {
          tagName: 'android.widget.Button',
          path: '0.0',
          attributes: {bounds: '[10,10][50,50]', text: 'Login'},
          children: [],
        },
      ],
    },
    {
      tagName: 'android.widget.LinearLayout',
      path: '1',
      attributes: {bounds: '[100,0][200,100]'},
      children: [],
    },
  ],
});

// Two fully-overlapping top-level elements, to test sibling z-order handling
// in isolation from descendant lookup
const buildOverlappingSource = () => ({
  tagName: 'android.widget.FrameLayout',
  path: '',
  attributes: {bounds: '[0,0][200,200]'},
  children: [
    {
      tagName: 'android.widget.Button',
      path: '0',
      attributes: {bounds: '[0,0][100,100]', 'resource-id': 'bottom-button'},
      children: [],
    },
    {
      // Listed later, so it's rendered on top of the sibling above
      tagName: 'android.widget.Button',
      path: '1',
      attributes: {bounds: '[0,0][100,100]', 'resource-id': 'overlay-button'},
      children: [],
    },
  ],
});

describe('utils/element-hit-testing.js', function () {
  describe('#findElementAtPoint', function () {
    it('should return the deepest element whose bounds contain the point', function () {
      const match = findElementAtPoint(buildNestedSource(), 20, 20);
      expect(match.path).toBe('0.0');
    });

    it('should fall back to a shallower element when no descendant matches', function () {
      const match = findElementAtPoint(buildNestedSource(), 150, 50);
      expect(match.path).toBe('1');
    });

    it('should prefer later (topmost) siblings over earlier overlapping ones', function () {
      const match = findElementAtPoint(buildOverlappingSource(), 5, 5);
      expect(match.path).toBe('1');
    });

    it('should return null when no element contains the point', function () {
      expect(findElementAtPoint(buildNestedSource(), 500, 500)).toBeNull();
    });

    it('should never match the root element, which has an empty path', function () {
      const source = {
        tagName: 'android.widget.FrameLayout',
        path: '',
        attributes: {bounds: '[0,0][200,200]'},
        children: [],
      };
      expect(findElementAtPoint(source, 150, 150)).toBeNull();
    });

    it('should return null when given no source', function () {
      expect(findElementAtPoint(null, 10, 10)).toBeNull();
    });
  });

  describe('#findAllElementsAtPoint', function () {
    it('should return every ancestor whose bounds contain the point, most specific first', function () {
      const matches = findAllElementsAtPoint(buildNestedSource(), 20, 20);
      // Same root-exclusion rule as findElementAtPoint - the root's empty path isn't included
      expect(matches.map((element) => element.path)).toEqual(['0.0', '0']);
    });

    it('should return every overlapping sibling, topmost first', function () {
      const matches = findAllElementsAtPoint(buildOverlappingSource(), 5, 5);
      expect(matches.map((element) => element.path)).toEqual(['1', '0']);
    });

    it('should return an empty array when no element contains the point', function () {
      expect(findAllElementsAtPoint(buildNestedSource(), 500, 500)).toEqual([]);
    });

    it('should never match the root element, which has an empty path', function () {
      const source = {
        tagName: 'android.widget.FrameLayout',
        path: '',
        attributes: {bounds: '[0,0][200,200]'},
        children: [],
      };
      expect(findAllElementsAtPoint(source, 150, 150)).toEqual([]);
    });

    it('should return an empty array when given no source', function () {
      expect(findAllElementsAtPoint(null, 10, 10)).toEqual([]);
    });

    it('should collapse a run of same-bounds pass-through ancestors into the most specific one', function () {
      // Semantics/RepaintBoundary-like wrappers: identical bounds to Button, all the way up to
      // MediaQuery, which is the first ancestor that actually differs in size (full screen)
      const source = {
        tagName: 'Scaffold',
        path: '',
        attributes: {x: '0', y: '0', width: '200', height: '200'},
        children: [
          {
            tagName: 'MediaQuery',
            path: '0',
            attributes: {x: '0', y: '0', width: '200', height: '200'},
            children: [
              {
                tagName: 'RepaintBoundary',
                path: '0.0',
                attributes: {x: '10', y: '10', width: '50', height: '50'},
                children: [
                  {
                    tagName: 'Semantics',
                    path: '0.0.0',
                    attributes: {x: '10', y: '10', width: '50', height: '50'},
                    children: [
                      {
                        tagName: 'Button',
                        path: '0.0.0.0',
                        attributes: {
                          x: '10',
                          y: '10',
                          width: '50',
                          height: '50',
                          text: 'Login',
                        },
                        children: [],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };
      const matches = findAllElementsAtPoint(source, 20, 20);
      // Semantics and RepaintBoundary share Button's exact bounds and are its ancestors, so
      // both collapse into it; MediaQuery differs in size (full screen) and is kept
      expect(matches.map((element) => element.path)).toEqual(['0.0.0.0', '0']);
    });

    it('should prefer a same-bounds named ancestor over an unnamed, more specific descendant', function () {
      // Button (the deepest match) has no identifying attribute of its own; the Semantics
      // wrapper directly above it, sharing its exact bounds, carries a semanticLabel. Losing
      // that wrapper to collapsing would leave a widget only findable by its own coordinates,
      // even though nothing else at that point was actually more specific spatially.
      const source = {
        tagName: 'Scaffold',
        path: '',
        attributes: {x: '0', y: '0', width: '200', height: '200'},
        children: [
          {
            tagName: 'RepaintBoundary',
            path: '0',
            attributes: {x: '10', y: '10', width: '50', height: '50'},
            children: [
              {
                tagName: 'Semantics',
                path: '0.0',
                attributes: {x: '10', y: '10', width: '50', height: '50', semanticLabel: 'Login'},
                children: [
                  {
                    tagName: 'Button',
                    path: '0.0.0',
                    attributes: {x: '10', y: '10', width: '50', height: '50'},
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      };
      const matches = findAllElementsAtPoint(source, 20, 20);
      expect(matches.map((element) => element.path)).toEqual(['0.0']);
    });

    it('should not collapse an ancestor whose bounds differ from its descendant', function () {
      const matches = findAllElementsAtPoint(buildNestedSource(), 20, 20);
      expect(matches.map((element) => element.path)).toEqual(['0.0', '0']);
    });

    it('should not collapse siblings that share identical bounds, even though a naive bounds-only check would', function () {
      const matches = findAllElementsAtPoint(buildOverlappingSource(), 5, 5);
      expect(matches.map((element) => element.path)).toEqual(['1', '0']);
    });
  });

  describe('#getElementDisplayName', function () {
    it('should include an identifying attribute when one is present', function () {
      const element = {tagName: 'android.widget.Button', attributes: {text: 'Login'}};
      expect(getElementDisplayName(element)).toBe('android.widget.Button (Login)');
    });

    it('should fall back to the tag name when no identifying attribute is present', function () {
      const element = {tagName: 'android.widget.FrameLayout', attributes: {}};
      expect(getElementDisplayName(element)).toBe('android.widget.FrameLayout');
    });

    it('should return an empty string when given no element', function () {
      expect(getElementDisplayName(null)).toBe('');
    });
  });
});
