import {describe, expect, it} from 'vitest';

import DartIntegrationTestFramework from '../../app/common/renderer/lib/client-frameworks/dart-integration-test.js';
import DartPatrolFramework from '../../app/common/renderer/lib/client-frameworks/dart-patrol.js';

const TAP_POINTER_ACTIONS = {
  finger1: [{type: 'pointerMove', duration: 0, x: 42, y: 84}],
};

describe('lib/client-frameworks/dart-*.js', function () {
  for (const [name, FrameworkClass] of [
    ['DartIntegrationTestFramework', DartIntegrationTestFramework],
    ['DartPatrolFramework', DartPatrolFramework],
  ]) {
    describe(name, function () {
      it('should render a widget-based tap when a Flutter finder was resolved', function () {
        const framework = new FrameworkClass();
        framework.actions = [
          {
            action: 'tap',
            params: [
              undefined,
              undefined,
              TAP_POINTER_ACTIONS,
              {foundBy: 'byValueKey', value: 'login-button'},
            ],
          },
        ];
        const code = framework.getCodeString();
        expect(code).toContain(`find.byKey(const Key("login-button"))`);
        expect(code).not.toContain('42');
      });

      it('should fall back to a coordinate-based tap when no Flutter finder was resolved', function () {
        const framework = new FrameworkClass();
        framework.actions = [{action: 'tap', params: [undefined, undefined, TAP_POINTER_ACTIONS]}];
        const code = framework.getCodeString();
        expect(code).toContain('42');
        expect(code).toContain('84');
        expect(code).not.toContain('find.by');
      });

      it('should fall back to the generic "not supported" comment for unimplemented actions', function () {
        const framework = new FrameworkClass();
        framework.actions = [{action: 'installApp', params: [undefined, undefined, 'app.apk']}];
        const code = framework.getCodeString();
        expect(code).toContain(
          "Code generation for action 'installApp' is not currently supported",
        );
      });
    });
  }

  describe('DartFlutterFramework#getFlutterFinderExpression', function () {
    it.each([
      ['byTooltip', 'Submit', 'find.byTooltip("Submit")'],
      ['bySemanticsLabel', 'Submit button', 'find.bySemanticsLabel("Submit button")'],
      ['byValueKey', 'submit-btn', 'find.byKey(const Key("submit-btn"))'],
      ['byText', 'Submit', 'find.text("Submit")'],
      ['byType', 'ElevatedButton', 'find.byType(ElevatedButton)'],
    ])('should map %s to the matching Finder expression', (foundBy, value, expected) => {
      const framework = new DartIntegrationTestFramework();
      expect(framework.getFlutterFinderExpression({foundBy, value})).toBe(expected);
    });

    it('should return null for an unrecognized foundBy value', function () {
      const framework = new DartIntegrationTestFramework();
      expect(framework.getFlutterFinderExpression({foundBy: 'unknown', value: 'x'})).toBeNull();
    });
  });
});
