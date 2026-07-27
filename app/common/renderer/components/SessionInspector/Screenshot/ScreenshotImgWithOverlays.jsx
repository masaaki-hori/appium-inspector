import {Input, Modal, Spin} from 'antd';
import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';

import {DRIVERS} from '../../../constants/common.js';
import {POINTER_TYPES} from '../../../constants/gestures.js';
import {DEFAULT_SWIPE, SCREENSHOT_INTERACTION_MODE} from '../../../constants/screenshot.js';
import {INSPECTOR_TABS} from '../../../constants/session-inspector.js';
import {findAllElementsAtPoint, getElementDisplayName} from '../../../utils/element-hit-testing.js';
import CoordinatesContainer from './Overlays/CoordinatesContainer.jsx';
import ElementOverlays from './Overlays/ElementOverlays.jsx';
import GestureTrail from './Overlays/GestureTrail.jsx';
import TapSwipeTrail from './Overlays/TapSwipeTrail.jsx';
import styles from './Screenshot.module.css';

const {POINTER_UP, POINTER_DOWN, POINTER_MOVE} = POINTER_TYPES;
const {SELECT, SWIPE, TAP_SWIPE} = SCREENSHOT_INTERACTION_MODE;

const handleSwipeOnScreenshot = async (swipeStartPoint, swipeEndPoint, applyClientMethod) => {
  const {POINTER_NAME, DURATION_1, DURATION_2, BUTTON, ORIGIN} = DEFAULT_SWIPE;
  await applyClientMethod({
    methodName: SWIPE,
    args: {
      [POINTER_NAME]: [
        {type: POINTER_MOVE, duration: DURATION_1, x: swipeStartPoint.x, y: swipeStartPoint.y},
        {type: POINTER_DOWN, button: BUTTON},
        {
          type: POINTER_MOVE,
          duration: DURATION_2,
          origin: ORIGIN,
          x: swipeEndPoint.x,
          y: swipeEndPoint.y,
        },
        {type: POINTER_UP, button: BUTTON},
      ],
    },
  });
};

/**
 * Shows the app screenshot along with various overlay elements,
 * such as divs that highlight the elements' bounding boxes
 */
