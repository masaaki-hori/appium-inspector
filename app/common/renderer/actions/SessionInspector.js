import sanitize from 'sanitize-filename';

import {SAVED_CLIENT_FRAMEWORK, SET_SAVED_GESTURES} from '../../shared/setting-defs.js';
import {DRIVERS} from '../constants/common.js';
import {POINTER_TYPES} from '../constants/gestures.js';
import {DEFAULT_TAP, SCREENSHOT_INTERACTION_MODE} from '../constants/screenshot.js';
import {
  APP_MODE,
  FLUTTER_CONTEXT,
  NATIVE_APP,
  SCREENSHOT_SCALE_REFRESH_EVENT,
  UNKNOWN_ERROR,
} from '../constants/session-inspector.js';
import i18n from '../i18next.js';
import InspectorDriver from '../lib/appium/inspector-driver.js';
import {CLIENT_FRAMEWORK_MAP} from '../lib/client-frameworks/map.js';
import {getSetting, setSetting} from '../polyfills.js';
import {debounce, isEmpty, omit} from '../utils/common.js';
import {findElementAtPoint} from '../utils/element-hit-testing.js';
import {downloadFile, readTextFromUploadedFiles} from '../utils/file-handling.js';
import {parseGestureFileContents} from '../utils/gesturefile-parsing.js';
import {getSuggestedLocators} from '../utils/locator-generation/common.js';
import {getOptimalXPath} from '../utils/locator-generation/xpath.js';
import {log} from '../utils/logger.js';
import {notification} from '../utils/notification.js';
import {getRandomId} from '../utils/other.js';
import {
  findDOMNodeByPath,
  findJSONElementByPath,
  xmlToDOM,
  xmlToJSON,
} from '../utils/source-parsing.js';
import {newSession, showError} from './SessionBuilder.js';

export const SET_SESSION_DETAILS = 'SET_SESSION_DETAILS';
export const SET_SOURCE_AND_SCREENSHOT = 'SET_SOURCE_AND_SCREENSHOT';
export const STORE_SESSION_SETTINGS = 'STORE_SESSION_SETTINGS';
export const SESSION_DONE = 'SESSION_DONE';
export const SELECT_ELEMENT = 'SELECT_ELEMENT';
export const UNSELECT_ELEMENT = 'UNSELECT_ELEMENT';
export const SET_SELECTED_ELEMENT_ID = 'SET_SELECTED_ELEMENT_ID';
export const SET_INTERACTIONS_NOT_AVAILABLE = 'SET_INTERACTIONS_NOT_AVAILABLE';
export const METHOD_CALL_REQUESTED = 'METHOD_CALL_REQUESTED';
export const METHOD_CALL_DONE = 'METHOD_CALL_DONE';
export const SET_EXPANDED_PATHS = 'SET_EXPANDED_PATHS';
export const SET_OPTIMAL_LOCATORS = 'SET_OPTIMAL_LOCATORS';

export const SELECT_CENTROID = 'SELECT_CENTROID';
export const UNSELECT_CENTROID = 'UNSELECT_CENTROID';
export const SET_SHOW_CENTROIDS = 'SET_SHOW_CENTROIDS';

export const QUIT_SESSION_REQUESTED = 'QUIT_SESSION_REQUESTED';
export const QUIT_SESSION_DONE = 'QUIT_SESSION_DONE';
export const SET_SESSION_TIME = 'SET_SESSION_TIME';

export const START_RECORDING = 'START_RECORDING';
export const PAUSE_RECORDING = 'PAUSE_RECORDING';
export const CLEAR_RECORDING = 'CLEAR_RECORDING';
export const SET_CLIENT_FRAMEWORK = 'SET_CLIENT_FRAMEWORK';
export const RECORD_ACTION = 'RECORD_ACTION';
export const RECORD_FLUTTER_FINDER = 'RECORD_FLUTTER_FINDER';
export const SET_SHOW_BOILERPLATE = 'SET_SHOW_BOILERPLATE';

export const SHOW_LOCATOR_SEARCH_MODAL = 'SHOW_LOCATOR_SEARCH_MODAL';
export const HIDE_LOCATOR_SEARCH_MODAL = 'HIDE_LOCATOR_SEARCH_MODAL';
export const SHOW_SIRI_COMMAND_MODAL = 'SHOW_SIRI_COMMAND_MODAL';
export const HIDE_SIRI_COMMAND_MODAL = 'HIDE_SIRI_COMMAND_MODAL';
export const SET_SIRI_COMMAND_VALUE = 'SET_SIRI_COMMAND_VALUE';
export const SET_LOCATOR_SEARCH_STRATEGY = 'SET_LOCATOR_SEARCH_STRATEGY';
export const SET_LOCATOR_SEARCH_VALUE = 'SET_LOCATOR_SEARCH_VALUE';
export const SEARCHING_FOR_ELEMENTS = 'SEARCHING_FOR_ELEMENTS';
export const SEARCHING_FOR_ELEMENTS_COMPLETED = 'SEARCHING_FOR_ELEMENTS_COMPLETED';
export const GET_FIND_ELEMENTS_TIMES = 'GET_FIND_ELEMENTS_TIMES';
export const GET_FIND_ELEMENTS_TIMES_COMPLETED = 'GET_FIND_ELEMENTS_TIMES_COMPLETED';
export const SELECT_LOCATED_ELEMENT = 'SELECT_LOCATED_ELEMENT';
export const FINDING_ELEMENT_IN_SOURCE = 'FINDING_ELEMENT_IN_SOURCE';
export const FINDING_ELEMENT_IN_SOURCE_COMPLETED = 'FINDING_ELEMENT_IN_SOURCE_COMPLETED';
export const CLEAR_SEARCH_RESULTS = 'CLEAR_SEARCH_RESULTS';
export const ADD_ASSIGNED_VAR_CACHE = 'ADD_ASSIGNED_VAR_CACHE';
export const CLEAR_ASSIGNED_VAR_CACHE = 'CLEAR_ASSIGNED_VAR_CACHE';
export const SET_MJPEG_STATE = 'SET_MJPEG_STATE';
export const SET_SCREENSHOT_INTERACTION_MODE = 'SET_SCREENSHOT_INTERACTION_MODE';
export const SET_APP_MODE = 'SET_APP_MODE';
export const SET_SEARCHED_FOR_ELEMENT_BOUNDS = 'SET_SEARCHED_FOR_ELEMENT_BOUNDS';
export const CLEAR_SEARCHED_FOR_ELEMENT_BOUNDS = 'CLEAR_SEARCHED_FOR_ELEMENT_BOUNDS';
export const SET_FOUND_DISPLAYS = 'SET_FOUND_DISPLAYS';
export const SET_CURRENT_DISPLAY_ID = 'SET_CURRENT_DISPLAY_ID';

export const SET_COORD_START = 'SET_COORD_START';
export const SET_COORD_END = 'SET_COORD_END';
export const CLEAR_COORD_ACTION = 'CLEAR_COORD_ACTION';
export const PROMPT_KEEP_ALIVE = 'PROMPT_KEEP_ALIVE';
export const HIDE_PROMPT_KEEP_ALIVE = 'HIDE_PROMPT_KEEP_ALIVE';

export const SELECT_INSPECTOR_TAB = 'SELECT_INSPECTOR_TAB';

