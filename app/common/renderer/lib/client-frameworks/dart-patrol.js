import DartFlutterFramework from './dart-common.js';

export default class DartPatrolFramework extends DartFlutterFramework {
  static readableName = 'Dart - patrol';

  wrapWithBoilerplate(code) {
    return `// This sample code supports the 'patrol' package
// https://patrol.leancode.co
//
// It runs in-process with the app-under-test (no Appium/WebDriver session), so replace the
// import below with your app's actual entrypoint
import 'package:patrol/patrol.dart';

import 'package:my_app/main.dart' as app;

void main() {
  patrolTest('recorded test', ($) async {
    app.main();
    await $.pumpAndSettle();

${this.indent(code, 4)}
  });
}
`;
  }

  codeFor_tap(varNameIgnore, varIndexIgnore, pointerActions, flutterFinder) {
    const finderExpr = flutterFinder && this.getFlutterFinderExpression(flutterFinder);
    if (finderExpr) {
      return `await $(${finderExpr}).tap();`;
    }
    const {x, y} = this.getTapCoordinatesFromPointerActions(pointerActions);
    return `${this.addComment(
      `Could not resolve a widget at (${x}, ${y}); falling back to a raw coordinate tap`,
    )}
await $.tester.tapAt(Offset(${x}, ${y}));
await $.pumpAndSettle();`;
  }

  codeFor_swipe(varNameIgnore, varIndexIgnore, pointerActions) {
    const {x1, y1, x2, y2} = this.getSwipeCoordinatesFromPointerActions(pointerActions);
    return `await $.tester.dragFrom(Offset(${x1}, ${y1}), Offset(${x2 - x1}, ${y2 - y1}));
await $.pumpAndSettle();`;
  }

  codeFor_enterText(varNameIgnore, varIndexIgnore, pointerActions, flutterFinder) {
    const finderExpr = flutterFinder && this.getFlutterFinderExpression(flutterFinder);
    if (!finderExpr) {
      return this.addComment('Could not resolve a widget to enter text into at this position');
    }
    const text = this.getEnterTextFromPointerActions(pointerActions);
    return `await $(${finderExpr}).enterText(${JSON.stringify(text)});`;
  }
}