const ScreenshotImgWithOverlays = (props) => {
  const {
    screenshot,
    serverDetails,
    isUsingMjpegMode,
    methodCallInProgress,
    screenshotInteractionMode,
    coordStart,
    coordEnd,
    clearCoordAction,
    scaleRatio,
    selectedTick,
    tapTickCoordinates,
    setCoordStart,
    setCoordEnd,
    showGesture,
    selectedInspectorTab,
    applyClientMethod,
    sourceJSON,
    automationName,
    tapAtCoordinates,
    tapElementAtCoordinates,
    verifyElementExistsAtCoordinates,
    enterTextAtCoordinates,
    checkTextAtCoordinates,
    onContextMenuActiveChange,
  } = props;

  const {t} = useTranslation();

  const [x, setX] = useState();
  const [y, setY] = useState();

  // Deliberately a hand-rolled menu, not antd's Dropdown/Menu: that implementation kept getting
  // closed out from under the user by antd/rc-trigger's own internal close-on-layout-change
  // behavior (window resize, ancestor scroll/reflow, etc. - all of which the periodic auto-refresh
  // can trigger indirectly), including a state where the root menu closed but a nested submenu
  // portal was orphaned on screen. Owning open/close/positioning outright removes that whole class
  // of bug, at the cost of losing antd's automatic viewport-overflow handling (handled minimally
  // below instead).
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({x: 0, y: 0});
  // Which candidate's submenu (of the 5 actions) is currently expanded - only meaningful when
  // rightClickCandidates.length > 1, i.e. there's something to disambiguate. null otherwise.
  const [expandedCandidateIndex, setExpandedCandidateIndex] = useState(null);
  // The submenu is positioned independently (via 'fixed', computed from the hovered row's own
  // bounding rect) rather than CSS-anchored ('absolute; left: 100%') to its candidate <li> - it
  // needs to render outside the root menu's scrollable list (see contextMenu's overflow-y in
  // Screenshot.module.css) since setting overflow-y to anything but 'visible' makes overflow-x
  // compute to 'auto' too (clipping), which was hiding the submenu whenever it CSS-overflowed the
  // scrollable container instead of the viewport.
  const [submenuPos, setSubmenuPos] = useState({x: 0, y: 0});
  const submenuRef = useRef(null);
  const contextMenuRef = useRef(null);
  const [enterTextModalOpen, setEnterTextModalOpen] = useState(false);
  const [enterTextValue, setEnterTextValue] = useState('');
  const [checkTextModalOpen, setCheckTextModalOpen] = useState(false);
  const [checkTextValue, setCheckTextValue] = useState('');
  // Tell <SessionInspector> whenever the right-click menu (or a modal opened from it) is up, so
  // it can skip the periodic auto-refresh tick entirely while the user is interacting with it -
  // belt-and-braces alongside owning the menu outright above, so a refresh can never land (and
  // reflow the page) mid-interaction in the first place.
  useEffect(() => {
    onContextMenuActiveChange?.(contextMenuOpen || enterTextModalOpen || checkTextModalOpen);
  }, [contextMenuOpen, enterTextModalOpen, checkTextModalOpen, onContextMenuActiveChange]);
  // handleScreenshotContextMenu captures the right-click position straight from the event itself
  // into this ref (rather than relying on the live x/y hover state, which the browser resets the
  // instant the context menu overlay appears), which every context menu action reads instead.
  const rightClickCoordsRef = useRef(null);
  // Which specific element (by page-source id) a context menu action should target, when more
  // than one element's bounds contained the right-clicked point and the user picked one from the
  // disambiguation submenu built from rightClickCandidates below - undefined otherwise, meaning
  // "let appium_handler.dart hit-test the coordinate itself" (the single-candidate behavior).
  // Enter Text/Check Text need this remembered separately from the click that set it, since their
  // actual action only fires later, when the modal's OK button is clicked.
  const selectedElementIdRef = useRef(undefined);
  // Every element whose bounds contain the right-clicked point, most specific first - see
  // findAllElementsAtPoint. Needs to be state (not just a ref like the two above) because it
  // drives what the context menu itself renders, not just what a later action call uses.
  const [rightClickCandidates, setRightClickCandidates] = useState([]);

  // The right-click menu (Flutter driver sessions only) is only meaningful while tracking a
  // tap/swipe coordinate, since its actions rely on rightClickCoordsRef being populated by
  // handleScreenshotContextMenu below
  const canUseFlutterContextMenu =
    automationName === DRIVERS.FLUTTER && screenshotInteractionMode === TAP_SWIPE;

  const handleScreenshotContextMenu = (e) => {
    if (!canUseFlutterContextMenu) {
      // Let the browser's native context menu show, same as before this feature existed
      return;
    }
    e.preventDefault();
    const point = {
      x: Math.round(e.nativeEvent.offsetX * scaleRatio),
      y: Math.round(e.nativeEvent.offsetY * scaleRatio),
    };
    rightClickCoordsRef.current = point;
    selectedElementIdRef.current = undefined;
    setRightClickCandidates(findAllElementsAtPoint(sourceJSON, point.x, point.y));
    setExpandedCandidateIndex(null);
    setContextMenuPos({x: e.clientX, y: e.clientY});
    setContextMenuOpen(true);
  };

  // Close on any click outside the menu, or on Escape - the menu's own item clicks close it
  // themselves (see runContextMenuAction) before this would even run.
  useEffect(() => {
    if (!contextMenuOpen) {
      return;
    }
    const handlePointerDown = (e) => {
      // The submenu renders as a sibling of contextMenuRef's own element (not nested inside it -
      // see submenuPos's declaration for why), so it needs its own inclusion check here too.
      if (!contextMenuRef.current?.contains(e.target) && !submenuRef.current?.contains(e.target)) {
        setContextMenuOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setContextMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [contextMenuOpen]);

  // Keep the menu fully within the viewport - antd's Dropdown did this automatically
  // (autoAdjustOverflow); replicate the common case now that positioning is manual.
  useLayoutEffect(() => {
    if (!contextMenuOpen || !contextMenuRef.current) {
      return;
    }
    const rect = contextMenuRef.current.getBoundingClientRect();
    const overflowX = rect.right - window.innerWidth;
    const overflowY = rect.bottom - window.innerHeight;
    if (overflowX > 0 || overflowY > 0) {
      setContextMenuPos((pos) => ({
        x: overflowX > 0 ? Math.max(0, pos.x - overflowX) : pos.x,
        y: overflowY > 0 ? Math.max(0, pos.y - overflowY) : pos.y,
      }));
    }
    // Only re-run when the menu just opened or its content changed shape (candidate count) -
    // not on every contextMenuPos update, which this effect itself may cause
  }, [contextMenuOpen, rightClickCandidates.length]);

  const handleCandidateMouseEnter = (index, e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setSubmenuPos({x: rect.right, y: rect.top});
    setExpandedCandidateIndex(index);
  };

  // Same rationale as the root menu's clamp above - keep the submenu within the viewport too,
  // since it's no longer CSS-anchored to its candidate row (see submenuPos's declaration).
  useLayoutEffect(() => {
    if (expandedCandidateIndex === null || !submenuRef.current) {
      return;
    }
    const rect = submenuRef.current.getBoundingClientRect();
    const overflowX = rect.right - window.innerWidth;
    const overflowY = rect.bottom - window.innerHeight;
    if (overflowX > 0 || overflowY > 0) {
      setSubmenuPos((pos) => ({
        x: overflowX > 0 ? Math.max(0, pos.x - overflowX) : pos.x,
        y: overflowY > 0 ? Math.max(0, pos.y - overflowY) : pos.y,
      }));
    }
    // Only re-run when the submenu just opened for a (possibly different) candidate - not on
    // every submenuPos update, which this effect itself may cause
  }, [expandedCandidateIndex]);

  // The context menu actions, common to the flat (0-1 candidate) and per-candidate
  // (>1 candidates) menu shapes below.
  const contextMenuActions = [
    {key: 'tap', label: t('tapMenuItem')},
    {key: 'verifyElementExists', label: t('verifyElementExists')},
    {key: 'verifyElementDoesNotExist', label: t('verifyElementDoesNotExist')},
    {key: 'enterText', label: t('enterTextMenuItem')},
    {key: 'checkText', label: t('checkTextMenuItem')},
  ];

  const runContextMenuAction = useCallback(
    (actionKey, elementId) => {
      setContextMenuOpen(false);
      const {x: cx, y: cy} = rightClickCoordsRef.current ?? {};
      switch (actionKey) {
        case 'tap':
          tapElementAtCoordinates(cx, cy, elementId);
          break;
        case 'verifyElementExists':
          verifyElementExistsAtCoordinates(cx, cy, true, elementId);
          break;
        case 'verifyElementDoesNotExist':
          verifyElementExistsAtCoordinates(cx, cy, false, elementId);
          break;
        case 'enterText':
          selectedElementIdRef.current = elementId;
          setEnterTextModalOpen(true);
          break;
        case 'checkText':
          selectedElementIdRef.current = elementId;
          setCheckTextModalOpen(true);
          break;
        default:
          break;
      }
    },
    [tapElementAtCoordinates, verifyElementExistsAtCoordinates],
  );

  const handleEnterTextOk = async () => {
    setEnterTextModalOpen(false);
    const {x: tx, y: ty} = rightClickCoordsRef.current ?? {};
    await enterTextAtCoordinates(tx, ty, enterTextValue, selectedElementIdRef.current);
    setEnterTextValue('');
  };

  const handleCheckTextOk = async () => {
    setCheckTextModalOpen(false);
    const {x: tx, y: ty} = rightClickCoordsRef.current ?? {};
    await checkTextAtCoordinates(tx, ty, checkTextValue, selectedElementIdRef.current);
    setCheckTextValue('');
  };

  // Used when creating a gesture and clicking on screenshot to set move coordinates
  const handleScreenshotClick = async () => {
    if (selectedTick) {
      await tapTickCoordinates(x, y);
    }
  };

  // Used during screenshot Coordinates Mode
  const handleScreenshotDown = async (e) => {
    // Only the primary (left) button starts a tap/swipe - a right-click is handled entirely by
    // the context menu above, and shouldn't also register as the start of a tap/swipe gesture
    if (e.button !== 0) {
      return;
    }
    if (screenshotInteractionMode === TAP_SWIPE) {
      await setCoordStart(x, y);
    }
  };

  // Used during screenshot Coordinates Mode
  const handleScreenshotUp = async (e) => {
    // Same rationale as handleScreenshotDown - without this, releasing the right mouse button
    // after a context-menu click would also perform (and, if recording, record) a tap/swipe at
    // that position
    if (e.button !== 0) {
      return;
    }
    if (screenshotInteractionMode !== TAP_SWIPE || !coordStart) {
      return;
    }
    await setCoordEnd(x, y);
    if (Math.abs(coordStart.x - x) < 5 && Math.abs(coordStart.y - y) < 5) {
      // Resolves to a locator-based tap when possible (see 'tapAtCoordinates') rather than
      // always sending a raw coordinate tap - required for a Flutter session's tap to come back
      // tagged with the widget locator the driver resolved, so the recorder/generated code can
      // refer to it by name instead of by raw x/y
      await tapAtCoordinates(x, y);
    } else {
      await handleSwipeOnScreenshot(coordStart, {x, y}, applyClientMethod);
    }
    await clearCoordAction();
  };

  const handleScreenshotCoordsUpdate = (e) => {
    if (screenshotInteractionMode !== SELECT) {
      const offsetX = e.nativeEvent.offsetX;
      const offsetY = e.nativeEvent.offsetY;
      const newX = offsetX * scaleRatio;
      const newY = offsetY * scaleRatio;
      setX(Math.round(newX));
      setY(Math.round(newY));
    }
  };

  const handleScreenshotLeave = async () => {
    setX(null);
    setY(null);
    await clearCoordAction();
  };

  // If we're tapping or swiping, show the 'crosshair' cursor style
  const screenshotStyle = {};
  if (screenshotInteractionMode === TAP_SWIPE || selectedTick) {
    screenshotStyle.cursor = 'crosshair';
  }

  const screenSrc = isUsingMjpegMode
    ? serverDetails.mjpegScreenshotUrl
    : `data:image/png;base64,${screenshot}`;

  // Show loading indicator if a method call is in progress, unless using MJPEG mode.
  return (
    <Spin size="large" spinning={!!methodCallInProgress && !isUsingMjpegMode}>
      <div className={styles.innerScreenshotContainer}>
        <div
          style={screenshotStyle}
          onMouseDown={handleScreenshotDown}
          onMouseUp={handleScreenshotUp}
          onMouseMove={handleScreenshotCoordsUpdate}
          onMouseOver={handleScreenshotCoordsUpdate}
          onMouseLeave={handleScreenshotLeave}
          onClick={handleScreenshotClick}
          onContextMenu={handleScreenshotContextMenu}
          className={styles.screenshotBox}
        >
          {screenshotInteractionMode !== SELECT && <CoordinatesContainer x={x} y={y} />}
          <img src={screenSrc} id="screenshot" />
          {screenshotInteractionMode === SELECT && <ElementOverlays {...props} />}
          {screenshotInteractionMode === TAP_SWIPE && (
            <TapSwipeTrail
              coordStart={coordStart}
              coordEnd={coordEnd}
              x={x}
              y={y}
              scaleRatio={scaleRatio}
            />
          )}
          {selectedInspectorTab === INSPECTOR_TABS.GESTURES && showGesture && (
            <GestureTrail gesture={showGesture} scaleRatio={scaleRatio} />
          )}
        </div>
        {contextMenuOpen && (
          <div
            ref={contextMenuRef}
            className={styles.contextMenu}
            style={{left: contextMenuPos.x, top: contextMenuPos.y}}
          >
            <ul className={styles.contextMenuList}>
              {rightClickCandidates.length <= 1
                ? contextMenuActions.map((action) => (
                    <li
                      key={action.key}
                      className={styles.contextMenuItem}
                      // False positive below: only reads/writes ref .current from inside this
                      // onClick handler, never during render (see the structurally-equivalent,
                      // unflagged call in the >1-candidate branch below) - a known limitation of
                      // this preview rule with 0/1-length conditional branches.
                      // prettier-ignore
                      // eslint-disable-next-line react-hooks/refs
                      onClick={() => runContextMenuAction(action.key, rightClickCandidates[0]?.attributes?.id)}
                    >
                      {action.label}
                    </li>
                  ))
                : rightClickCandidates.map((element, index) => (
                    <li
                      key={element.attributes?.id ?? index}
                      className={styles.contextMenuItem}
                      onMouseEnter={(e) => handleCandidateMouseEnter(index, e)}
                    >
                      {getElementDisplayName(element)}
                    </li>
                  ))}
            </ul>
          </div>
        )}
        {contextMenuOpen &&
          expandedCandidateIndex !== null &&
          rightClickCandidates[expandedCandidateIndex] && (
            <ul
              ref={submenuRef}
              className={`${styles.contextMenuList} ${styles.contextSubmenuList}`}
              style={{left: submenuPos.x, top: submenuPos.y}}
            >
              {contextMenuActions.map((action) => (
                <li
                  key={action.key}
                  className={styles.contextMenuItem}
                  onClick={() =>
                    runContextMenuAction(
                      action.key,
                      rightClickCandidates[expandedCandidateIndex].attributes?.id,
                    )
                  }
                >
                  {action.label}
                </li>
              ))}
            </ul>
          )}
        <Modal
          title={t('enterTextModalTitle')}
          open={enterTextModalOpen}
          onOk={handleEnterTextOk}
          onCancel={() => setEnterTextModalOpen(false)}
        >
          <Input
            placeholder={t('enterTextInputPlaceholder')}
            value={enterTextValue}
            onChange={(e) => setEnterTextValue(e.target.value)}
            onPressEnter={handleEnterTextOk}
          />
        </Modal>
        <Modal
          title={t('checkTextModalTitle')}
          open={checkTextModalOpen}
          onOk={handleCheckTextOk}
          onCancel={() => setCheckTextModalOpen(false)}
        >
          <Input
            placeholder={t('checkTextInputPlaceholder')}
            value={checkTextValue}
            onChange={(e) => setCheckTextValue(e.target.value)}
            onPressEnter={handleCheckTextOk}
          />
        </Modal>
      </div>
    </Spin>
  );
};

export default ScreenshotImgWithOverlays;
