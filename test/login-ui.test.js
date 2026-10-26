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
