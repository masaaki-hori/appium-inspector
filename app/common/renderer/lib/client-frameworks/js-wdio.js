import refractorJs from 'refractor/javascript';

import CommonClientFramework from './common.js';

export default class JsWdIoFramework extends CommonClientFramework {
  static readableName = 'JS/TS - WebdriverIO';
  static refractorLang = 'js';
  static refractorLib = refractorJs;

  wrapWithBoilerplate(code) {
    return `// This sample code supports WebdriverIO client >=9.7.0
// (npm i --save webdriverio)
// Then paste this into a .js or .ts file and run with Node
// (modern Node can run TypeScript files directly if types are strippable):
// node <file>.js
// or: node <file>.ts

import {remote} from 'webdriverio';
import {execSync} from 'node:child_process';
import {createInterface} from 'node:readline/promises';

// Prompts on stdin for a value that must differ on every run (e.g. a patient card number the
// app-under-test rejects as a duplicate) - see any 'enterText' step below with a comment
// referencing this.
async function promptForInput(question) {
  const rl = createInterface({input: process.stdin, output: process.stdout});
  try {
    return await rl.question(\`\${question} \`);
  } finally {
    rl.close();
  }
}

// Retries a Flutter-driver action (tap/enterText/checkExistence/checkText all resolve their
// target locator live against appium_handler.dart's page source) until 'isDone(foundBy)' returns
// true or 'timeoutMs' elapses, refreshing the page source before each attempt.
//
// Two things make this necessary rather than a single attempt:
// - appium_handler.dart only refreshes its cached page source when 'getPageSource' is called, and
//   a generated script is a brand new session that's never called it at all - without a refresh
//   here, the cache is empty and every locator-based action fails to resolve, immediately and
//   every time.
// - Even with a fresh page source, the target widget frequently doesn't exist *yet* right after a
//   previous action - e.g. search results that only appear once the app finishes processing a
//   text change. A single immediate attempt races that; retrying gives it time to show up.
async function retryFlutterAction(driver, action, isDone, errorMessage, {timeoutMs = 5000, intervalMs = 300} = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    await driver.getPageSource();
    const result = await driver.performActions([
      {type: 'pointer', id: 'finger1', parameters: {pointerType: 'touch'}, actions: [action]},
    ]);
    let {foundBy} = JSON.parse(result.response.message);
    // A widget appium_handler.dart deliberately couldn't resolve a locator for (e.g. a raw
    // coordinate tap as a last resort) should read as "not found" here, not as the literal
    // 4-character string "null" a naive null field would otherwise serialize as.
    if (foundBy === 'null') {
      foundBy = null;
    }
    if (isDone(foundBy)) {
      return result;
    }
    if (Date.now() >= deadline) {
      throw new Error(errorMessage);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

async function main () {
  const caps = ${JSON.stringify(this.caps, null, 2)}
  const driver = await remote({
    protocol: "${this.serverUrlParts.protocol}",
    hostname: "${this.serverUrlParts.host}",
    port: ${this.serverUrlParts.port},
    path: "${this.serverUrlParts.path}",
    capabilities: caps
  });
${this.indent(code, 2)}
  await driver.deleteSession();
}

main().catch(console.log);`;
  }

  addComment(comment) {
    return `// ${comment}`;
  }

  codeFor_findAndAssign(strategy, locator, localVar, isArray) {
    // wdio allows to specify strategy as a locator prefix
    const validStrategies = [
      'xpath',
      'accessibility id',
      'id',
      'class name',
      'name',
      '-android uiautomator',
      '-android datamatcher',
      '-android viewtag',
      '-ios predicate string',
      '-ios class chain',
    ];
    if (!validStrategies.includes(strategy)) {
      return this.handleUnsupportedLocatorStrategy(strategy, locator);
    }
    if (isArray) {
      return `const ${localVar} = await driver.$$(${JSON.stringify(`${strategy}:${locator}`)});`;
    } else {
      return `const ${localVar} = await driver.$(${JSON.stringify(`${strategy}:${locator}`)});`;
    }
  }

  codeFor_elementClick(varName, varIndex) {
    return `await ${this.getVarName(varName, varIndex)}.click();`;
  }

  codeFor_elementClear(varName, varIndex) {
    return `await ${this.getVarName(varName, varIndex)}.clearValue();`;
  }