export const SET_CONTEXT = 'SET_CONTEXT';

export const SET_APP_ID = 'SET_APP_ID';
export const SET_SERVER_STATUS = 'SET_SERVER_STATUS';
export const SET_FLAT_SESSION_CAPS = 'SET_FLAT_SESSION_CAPS';

export const SET_KEEP_ALIVE_INTERVAL = 'SET_KEEP_ALIVE_INTERVAL';
export const SET_USER_WAIT_TIMEOUT = 'SET_USER_WAIT_TIMEOUT';
export const SET_LAST_ACTIVE_MOMENT = 'SET_LAST_ACTIVE_MOMENT';

export const SET_AWAITING_MJPEG_STREAM = 'SET_AWAITING_MJPEG_STREAM';

export const GESTURE_UPLOAD_REQUESTED = 'GESTURE_UPLOAD_REQUESTED';
export const GESTURE_UPLOAD_DONE = 'GESTURE_UPLOAD_DONE';
export const SHOW_GESTURE_EDITOR = 'SHOW_GESTURE_EDITOR';
export const HIDE_GESTURE_EDITOR = 'HIDE_GESTURE_EDITOR';
export const GET_SAVED_GESTURES_REQUESTED = 'GET_SAVED_GESTURES_REQUESTED';
export const GET_SAVED_GESTURES_DONE = 'GET_SAVED_GESTURES_DONE';
export const DELETE_SAVED_GESTURES_REQUESTED = 'DELETE_SAVED_GESTURES_REQUESTED';
export const DELETE_SAVED_GESTURES_DONE = 'DELETE_SAVED_GESTURES_DONE';
export const SET_LOADED_GESTURE = 'SET_LOADED_GESTURE';
export const REMOVE_LOADED_GESTURE = 'REMOVE_LOADED_GESTURE';
export const SHOW_GESTURE_ACTION = 'SHOW_GESTURE_ACTION';
export const HIDE_GESTURE_ACTION = 'HIDE_GESTURE_ACTION';
export const SELECT_TICK_ELEMENT = 'SELECT_TICK_ELEMENT';
export const UNSELECT_TICK_ELEMENT = 'UNSELECT_TICK_ELEMENT';
export const SET_GESTURE_TAP_COORDS_MODE = 'SET_GESTURE_TAP_COORDS_MODE';
export const CLEAR_TAP_COORDINATES = 'CLEAR_TAP_COORDINATES';

export const TOGGLE_SHOW_ATTRIBUTES = 'TOGGLE_SHOW_ATTRIBUTES';
export const SET_REFRESHING_STATE = 'SET_REFRESHING_STATE';

export const SET_AUTO_SESSION_RESTART = 'SET_AUTO_SESSION_RESTART';

const KEEP_ALIVE_PING_INTERVAL = 20 * 1000;
const NO_NEW_COMMAND_LIMIT = 24 * 60 * 60 * 1000; // Set timeout to 24 hours

// A debounced function that calls findElement and gets info about the element
const findElement = debounce(async function (strategyMap, dispatch, getState, path) {
  for (let [strategy, selector] of strategyMap) {
    // Get the information about the element
    const action = callClientMethod({
      strategy,
      selector,
    });
    let {elementId} = await action(dispatch, getState);

    // Set the elementId for the selected element
    // (check first that the selectedElementPath didn't change, to avoid race conditions)
    if (elementId && getState().inspector.selectedElementPath === path) {
      return dispatch({type: SET_SELECTED_ELEMENT_ID, elementId});
    }
  }

  return dispatch({type: SET_INTERACTIONS_NOT_AVAILABLE});
}, 1000);

export function selectElement(path) {
  return async (dispatch, getState) => {
    const {sourceJSON, sourceXML, expandedPaths, currentContext, automationName} =
      getState().inspector;
    const isNative = currentContext === NATIVE_APP;
    // Set the selected element in the source tree
    const selectedElement = findJSONElementByPath(path, sourceJSON);
    dispatch({type: SELECT_ELEMENT, selectedElement});

    // Expand all of this element's ancestors so that it's visible in the source tree
    // Make a copy of the array to avoid state mutation
    const copiedExpandedPaths = [...expandedPaths];
    let pathArr = path.split('.').slice(0, path.length - 1);
    while (pathArr.length > 1) {
      pathArr.splice(pathArr.length - 1);
      let path = pathArr.join('.');
      if (!copiedExpandedPaths.includes(path)) {
        copiedExpandedPaths.push(path);
      }
    }
    dispatch({type: SET_EXPANDED_PATHS, paths: copiedExpandedPaths});

    // Calculate the recommended locator strategies
    const strategyMap = getSuggestedLocators(selectedElement, sourceXML, isNative, automationName);
    dispatch({type: SET_OPTIMAL_LOCATORS, strategyMap});

    // Debounce find element so that if another element is selected shortly after, cancel the previous search
    await findElement(strategyMap, dispatch, getState, path);
  };
}

export function unselectElement() {
  return (dispatch) => {
    dispatch({type: UNSELECT_ELEMENT});
  };
}

export function selectCentroid(path) {
  return (dispatch) => {
    dispatch({type: SELECT_CENTROID, path});
  };
}

export function unselectCentroid() {
  return (dispatch) => {
    dispatch({type: UNSELECT_CENTROID});
  };
}

/**
 * Requests a method call on appium
 */
export function applyClientMethod(params) {
  return async (dispatch, getState) => {
    const isRecording =
      params.methodName !== 'deleteSession' &&
      params.methodName !== 'getPageSource' &&
      params.methodName !== 'gesture' &&
      getState().inspector.isRecording;
    dispatch({type: METHOD_CALL_REQUESTED});
    const callAction = callClientMethod(params);
    const {
      contexts,
      contextsError,
      commandRes,
      currentContext,
      currentContextError,
      source,
      screenshot,
      windowSize,
      sourceError,
      screenshotError,
      windowSizeError,
      variableName,
      variableIndex,
      strategy,
      selector,
    } = await callAction(dispatch, getState);

    // TODO: Implement recorder code for gestures
    if (isRecording) {
      // Add 'findAndAssign' line of code. Don't do it for arrays though. Arrays already have 'find' expression
      if (strategy && selector && !variableIndex && variableIndex !== 0) {
        const findAction = findAndAssign(strategy, selector, variableName, false);
        findAction(dispatch, getState);
      }

      // now record the actual action
      let args = [variableName, variableIndex];
      args = args.concat(params.args || []);
      dispatch({type: RECORD_ACTION, action: params.methodName, params: args});
    }
    dispatch({type: METHOD_CALL_DONE});

    // Dispatch whenever a refresh actually ran (skipRefresh calls return none of these), whether
    // it succeeded or failed - previously this only fired when 'source' was present, which meant
    // a failed initial source fetch (e.g. a null/unparsable response) silently discarded its
    // 'sourceError' too, leaving the UI stuck on its "gathering initial source" loading state
    // forever instead of showing the error
    if (source || sourceError || screenshot || screenshotError || windowSize || windowSizeError) {
      dispatch({
        type: SET_SOURCE_AND_SCREENSHOT,
        contexts,
        currentContext,
        sourceJSON: source ? xmlToJSON(source) : undefined,
        sourceXML: source,
        screenshot,
        windowSize,
        contextsError,
        currentContextError,
        sourceError,
        screenshotError,
        windowSizeError,
      });
    }
    // Ask <SessionInspector> to recompute the screenshot's scale ratio/container width, since
    // this call may have changed the screenshot's rendered dimensions (new image, orientation
    // change, etc.). This intentionally is NOT a real 'resize' event: third-party popup libraries
    // (e.g. antd's Dropdown, for the Flutter right-click context menu in Screenshot.jsx) also
    // listen for window resize and auto-close on it, which was silently closing that menu/any
    // open modal on every periodic auto-refresh tick (see SCREENSHOT_SCALE_REFRESH_EVENT usage).
    window.dispatchEvent(new Event(SCREENSHOT_SCALE_REFRESH_EVENT));
    return commandRes;
  };
}

