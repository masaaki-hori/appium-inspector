import {useCallback, useEffect} from 'react';
import {useNavigate} from 'react-router';

import {WINDOW_DIMENSIONS} from '../../constants/common.js';
import {SCREENSHOT_INTERACTION_MODE} from '../../constants/screenshot.js';
import {
  AUTO_REFRESH_INTERVAL,
  INSPECTOR_TABS,
  MJPEG_STREAM_CHECK_INTERVAL,
  SCREENSHOT_SCALE_REFRESH_EVENT,
  SESSION_EXPIRY_PROMPT_TIMEOUT,
} from '../../constants/session-inspector.js';
import {downloadFile} from '../../utils/file-handling.js';
import Commands from './CommandsTab/Commands.jsx';
import GestureEditor from './GesturesTab/GestureEditor.jsx';
import SavedGestures from './GesturesTab/SavedGestures.jsx';
import HeaderButtons from './Header/HeaderButtons.jsx';
import Screenshot from './Screenshot/Screenshot.jsx';
import SessionExpiryModal from './SessionExpiryModal.jsx';
import styles from './SessionInspector.module.css';
import SessionInspectorTabs from './SessionInspectorTabs.jsx';

// resize width to something sensible for using the inspector on first run
const resizeWindowOnLaunch = () => {
  const curHeight = window.innerHeight;
  const curWidth = window.innerWidth;
  if (curHeight < WINDOW_DIMENSIONS.MIN_HEIGHT || curWidth < WINDOW_DIMENSIONS.MIN_WIDTH) {
    const newWidth =
      curWidth < WINDOW_DIMENSIONS.MIN_WIDTH ? WINDOW_DIMENSIONS.MIN_WIDTH : curWidth;
    const newHeight =
      curHeight < WINDOW_DIMENSIONS.MIN_HEIGHT ? WINDOW_DIMENSIONS.MIN_HEIGHT : curHeight;
    window.resizeTo(newWidth, newHeight);
  }
};

/**
 * The root component of the Session Inspector screen.
 */
