import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stateSource = fs.readFileSync(path.join(root, 'src/ui/state.js'), 'utf8');
const usersSource = fs.readFileSync(path.join(root, 'src/ui/pages/users.js'), 'utf8');

test('ordinary users can see every machine in their assigned machine list', () => {
  const sandbox = {
    window:{},
    devices:[],
    userRecords:[],
  };
  vm.createContext(sandbox);
  vm.runInContext(stateSource, sandbox, { filename:'state.js' });
  vm.runInContext(`
    currentRole = 'user';
    currentUsername = 'user-a';
    currentClient = '';
    currentMachineId = '';
    window.BSF_USER_PROFILE = { machineIds:['machine-a', 'machine-b'] };
    devices = [
      { id:'KW-A', backendId:'machine-a', client:'Client A' },
      { id:'KW-B', backendId:'machine-b', client:'Client A' },
      { id:'KW-C', backendId:'machine-c', client:'Client A' }
    ];
  `, sandbox);

  const devices = vm.runInContext('scopedDevices()', sandbox);
  assert.deepEqual(JSON.parse(JSON.stringify(devices.map((device) => device.id))), ['KW-A', 'KW-B']);
  assert.equal(vm.runInContext('currentUserHasMachineAssignment()', sandbox), true);
});

test('user management shows multiple assigned devices and does not overwrite them from edit form', () => {
  assert.match(usersSource, /safe\.assignedDevices = \(user\.machineNames \|\| \[\]\)/);
  assert.match(usersSource, />Assigned Devices<\/th>/);
  assert.doesNotMatch(usersSource, /Linked Machine/);
  assert.doesNotMatch(usersSource, /user-machine-input/);
});