/**
 * Taps the screenshot at the given point.
 *
 * For a Flutter driver session, the widget under the point is resolved server-side (see the
 * 'appium-handler' Dart package this pairs with) as part of performing the tap itself, so the
 * coordinate-based tap is always sent, and the response is used to tag the recorded action with
 * the widget locator the driver resolved (see 'tapFlutterWidgetAtCoordinates').
 *
 * For other drivers, the point is looked up against the already-known element bounds first: if
 * it falls within a known element, that element is located and clicked (so the recorder/generated
 * code refers to it by locator, not by raw coordinates). Otherwise, falls back to a coordinate-
 * based tap, same as for Flutter.
 */
export function tapAtCoordinates(x, y) {
  return async (dispatch, getState) => {
    const {automationName} = getState().inspector;
    if (automationName === DRIVERS.FLUTTER) {
      return await tapFlutterWidgetAtCoordinates(x, y)(dispatch, getState);
    }

    const {sourceJSON, sourceXML, currentContext} = getState().inspector;
    const isNative = currentContext === NATIVE_APP;
    const targetElement = findElementAtPoint(sourceJSON, x, y);

    if (targetElement) {
      const strategyMap = getSuggestedLocators(targetElement, sourceXML, isNative, automationName);
      for (const [strategy, selector] of strategyMap) {
        const findAction = callClientMethod({strategy, selector});
        const {elementId} = await findAction(dispatch, getState);
        if (elementId) {
          const clickAction = applyClientMethod({methodName: 'elementClick', elementId});
          return await clickAction(dispatch, getState);
        }
      }
    }

    return await tapRawCoordinates(x, y)(dispatch, getState);
  };
}

export function restartSession(error, params) {
  return async (dispatch, getState) => {
    if (error?.name !== UNKNOWN_ERROR) {
      showError(error, {methodName: params.methodName, secs: 10});
      return dispatch({type: METHOD_CALL_DONE});
    }
    showError(error, {methodName: params.methodName, secs: 3});
    notification.info({
      title: i18n.t('RestartSessionMessage'),
      duration: 3,
    });
    const quitSes = quitSession();
    const newSes = newSession(getState().builder.caps);
    const getPageSrc = applyClientMethod({methodName: 'getPageSource'});
    const storeSessionSet = storeSessionSettings();
    const getSavedClientFrame = getSavedClientFramework();
    const runKeepAliveLp = runKeepAliveLoop();
    const setSesTime = setSessionTime(Date.now());

    await quitSes(dispatch, getState);
    await newSes(dispatch, getState);
    await getPageSrc(dispatch, getState);
    await storeSessionSet(dispatch, getState);
    await getSavedClientFrame(dispatch);
    runKeepAliveLp(dispatch, getState);
    setSesTime(dispatch);
    dispatch({type: SET_AUTO_SESSION_RESTART, autoSessionRestart: true});
    dispatch({type: METHOD_CALL_DONE});
    // Callers (see applyClientMethod, which awaits this via callClientMethod) destructure this
    // return value - returning undefined here would throw there
    return {};
  };
}

export function addAssignedVarCache(varName) {
  return (dispatch) => {
    dispatch({type: ADD_ASSIGNED_VAR_CACHE, varName});
  };
}

export function setExpandedPaths(paths) {
  return (dispatch) => {
    dispatch({type: SET_EXPANDED_PATHS, paths});
  };
}

/**
 * Quit the session and go back to the new session window
 */
export function quitSession({reason, manualQuit = true, detachOnly = false} = {}) {
  return async (dispatch, getState) => {
    const killAction = killKeepAliveLoop();
    killAction(dispatch, getState);
    if (!detachOnly) {
      const applyAction = applyClientMethod({methodName: 'deleteSession'});
      await applyAction(dispatch, getState);
    }
    dispatch({type: QUIT_SESSION_DONE});
    InspectorDriver.clearInstance(); // clear the 'cached' driver instance
    if (!manualQuit) {
      showError(new Error(reason || i18n.t('Session has been terminated')), {secs: 0});
    }
  };
}

export function startRecording() {
  return (dispatch) => {
    dispatch({type: START_RECORDING});
  };
}

export function pauseRecording() {
  return (dispatch) => {
    dispatch({type: PAUSE_RECORDING});
  };
}

export function clearRecording() {
  return (dispatch) => {
    dispatch({type: CLEAR_RECORDING});
    dispatch({type: CLEAR_ASSIGNED_VAR_CACHE}); // Get rid of the variable cache
  };
}

export function getSavedClientFramework() {
  return async (dispatch) => {
    let framework = await getSetting(SAVED_CLIENT_FRAMEWORK);
    dispatch({type: SET_CLIENT_FRAMEWORK, framework});
  };
}

export function setClientFramework(framework) {
  return async (dispatch) => {
    if (!CLIENT_FRAMEWORK_MAP[framework]) {
      throw new Error(i18n.t('frameworkNotSupported', {framework}));
    }
    await setSetting(SAVED_CLIENT_FRAMEWORK, framework);
    dispatch({type: SET_CLIENT_FRAMEWORK, framework});
  };
}

export function recordAction(action, params) {
  return (dispatch) => {
    dispatch({type: RECORD_ACTION, action, params});
  };
}

export function toggleShowBoilerplate() {
  return (dispatch, getState) => {
    const show = !getState().inspector.showBoilerplate;
    dispatch({type: SET_SHOW_BOILERPLATE, show});
  };
}

export function setSessionDetails({serverDetails, driver, sessionCaps, appMode, isUsingMjpegMode}) {
  return (dispatch) => {
    dispatch({
      type: SET_SESSION_DETAILS,
      serverDetails,
      driver,
      sessionCaps,
      appMode,
      isUsingMjpegMode,
    });
  };
}

export function storeSessionSettings(updatedSessionSettings = null) {
  return async (dispatch, getState) => {
    let sessionSettings = updatedSessionSettings;
    if (sessionSettings === null) {
      const action = applyClientMethod({
        methodName: 'getSettings',
        skipRefresh: true,
      });
      sessionSettings = await action(dispatch, getState);
    }
    dispatch({type: STORE_SESSION_SETTINGS, sessionSettings});
  };
}

export function showLocatorSearchModal() {
  return (dispatch) => {
    dispatch({type: SHOW_LOCATOR_SEARCH_MODAL});
  };
}

export function hideLocatorSearchModal() {
  return (dispatch) => {
    dispatch({type: HIDE_LOCATOR_SEARCH_MODAL});
  };
}

