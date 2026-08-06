import {describe, expect, it} from 'vitest';

import JsWdIoFramework from '../../app/common/renderer/lib/client-frameworks/js-wdio.js';

const TAP_POINTER_ACTIONS = {
  finger1: [{type: 'pointerMove', duration: 0, x: 42, y: 84}],
};

const ENTER_TEXT_POINTER_ACTIONS = {
  finger1: [
    {type: 'pointerMove', duration: 0, x: 42, y: 84},
    {type: 'enterText', text: 'hello@example.com'},
  ],
};

const SWIPE_POINTER_ACTIONS = {
  finger1: [
    {type: 'pointerMove', duration: 0, x: 10, y: 20},
    {type: 'pointerDown', button: 0},
    {type: 'pointerMove', duration: 1000, origin: 'pointer', x: 30, y: 40},
    {type: 'pointerUp', button: 0},
  ],
};

describe('lib/client-frameworks/js-wdio.js', function () {
  describe('JsWdIoFramework', function () {
    it('should render a retrying locator-based tap when a Flutter finder was resolved', function () {
      const framework = new JsWdIoFramework();
      framework.actions = [
        {
          action: 'tap',
          params: [undefined, undefined, TAP_POINTER_ACTIONS, {foundBy: 'byValueKey', value: 'login-button'}],
        },
      ];
      const code = framework.getCodeString();
      expect(code).toContain('retryFlutterAction(driver,');
      expect(code).toContain('"type":"tap"');
      expect(code).toContain('"foundBy":"byValueKey"');
      expect(code).toContain('"value":"login-button"');
      expect(code).not.toContain('42');
    });

    it('should fall back to a literal coordinate-based tap when no Flutter finder was resolved and no recording window size is known', function () {
      const framework = new JsWdIoFramework();
      framework.actions = [{action: 'tap', params: [undefined, undefined, TAP_POINTER_ACTIONS]}];
      const code = framework.getCodeString();
      expect(code).toContain('42');
      expect(code).toContain('84');
      expect(code).not.toContain('performActions');
      expect(code).not.toContain('retryFlutterAction');
      expect(code).not.toContain('getWindowRect');
      // A raw coordinate tap still hit-tests against appium_handler.dart's cached page source.
      expect(code).toContain('await driver.getPageSource();');
    });

    it('should scale a coordinate-based tap to the replay device when a recording window size is known', function () {
      const framework = new JsWdIoFramework(undefined, undefined, undefined, {width: 100, height: 200});
      framework.actions = [{action: 'tap', params: [undefined, undefined, TAP_POINTER_ACTIONS]}];
      const code = framework.getCodeString();
      // 42/100 = 0.42, 84/200 = 0.42
      expect(code).toContain('const el1 = await driver.getWindowRect();');
      expect(code).toContain('Math.round(el1.width * 0.4200)');
      expect(code).toContain('Math.round(el1.height * 0.4200)');
      expect(code).not.toContain(': 42,');
    });

    it('should use a unique window-rect variable name for each scaled coordinate tap', function () {
      const framework = new JsWdIoFramework(undefined, undefined, undefined, {width: 100, height: 200});
      framework.actions = [
        {action: 'tap', params: [undefined, undefined, TAP_POINTER_ACTIONS]},
        {action: 'tap', params: [undefined, undefined, TAP_POINTER_ACTIONS]},
      ];
      const code = framework.getCodeString();
      expect(code).toContain('const el1 = await driver.getWindowRect();');
      expect(code).toContain('const el2 = await driver.getWindowRect();');
    });

    it('should render a retrying tapDirect call when a Flutter finder was resolved', function () {
      const framework = new JsWdIoFramework();
      framework.actions = [
        {
          action: 'tapDirect',
          params: [undefined, undefined, TAP_POINTER_ACTIONS, {foundBy: 'byText', value: 'アカウントを追加する'}],
        },
      ];
      const code = framework.getCodeString();
      expect(code).toContain('retryFlutterAction(driver,');
      expect(code).toContain('"type":"tapDirect"');
      expect(code).toContain('"foundBy":"byText"');
      expect(code).toContain('"value":"アカウントを追加する"');
      expect(code).not.toContain('42');
    });

    it('should comment out tapDirect when no Flutter finder was resolved, without falling back to coordinates', function () {
      const framework = new JsWdIoFramework();
      framework.actions = [{action: 'tapDirect', params: [undefined, undefined, TAP_POINTER_ACTIONS]}];
      const code = framework.getCodeString();
      expect(code).toContain('Could not resolve a widget to tap directly at this position');
      expect(code).not.toContain('performActions');
      expect(code).not.toContain('42');
    });

    it('should scale a swipe to the replay device when a recording window size is known', function () {
      const framework = new JsWdIoFramework(undefined, undefined, undefined, {width: 100, height: 200});
      framework.actions = [{action: 'swipe', params: [undefined, undefined, SWIPE_POINTER_ACTIONS]}];
      const code = framework.getCodeString();
      // 10/100=0.1, 20/200=0.1, 30/100=0.3, 40/200=0.2
      expect(code).toContain('const el1 = await driver.getWindowRect();');
      expect(code).toContain('Math.round(el1.width * 0.1000)');
      expect(code).toContain('Math.round(el1.height * 0.1000)');
      expect(code).toContain('Math.round(el1.width * 0.3000)');
      expect(code).toContain('Math.round(el1.height * 0.2000)');
    });

    it('should fall back to literal swipe coordinates when no recording window size is known', function () {
      const framework = new JsWdIoFramework();
      framework.actions = [{action: 'swipe', params: [undefined, undefined, SWIPE_POINTER_ACTIONS]}];
      const code = framework.getCodeString();
      expect(code).toContain('x: 10');
      expect(code).toContain('y: 20');
      expect(code).toContain('x: 30');
      expect(code).toContain('y: 40');
      expect(code).not.toContain('getWindowRect');
    });

    it('should fall back to the generic "not supported" comment for unimplemented actions', function () {
      const framework = new JsWdIoFramework();
      framework.actions = [{action: 'notARealAction', params: []}];
      const code = framework.getCodeString();
      expect(code).toContain("Code generation for action 'notARealAction' is not currently supported");
    });

    it('should enter text into the resolved widget when a Flutter finder was resolved', function () {
      const framework = new JsWdIoFramework();
      framework.actions = [
        {
          action: 'enterText',
          params: [undefined, undefined, ENTER_TEXT_POINTER_ACTIONS, {foundBy: 'byValueKey', value: 'email-field'}],
        },
      ];
      const code = framework.getCodeString();
      expect(code).toContain('retryFlutterAction(driver,');
      expect(code).toContain('"type":"enterText"');
      expect(code).toContain('"foundBy":"byValueKey"');
      expect(code).toContain('"value":"email-field"');
      expect(code).toContain('"text":"hello@example.com"');
    });

    it('should comment out entering text when no Flutter finder was resolved', function () {
      const framework = new JsWdIoFramework();
      framework.actions = [{action: 'enterText', params: [undefined, undefined, ENTER_TEXT_POINTER_ACTIONS]}];
      const code = framework.getCodeString();
      expect(code).toContain('Could not resolve a widget to enter text into at this position');
      expect(code).not.toContain('performActions');
    });

    it('should prompt for input at runtime instead of replaying the recorded text when flagged', function () {
      const framework = new JsWdIoFramework();
      framework.actions = [
        {
          action: 'enterText',
          params: [
            undefined,
            undefined,
            ENTER_TEXT_POINTER_ACTIONS,
            {foundBy: 'byValueKey', value: 'card-number-field', prompted: true},
          ],
        },
      ];
      const code = framework.getCodeString();
      expect(code).toContain('const el1 = await promptForInput(');
      expect(code).toContain('text: el1');
      expect(code).not.toContain('"text":"hello@example.com"');
      expect(code).toContain('retryFlutterAction(driver,');
    });

    it('should use a unique variable name for each prompted enterText call', function () {
      const framework = new JsWdIoFramework();
      framework.actions = [
        {
          action: 'enterText',
          params: [
            undefined,
            undefined,
            ENTER_TEXT_POINTER_ACTIONS,
            {foundBy: 'byValueKey', value: 'field-1', prompted: true},
          ],
        },
        {
          action: 'enterText',
          params: [
            undefined,
            undefined,
            ENTER_TEXT_POINTER_ACTIONS,
            {foundBy: 'byValueKey', value: 'field-2', prompted: true},
          ],
        },
      ];
      const code = framework.getCodeString();
      // Each prompted call only consumes one name off the shared counter now (the prompted text -
      // the performActions result no longer needs its own variable, since retryFlutterAction
      // checks it internally), so the second call's prompt lands on el2.
      expect(code).toContain('const el1 = await promptForInput(');
      expect(code).toContain('const el2 = await promptForInput(');
    });

    it('should include the promptForInput helper in the boilerplate', function () {
      const serverUrlParts = {protocol: 'http', host: 'localhost', port: 4723, path: '/'};
      const framework = new JsWdIoFramework('http://localhost:4723', serverUrlParts, {});
      framework.actions = [];
      const code = framework.getCodeString(true);
      expect(code).toContain("import {createInterface} from 'node:readline/promises';");
      expect(code).toContain('async function promptForInput(question)');
    });

    it('should render a retrying existence assertion when a widget should exist', function () {
      const framework = new JsWdIoFramework();
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
      expect(code).toContain('retryFlutterAction(driver,');
      expect(code).toContain('"type":"checkExistence"');
      expect(code).toContain('"value":"Login Success"');
      expect(code).toContain('Boolean(foundBy)');
    });

    it('should render a retrying existence assertion when a widget should not exist', function () {
      const framework = new JsWdIoFramework();
      framework.actions = [
        {
          action: 'checkExistence',
          params: [undefined, undefined, TAP_POINTER_ACTIONS, {foundBy: 'byText', value: 'Error', shouldExist: false}],
        },
      ];
      const code = framework.getCodeString();
      expect(code).toContain('retryFlutterAction(driver,');
      expect(code).toContain('!foundBy');
    });

    it('should render one independent retryFlutterAction call per recorded checkExistence action', function () {
      const framework = new JsWdIoFramework();
      framework.actions = [
        {
          action: 'checkExistence',
          params: [undefined, undefined, TAP_POINTER_ACTIONS, {foundBy: 'byText', value: 'First', shouldExist: true}],
        },
        {
          action: 'checkExistence',
          params: [undefined, undefined, TAP_POINTER_ACTIONS, {foundBy: 'byText', value: 'Second', shouldExist: true}],
        },
      ];
      const code = framework.getCodeString();
      expect((code.match(/retryFlutterAction\(driver,/g) || []).length).toBe(2);
      expect(code).toContain('"value":"First"');
      expect(code).toContain('"value":"Second"');
    });

    it('should include the retryFlutterAction retry helper in the boilerplate', function () {
      const serverUrlParts = {protocol: 'http', host: 'localhost', port: 4723, path: '/'};
      const framework = new JsWdIoFramework('http://localhost:4723', serverUrlParts, {});
      framework.actions = [];
      const code = framework.getCodeString(true);
      expect(code).toContain('async function retryFlutterAction(');
      expect(code).toContain('driver.getPageSource()');
      // A widget appium_handler.dart deliberately couldn't resolve (e.g. a raw coordinate tap
      // fallback) must read as not-found here, not as the literal string "null".
      expect(code).toContain("foundBy === 'null'");
    });

    it('should comment out an existence check when no Flutter finder was resolved', function () {
      const framework = new JsWdIoFramework();
      framework.actions = [{action: 'checkExistence', params: [undefined, undefined, TAP_POINTER_ACTIONS]}];
      const code = framework.getCodeString();
      expect(code).toContain('Could not resolve a widget to verify the existence of at this position');
      expect(code).not.toContain('performActions');
    });

    it('should render a checkText action the same way as checkExistence', function () {
      const framework = new JsWdIoFramework();
      framework.actions = [
        {
          action: 'checkText',
          params: [undefined, undefined, TAP_POINTER_ACTIONS, {foundBy: 'byText', value: 'YES', shouldExist: true}],
        },
      ];
      const code = framework.getCodeString();
      expect(code).toContain('"type":"checkExistence"');
      expect(code).toContain('"value":"YES"');
    });

    it('should render a shell command as an execSync call', function () {
      const framework = new JsWdIoFramework();
      framework.actions = [{action: 'shellCommand', params: ['ldb-cli qtest user kyc approval']}];
      const code = framework.getCodeString();
      expect(code).toContain('execSync("ldb-cli qtest user kyc approval", {stdio: \'inherit\'});');
    });

    it('should include the execSync import in the boilerplate', function () {
      const serverUrlParts = {protocol: 'http', host: 'localhost', port: 4723, path: '/'};
      const framework = new JsWdIoFramework('http://localhost:4723', serverUrlParts, {});
      framework.actions = [];
      const code = framework.getCodeString(true);
      expect(code).toContain("import {execSync} from 'node:child_process';");
    });
  });
});
