// Screenshot interaction modes
// TAP_SWIPE refers to both TAP and SWIPE
// TAP_ELEMENT refers to tapping an element highlighter to both select and tap it in one action
// GESTURE refers to playback via gesture editor
// CHECK_EXISTENCE, ENTER_TEXT and CHECK_TEXT are Flutter-only actions (right-click, in
// TAP_SWIPE mode) - see 'appium_handler.dart's 'checkExistence'/'enterText'/'checkText'
// performActions handling. Their values also double as the performActions action 'type' sent to
// that Dart-side handler
export const SCREENSHOT_INTERACTION_MODE = {
  SELECT: 'select',
  SWIPE: 'swipe',
  TAP: 'tap',
  TAP_SWIPE: 'tap_swipe',
  TAP_ELEMENT: 'tap_element',
  GESTURE: 'gesture',
  CHECK_EXISTENCE: 'checkExistence',
  ENTER_TEXT: 'enterText',
  CHECK_TEXT: 'checkText',
};

// Default parameters when executing coordinate-based swipe over app screenshot
export const DEFAULT_SWIPE = {
  POINTER_NAME: 'finger1',
  DURATION_1: 0,
  DURATION_2: 750,
  BUTTON: 0,
  ORIGIN: 'viewport',
};

// Default parameters when executing coordinate-based tap over app screenshot
export const DEFAULT_TAP = {
  POINTER_NAME: 'finger1',
  DURATION_1: 0,
  DURATION_2: 100,
  BUTTON: 0,
};

// 3 Types of centroids:
// CENTROID is the circle/square for an individual element
// EXPAND is the +/- circle for a group of overlapping elements
// OVERLAP is the circle for an individual element, shown in a circle around an EXPAND centroid
export const RENDER_CENTROID_AS = {
  CENTROID: 'centroid',
  EXPAND: 'expand',
  OVERLAP: 'overlap',
};

export const CENTROID_STYLES = {
  VISIBLE: 'visible',
  HIDDEN: 'hidden',
  CONTAINER: '50%',
  NON_CONTAINER: '0%',
};