  codeFor_elementSendKeys(varName, varIndex, text) {
    return `await ${this.getVarName(varName, varIndex)}.addValue(${JSON.stringify(text)});`;
  }

  /**
   * Builds a 'retryFlutterAction(...)' call (see the boilerplate above) carrying a resolved
   * Flutter locator ('flutterFinder': {foundBy, value}) instead of a raw coordinate - the same
   * '{type, foundBy, value, ...}' action shape Appium Inspector's own screenshot-driven
   * tap/enterText/checkText/checkExistence actions send (see 'inspector-driver.js#executeMethod').
   * 'appium_handler.dart' resolves the locator live against the *current* page source (see its
   * '_findNodeByLocator'), so unlike a raw coordinate tap this keeps working if the app's layout
   * shifts between recording and replay - the reliability Dart's 'find.byXxx(...)' gets from
   * being in-process, without needing to be.
   *
   * @param {string} type 'tap' or 'enterText'
   * @param {{foundBy: string, value: string}} flutterFinder
   * @param {object} [extraFields] additional fields to merge into the action (e.g. 'text' for
   *   'enterText')
   */
  codeFor_flutterPerformAction(type, flutterFinder, extraFields = {}) {
    const action = {type, foundBy: flutterFinder.foundBy, value: flutterFinder.value, ...extraFields};
    const errorMessage = `Could not resolve the widget to ${type} (foundBy=${flutterFinder.foundBy}, value=${flutterFinder.value})`;
    return `await retryFlutterAction(driver, ${JSON.stringify(action)}, (foundBy) => Boolean(foundBy), ${JSON.stringify(errorMessage)});`;
  }

  /**
   * Scales recorded pixel coordinates to whatever device the *generated* script actually runs
   * against, using their ratio to the screen size at recording time (this framework instance's
   * 'windowSize' - the live device size when the code was generated, see 'Recorder.jsx'). A raw
   * pixel coordinate is otherwise meaningless across devices with a different resolution - one
   * recorded on a phone can land anywhere (or off-screen) on a tablet. Falls back to the literal
   * recorded pixels, with a comment, if no window size was known when this code was generated.
   *
   * @param {Array<[number, number]>} points x/y pairs to scale, in recorded-pixel space
   * @returns {{rectDecl: string, points: Array<[string, string]>}} 'rectDecl' is a statement
   *   declaring the local variable the expressions in 'points' reference (empty string when
   *   falling back to literal pixels, since nothing needs declaring in that case)
   */
  codeForScaledCoordinates(points) {
    if (!this.windowSize?.width || !this.windowSize?.height) {
      return {
        rectDecl: `${this.addComment(
          'Recording device screen size unknown - using the literal recorded pixel coordinates, which will only land correctly on a device with the same resolution',
        )}\n`,
        points: points.map(([x, y]) => [`${x}`, `${y}`]),
      };
    }
    const rectVar = this.getNewLocalVar();
    const {width, height} = this.windowSize;
    return {
      rectDecl: `const ${rectVar} = await driver.getWindowRect();\n`,
      points: points.map(([x, y]) => [
        `Math.round(${rectVar}.width * ${(x / width).toFixed(4)})`,
        `Math.round(${rectVar}.height * ${(y / height).toFixed(4)})`,
      ]),
    };
  }

  codeFor_tap(varNameIgnore, varIndexIgnore, pointerActions, flutterFinder) {
    if (flutterFinder) {
      return this.codeFor_flutterPerformAction('tap', flutterFinder);
    }
    const {x, y} = this.getTapCoordinatesFromPointerActions(pointerActions);
    const {rectDecl, points} = this.codeForScaledCoordinates([[x, y]]);
    const [[xExpr, yExpr]] = points;
    // Same reason as the 'await driver.getPageSource()' in 'codeFor_flutterPerformAction' - a raw
    // coordinate tap still hit-tests against appium_handler.dart's cached page source
    // ('_getNodeFromOffset'), which is otherwise empty for the first action in a fresh session.
    return `${rectDecl}await driver.getPageSource();
await driver.action('pointer')
  .move({ duration: 0, x: ${xExpr}, y: ${yExpr} })
  .down({ button: 0 })
  .pause(50)
  .up({ button: 0 })
  .perform();
`;
  }