export function showSiriCommandModal() {
  return (dispatch) => {
    dispatch({type: SHOW_SIRI_COMMAND_MODAL});
  };
}

export function hideSiriCommandModal() {
  return (dispatch) => {
    dispatch({type: HIDE_SIRI_COMMAND_MODAL});
  };
}

export function setSiriCommandValue(siriCommandValue) {
  return (dispatch) => {
    dispatch({type: SET_SIRI_COMMAND_VALUE, siriCommandValue});
  };
}

export function toggleMultiDisplayMode(displays) {
  return async (dispatch, getState) => {
    if (displays) {
      // Toggling off: reset to the default display (0), then set displays to null
      await setCurrentDisplayId(0)(dispatch, getState);
      return dispatch({type: SET_FOUND_DISPLAYS, displays: null});
    }
    // Toggling on: run search, set displays and currentDisplayId
    // Any errors will be surfaced as part of callClientMethod
    const action = applyClientMethod({
      methodName: 'executeScript',
      args: ['mobile:listDisplays', []],
      skipRefresh: true,
    });
    const foundDisplays = await action(dispatch, getState);
    dispatch({type: SET_FOUND_DISPLAYS, displays: foundDisplays});
    dispatch({type: SET_CURRENT_DISPLAY_ID, displayId: 0});
  };
}

export function setCurrentDisplayId(displayId) {
  return async (dispatch, getState) => {
    const action = applyClientMethod({
      methodName: 'updateSettings',
      // without enableMultiWindows: true, app source is retrieved from default display
      args: [{currentDisplayId: displayId, enableMultiWindows: true}],
    });
    await action(dispatch, getState);
    dispatch({type: SET_CURRENT_DISPLAY_ID, displayId});
  };
}

export function setLocatorSearchValue(locatorSearchValue) {
  return (dispatch) => {
    dispatch({type: SET_LOCATOR_SEARCH_VALUE, locatorSearchValue});
  };
}

export function setLocatorSearchStrategy(locatorSearchStrategy) {
  return (dispatch) => {
    dispatch({type: SET_LOCATOR_SEARCH_STRATEGY, locatorSearchStrategy});
  };
}

export function setContext(context) {
  return (dispatch) => {
    dispatch({type: SET_CONTEXT, context});
  };
}

export function searchForElement(strategy, selector) {
  return async (dispatch, getState) => {
    const isRecording = getState().inspector.isRecording;
    dispatch({type: SEARCHING_FOR_ELEMENTS});
    try {
      const callAction = callClientMethod({strategy, selector, fetchArray: true});
      let {elements, variableName, executionTime} = await callAction(dispatch, getState);
      if (isRecording) {
        const findAction = findAndAssign(strategy, selector, variableName, true);
        findAction(dispatch, getState);
      }
      elements = elements.map((el) => el.id);
      dispatch({type: SEARCHING_FOR_ELEMENTS_COMPLETED, elements, executionTime});
    } catch (error) {
      dispatch({type: SEARCHING_FOR_ELEMENTS_COMPLETED});
      showError(error, {methodName: 10});
    }
  };
}

/**
 * Get all the find element times based on the find data source
 */
export function getFindElementsTimes(findDataSource) {
  return async (dispatch, getState) => {
    dispatch({type: GET_FIND_ELEMENTS_TIMES});
    try {
      const findElementsExecutionTimes = [];
      for (const element of findDataSource) {
        const {find, key, selector} = element;
        const action = callClientMethod({strategy: key, selector});
        const {executionTime} = await action(dispatch, getState);
        findElementsExecutionTimes.push({find, key, selector, time: executionTime});
      }

      dispatch({
        type: GET_FIND_ELEMENTS_TIMES_COMPLETED,
        findElementsExecutionTimes: [...findElementsExecutionTimes].sort((a, b) => a.time - b.time),
      });
    } catch (error) {
      dispatch({type: GET_FIND_ELEMENTS_TIMES_COMPLETED});
      showError(error, {methodName: 10});
    }
  };
}

export function findAndAssign(strategy, selector, variableName, isArray) {
  return (dispatch, getState) => {
    const {assignedVarCache} = getState().inspector;

    // If this call to 'findAndAssign' for this variable wasn't done already, do it now
    if (!assignedVarCache[variableName]) {
      dispatch({
        type: RECORD_ACTION,
        action: 'findAndAssign',
        params: [strategy, selector, variableName, isArray],
      });
      dispatch({type: ADD_ASSIGNED_VAR_CACHE, varName: variableName});
    }
  };
}

export function selectLocatedElement(elementId) {
  return async (dispatch, getState) => {
    dispatch({type: SELECT_LOCATED_ELEMENT, elementId});
    dispatch({type: CLEAR_SEARCHED_FOR_ELEMENT_BOUNDS});
    if (elementId) {
      try {
        const action = callClientMethod({
          elementId,
          methodName: 'getElementRect',
          skipRefresh: true,
          skipRecord: true,
        });
        const {commandRes} = await action(dispatch, getState);
        dispatch({
          type: SET_SEARCHED_FOR_ELEMENT_BOUNDS,
          location: {x: commandRes.x, y: commandRes.y},
          size: {width: commandRes.width, height: commandRes.height},
        });
      } catch {}
    }
  };
}

/**
 * Given an element ID found through search, and its bounds,
 * attempt to find and select this element in the source tree
 */
export function findLocatedElementInSource(sourceJSON, sourceXML, bounds, id) {
  const UPPER_FILTER_LIMIT = 10;

  // Parse the source tree and find all nodes whose bounds match the expected bounds
  // Return the path of each node
  function findPathsMatchingBounds() {
    if (!bounds || !sourceJSON.children?.[0]?.attributes) {
      return null;
    }
    if (sourceJSON.children[0].attributes.bounds) {
      const [endX, endY] = [
        bounds.location.x + bounds.size.width,
        bounds.location.y + bounds.size.height,
      ];
      const coords = `[${bounds.location.x},${bounds.location.y}][${endX},${endY}]`;
      return findPathsFromCoords(sourceJSON.children, coords);
    } else if (sourceJSON.children[0].attributes.x) {
      const combinedBounds = {
        x: String(bounds.location.x),
        y: String(bounds.location.y),
        height: String(bounds.size.height),
        width: String(bounds.size.width),
      };
      return findPathsFromBounds(sourceJSON.children, combinedBounds);
    }
    return null;
  }

  // Recursive function for parsing source tree when elements have 'bounds' property
  function findPathsFromCoords(trees, coords) {
    let collectedPaths = [];
    for (const tree of trees) {
      if (tree.attributes.bounds === coords) {
        collectedPaths.push(tree.path);
      }
      if (tree.children.length) {
        collectedPaths.push(...findPathsFromCoords(tree.children, coords));
      }
    }
    return collectedPaths;
  }

  // Recursive function for parsing source tree when elements have 'x/y/height/width' properties
  function findPathsFromBounds(trees, bounds) {
    let collectedPaths = [];
    for (const tree of trees) {
      if (
        tree.attributes.x === bounds.x &&
        tree.attributes.y === bounds.y &&
        tree.attributes.height === bounds.height &&
        tree.attributes.width === bounds.width
      ) {
        collectedPaths.push(tree.path);
      }
      if (tree.children.length) {
        collectedPaths.push(...findPathsFromBounds(tree.children, bounds));
      }
    }
    return collectedPaths;
  }

  // If findPathsMatchingBounds found multiple items,
  // use Appium findElement to filter further by element ID
  async function filterFoundPaths(foundPaths, dispatch, getState) {
    if (!foundPaths) {
      return null;
    }
    if (foundPaths.length === 1) {
      return foundPaths[0];
    } else if (foundPaths.length !== 0 && foundPaths.length <= UPPER_FILTER_LIMIT) {
      return await findElementWithMatchingId(foundPaths, dispatch, getState);
    }
    return null;
  }

  // For each provided path, get its xpath and call Appium findElement
  // Return the path of the element whose ID matches the expected ID
  async function findElementWithMatchingId(foundPaths, dispatch, getState) {
    const sourceDoc = xmlToDOM(sourceXML);
    for (const path of foundPaths) {
      const domNode = findDOMNodeByPath(path, sourceDoc);
      const xpath = getOptimalXPath(sourceDoc, domNode);
      const action = callClientMethod({strategy: 'xpath', selector: xpath});
      const {el} = await action(dispatch, getState);
      if (el && el.elementId === id) {
        return path;
      }
    }
    return null;
  }

  return async (dispatch, getState) => {
    dispatch({type: FINDING_ELEMENT_IN_SOURCE});
    const foundPaths = findPathsMatchingBounds();
    const foundPath = await filterFoundPaths(foundPaths, dispatch, getState);
    if (foundPath) {
      const action = selectElement(foundPath);
      await action(dispatch, getState);
    } else {
      showError(new Error(i18n.t('findingElementInSourceFailed')), {secs: 8});
    }
    dispatch({type: FINDING_ELEMENT_IN_SOURCE_COMPLETED});
  };
}

