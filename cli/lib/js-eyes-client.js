/**
 * JS-Eyes Client adapter.
 *
 * Keep this file as a thin ESM bridge to the current JS-Eyes SDK instead of
 * carrying a stale copied WebSocket client.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  BrowserAutomation,
  PolicyBlockError,
  ServerPolicyError,
} = require('@js-eyes/client-sdk');

const JsEyesClient = BrowserAutomation;

export {
  BrowserAutomation,
  JsEyesClient,
  PolicyBlockError,
  ServerPolicyError,
};

export default JsEyesClient;