  /**
   * Bypasses appium_handler.dart's hit-test-based tap entirely (see the Dart-side 'tapDirect'
   * case in '_performActions'/'_driveByDirectCallback') by invoking the resolved widget's own
   * 'onTap' callback directly - immune to whatever is currently painted on top of it (a
   * coach-mark highlight, a dialog barrier), unlike 'tap' above and every other tap path, which
   * all synthesize a real pointer gesture at a screen coordinate and get hit-tested against
   * whatever's on top there. Requires a resolved Flutter locator - there's no coordinate
   * fallback, since a raw coordinate is exactly what risks resolving to the overlay sitting on
   * top instead of the intended widget, defeating the point.
   */
  codeFor_tapDirect(varNameIgnore, varIndexIgnore, pointerActionsIgnore, flutterFinder) {
    if (!flutterFinder) {
      return this.addComment(
        'Could not resolve a widget to tap directly at this position - tapDirect requires a resolved locator, since a raw coordinate is exactly what risks landing on an overlay instead of the intended widget',
      );
    }
    return this.codeFor_flutterPerformAction('tapDirect', flutterFinder);
  }

  /**
   * Unlike 'tap' above, there's no coordinate-based fallback here - flutter_driver's 'enterText'
   * ignores whatever finder came with it and just types into whichever widget currently has
   * keyboard focus (see appium_handler.dart's '_focusForTextEntry'), so a resolved locator to
   * focus that widget first is mandatory. No separate 'submitted' step is needed afterwards (as
   * Dart's generated code needs) - appium_handler.dart's 'enter_text' handling already sends the
   * keyboard's 'done' action unconditionally.
   */
  codeFor_enterText(varNameIgnore, varIndexIgnore, pointerActions, flutterFinder) {
    if (!flutterFinder) {
      return this.addComment('Could not resolve a widget to enter text into at this position');
    }
    const recordedText = this.getEnterTextFromPointerActions(pointerActions);
    // Marked (via the Enter Text modal's checkbox) as needing a fresh value on every run - e.g. a
    // patient card number the app-under-test rejects as a duplicate - so prompt for it instead of
    // replaying the exact string typed while recording. A fresh variable name (shares the same
    // 'elN' counter as findAndAssign) avoids redeclaring the same 'const' if recorded more than
    // once, a SyntaxError under Node.
    if (flutterFinder.prompted) {
      const textVar = this.getNewLocalVar();
      const action = {type: 'enterText', foundBy: flutterFinder.foundBy, value: flutterFinder.value};
      const errorMessage = `Could not resolve the widget to enterText (foundBy=${flutterFinder.foundBy}, value=${flutterFinder.value})`;
      return `const ${textVar} = await promptForInput(${JSON.stringify(`Enter text (recorded value was ${JSON.stringify(recordedText)}):`)});
await retryFlutterAction(driver, {...${JSON.stringify(action)}, text: ${textVar}}, (foundBy) => Boolean(foundBy), ${JSON.stringify(errorMessage)});`;
    }
    return this.codeFor_flutterPerformAction('enterText', flutterFinder, {text: recordedText});
  }

  /**
   * Renders an existence assertion for a recorded 'checkExistence' action. Unlike Dart (which
   * can just ask flutter_test's own in-process 'find'/'expect'), this has to go back over the
   * wire and parse appium_handler.dart's response the same way Appium Inspector's own
   * 'verifyElementExistsAtCoordinates' does (see 'parseFlutterFinderFromResponse' in
   * 'actions/SessionInspector.js') - a resolved '{foundBy, value}' in the reply means the widget
   * was found, and '{}' (the 'not found' response) means it wasn't.
   *
   * Delegates to 'retryFlutterAction' (see the boilerplate above) rather than checking once
   * inline, since a check run immediately after a driving action can race the app's own async
   * re-render - the element genuinely isn't there yet, but will be moments later.
   */
  codeFor_checkExistence(varNameIgnore, varIndexIgnore, pointerActionsIgnore, flutterFinder) {
    if (!flutterFinder) {
      return this.addComment('Could not resolve a widget to verify the existence of at this position');
    }
    const action = {type: 'checkExistence', foundBy: flutterFinder.foundBy, value: flutterFinder.value};
    const expectation = flutterFinder.shouldExist ? 'to exist' : 'to not exist';
    const errorMessage = `Expected element ${expectation} (foundBy=${flutterFinder.foundBy}, value=${flutterFinder.value})`;
    const isDone = flutterFinder.shouldExist ? '(foundBy) => Boolean(foundBy)' : '(foundBy) => !foundBy';
    return `await retryFlutterAction(driver, ${JSON.stringify(action)}, ${isDone}, ${JSON.stringify(errorMessage)});`;
  }

