import {useCallback, useEffect, useRef} from 'react';
import {useTranslation} from 'react-i18next';
import {useNavigate} from 'react-router';

import {WINDOW_DIMENSIONS} from '../../constants/common.js';
import {
  AUTO_REFRESH_INTERVAL,
  SESSION_EXPIRY_PROMPT_TIMEOUT,
} from '../../constants/session-inspector.js';
import HeaderButtons from './Header/HeaderButtons.jsx';
import Screenshot from './Screenshot/Screenshot.jsx';
import SessionExpiryModal from './SessionExpiryModal.jsx';
import SessionInspectorTabs from './SessionInspectorTabs.jsx';

import styles from './SessionInspector.module.css';

// resize width to something sensible for using the inspector on first run
const resizeWindowOnLaunch = () => {
  const curHeight = window.innerHeight;
  const curWidth = window.innerWidth;
  if (curHeight < WINDOW_DIMENSIONS.MIN_HEIGHT || curWidth < WINDOW_DIMENSIONS.MIN_WIDTH) {
    const newWidth = curWidth < WINDOW_DIMENSIONS.MIN_WIDTH ? WINDOW_DIMENSIONS.MIN_WIDTH : curWidth;
    const newHeight = curHeight < WINDOW_DIMENSIONS.MIN_HEIGHT ? WINDOW_DIMENSIONS.MIN_HEIGHT : curHeight;
    window.resizeTo(newWidth, newHeight);
  }
};

/**
 * The root component of the Session Inspector screen.
 */
const Inspector = (props) => {
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
  const showScreenshot =
    (screenshot && !screenshotError) || (isUsingMjpegMode && (!isSourceRefreshOn || !isAwaitingMjpegStream));

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
