import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const router = fs.readFileSync(path.join(root, 'src/ui/router.js'), 'utf8');

test('login screen does not ask the user to select a role', () => {
  assert.doesNotMatch(html, /id="role-select"/);
  assert.doesNotMatch(router, /role-select/);
});

test('login screen uses an eye icon for password visibility', () => {
  assert.match(html, /id="login-password-toggle"/);
  assert.match(html, /id="login-password-eye"/);
  assert.match(html, /id="login-password-eye-off"/);
  assert.doesNotMatch(html, />Show<\/button>|>Hide<\/button>/);
  assert.match(router, /function togglePasswordVisibility\(\)/);
  assert.match(router, /function setPasswordEyeState\(visible\)/);
  assert.match(router, /input\.type = show \? 'text' : 'password'/);
});

test('login failures render inline instead of using browser alerts', () => {
  assert.match(html, /id="login-error"/);
  assert.match(router, /function setLoginError\(/);
  assert.doesNotMatch(router, /alert\('Sign in failed:/);
});

test('session restore shows a loading view before login or the application', () => {
  assert.match(html, /id="auth-loading-screen"/);
  assert.match(html, /id="auth-loading-text"[^>]*>Loading system/);
  assert.match(html, /id="login-screen" style="display:none/);
  assert.match(router, /setAuthView\('loading'/);
  assert.match(router, /isAuthenticationFailure/);
  assert.match(router, /isRetryableSessionError/);
});

test('authenticated startup keeps the loading view until the first page is rendered', () => {
  const startup = router.match(/async function enterAuthenticatedApp[\s\S]*?async function login\(/);
  assert.ok(startup);
  assert.match(startup[0], /setAuthView\('loading', 'Loading system data\.\.\.'\)/);
  assert.match(startup[0], /await loadDataForCurrentRole\(\)/);
  assert.match(startup[0], /navigate\('machines'\)[\s\S]*setAuthView\('app'\)/);
});
