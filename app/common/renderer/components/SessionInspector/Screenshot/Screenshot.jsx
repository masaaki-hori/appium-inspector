import {Input, Modal, Spin} from 'antd';
import {Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';

import {DRIVERS} from '../../../constants/common.js';
import {GESTURE_ITEM_STYLES, POINTER_TYPES} from '../../../constants/gestures.js';
import {DEFAULT_SWIPE, SCREENSHOT_INTERACTION_MODE} from '../../../constants/screenshot.js';
import {INSPECTOR_TABS} from '../../../constants/session-inspector.js';
import {
  findAllElementsAtPoint,
  findElementAtPoint,
  getElementDisplayName,
} from '../../../utils/element-hit-testing.js';
import inspectorStyles from '../SessionInspector.module.css';
import HighlighterRects from './HighlighterRects.jsx';
import styles from './Screenshot.module.css';

const {POINTER_UP, POINTER_DOWN, PAUSE, POINTER_MOVE} = POINTER_TYPES;
const {SELECT, SWIPE, TAP_SWIPE} = SCREENSHOT_INTERACTION_MODE;

/**
 * Shows screenshot of running application and divs that highlight the elements' bounding boxes
 */
const Screenshot = (props) => {
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
    selectedInspectorTab,
    applyClientMethod,
    sourceJSON,
    tapAtCoordinates,
    automationName,
    tapElementAtCoordinates,
    verifyElementExistsAtCoordinates,
    enterTextAtCoordinates,
    checkTextAtCoordinates,
    onContextMenuActiveChange,
  } = props;
  const {t} = useTranslation();

  const [x, setX] = useState();
  const [y, setY] = useState();
  const [hoveredElement, setHoveredElement] = useState();
  // Deliberately a hand-rolled menu, not antd's Dropdown/Menu: that implementation kept getting
  // closed out from under the user by antd/rc-trigger's own internal close-on-layout-change
  // behavior (window resize, ancestor scroll/reflow, etc. - all of which the periodic auto-refresh
  // can trigger indirectly), including a state where the root menu closed but a nested submenu
  // portal was orphaned on screen. Owning open/close/positioning outright removes that whole class
  // of bug, at the cost of losing antd's automatic viewport-overflow handling (handled minimally
  // below instead).
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({x: 0, y: 0});
  // Which candidate's submenu (of the 4 actions) is currently expanded - only meaningful when
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
  // The live 'x'/'y' hover state gets reset to null by handleScreenshotLeave as soon as the mouse
  // leaves the screenshot - which happens the instant the context menu overlay appears (the
  // browser re-targets the pointer to the topmost element, not just when a later modal's OK button
  // is clicked), well before any menu item can be clicked. So the context menu can't rely on
  // 'x'/'y' at all - handleScreenshotContextMenu captures the position straight from the
  // right-click event itself into this ref, which every context menu action reads instead.
  const rightClickCoordsRef = useRef(null);
  // Which specific element (by page-source id) a context menu action should target, when more
  // than one element's bounds contained the right-clicked point and the user picked one from the
  // disambiguation submenu built from rightClickCandidates below - undefined otherwise, meaning
  // "let appium_handler.dart hit-test the coordinate itself" (the pre-existing, single-candidate
  // behavior). Enter Text/Check Text need this remembered separately from the click that set it,
  // since their actual action only fires later, when the modal's OK button is clicked.
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

  const handleScreenshotClick = async () => {
    const {tapTickCoordinates} = props;
    if (selectedTick) {
      await tapTickCoordinates(x, y);
    }
  };

  const handleScreenshotDown = async (e) => {
    // Only the primary (left) button starts a tap/swipe - a right-click is handled entirely by
    // the context menu below, and shouldn't also register as the start of a tap/swipe gesture
    if (e.button !== 0) {
      return;
    }
    const {setCoordStart} = props;
    if (screenshotInteractionMode === TAP_SWIPE) {
      await setCoordStart(x, y);
    }
  };

  const handleScreenshotUp = async (e) => {
    // Same rationale as handleScreenshotDown - without this, releasing the right mouse button
    // after a context-menu click would also perform (and, if recording, record) a tap/swipe at
    // that position
    if (e.button !== 0) {
      return;
    }
    const {setCoordEnd} = props;
    if (screenshotInteractionMode === TAP_SWIPE) {
      await setCoordEnd(x, y);
      if (Math.abs(coordStart.x - x) < 5 && Math.abs(coordStart.y - y) < 5) {
        // Pass coordEnd because otherwise it is not retrieved.
        // Prefer tapping the element under the point (if any) over raw coordinates,
        // so recorded/generated code refers to an element rather than a pixel location
        await tapAtCoordinates(x, y);
      } else {
        await handleDoSwipe({x, y}); // Pass coordEnd because otherwise it is not retrieved
      }
      await clearCoordAction();
    }
  };

  const handleDoSwipe = async (swipeEndLocal) => {
    const {POINTER_NAME, DURATION_1, DURATION_2, BUTTON, ORIGIN} = DEFAULT_SWIPE;
    await applyClientMethod({
      methodName: SWIPE,
      args: {
        [POINTER_NAME]: [
          {type: POINTER_MOVE, duration: DURATION_1, x: coordStart.x, y: coordStart.y},
          {type: POINTER_DOWN, button: BUTTON},
          {
            type: POINTER_MOVE,
            duration: DURATION_2,
            origin: ORIGIN,
            x: swipeEndLocal.x,
            y: swipeEndLocal.y,
          },
          {type: POINTER_UP, button: BUTTON},
        ],
      },
    });
  };

  const handleScreenshotCoordsUpdate = (e) => {
    if (screenshotInteractionMode !== SELECT) {
      const offsetX = e.nativeEvent.offsetX;
      const offsetY = e.nativeEvent.offsetY;
      const newX = Math.round(offsetX * scaleRatio);
      const newY = Math.round(offsetY * scaleRatio);
      setX(newX);
      setY(newY);
      setHoveredElement(
        screenshotInteractionMode === TAP_SWIPE ? findElementAtPoint(sourceJSON, newX, newY) : null,
      );
    }
  };

  const handleScreenshotLeave = async () => {
    setX(null);
    setY(null);
    setHoveredElement(null);
    await clearCoordAction();
  };

  // retrieve and format gesture for svg drawings
  const getGestureCoordinates = () => {
    const {showGesture} = props;
    const {FILLED, NEW_DASHED, WHOLE, DASHED} = GESTURE_ITEM_STYLES;
    const defaultTypes = {pointerDown: WHOLE, pointerUp: DASHED};

    if (!showGesture) {
      return null;
    }
    return showGesture.map((pointer) => {
      // 'type' is used to keep track of the last pointerup/pointerdown move
      let type = DASHED;
      const temp = [];
      for (const tick of pointer.ticks) {
        if (tick.type === PAUSE) {
          continue;
        }
        const len = temp.length;
        type = tick.type !== POINTER_MOVE ? defaultTypes[tick.type] : type;
        if (tick.type === POINTER_MOVE && tick.x !== undefined && tick.y !== undefined) {
          temp.push({id: tick.id, type, x: tick.x, y: tick.y, color: pointer.color});
        }
        if (len === 0) {
          if (tick.type === POINTER_DOWN) {
            temp.push({id: tick.id, type: FILLED, x: 0, y: 0, color: pointer.color});
          }
        } else {
          if (tick.type === POINTER_DOWN && temp[len - 1].type === DASHED) {
            temp[len - 1].type = FILLED;
          }
          if (tick.type === POINTER_UP && temp[len - 1].type === WHOLE) {
            temp[len - 1].type = NEW_DASHED;
          }
        }
      }
      return temp;
    });
  };

  // If we're tapping or swiping, show the 'crosshair' cursor style
  const screenshotStyle = {};
  if (screenshotInteractionMode === TAP_SWIPE || selectedTick) {
    screenshotStyle.cursor = 'crosshair';
  }

  const screenSrc = isUsingMjpegMode
    ? serverDetails.mjpegScreenshotUrl
    : `data:image/gif;base64,${screenshot}`;
  const points = getGestureCoordinates();

  // Show the screenshot and highlighter rects.
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
          className={inspectorStyles.screenshotBox}
        >
          {screenshotInteractionMode !== SELECT && (
            <div className={styles.coordinatesContainer}>
              {hoveredElement ? (
                <p>{t('elementAtCoordinates', {element: getElementDisplayName(hoveredElement)})}</p>
              ) : (
                <>
                  <p>{t('xCoordinate', {x})}</p>
                  <p>{t('yCoordinate', {y})}</p>
                </>
              )}
            </div>
          )}
          <img src={screenSrc} id="screenshot" />
          {screenshotInteractionMode === SELECT && <HighlighterRects {...props} />}
          {screenshotInteractionMode === TAP_SWIPE && (
            <svg className={styles.swipeSvg}>
              {coordStart && (
                <circle cx={coordStart.x / scaleRatio} cy={coordStart.y / scaleRatio} r={10} />
              )}
              {coordStart && !coordEnd && (
                <line
                  x1={coordStart.x / scaleRatio}
                  y1={coordStart.y / scaleRatio}
                  x2={x / scaleRatio}
                  y2={y / scaleRatio}
                />
              )}
              {coordStart && coordEnd && (
                <line
                  x1={coordStart.x / scaleRatio}
                  y1={coordStart.y / scaleRatio}
                  x2={coordEnd.x / scaleRatio}
                  y2={coordEnd.y / scaleRatio}
                />
              )}
            </svg>
          )}
          {selectedInspectorTab === INSPECTOR_TABS.GESTURES && points && (
            <svg key="gestureSVG" className={styles.gestureSvg}>
              {points.map((pointer) =>
                pointer.map((tick, index) => (
                  <Fragment key={tick.id}>
                    {index > 0 && (
                      <line
                        className={styles[tick.type]}
                        key={`${tick.id}.line`}
                        x1={pointer[index - 1].x / scaleRatio}
                        y1={pointer[index - 1].y / scaleRatio}
                        x2={tick.x / scaleRatio}
                        y2={tick.y / scaleRatio}
                        style={{stroke: tick.color}}
                      />
                    )}
                    <circle
                      className={styles[`${tick.type}Circle`]}
                      key={`${tick.id}.circle`}
                      cx={tick.x / scaleRatio}
                      cy={tick.y / scaleRatio}
                      r={8}
                      style={
                        tick.type === GESTURE_ITEM_STYLES.FILLED
                          ? {fill: tick.color}
                          : {stroke: tick.color}
                      }
                    />
                  </Fragment>
                )),
              )}
            </svg>
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

export default Screenshot;
