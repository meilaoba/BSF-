import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const state = fs.readFileSync(path.join(root, 'src/ui/state.js'), 'utf8');
const router = fs.readFileSync(path.join(root, 'src/ui/router.js'), 'utf8');

test('an unassigned user is limited to the Account page', () => {
  assert.match(state, /function currentUserHasMachineAssignment\(\)/);
  assert.match(state, /currentRole === 'user' && !currentUserHasMachineAssignment\(\)/);
  assert.match(state, /id:'account',label:'Account'/);
  assert.match(router, /navigate\(currentRole === 'user' && !currentUserHasMachineAssignment\(\) \? 'account' : 'machines'\)/);
});

test('an unassigned user does not load device data', () => {
  assert.match(router, /if\(currentRole === 'user' && !currentUserHasMachineAssignment\(\)\)\{[\s\S]*devices\.splice\(0, devices\.length\)/);
  assert.match(router, /if\(currentRole === 'user' && !currentUserHasMachineAssignment\(\)\) return false;/);
});
