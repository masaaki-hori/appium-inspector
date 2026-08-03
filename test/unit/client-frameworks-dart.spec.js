import {describe, expect, it} from 'vitest';

import DartIntegrationTestFramework from '../../app/common/renderer/lib/client-frameworks/dart-integration-test.js';
import DartPatrolFramework from '../../app/common/renderer/lib/client-frameworks/dart-patrol.js';

const TAP_POINTER_ACTIONS = {
  finger1: [{type: 'pointerMove', duration: 0, x: 42, y: 84}],
};

const ENTER_TEXT_POINTER_ACTIONS = {
  finger1: [
    {type: 'pointerMove', duration: 0, x: 42, y: 84},
    {type: 'enterText', text: 'hello@example.com'},
  ],
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
            params: [undefined, undefined, TAP_POINTER_ACTIONS, {foundBy: 'byValueKey', value: 'login-button'}],
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
        expect(code).toContain("Code generation for action 'installApp' is not currently supported");
      });

      it('should render a findsOneWidget assertion when a widget should exist', function () {
        const framework = new FrameworkClass();
        framework.actions = [
          {
            action: 'checkExistence',
            params: [
              undefined,
              undefined,
              TAP_POINTER_ACTIONS,
              {foundBy: 'byText', value: 'Login Success', shouldExist: true},
            ],
          },
        ];
        const code = framework.getCodeString();
        expect(code).toContain('expect(find.text("Login Success"), findsOneWidget);');
      });

      it('should render a findsNothing assertion when a widget should not exist', function () {
        const framework = new FrameworkClass();
        framework.actions = [
          {
            action: 'checkExistence',
            params: [
              undefined,
              undefined,
              TAP_POINTER_ACTIONS,
              {foundBy: 'byText', value: 'Error', shouldExist: false},
            ],
          },
        ];
        const code = framework.getCodeString();
        expect(code).toContain('expect(find.text("Error"), findsNothing);');
      });

      it('should comment out an existence check when no Flutter finder was resolved', function () {
        const framework = new FrameworkClass();
        framework.actions = [{action: 'checkExistence', params: [undefined, undefined, TAP_POINTER_ACTIONS]}];
        const code = framework.getCodeString();
        expect(code).toContain('Could not resolve a widget to verify the existence of at this position');
        expect(code).not.toContain('expect(');
      });

      it('should enter text into the resolved widget when a Flutter finder was resolved', function () {
        const framework = new FrameworkClass();
        framework.actions = [
          {
            action: 'enterText',
            params: [undefined, undefined, ENTER_TEXT_POINTER_ACTIONS, {foundBy: 'byValueKey', value: 'email-field'}],
          },
        ];
        const code = framework.getCodeString();
        expect(code).toContain('find.byKey(const Key("email-field"))');
        expect(code).toContain('enterText');
        expect(code).toContain('"hello@example.com"');
      });

      it('should comment out entering text when no Flutter finder was resolved', function () {
        const framework = new FrameworkClass();
        framework.actions = [{action: 'enterText', params: [undefined, undefined, ENTER_TEXT_POINTER_ACTIONS]}];
        const code = framework.getCodeString();
        expect(code).toContain('Could not resolve a widget to enter text into at this position');
        expect(code).not.toContain('enterText(');
      });

      it('should also submit a TextInputAction.done after entering text when the live interaction did', function () {
        const framework = new FrameworkClass();
        framework.actions = [
          {
            action: 'enterText',
            params: [
              undefined,
              undefined,
              ENTER_TEXT_POINTER_ACTIONS,
              {foundBy: 'byValueKey', value: 'email-field', submitted: true},
            ],
          },
        ];
        const code = framework.getCodeString();
        expect(code).toContain('testTextInput.receiveAction(TextInputAction.done)');
      });

      it('should not submit a TextInputAction.done when the live interaction did not', function () {
        const framework = new FrameworkClass();
        framework.actions = [
          {
            action: 'enterText',
            params: [
              undefined,
              undefined,
              ENTER_TEXT_POINTER_ACTIONS,
              {foundBy: 'byValueKey', value: 'email-field', submitted: false},
            ],
          },
        ];
        const code = framework.getCodeString();
        expect(code).not.toContain('TextInputAction');
      });

      it('should render a text-content assertion for a recorded checkText action', function () {
        const framework = new FrameworkClass();
        framework.actions = [
          {
            action: 'checkText',
            params: [undefined, undefined, TAP_POINTER_ACTIONS, {foundBy: 'byText', value: 'YES', shouldExist: true}],
          },
        ];
        const code = framework.getCodeString();
        expect(code).toContain('expect(find.text("YES"), findsOneWidget);');
      });

      it('should comment out a checkText action when no Flutter finder was resolved', function () {
        const framework = new FrameworkClass();
        framework.actions = [{action: 'checkText', params: [undefined, undefined, TAP_POINTER_ACTIONS]}];
        const code = framework.getCodeString();
        expect(code).toContain('Could not resolve a widget to verify the existence of at this position');
        expect(code).not.toContain('expect(');
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
      ['byType', 'Icon#3', 'find.byType(Icon).at(3)'],
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