export function clearSearchResults() {
  return (dispatch) => {
    dispatch({type: CLEAR_SEARCH_RESULTS});
    dispatch({type: CLEAR_SEARCHED_FOR_ELEMENT_BOUNDS});
  };
}

export function setMjpegState(targetMjpegState) {
  return (dispatch) => {
    dispatch({type: SET_MJPEG_STATE, targetMjpegState});
  };
}

export function selectScreenshotInteractionMode(screenshotInteractionMode) {
  return (dispatch) => {
    dispatch({type: SET_SCREENSHOT_INTERACTION_MODE, screenshotInteractionMode});
  };
}

export function setRefreshingState(refreshStates) {
  return (dispatch) => {
    dispatch({type: SET_REFRESHING_STATE, refreshStates});
  };
}

export function selectAppMode(mode) {
  return async (dispatch, getState) => {
    const {appMode, automationName} = getState().inspector;
    dispatch({type: SET_APP_MODE, mode});
    if (appMode !== mode && mode === APP_MODE.WEB_HYBRID) {
      if (automationName === DRIVERS.FLUTTER) {
        // A Flutter driver session has no real WebView-hybrid concept to search for - this
        // button is repurposed as "leave the native OS layer switched to by NATIVE app mode
        // below, and resume driving the Flutter widget tree", so just switch back to the
        // FLUTTER context directly. The generic getPageSource path this used to take instead
        // triggers a WebView-context HTML-tagging script injection ('execute/sync') that the
        // Flutter driver doesn't support - it errored, and left later getContexts() calls
        // reporting only FLUTTER (losing NATIVE_APP as a selectable context) as a side effect.
        const action = applyClientMethod({
          methodName: 'switchAppiumContext',
          args: [FLUTTER_CONTEXT],
        });
        await action(dispatch, getState);
      } else {
        // if we're transitioning to hybrid mode, do a pre-emptive search for contexts
        const action = applyClientMethod({methodName: 'getPageSource'});
        await action(dispatch, getState);
      }
    }
    if (appMode !== mode && mode === APP_MODE.NATIVE) {
      const action = applyClientMethod({methodName: 'switchAppiumContext', args: [NATIVE_APP]});
      await action(dispatch, getState);
    }
  };
}

export function toggleShowCentroids() {
  return (dispatch, getState) => {
    const {showCentroids} = getState().inspector;
    const show = !showCentroids;
    dispatch({type: SET_SHOW_CENTROIDS, show});
  };
}

export function getActiveAppId(isIOS, isAndroid) {
  return async (dispatch, getState) => {
    try {
      if (isIOS) {
        const action = applyClientMethod({
          methodName: 'executeScript',
          args: ['mobile:activeAppInfo', []],
          skipRefresh: true,
        });
        const {bundleId} = await action(dispatch, getState);
        dispatch({type: SET_APP_ID, appId: bundleId});
      }
      if (isAndroid) {
        const action = applyClientMethod({
          methodName: 'executeScript',
          args: ['mobile:getCurrentPackage', []],
          skipRefresh: true,
        });
        const appPackage = await action(dispatch, getState);
        dispatch({type: SET_APP_ID, appId: appPackage});
      }
    } catch (err) {
      log.error(`Could not Retrieve Active App ID: ${err}`);
    }
  };
}

export function getServerStatus() {
  return async (dispatch, getState) => {
    const status = applyClientMethod({methodName: 'status', skipRefresh: true});
    const {build} = await status(dispatch, getState);
    dispatch({type: SET_SERVER_STATUS, status: build});
  };
}

export function getFlatSessionCaps() {
  return async (dispatch, getState) => {
    const action = applyClientMethod({methodName: 'getSession', skipRefresh: true});
    const flatSessionCaps = await action(dispatch, getState);
    dispatch({type: SET_FLAT_SESSION_CAPS, flatSessionCaps});
  };
}

// Start the session timer once session starts
export function setSessionTime(time) {
  return (dispatch) => {
    dispatch({type: SET_SESSION_TIME, sessionStartTime: time});
  };
}

export function setCoordStart(coordStartX, coordStartY) {
  return (dispatch) => {
    dispatch({type: SET_COORD_START, coordStartX, coordStartY});
  };
}

export function setCoordEnd(coordEndX, coordEndY) {
  return (dispatch) => {
    dispatch({type: SET_COORD_END, coordEndX, coordEndY});
  };
}

export function clearCoordAction() {
  return (dispatch) => {
    dispatch({type: CLEAR_COORD_ACTION});
  };
}

export function selectInspectorTab(interaction) {
  return (dispatch) => {
    dispatch({type: SELECT_INSPECTOR_TAB, interaction});
  };
}

export function getSupportedSessionMethods() {
  return async (_dispatch, getState) => {
    async function safelyCallCommand(methodName) {
      try {
        const action = executeDriverCommand({methodName});
        const {commandRes} = await action(getState);
        return commandRes;
      } catch {
        return [];
      }
    }

    const [commands, executeMethods] = await Promise.all([
      safelyCallCommand('getAppiumCommands'),
      safelyCallCommand('getAppiumExtensions'),
    ]);
    return {commands, executeMethods};
  };
}

export function setUserWaitTimeout(userWaitTimeout) {
  return (dispatch) => {
    dispatch({type: SET_USER_WAIT_TIMEOUT, userWaitTimeout});
  };
}

/**
 * Ping server every 30 seconds to prevent `newCommandTimeout` from killing session
 */
