import {Dropdown, Input, Modal, Spin} from 'antd';
import {Fragment, useRef, useState} from 'react';
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
    verifyElementExistsAtCoordinates,
    enterTextAtCoordinates,
    checkTextAtCoordinates,
  } = props;
  const {t} = useTranslation();

  const [x, setX] = useState();
  const [y, setY] = useState();
  const [hoveredElement, setHoveredElement] = useState();
  const [enterTextModalOpen, setEnterTextModalOpen] = useState(false);
  const [enterTextValue, setEnterTextValue] = useState('');
  const [checkTextModalOpen, setCheckTextModalOpen] = useState(false);
  const [checkTextValue, setCheckTextValue] = useState('');
  // The live 'x'/'y' hover state gets reset to null by handleScreenshotLeave as soon as the mouse
  // leaves the screenshot - which happens the instant the context menu's dropdown overlay appears
  // (the browser re-targets the pointer to the topmost element, not just when a later modal's OK
  // button is clicked), well before any menu item can be clicked. So the context menu can't rely
  // on 'x'/'y' at all - handleScreenshotContextMenu captures the position straight from the
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

  const handleScreenshotContextMenu = (e) => {
    const point = {
      x: Math.round(e.nativeEvent.offsetX * scaleRatio),
      y: Math.round(e.nativeEvent.offsetY * scaleRatio),
    };
    rightClickCoordsRef.current = point;
    selectedElementIdRef.current = undefined;
    setRightClickCandidates(findAllElementsAtPoint(sourceJSON, point.x, point.y));
  };

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

  // The right-click menu (Flutter driver sessions only) is only meaningful while tracking a
  // tap/swipe coordinate, since its actions rely on rightClickCoordsRef being populated by
  // handleScreenshotContextMenu below
  const canUseFlutterContextMenu =
    automationName === DRIVERS.FLUTTER && screenshotInteractionMode === TAP_SWIPE;

  // The four context menu actions, targeting a specific element (by page-source id) when more
  // than one candidate matched the clicked point - see buildFlutterContextMenuItems below.
  // 'keyPrefix' keeps antd Menu item keys unique when this is called once per candidate.
  const buildActionItems = (elementId, keyPrefix = '') => [
    {
      key: `${keyPrefix}verifyElementExists`,
      label: t('verifyElementExists'),
      onClick: () => {
        const {x: cx, y: cy} = rightClickCoordsRef.current ?? {};
        verifyElementExistsAtCoordinates(cx, cy, true, elementId);
      },
    },
    {
      key: `${keyPrefix}verifyElementDoesNotExist`,
      label: t('verifyElementDoesNotExist'),
      onClick: () => {
        const {x: cx, y: cy} = rightClickCoordsRef.current ?? {};
        verifyElementExistsAtCoordinates(cx, cy, false, elementId);
      },
    },
    {
      key: `${keyPrefix}enterText`,
      label: t('enterTextMenuItem'),
      onClick: () => {
        selectedElementIdRef.current = elementId;
        setEnterTextModalOpen(true);
      },
    },
    {
      key: `${keyPrefix}checkText`,
      label: t('checkTextMenuItem'),
      onClick: () => {
        selectedElementIdRef.current = elementId;
        setCheckTextModalOpen(true);
      },
    },
  ];

  // With 0 or 1 candidates, there's nothing to disambiguate - same flat menu as always, and
  // appium_handler.dart hit-tests the coordinate itself (elementId undefined) exactly like
  // before this feature existed. With more than one, each candidate becomes its own submenu of
  // the same four actions, so the user can pick which overlapping widget they meant.
  const flutterContextMenu = {
    items:
      rightClickCandidates.length > 1
        ? rightClickCandidates.map((element, index) => ({
            key: `element-${index}`,
            label: getElementDisplayName(element),
            children: buildActionItems(element.attributes?.id, `element-${index}-`),
          }))
        : buildActionItems(rightClickCandidates[0]?.attributes?.id),
  };

  // Show the screenshot and highlighter rects.
  // Show loading indicator if a method call is in progress, unless using MJPEG mode.
  return (
    <Spin size="large" spinning={!!methodCallInProgress && !isUsingMjpegMode}>
      <div className={styles.innerScreenshotContainer}>
        <Dropdown
          menu={flutterContextMenu}
          trigger={['contextMenu']}
          disabled={!canUseFlutterContextMenu}
        >
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
                  <p>
                    {t('elementAtCoordinates', {element: getElementDisplayName(hoveredElement)})}
                  </p>
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
        </Dropdown>
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
