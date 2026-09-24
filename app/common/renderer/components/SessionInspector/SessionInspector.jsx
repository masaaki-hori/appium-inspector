import {bindActionCreators} from '@reduxjs/toolkit';
import {Splitter} from 'antd';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {shallowEqual, useDispatch, useSelector} from 'react-redux';
import {useNavigate} from 'react-router';
import {useTranslation} from 'react-i18next';

import * as SessionInspectorActions from '../../actions/SessionInspector.js';
import {WINDOW_DIMENSIONS} from '../../constants/common.js';
import {AUTO_REFRESH_INTERVAL, SESSION_EXPIRY_PROMPT_TIMEOUT} from '../../constants/session-inspector.js';
import HeaderButtons from './Header/HeaderButtons.jsx';
import Screenshot from './Screenshot/Screenshot.jsx';
import SessionExpiryModal from './SessionExpiryModal.jsx';
import SessionInspectorTabs from './SessionInspectorTabs.jsx';

import styles from './SessionInspector.module.css';

const MAX_SCREENSHOT_WIDTH_PERCENT = `${WINDOW_DIMENSIONS.MAX_SCREENSHOT_PANEL_WIDTH_FRACTION * 100}%`;

/**
 * The root component of the Session Inspector screen.
 */
const Inspector = () => {
  const inspector = useSelector((state) => state.inspector, shallowEqual);
  const dispatch = useDispatch();
  const actions = useMemo(() => bindActionCreators(SessionInspectorActions, dispatch), [dispatch]);
  const props = {...inspector, ...actions};

  const {
    screenshot,
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
    methodCallInProgress,
  } = props;

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

  // Ref to persist session expiry timeout without resetting on re-renders
  const sessionExpiryTimeoutRef = useRef(null);

  const navigate = useNavigate();
  const {t} = useTranslation();

  // Once a screenshot has been obtained, keep showing it - and keep <Screenshot> mounted -
  // even if a later periodic auto-refresh transiently fails to get a new one (e.g. the Flutter
  // driver's VM service screenshot call flaking). Unmounting on every such hiccup was destroying
  // the right-click context menu/modal state that lives inside <Screenshot>. The error, if any,
  // still renders alongside the (now possibly stale) screenshot - see Screenshot.jsx's JSX.
  const showScreenshot = !!screenshot || (isUsingMjpegMode && (!isSourceRefreshOn || !isAwaitingMjpegStream));

  const [screenshotPanelWidth, setScreenshotPanelWidth] = useState(WINDOW_DIMENSIONS.INITIAL_SCREENSHOT_PANEL_WIDTH_PX);
  const screenshotPanelResizedManually = useRef(false);

  // Triggered when the width of the scaled image or Inspector window changes.
  const setPanelWidthAutomatically = (suggestedWidth) => {
    setScreenshotPanelWidth((curWidth) => {
      if (screenshotPanelResizedManually.current) {
        // re-enforce the same limits that are already set for Splitter.Panel,
        // otherwise the panel can go outside these bounds upon Inspector window size change
        const maxPanelSize = window.innerWidth * WINDOW_DIMENSIONS.MAX_SCREENSHOT_PANEL_WIDTH_FRACTION;
        return Math.min(Math.max(curWidth, WINDOW_DIMENSIONS.MIN_IMG_WIDTH_PX), maxPanelSize);
      }
      // ignore sub-pixel differences to avoid a resizing loop
      return Math.abs(suggestedWidth - curWidth) < 1 ? curWidth : suggestedWidth;
    });
  };

  // Triggered when manually adjusting the splitter. Only needed to trip the manual resize flag.
  const setPanelWidthManually = (widths) => {
    screenshotPanelResizedManually.current = true;
    setScreenshotPanelWidth(widths[0]);
  };

  const quitSessionAndReturn = useCallback(
    async ({reason, manualQuit = true, detachOnly = false} = {}) => {
      await quitSession({reason, manualQuit, detachOnly});
      navigate('/session', {replace: true});
    },
    [navigate, quitSession],
  );

  useEffect(() => {
    applyClientMethod({methodName: 'getPageSource'});
    storeSessionSettings();
    getSavedClientFramework();
    runKeepAliveLoop();
    setSessionTime(Date.now());
  }, [applyClientMethod, getSavedClientFramework, runKeepAliveLoop, setSessionTime, storeSessionSettings]);

  // Periodically re-fetch the screenshot/source on their own, so the Inspector eventually shows
  // app state changes that weren't driven by an Inspector-initiated action (e.g. a timer in the
  // app-under-test), instead of staying stuck on a stale screen until the user happens to
  // interact again. Not needed in MJPEG mode, which already streams continuously. Skips a tick
  // entirely (rather than queuing) if a method call - including a previous auto-refresh tick - is
  // already in flight, so this never piles up requests during a slow/unresponsive session. Also
  // skips a tick while the Flutter right-click context menu/modal is up, so a refresh can never
  // reflow the page mid-interaction.
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

  return (
    <div className={styles.inspectorContainer}>
      <HeaderButtons {...props} quitSessionAndReturn={quitSessionAndReturn} />
      <div className={styles.inspectorMain}>
        <Screenshot
          {...props}
          showScreenshot={showScreenshot}
          onContextMenuActiveChange={handleContextMenuActiveChange}
        />
        <SessionInspectorTabs {...props} showScreenshot={showScreenshot} />
      </div>
      <Splitter className={styles.inspectorSplitter} onResize={setPanelWidthManually}>
        <Splitter.Panel
          min={WINDOW_DIMENSIONS.MIN_IMG_WIDTH_PX}
          max={MAX_SCREENSHOT_WIDTH_PERCENT}
          size={screenshotPanelWidth}
        >
          <Screenshot
            {...props}
            showScreenshot={showScreenshot}
            screenshotPanelWidth={screenshotPanelWidth}
            suggestScreenshotPanelWidth={setPanelWidthAutomatically}
          />
        </Splitter.Panel>
        <Splitter.Panel>
          <SessionInspectorTabs {...props} showScreenshot={showScreenshot} />
        </Splitter.Panel>
      </Splitter>
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