export function runKeepAliveLoop() {
  return (dispatch, getState) => {
    dispatch({type: SET_LAST_ACTIVE_MOMENT, lastActiveMoment: Date.now()});
    const {driver} = getState().inspector;

    const keepAliveInterval = setInterval(async () => {
      const {lastActiveMoment, showKeepAlivePrompt} = getState().inspector;
      log.info('Pinging Appium server to keep session active');
      try {
        await driver.getTimeouts(); // Pings the Appium server to keep it alive
      } catch {}
      const now = Date.now();

      // If the new command limit has been surpassed, prompt user if they want to keep session going
      if (now - lastActiveMoment > NO_NEW_COMMAND_LIMIT && !showKeepAlivePrompt) {
        dispatch({type: PROMPT_KEEP_ALIVE});
      }
    }, KEEP_ALIVE_PING_INTERVAL);
    dispatch({type: SET_KEEP_ALIVE_INTERVAL, keepAliveInterval});
  };
}

/**
 * Get rid of the intervals to keep the session alive
 */
export function killKeepAliveLoop() {
  return (dispatch, getState) => {
    const {keepAliveInterval} = getState().inspector;
    clearInterval(keepAliveInterval);
    dispatch({type: SET_KEEP_ALIVE_INTERVAL, keepAliveInterval: null});
  };
}

/**
 * Reset the new command clock and kill the wait for user timeout
 */
export function keepSessionAlive() {
  return (dispatch, getState) => {
    const {userWaitTimeout} = getState().inspector;
    dispatch({type: HIDE_PROMPT_KEEP_ALIVE});
    dispatch({type: SET_LAST_ACTIVE_MOMENT, lastActiveMoment: +new Date()});
    if (userWaitTimeout) {
      clearTimeout(userWaitTimeout);
      dispatch({type: SET_USER_WAIT_TIMEOUT, userWaitTimeout: null});
    }
  };
}

export function callClientMethod(params) {
  return async (dispatch, getState) => {
    const {driver, appMode, isUsingMjpegMode, isSourceRefreshOn, autoSessionRestart} =
      getState().inspector;
    params.appMode = appMode;
    params.autoSessionRestart = autoSessionRestart;

    // don't retrieve screenshot if we're already using the mjpeg stream
    if (isUsingMjpegMode) {
      params.skipScreenshot = true;
    }

    if (!isSourceRefreshOn) {
      params.skipRefresh = true;
    }

    log.info(`Calling client method with params:`);
    log.info(params);
    try {
      const action = keepSessionAlive();
      action(dispatch, getState);
      const inspectorDriver = InspectorDriver.instance(driver);
      const res = await inspectorDriver.run(params);
      res.elementId = res.id;
      return res;
    } catch (error) {
      log.error(error);
      if (getState().inspector.autoSessionRestart) {
        const restartSes = restartSession(error, params);
        return await restartSes(dispatch, getState);
      }
      showError(error, {methodName: params.methodName, secs: 10});
      dispatch({type: METHOD_CALL_DONE});
      // Callers (see applyClientMethod) destructure this return value - returning undefined
      // here would throw there and silently drop the error this function just reported
      return {};
    }
  };
}

// Simple alternative to callClientMethod, for when we only want to
// run the command without any side-effects
export function executeDriverCommand(params) {
  return async (getState) => {
    const {driver} = getState().inspector;
    params.skipRefresh = true;
    const inspectorDriver = InspectorDriver.instance(driver);
    return await inspectorDriver.run(params);
  };
}

export function setAwaitingMjpegStream(isAwaiting) {
  return (dispatch) => {
    dispatch({type: SET_AWAITING_MJPEG_STREAM, isAwaiting});
  };
}

export function importGestureFiles(fileList) {
  return async (dispatch) => {
    dispatch({type: GESTURE_UPLOAD_REQUESTED});
    const gestures = await readTextFromUploadedFiles(fileList);
    const invalidGestureFiles = [];
    const parsedGestures = [];
    for (const gesture of gestures) {
      const {fileName, content, error} = gesture;
      // Some error occurred while reading the uploaded file
      if (error) {
        invalidGestureFiles.push(fileName);
        continue;
      }
      const gestureJSON = parseAndValidateGestureFileString(content);
      if (!gestureJSON) {
        invalidGestureFiles.push(fileName);
        continue;
      }
      parsedGestures.push(gestureJSON);
    }

    for (const parsedGesture of parsedGestures) {
      await saveGesture(parsedGesture)(dispatch);
    }
    dispatch({type: GESTURE_UPLOAD_DONE});

    if (!isEmpty(invalidGestureFiles)) {
      notification.error({
        title: i18n.t('unableToImportGestureFiles', {fileNames: invalidGestureFiles.join(', ')}),
        duration: 0,
      });
    }
  };
}