const Inspector = (props) => {
  const {
    screenshot,
    screenshotError,
    isUsingMjpegMode,
    isAwaitingMjpegStream,
    isSourceRefreshOn,
    quitSession,
    setUserWaitTimeout,
    showKeepAlivePrompt,
    keepSessionAlive,
    applyClientMethod,
    getSavedClientFramework,
    runKeepAliveLoop,
    setSessionTime,
    storeSessionSettings,
    setAwaitingMjpegStream,
    methodCallInProgress,
  } = props;

  const screenshotContainerElRef = useRef(null);
  const mjpegStreamCheckIntervalRef = useRef(null);
  const autoRefreshIntervalRef = useRef(null);
  // Read fresh at each auto-refresh tick without having to restart the interval every time a
  // method call starts/finishes (which would happen very often)
  const methodCallInProgressRef = useRef(methodCallInProgress);
  useEffect(() => {
    methodCallInProgressRef.current = methodCallInProgress;
  }, [methodCallInProgress]);
  // Whether the Flutter right-click context menu (or a modal opened from it) is currently up -
  // see the auto-refresh interval below, and Screenshot.jsx's onContextMenuActiveChange callback
  // that keeps this current.
  const contextMenuActiveRef = useRef(false);
  const handleContextMenuActiveChange = useCallback((active) => {
    contextMenuActiveRef.current = active;
  }, []);
  // Debounced updater stored in a ref to avoid creating it during render
  const updateScreenshotScaleDebouncedRef = useRef(undefined);

  // Ref to persist session expiry timeout without resetting on re-renders
  const sessionExpiryTimeoutRef = useRef(null);

  const [scaleRatio, setScaleRatio] = useState(1);

  const navigate = useNavigate();
  const {t} = useTranslation();

  // Once a screenshot has been obtained, keep showing it - and keep <Screenshot> mounted -
  // even if a later periodic auto-refresh transiently fails to get a new one (e.g. the Flutter
  // driver's VM service screenshot call flaking). Unmounting on every such hiccup was destroying
  // the right-click context menu/modal state that lives inside <Screenshot>. The error, if any,
  // still renders alongside the (now possibly stale) screenshot - see the JSX below.
  //const showScreenshot =
  //  !!screenshot || (isUsingMjpegMode && (!isSourceRefreshOn || !isAwaitingMjpegStream));
  const showScreenshot =
    (screenshot && !screenshotError) ||
    (isUsingMjpegMode && (!isSourceRefreshOn || !isAwaitingMjpegStream));

  const updateScreenshotScale = useCallback(() => {
    // If the screenshot has too much space to the right or bottom, adjust the max width
    // of its container, so the source tree always fills the remaining space.
    // This keeps everything looking tight.
    const screenshotContainer = screenshotContainerElRef.current;
    if (!screenshotContainer) {
      return;
    }

    const screenshotImg = screenshotContainer.querySelector('#screenshot');
    if (!screenshotImg) {
      return;
    }

    const imgRect = screenshotImg.getBoundingClientRect();
    const containerRect = screenshotContainer.getBoundingClientRect();
    if (imgRect.height < containerRect.height) {
      // get the expected image width if the image would fill the screenshot box height
      const attemptedImgWidth = (containerRect.height / imgRect.height) * imgRect.width;
      // get the maximum image width as a fraction of the current window width
      const maxImgWidth = window.innerWidth * WINDOW_DIMENSIONS.MAX_IMAGE_WIDTH_FRACTION;
      // make sure not to exceed both the maximum allowed width and the full screenshot width
      const curMaxImgWidth = Math.min(maxImgWidth, attemptedImgWidth, windowSize.width);
      screenshotContainer.style.maxWidth = `${curMaxImgWidth}px`;
    } else if (imgRect.width < containerRect.width) {
      screenshotContainer.style.maxWidth = `${imgRect.width}px`;
    }

    // Calculate the ratio for scaling items overlaid on the screenshot
    // (highlighter rectangles/circles, gestures, etc.)
    const newImgWidth = screenshotImg.getBoundingClientRect().width;
    setScaleRatio(windowSize.width / newImgWidth);
  }, [windowSize]);

  useEffect(() => {
    const debounced = _.debounce(() => {
      updateScreenshotScale();
    }, 50);
    updateScreenshotScaleDebouncedRef.current = debounced;
    return () => {
      debounced.cancel?.();
      if (updateScreenshotScaleDebouncedRef.current === debounced) {
        updateScreenshotScaleDebouncedRef.current = undefined;
      }
    };
  }, [updateScreenshotScale]);

  // Stable handler for events that calls the debounced function ref
  const updateScreenshotScaleDebounced = useCallback(() => {
    updateScreenshotScaleDebouncedRef.current?.();
  }, []);

  const checkMjpegStream = useCallback(async () => {
    const img = new Image();
    img.src = serverDetails.mjpegScreenshotUrl;
    let imgReady = false;
    try {
      await img.decode();
      imgReady = true;
    } catch {}
    if (imgReady && isAwaitingMjpegStream) {
      setAwaitingMjpegStream(false);
      updateScreenshotScaleDebounced();
      // stream obtained - can clear the refresh interval
      clearInterval(mjpegStreamCheckIntervalRef.current);
      mjpegStreamCheckIntervalRef.current = null;
    } else if (!imgReady && !isAwaitingMjpegStream) {
      setAwaitingMjpegStream(true);
    }
  }, [
    isAwaitingMjpegStream,
    serverDetails.mjpegScreenshotUrl,
    setAwaitingMjpegStream,
    updateScreenshotScaleDebounced,
  ]);

  const screenshotInteractionChange = (mode) => {
    const {selectScreenshotInteractionMode, clearCoordAction} = props;
    clearCoordAction(); // When the action changes, reset the swipe action
    selectScreenshotInteractionMode(mode);
  };

  const switchScreenCaptureMode = (shouldUseMjpeg) => {
    setMjpegState(shouldUseMjpeg);
    if (!shouldUseMjpeg) {
      setRefreshingState({source: true});
    }
    applyClientMethod({methodName: 'getPageSource'});
  };

  const quitSessionAndReturn = useCallback(
    async ({reason, manualQuit = true, detachOnly = false} = {}) => {
      await quitSession({reason, manualQuit, detachOnly});
      navigate('/session', {replace: true});
    },
    [navigate, quitSession],
  );

  useEffect(() => {
    resizeWindowOnLaunch();
    applyClientMethod({methodName: 'getPageSource'});
    storeSessionSettings();
    getSavedClientFramework();
    runKeepAliveLoop();
    setSessionTime(Date.now());
  }, [
    applyClientMethod,
    getSavedClientFramework,
    runKeepAliveLoop,
    setSessionTime,
    storeSessionSettings,
  ]);

  /**
   * Ensures component dimensions are adjusted only once windowSize exists.
   * Cannot be combined with the other useEffect hook, since inside it,
   * windowSize is set to 'undefined', and the event listener and MJPEG checker
   * would not update this value when invoked
   */
  useEffect(() => {
    if (!windowSize || !JSON.stringify(windowSize)) {
      return;
    }
    updateScreenshotScaleDebounced();
    window.addEventListener('resize', updateScreenshotScaleDebounced);
    // Separate from the real 'resize' listener above - see SCREENSHOT_SCALE_REFRESH_EVENT's
    // definition for why this can't just reuse a real 'resize' event dispatch.
    window.addEventListener(SCREENSHOT_SCALE_REFRESH_EVENT, updateScreenshotScaleDebounced);
    if (isUsingMjpegMode) {
      mjpegStreamCheckIntervalRef.current = setInterval(
        checkMjpegStream,
        MJPEG_STREAM_CHECK_INTERVAL,
      );
    }
    return () => {
      window.removeEventListener('resize', updateScreenshotScaleDebounced);
      window.removeEventListener(SCREENSHOT_SCALE_REFRESH_EVENT, updateScreenshotScaleDebounced);
      if (mjpegStreamCheckIntervalRef.current) {
        clearInterval(mjpegStreamCheckIntervalRef.current);
        mjpegStreamCheckIntervalRef.current = null;
      }
    };
  }, [checkMjpegStream, isUsingMjpegMode, updateScreenshotScaleDebounced, windowSize]);

  // Periodically re-fetch the screenshot/source on their own, so the Inspector eventually shows
  // app state changes that weren't driven by an Inspector-initiated action (e.g. a timer in the
  // app-under-test), instead of staying stuck on a stale screen until the user happens to
  // interact again. Not needed in MJPEG mode, which already streams continuously. Skips a tick
  // entirely (rather than queuing) if a method call - including a previous auto-refresh tick - is
  // already in flight, so this never piles up requests during a slow/unresponsive session.
  useEffect(() => {
    if (isUsingMjpegMode || !isSourceRefreshOn) {
      return;
    }
    autoRefreshIntervalRef.current = setInterval(() => {
      if (!methodCallInProgressRef.current && !contextMenuActiveRef.current) {
        applyClientMethod({methodName: 'getPageSource'});
      }
    }, AUTO_REFRESH_INTERVAL);
    return () => {
      clearInterval(autoRefreshIntervalRef.current);
      autoRefreshIntervalRef.current = null;
    };
  }, [applyClientMethod, isSourceRefreshOn, isUsingMjpegMode]);

  // If session expiry prompt is shown, start timeout until session is automatically quit.
  // Timeout should remain active until it fires or user acts (keep alive / quit).
  useEffect(() => {
    if (showKeepAlivePrompt) {
      // Create timeout only once while prompt is visible
      if (!sessionExpiryTimeoutRef.current) {
        sessionExpiryTimeoutRef.current = setTimeout(() => {
          quitSessionAndReturn({reason: t('Session closed due to inactivity'), manualQuit: false});
        }, SESSION_EXPIRY_PROMPT_TIMEOUT);
        setUserWaitTimeout(sessionExpiryTimeoutRef.current);
      }
    } else if (sessionExpiryTimeoutRef.current) {
      // Prompt dismissed by user action; clear timeout
      clearTimeout(sessionExpiryTimeoutRef.current);
      sessionExpiryTimeoutRef.current = null;
      setUserWaitTimeout(null);
    }
  }, [quitSessionAndReturn, setUserWaitTimeout, showKeepAlivePrompt, t]);

  const screenShotControls = (
    <div className={styles.screenshotControls}>
      <Space size="middle">
        {serverDetails.mjpegScreenshotUrl !== null && (
          <Space.Compact>
            <Tooltip title={t('useMjpegStream')} placement="topLeft">
              <Button
                icon={<IconMovie size={18} />}
                onClick={() => switchScreenCaptureMode(true)}
                type={isUsingMjpegMode ? BUTTON.PRIMARY : BUTTON.DEFAULT}
              />
            </Tooltip>
            <Tooltip title={t('useScreenshotApi')} placement="topLeft">
              <Button
                icon={<IconPhoto size={18} />}
                onClick={() => switchScreenCaptureMode(false)}
                type={!isUsingMjpegMode ? BUTTON.PRIMARY : BUTTON.DEFAULT}
              />
            </Tooltip>
          </Space.Compact>
        )}
        <Tooltip title={t(showCentroids ? 'Hide Element Handles' : 'Show Element Handles')}>
          <Button
            icon={<IconEyePlus size={18} />}
            onClick={() => toggleShowCentroids()}
            type={showCentroids ? BUTTON.PRIMARY : BUTTON.DEFAULT}
            disabled={isGestureEditorVisible}
          />
        </Tooltip>
        <Space.Compact>
          <Tooltip title={t('Select Elements')}>
            <Button
              icon={<IconObjectScan size={18} />}
              onClick={() => screenshotInteractionChange(SELECT)}
              type={screenshotInteractionMode === SELECT ? BUTTON.PRIMARY : BUTTON.DEFAULT}
              disabled={isGestureEditorVisible}
            />
          </Tooltip>
          <Tooltip title={t('Tap/Swipe By Coordinates')}>
            <Button
              icon={<IconCrosshair size={18} />}
              onClick={() => screenshotInteractionChange(TAP_SWIPE)}
              type={screenshotInteractionMode === TAP_SWIPE ? BUTTON.PRIMARY : BUTTON.DEFAULT}
              disabled={isGestureEditorVisible}
            />
          </Tooltip>
        </Space.Compact>
        <Tooltip title={t('Download Screenshot')}>
          <Button
            icon={<IconDownload size={18} />}
            onClick={() => downloadScreenshot(screenshot)}
            disabled={!showScreenshot || isUsingMjpegMode}
          />
        </Tooltip>
      </Space>
    </div>
  );

  const main = (
    <div className={styles.inspectorMain}>
      <div
        id="screenshotContainer"
        className={styles.screenshotContainer}
        ref={screenshotContainerElRef}
      >
        {screenShotControls}
        {showScreenshot && (
          <Screenshot
            {...props}
            scaleRatio={scaleRatio}
            onContextMenuActiveChange={handleContextMenuActiveChange}
          />
        )}
        {screenshotError && t('couldNotObtainScreenshot', {screenshotError})}
        {/* Only show the loading spinner while genuinely still waiting for the first
            screenshot - once screenshotError is set, spinning forever would be misleading,
            since retrying won't happen on its own */}
        {!showScreenshot && !screenshotError && (
          <Spin size="large" spinning={true}>
            <div className={styles.screenshotBox} />
          </Spin>
        )}
      </div>
      <div className={styles.inspectorTabsContainer}>
        <Tabs
          activeKey={selectedInspectorTab}
          size="small"
          onChange={(tab) => selectInspectorTab(tab)}
          items={[
            {
              label: t('Source'),
              key: INSPECTOR_TABS.SOURCE,
              disabled: !showScreenshot,
              children: <SourceTab {...props} />,
            },
            {
              label: t('Commands'),
              key: INSPECTOR_TABS.COMMANDS,
              disabled: !showScreenshot,
              children: <Commands {...props} />,
            },
            {
              label: t('Gestures'),
              key: INSPECTOR_TABS.GESTURES,
              disabled: !showScreenshot,
              children: isGestureEditorVisible ? (
                <GestureEditor {...props} />
              ) : (
                <SavedGestures {...props} />
              ),
            },
            {
              label: t('Recorder'),
              key: INSPECTOR_TABS.RECORDER,
              disabled: !showScreenshot,
              children: <Recorder {...props} />,
            },
            {
              label: t('Session Information'),
              key: INSPECTOR_TABS.SESSION_INFO,
              disabled: !showScreenshot,
              children: <SessionInfo {...props} />,
            },
          ]}
        />
      </div>
    </div>
  );

  return (
    <div className={styles.inspectorContainer}>
      <HeaderButtons {...props} quitSessionAndReturn={quitSessionAndReturn} />
      <div className={styles.inspectorMain}>
        <Screenshot {...props} showScreenshot={showScreenshot} />
        <SessionInspectorTabs {...props} showScreenshot={showScreenshot} />
      </div>
      <SessionExpiryModal
        showKeepAlivePrompt={showKeepAlivePrompt}
        keepSessionAlive={keepSessionAlive}
        quitSessionAndReturn={quitSessionAndReturn}
        setUserWaitTimeout={setUserWaitTimeout}
      />
    </div>
  );
};

export default Inspector;
