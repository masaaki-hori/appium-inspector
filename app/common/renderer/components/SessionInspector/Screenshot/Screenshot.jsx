import {Dropdown, Input, Modal, Spin} from 'antd';
import {Fragment, useState} from 'react';
import {useTranslation} from 'react-i18next';

import {DRIVERS} from '../../../constants/common.js';
import {GESTURE_ITEM_STYLES, POINTER_TYPES} from '../../../constants/gestures.js';
import {DEFAULT_SWIPE, SCREENSHOT_INTERACTION_MODE} from '../../../constants/screenshot.js';
import {INSPECTOR_TABS} from '../../../constants/session-inspector.js';
import {findElementAtPoint, getElementDisplayName} from '../../../utils/element-hit-testing.js';
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

  const handleEnterTextOk = async () => {
    setEnterTextModalOpen(false);
    await enterTextAtCoordinates(x, y, enterTextValue);
    setEnterTextValue('');
  };

  const handleCheckTextOk = async () => {
    setCheckTextModalOpen(false);
    await checkTextAtCoordinates(x, y, checkTextValue);
    setCheckTextValue('');
  };

  const handleScreenshotClick = async () => {
    const {tapTickCoordinates} = props;
    if (selectedTick) {
      await tapTickCoordinates(x, y);
    }
  };

  const handleScreenshotDown = async () => {
    const {setCoordStart} = props;
    if (screenshotInteractionMode === TAP_SWIPE) {
      await setCoordStart(x, y);
    }
  };

  const handleScreenshotUp = async () => {
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
  // tap/swipe coordinate, since its actions rely on the same 'x'/'y' state
  const canUseFlutterContextMenu =
    automationName === DRIVERS.FLUTTER && screenshotInteractionMode === TAP_SWIPE;
  const flutterContextMenu = {
    items: [
      {
        key: 'verifyElementExists',
        label: t('verifyElementExists'),
        onClick: () => verifyElementExistsAtCoordinates(x, y, true),
      },
      {
        key: 'verifyElementDoesNotExist',
        label: t('verifyElementDoesNotExist'),
        onClick: () => verifyElementExistsAtCoordinates(x, y, false),
      },
      {
        key: 'enterText',
        label: t('enterTextMenuItem'),
        onClick: () => setEnterTextModalOpen(true),
      },
      {
        key: 'checkText',
        label: t('checkTextMenuItem'),
        onClick: () => setCheckTextModalOpen(true),
      },
    ],
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
