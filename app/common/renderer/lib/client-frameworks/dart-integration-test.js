import DartFlutterFramework from './dart-common.js';

export default class DartIntegrationTestFramework extends DartFlutterFramework {
  static readableName = 'Dart - integration_test';

  wrapWithBoilerplate(code) {
    return `// This sample code supports the Flutter 'integration_test' package
// https://docs.flutter.dev/testing/integration-tests
//
// It runs in-process with the app-under-test (no Appium/WebDriver session), so replace the
// import below with your app's actual entrypoint
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'package:my_app/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('recorded test', (WidgetTester tester) async {
    app.main();
    await tester.pumpAndSettle();

${this.indent(code, 4)}
  });
}
`;
  }

  codeFor_tap(varNameIgnore, varIndexIgnore, pointerActions, flutterFinder) {
    const finderExpr = flutterFinder && this.getFlutterFinderExpression(flutterFinder);
    if (finderExpr) {
      return `await tester.tap(${finderExpr});\nawait tester.pumpAndSettle();`;
    }
    const {x, y} = this.getTapCoordinatesFromPointerActions(pointerActions);
    return `${this.addComment(
      `Could not resolve a widget at (${x}, ${y}); falling back to a raw coordinate tap`,
    )}
await tester.tapAt(const Offset(${x}, ${y}));
await tester.pumpAndSettle();`;
  }

  codeFor_swipe(varNameIgnore, varIndexIgnore, pointerActions) {
    const {x1, y1, x2, y2} = this.getSwipeCoordinatesFromPointerActions(pointerActions);
    return `await tester.dragFrom(const Offset(${x1}, ${y1}), const Offset(${x2 - x1}, ${y2 - y1}));
await tester.pumpAndSettle();`;
  }

  codeFor_enterText(varNameIgnore, varIndexIgnore, pointerActions, flutterFinder) {
    const finderExpr = flutterFinder && this.getFlutterFinderExpression(flutterFinder);
    if (!finderExpr) {
      return this.addComment('Could not resolve a widget to enter text into at this position');
    }
    const text = this.getEnterTextFromPointerActions(pointerActions);
    // 'submitted' - see parseFlutterFinderFromResponse in actions/SessionInspector.js - means the
    // live interaction also sent a TextInputAction.done after entering the text; matching that in
    // generated code is what makes a field's onSubmitted/onFieldSubmitted fire when this runs.
    const submitStep = flutterFinder.submitted
      ? '\nawait tester.testTextInput.receiveAction(TextInputAction.done);\nawait tester.pumpAndSettle();'
      : '';
    return `await tester.enterText(${finderExpr}, ${JSON.stringify(text)});
await tester.pumpAndSettle();${submitStep}`;
  }
}
