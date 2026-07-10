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
 * Element interaction only has verified support for 'tap': when the current session's driver
 * is 'flutter' (see the 'appium-handler'/'appium-flutter-driver' projects this pairs with),
 * a tap's recorded action carries a resolved Flutter locator ('flutterFinder': {foundBy, value},
 * set by 'RECORD_FLUTTER_FINDER' in actions/reducers/SessionInspector.js), which is translated
 * into the matching 'find.byXxx(...)' expression. Without a resolved locator (e.g. the tap didn't
 * land on a widget, or the session isn't a Flutter driver), taps fall back to raw-coordinate code.
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
      case 'byType':
        // 'value' is the widget's Dart runtime type name, used here as a bare identifier.
        // Generic types (e.g. containing '-' where appium-handler sanitized '<'/'>') or
        // private ('_'-prefixed) types may need manual fixup, since they aren't directly
        // importable/referenceable as written.
        return `find.byType(${value})`;
      default:
        return null;
    }
  }
}
