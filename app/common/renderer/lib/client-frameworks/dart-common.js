import refractorDart from 'refractor/dart';

import CommonClientFramework from './common.js';

/**
 * Base class for Dart-based Flutter widget-test frameworks (integration_test, patrol).
 *
 * Unlike every other client framework here, these don't drive a remote Appium/WebDriver
 * session - 'integration_test'/'patrol' tests run in-process with the app-under-test via
 * WidgetTester, so there's no 'driver' object and no equivalent for most Appium commands
 * (sessions, contexts, app management, file transfer, device commands, etc). Actions without
 * a 'codeFor_*' override here fall back to the base class's generic
 * "not currently supported" comment - see CommonClientFramework#getCodeString.
 *
 * Element interaction only has verified support for 'tap', 'checkExistence', 'enterText' and
 * 'checkText': when the current session's driver is 'flutter' (see the
 * 'appium-handler'/'appium-flutter-driver' projects this pairs with), those recorded actions
 * carry a resolved Flutter locator ('flutterFinder': {foundBy, value}, set by
 * 'RECORD_FLUTTER_FINDER' in actions/reducers/SessionInspector.js), which is translated into the
 * matching 'find.byXxx(...)' expression. Without a resolved locator (e.g. a tap that didn't land
 * on a widget, or the session isn't a Flutter driver), taps fall back to raw-coordinate code, and
 * 'checkExistence'/'enterText'/'checkText' fall back to a comment (there's no coordinate-based
 * equivalent for those in flutter_test). 'checkText' always uses a 'byText' locator built from
 * the expected text itself, rather than the tapped widget's auto-resolved locator - see
 * 'actions/SessionInspector.js#checkTextAtCoordinates' for why.
 */
export default class DartFlutterFramework extends CommonClientFramework {
  static refractorLang = 'dart';
  static refractorLib = refractorDart;

  addComment(comment) {
    return `// ${comment}`;
  }

  /**
   * Translates a resolved Flutter locator into the matching 'find.byXxx(...)' expression.
   *
   * @param {{foundBy: string, value: string}} flutterFinder
   * @returns {string|null} a Dart 'Finder' expression, or null if 'foundBy' is unrecognized
   */
  getFlutterFinderExpression({foundBy, value}) {
    switch (foundBy) {
      case 'byTooltip':
        return `find.byTooltip(${JSON.stringify(value)})`;
      case 'bySemanticsLabel':
        return `find.bySemanticsLabel(${JSON.stringify(value)})`;
      case 'byValueKey':
        return `find.byKey(const Key(${JSON.stringify(value)}))`;
      case 'byText':
        return `find.text(${JSON.stringify(value)})`;
      case 'byType': {
        // 'value' is the widget's Dart runtime type name, used here as a bare identifier -
        // optionally suffixed with '#<index>' (appium_handler.dart's 'ByTypeIndex' finder) when
        // a plain type match was ambiguous (more than one widget of that type on screen) and got
        // narrowed to this widget's position among same-typed widgets in the page source, via
        // '.at(index)'. Generic types (e.g. containing '-' where appium-handler sanitized
        // '<'/'>') or private ('_'-prefixed) types may need manual fixup either way, since they
        // aren't directly importable/referenceable as written.
        const [type, index] = value.split('#');
        return index === undefined ? `find.byType(${type})` : `find.byType(${type}).at(${index})`;
      }
      default:
        return null;
    }
  }

  /**
   * Renders an 'expect(finder, findsOneWidget/findsNothing)' assertion for a recorded
   * 'checkExistence' action - identical for integration_test and patrol, since both use
   * flutter_test's own 'expect'/'find' matchers for this rather than a framework-specific API.
   */
  codeFor_checkExistence(varNameIgnore, varIndexIgnore, pointerActionsIgnore, flutterFinder) {
    const finderExpr = flutterFinder && this.getFlutterFinderExpression(flutterFinder);
    if (!finderExpr) {
      return this.addComment('Could not resolve a widget to verify the existence of at this position');
    }
    const matcher = flutterFinder.shouldExist ? 'findsOneWidget' : 'findsNothing';
    return `expect(${finderExpr}, ${matcher});`;
  }

  /**
   * Renders a text-content assertion for a recorded 'checkText' action. The recorded
   * 'flutterFinder' is always a 'byText' locator built from the expected text (see
   * 'checkTextAtCoordinates'), so this is just 'codeFor_checkExistence' under another name -
   * kept separate since the two actions are conceptually distinct from the recorder's/user's
   * point of view, even though they render identically.
   */
  codeFor_checkText(varNameIgnore, varIndexIgnore, pointerActions, flutterFinder) {
    return this.codeFor_checkExistence(varNameIgnore, varIndexIgnore, pointerActions, flutterFinder);
  }

  /**
   * integration_test/patrol run in-process on the device itself (see the 'js-wdio.js' override
   * of this same action for why that rules out actually running a shell command from here), so
   * the next best thing - and consistent with this project's own QA test specs, which already
   * 'print()' a "### QA MANUAL" instruction for backend/admin steps that can't be automated - is
   * to print instructions for whoever is watching the terminal to run it themselves.
   *
   * Unlike every other 'codeFor_*' here, this isn't tied to any element, so 'recordShellCommand'
   * (in actions/SessionInspector.js) doesn't prepend the usual variableName/variableIndex pair to
   * its recorded params - 'command' is the only (first) argument.
   */
  codeFor_shellCommand(command) {
    return `print(${JSON.stringify(`### QA MANUAL: run the following in a terminal: ${command}`)});`;
  }

  /**
   * A comment for a recorded 'enterText' action marked (via the Enter Text modal's checkbox) as
   * needing a fresh value on every run - e.g. a patient card number the app-under-test rejects as
   * a duplicate. Unlike 'js-wdio.js' (a normal host-side Node process, which can prompt on
   * stdin - see its 'codeFor_enterText'), integration_test/patrol run in-process on the device, so
   * there's no interactive terminal to prompt through; this just flags the recorded value for
   * manual replacement instead.
   */
  promptedComment(recordedText) {
    return this.addComment(`QA MANUAL: replace ${JSON.stringify(recordedText)} below with a fresh value for this run`);
  }
}