  /**
   * The recorded 'flutterFinder' for 'checkText' is always a 'byText' locator built from the
   * expected text itself (see 'checkTextAtCoordinates'), so this is just 'codeFor_checkExistence'
   * under another name - same as the Dart frameworks.
   */
  codeFor_checkText(varNameIgnore, varIndexIgnore, pointerActions, flutterFinder) {
    return this.codeFor_checkExistence(varNameIgnore, varIndexIgnore, pointerActions, flutterFinder);
  }

  /**
   * A recorded 'run shell command' step (see the context menu's 'runShellCommand' action) has no
   * Appium/device counterpart at all - it's purely a marker for code generation, letting a
   * generated script shell out (e.g. to a backend admin CLI) at the exact point it was recorded,
   * since this script runs as a normal Node.js process on the host rather than in-app like Dart's
   * integration_test/patrol (which can't do this at all - see 'dart-common.js's override).
   *
   * Unlike every other 'codeFor_*' here, this isn't tied to any element, so 'recordShellCommand'
   * (in actions/SessionInspector.js) doesn't prepend the usual variableName/variableIndex pair to
   * its recorded params - 'command' is the only (first) argument.
   */
  codeFor_shellCommand(command) {
    return `execSync(${JSON.stringify(command)}, {stdio: 'inherit'});`;
  }

  codeFor_swipe(varNameIgnore, varIndexIgnore, pointerActions) {
    const {x1, y1, x2, y2} = this.getSwipeCoordinatesFromPointerActions(pointerActions);
    const {rectDecl, points} = this.codeForScaledCoordinates([
      [x1, y1],
      [x2, y2],
    ]);
    const [[x1Expr, y1Expr], [x2Expr, y2Expr]] = points;
    return `${rectDecl}await driver.action('pointer')
  .move({ duration: 0, x: ${x1Expr}, y: ${y1Expr} })
  .down({ button: 0 })
  .move({ duration: 1000, x: ${x2Expr}, y: ${y2Expr} })
  .up({ button: 0 })
  .perform();
`;
  }

  // Top-Level Commands

  codeFor_executeScriptNoArgs(scriptCmd) {
    return `await driver.executeScript(${JSON.stringify(scriptCmd)});`;
  }

  codeFor_executeScriptWithArgs(scriptCmd, jsonArg) {
    return `await driver.executeScript(${JSON.stringify(scriptCmd)}, ${JSON.stringify(jsonArg)});`;
  }

  codeFor_updateSettings(varNameIgnore, varIndexIgnore, settingsJson) {
    return `await driver.updateSettings(${JSON.stringify(settingsJson)});`;
  }

  codeFor_getSettings() {
    return `let settings = await driver.getSettings();`;
  }

  // Session

  codeFor_status() {
    return `let status = await driver.status();`;
  }

  codeFor_getSession() {
    return `let sessionDetails = await driver.getSession();`;
  }

  codeFor_getAppiumCommands() {
    return `let appiumCommands = await driver.getAppiumCommands();`;
  }

  codeFor_getAppiumExtensions() {
    return `let appiumExtensions = await driver.getAppiumExtensions();`;
  }

  codeFor_getAppiumSessionCapabilities() {
    return `let sessionCaps = await driver.getAppiumSessionCapabilities();`;
  }

  codeFor_getTimeouts() {
    return `let timeouts = await driver.getTimeouts();`;
  }

  codeFor_setTimeouts(/*varNameIgnore, varIndexIgnore, timeoutsJson*/) {
    return '/* TODO implement setTimeouts */';
  }

  codeFor_getLogTypes() {
    return `let logTypes = await driver.getLogTypes();`;
  }

  codeFor_getLogs(varNameIgnore, varIndexIgnore, logType) {
    return `let logs = await driver.getLogs("${logType}");`;
  }