export function exportSavedGesture(gestureJSON) {
  return async () => {
    const cleanedName = `gesture-${gestureJSON.name}`;
    const gestureToExport = omit(gestureJSON, ['id', 'date']);
    const href = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(gestureToExport, null, 2),
    )}`;
    const escapedName = sanitize(cleanedName, {replacement: '_'});
    const fileName = `${escapedName}.json`;
    downloadFile(href, fileName);
  };
}

export function saveGesture(gesture) {
  return async (dispatch) => {
    const savedGestures = (await getSetting(SET_SAVED_GESTURES)) || [];

    if (gesture.id) {
      // Editing an already saved gesture
      for (const savedGesture of savedGestures) {
        if (savedGesture.id === gesture.id) {
          savedGesture.name = gesture.name;
          savedGesture.description = gesture.description;
          savedGesture.actions = gesture.actions;
        }
      }
    } else {
      // Adding a new gesture
      gesture.id = getRandomId();
      gesture.date = Date.now();
      savedGestures.push(gesture);
    }

    await setSetting(SET_SAVED_GESTURES, savedGestures);
    const action = getSavedGestures();
    await action(dispatch);
  };
}

export function getSavedGestures() {
  return async (dispatch) => {
    dispatch({type: GET_SAVED_GESTURES_REQUESTED});
    const savedGestures = await getSetting(SET_SAVED_GESTURES);
    dispatch({type: GET_SAVED_GESTURES_DONE, savedGestures});
  };
}

export function deleteSavedGesture(id) {
  return async (dispatch) => {
    dispatch({type: DELETE_SAVED_GESTURES_REQUESTED, deleteGesture: id});
    const gestures = await getSetting(SET_SAVED_GESTURES);
    const newGestures = gestures.filter((gesture) => gesture.id !== id);
    await setSetting(SET_SAVED_GESTURES, newGestures);
    dispatch({type: DELETE_SAVED_GESTURES_DONE});
    dispatch({type: GET_SAVED_GESTURES_DONE, savedGestures: newGestures});
  };
}

export function showGestureEditor() {
  return (dispatch) => {
    dispatch({type: SHOW_GESTURE_EDITOR});
    dispatch({type: SET_SCREENSHOT_INTERACTION_MODE, screenshotInteractionMode: 'gesture'});
  };
}

export function hideGestureEditor() {
  return (dispatch) => {
    dispatch({type: HIDE_GESTURE_EDITOR});
    dispatch({type: SET_SCREENSHOT_INTERACTION_MODE, screenshotInteractionMode: 'select'});
  };
}

export function setLoadedGesture(loadedGesture) {
  return (dispatch) => {
    dispatch({type: SET_LOADED_GESTURE, loadedGesture});
  };
}

export function removeLoadedGesture() {
  return (dispatch) => {
    dispatch({type: REMOVE_LOADED_GESTURE});
  };
}

export function displayGesture(showGesture) {
  return (dispatch) => {
    dispatch({type: SHOW_GESTURE_ACTION, showGesture});
  };
}

export function removeGestureDisplay() {
  return (dispatch) => {
    dispatch({type: HIDE_GESTURE_ACTION});
  };
}

export function selectTick(tick) {
  return (dispatch, getState) => {
    const {tickCoordinates} = getState().inspector;

    if (tickCoordinates) {
      dispatch({type: SET_GESTURE_TAP_COORDS_MODE, x: undefined, y: undefined});
    }

    dispatch({type: SELECT_TICK_ELEMENT, selectedTick: tick});
  };
}

export function unselectTick() {
  return (dispatch) => {
    dispatch({type: CLEAR_TAP_COORDINATES});
    dispatch({type: UNSELECT_TICK_ELEMENT});
  };
}

export function tapTickCoordinates(x, y) {
  return (dispatch) => {
    dispatch({type: SET_GESTURE_TAP_COORDS_MODE, x, y});
  };
}

export function toggleShowAttributes() {
  return (dispatch) => {
    dispatch({type: TOGGLE_SHOW_ATTRIBUTES});
  };
}

export function toggleAutoSessionRestart() {
  return (dispatch, getState) => {
    const autoSessionRestart = !getState().inspector.autoSessionRestart;
    dispatch({type: SET_AUTO_SESSION_RESTART, autoSessionRestart});
  };
}

/**
 * Taps the widget at the given point of a Flutter driver session, using 'appium_handler.dart's
 * 'tap' performActions handling - the disambiguation-aware counterpart to 'tapAtCoordinates'
 * (which always hit-tests the coordinate itself). Same local pre-check and rationale as
 * 'verifyElementExistsAtCoordinates' for avoiding appium_handler.dart's non-null assertion crash
 * on an empty hit-test, and the same 'elementId' disambiguation escape hatch.
 *
 * If recording, the resolved locator is attached to the just-recorded action (see
 * 'RECORD_FLUTTER_FINDER'), same as 'tapAtCoordinates'.
 *
 * @param {string} [elementId] see 'verifyElementExistsAtCoordinates'
 */
export function tapElementAtCoordinates(x, y, elementId) {
  return async (dispatch, getState) => {
    const {sourceJSON, isRecording} = getState().inspector;
    if (!elementId && !findElementAtPoint(sourceJSON, x, y)) {
      notification.error({title: i18n.t('noElementFoundAtPosition')});
      return;
    }

    const {POINTER_NAME, DURATION_1} = DEFAULT_TAP;
    const tapAction = applyClientMethod({
      methodName: SCREENSHOT_INTERACTION_MODE.TAP,
      args: [
        {
          [POINTER_NAME]: [
            {type: POINTER_TYPES.POINTER_MOVE, duration: DURATION_1, x, y},
            {type: SCREENSHOT_INTERACTION_MODE.TAP, elementId},
          ],
        },
      ],
    });
    const commandRes = await tapAction(dispatch, getState);
    const flutterFinder = parseFlutterFinderFromResponse(commandRes);

    if (!flutterFinder) {
      notification.error({title: i18n.t('couldNotResolveElementLocator')});
      return;
    }

    if (isRecording) {
      dispatch({type: RECORD_FLUTTER_FINDER, flutterFinder});
    }
  };
}

/**
 * Checks (read-only, no interaction with the app) whether a widget exists at the given point of
 * a Flutter driver session, using 'appium_handler.dart's 'checkExistence' performActions
 * handling - same finder-resolution mechanism as a tap, but without actually tapping.
 *
 * A local bounds hit-test (see 'findElementAtPoint') is checked first, to avoid sending a check
 * for a point appium_handler.dart has no widget for at all - as of this writing, its Dart-side
 * handling of that case is a non-null assertion on the hit-test result, which throws (crashing
 * the check, though not the app-under-test) rather than reporting "not found". Skipped when
 * 'elementId' is given, since that means a specific element was already picked (see
 * 'Screenshot.jsx's disambiguation submenu, for when more than one element's bounds contain the
 * clicked point) rather than left to be hit-tested from the coordinate.
 *
 * @param {boolean} shouldExist whether the generated assertion should expect the widget found at
 * (x, y) right now to still be present ('findsOneWidget'), or absent ('findsNothing'), when the
 * generated test runs
 * @param {string} [elementId] page-source id of a specific element to target, when the point has
 * more than one candidate and the user picked one - see 'appium_handler.dart#_performActions',
 * which uses this instead of hit-testing (x, y) when present
 */
export function verifyElementExistsAtCoordinates(x, y, shouldExist, elementId) {
  return async (dispatch, getState) => {
    const {sourceJSON, isRecording} = getState().inspector;
    if (!elementId && !findElementAtPoint(sourceJSON, x, y)) {
      notification.error({title: i18n.t('noElementFoundAtPosition')});
      return;
    }

    const {POINTER_NAME, DURATION_1} = DEFAULT_TAP;
    const checkAction = applyClientMethod({
      methodName: SCREENSHOT_INTERACTION_MODE.CHECK_EXISTENCE,
      args: [
        {
          [POINTER_NAME]: [
            {type: POINTER_TYPES.POINTER_MOVE, duration: DURATION_1, x, y},
            {type: SCREENSHOT_INTERACTION_MODE.CHECK_EXISTENCE, text: '', elementId},
          ],
        },
      ],
    });
    const commandRes = await checkAction(dispatch, getState);
    const flutterFinder = parseFlutterFinderFromResponse(commandRes);

    if (!flutterFinder) {
      notification.error({title: i18n.t('couldNotResolveElementLocator')});
      return;
    }

    notification.success({
      title: i18n.t('existenceCheckFoundElement', flutterFinder),
    });

    if (isRecording) {
      dispatch({type: RECORD_FLUTTER_FINDER, flutterFinder: {...flutterFinder, shouldExist}});
    }
  };
}

/**
 * Enters text into the widget at the given point of a Flutter driver session, using
 * 'appium_handler.dart's 'enterText' performActions handling - same finder-resolution mechanism
 * as a tap/existence check. Same local pre-check and rationale as 'verifyElementExistsAtCoordinates'
 * for avoiding appium_handler.dart's non-null assertion crash on an empty hit-test, and the same
 * 'elementId' disambiguation escape hatch.
 *
 * If recording, the resolved locator is attached to the just-recorded action (see
 * 'RECORD_FLUTTER_FINDER'), so Flutter-aware code generators (see 'lib/client-frameworks/dart-*.js')
 * can emit a widget-based 'tester.enterText(...)'/'$(...).enterText(...)' call.
 *
 * @param {string} [elementId] see 'verifyElementExistsAtCoordinates'
 */
export function enterTextAtCoordinates(x, y, text, elementId) {
  return async (dispatch, getState) => {
    const {sourceJSON, isRecording} = getState().inspector;
    if (!elementId && !findElementAtPoint(sourceJSON, x, y)) {
      notification.error({title: i18n.t('noElementFoundAtPosition')});
      return;
    }

    const {POINTER_NAME, DURATION_1} = DEFAULT_TAP;
    const enterTextAction = applyClientMethod({
      methodName: SCREENSHOT_INTERACTION_MODE.ENTER_TEXT,
      args: [
        {
          [POINTER_NAME]: [
            {type: POINTER_TYPES.POINTER_MOVE, duration: DURATION_1, x, y},
            {type: SCREENSHOT_INTERACTION_MODE.ENTER_TEXT, text, elementId},
          ],
        },
      ],
    });
    const commandRes = await enterTextAction(dispatch, getState);
    const flutterFinder = parseFlutterFinderFromResponse(commandRes);

    if (!flutterFinder) {
      notification.error({title: i18n.t('couldNotResolveElementLocator')});
      return;
    }

    if (isRecording) {
      dispatch({type: RECORD_FLUTTER_FINDER, flutterFinder});
    }
  };
}

/**
 * Checks (read-only) whether the widget at the given point of a Flutter driver session currently
 * displays exactly 'expectedText', using 'appium_handler.dart's 'checkText' performActions
 * handling. Same local pre-check and rationale as 'verifyElementExistsAtCoordinates' for avoiding
 * appium_handler.dart's non-null assertion crash on an empty hit-test.
 *
 * Unlike a tap/existence check, the resolved locator isn't used as-is: appium_handler.dart
 * doesn't actually compare the widget's text against 'expectedText' server-side (as of this
 * writing, its 'checkText'/'checkExistence' handling is identical - only the returned widget's
 * own 'text' differs, which is used here for live pass/fail feedback while recording). So instead
 * of the auto-resolved 'foundBy'/'value' (which could be tooltip/semanticsLabel/key/type instead
 * of text), a 'byText' locator for 'expectedText' itself is recorded - the same widget-existence
 * mechanism as 'verifyElementExistsAtCoordinates', but always by exact text content. When the
 * *generated* test runs, this correctly passes only if the widget then displays 'expectedText'.
 *
 * @param {string} [elementId] see 'verifyElementExistsAtCoordinates'
 */
export function checkTextAtCoordinates(x, y, expectedText, elementId) {
  return async (dispatch, getState) => {
    const {sourceJSON, isRecording} = getState().inspector;
    if (!elementId && !findElementAtPoint(sourceJSON, x, y)) {
      notification.error({title: i18n.t('noElementFoundAtPosition')});
      return;
    }

    const {POINTER_NAME, DURATION_1} = DEFAULT_TAP;
    const checkTextAction = applyClientMethod({
      methodName: SCREENSHOT_INTERACTION_MODE.CHECK_TEXT,
      args: [
        {
          [POINTER_NAME]: [
            {type: POINTER_TYPES.POINTER_MOVE, duration: DURATION_1, x, y},
            {type: SCREENSHOT_INTERACTION_MODE.CHECK_TEXT, text: expectedText, elementId},
          ],
        },
      ],
    });
    const commandRes = await checkTextAction(dispatch, getState);
    const resolved = parseFlutterFinderFromResponse(commandRes);

    if (!resolved) {
      notification.error({title: i18n.t('couldNotResolveElementLocator')});
      return;
    }

    if (resolved.text === expectedText) {
      notification.success({title: i18n.t('checkTextMatched', {actualText: resolved.text})});
    } else {
      notification.warning({
        title: i18n.t('checkTextDidNotMatch', {actualText: resolved.text, expectedText}),
      });
    }

    if (isRecording) {
      dispatch({
        type: RECORD_FLUTTER_FINDER,
        flutterFinder: {foundBy: 'byText', value: expectedText, shouldExist: true},
      });
    }
  };
}

/**
 * Sends a coordinate-based tap ('performActions' with a pointerMove/Down/Pause/Up sequence),
 * without attempting to resolve which element it landed on beforehand.
 */
function tapRawCoordinates(x, y) {
  return async (dispatch, getState) => {
    const {POINTER_NAME, DURATION_1, DURATION_2, BUTTON} = DEFAULT_TAP;
    const {POINTER_UP, POINTER_DOWN, PAUSE, POINTER_MOVE} = POINTER_TYPES;
    const tapAction = applyClientMethod({
      methodName: SCREENSHOT_INTERACTION_MODE.TAP,
      args: [
        {
          [POINTER_NAME]: [
            {type: POINTER_MOVE, duration: DURATION_1, x, y},
            {type: POINTER_DOWN, button: BUTTON},
            {type: PAUSE, duration: DURATION_2},
            {type: POINTER_UP, button: BUTTON},
          ],
        },
      ],
    });
    return await tapAction(dispatch, getState);
  };
}

/**
 * Taps at the given coordinates against a Flutter driver session. The Dart-side handler (see the
 * 'appium-handler' Flutter package) resolves the widget under the point itself as part of
 * handling the tap, and returns which locator it used ('foundBy'/'value', following the
 * ByTooltipMessage/BySemanticsLabel/ByValueKey/ByText/ByType priority order used by
 * 'appium_handler.dart#_execCommandWithFinder'). That locator is attached to the just-recorded
 * action so Flutter-aware code generators (see 'lib/client-frameworks/dart-*.js') can emit a
 * widget-based 'find.byXxx(...)' expression instead of raw coordinates.
 */
function tapFlutterWidgetAtCoordinates(x, y) {
  return async (dispatch, getState) => {
    const wasRecording = getState().inspector.isRecording;
    const commandRes = await tapRawCoordinates(x, y)(dispatch, getState);

    if (wasRecording) {
      const flutterFinder = parseFlutterFinderFromResponse(commandRes);
      if (flutterFinder) {
        dispatch({type: RECORD_FLUTTER_FINDER, flutterFinder});
      }
    }

    return commandRes;
  };
}

/**
 * Parses the '{text, elementId, type, foundBy, value, submitted}' JSON that
 * 'appium_handler.dart's 'performActions' handler returns after resolving a tap, existence
 * check, enterText or checkText, out of the raw driver response for the 'performActions'
 * command. 'text' is the resolved widget's own current text content (used by
 * 'checkTextAtCoordinates' to compare against the expected value; ignored by
 * tap/checkExistence/enterText). 'submitted' is only ever true for a successful 'enterText' -
 * appium_handler.dart also sends a 'TextInputAction.done' after entering the text (see
 * '_submitTextEntry' there), and this flag says whether that step is needed in generated code
 * too, for the field's 'onSubmitted'/'onFieldSubmitted' to fire the same way it did live.
 *
 * @returns {{foundBy: string, value: string, text: string, submitted: boolean}|null} null if the
 * response wasn't in the expected shape (e.g. not a Flutter session using this driver/handler
 * pairing, or no widget was resolved)
 */
function parseFlutterFinderFromResponse(commandRes) {
  try {
    const {foundBy, value, text, submitted} = JSON.parse(commandRes.response.message);
    return foundBy && value ? {foundBy, value, text, submitted} : null;
  } catch {
    return null;
  }
}

function parseAndValidateGestureFileString(gestureFileString) {
  const gestureJSON = parseGestureFileContents(gestureFileString);
  if (gestureJSON === null) {
    return null;
  }
  return omit(gestureJSON, ['id', 'date']);
}