  // Context

  codeFor_getAppiumContext() {
    return `let context = await driver.getAppiumContext();`;
  }

  codeFor_getAppiumContexts() {
    return `let contexts = await driver.getAppiumContexts();`;
  }

  codeFor_switchAppiumContext(varNameIgnore, varIndexIgnore, name) {
    return `await driver.switchAppiumContext("${name}");`;
  }

  // Device Interaction

  codeFor_getWindowRect() {
    return `let windowRect = await driver.getWindowRect();`;
  }

  codeFor_takeScreenshot() {
    return `let screenshot = await driver.takeScreenshot();`;
  }

  codeFor_isKeyboardShown() {
    return `let isKeyboardShown = await driver.isKeyboardShown();`;
  }

  codeFor_getOrientation() {
    return `let orientation = await driver.getOrientation();`;
  }

  codeFor_setOrientation(varNameIgnore, varIndexIgnore, orientation) {
    return `await driver.setOrientation("${orientation}");`;
  }

  codeFor_getGeoLocation() {
    return `let location = await driver.getGeoLocation();`;
  }

  codeFor_setGeoLocation(varNameIgnore, varIndexIgnore, latitude, longitude, altitude) {
    return `await driver.setGeoLocation({latitude: ${latitude}, longitude: ${longitude}, altitude: ${altitude}});`;
  }

  codeFor_rotateDevice(varNameIgnore, varIndexIgnore, x, y, radius, rotation, touchCount, duration) {
    return `await driver.rotateDevice(${x}, ${y}, ${radius}, ${rotation}, ${touchCount}, ${duration});`;
  }

  // App Management

  codeFor_installApp(varNameIgnore, varIndexIgnore, app) {
    return `await driver.installApp("${app}");`;
  }

  codeFor_isAppInstalled(varNameIgnore, varIndexIgnore, app) {
    return `let isAppInstalled = await driver.isAppInstalled("${app}");`;
  }

  codeFor_activateApp(varNameIgnore, varIndexIgnore, app) {
    return `await driver.activateApp("${app}");`;
  }

  codeFor_terminateApp(varNameIgnore, varIndexIgnore, app) {
    return `await driver.terminateApp("${app}");`;
  }

  codeFor_removeApp(varNameIgnore, varIndexIgnore, app) {
    return `await driver.removeApp("${app}")`;
  }

  codeFor_queryAppState(varNameIgnore, varIndexIgnore, app) {
    return `let appState = await driver.queryAppState("${app}");`;
  }

  // File Transfer

  codeFor_pushFile(varNameIgnore, varIndexIgnore, pathToInstallTo, fileContentString) {
    return `await driver.pushFile("${pathToInstallTo}", "${fileContentString}");`;
  }

  codeFor_pullFile(varNameIgnore, varIndexIgnore, pathToPullFrom) {
    return `let fileBase64 = await driver.pullFile("${pathToPullFrom}");`;
  }

  codeFor_pullFolder(varNameIgnore, varIndexIgnore, folderToPullFrom) {
    return `let folderBase64 = await driver.pullFolder("${folderToPullFrom}");`;
  }

  // Web

  codeFor_navigateTo(varNameIgnore, varIndexIgnore, url) {
    return `await driver.navigateTo('${url}');`;
  }

  codeFor_getUrl() {
    return `let currentUrl = await driver.getUrl();`;
  }

  codeFor_back() {
    return `await driver.back();`;
  }

  codeFor_forward() {
    return `await driver.forward();`;
  }

  codeFor_refresh() {
    return `await driver.refresh();`;
  }

  codeFor_getTitle() {
    return `let title = await driver.getTitle();`;
  }

  codeFor_getWindowHandle() {
    return `let windowHandle = await driver.getWindowHandle();`;
  }

  codeFor_closeWindow() {
    return `await driver.closeWindow();`;
  }

  codeFor_switchToWindow(varNameIgnore, varIndexIgnore, handle) {
    return `await driver.switchToWindow("${handle}");`;
  }

  codeFor_getWindowHandles() {
    return `let windowHandles = await driver.getWindowHandles();`;
  }

  codeFor_createWindow(varNameIgnore, varIndexIgnore, type) {
    return `let newWindow = await driver.createWindow("${type}");`;
  }
}
