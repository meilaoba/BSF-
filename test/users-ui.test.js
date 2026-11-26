import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/ui/pages/users.js'), 'utf8');

test('Add User save submits a vendor user without a frontend exception', async () => {
  let created = null;
  const alerts = [];
  const modal = { dataset:{ editIndex:'' }, remove(){ this.removed = true; } };
  const values = {
    'user-username-input':'TT',
    'user-email-input':'3310103205@qq.com',
    'user-mobile-input':'+852 9123 4567',
    'user-password-input':'password',
    'user-role-input':'User',
    'user-client-input':'client-1',
    'user-machine-input':'machine-1',
  };
  const page = { innerHTML:'' };
  const sandbox = {
    console,
    window:{
      BSF_API_CONFIG:{ enabled:true },
      BSF_API:{
        async createUser(payload){ created = payload; return { id:'user-1' }; },
        async updateUser(){ throw new Error('unexpected update'); },
      },
      BSF_LOAD_DIRECTORY_DATA:async () => true,
    },
    document:{
      getElementById(id){
        if(id === 'user-modal') return modal.removed ? null : modal;
        if(id === 'page-content') return page;
        return Object.prototype.hasOwnProperty.call(values, id) ? { value:values[id] } : null;
      },
    },
    alert(message){ alerts.push(String(message)); },
    currentClient:'',
    isClientScopedRole(){ return true; },
    bsfEscapeHtml(value){ return String(value ?? ''); },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename:'users.js' });

  await vm.runInContext('saveUserModal()', sandbox);

  assert.deepEqual(alerts, []);
  assert.deepEqual(JSON.parse(JSON.stringify(created)), {
    id:'',
    userName:'TT',
    email:'3310103205@qq.com',
    mobile:'+852 9123 4567',
    password:'password',
    role:'User',
    clientId:'client-1',
    status:'active',
  });
});

test('Add User validates a placeholder mobile inline before calling the backend', async () => {
  let createCalls = 0;
  const error = { textContent:'', style:{} };
  const input = {
    value:'1111111',
    style:{},
    setAttribute(name, value){ this[name] = String(value); },
    focus(){ this.focused = true; },
  };
  const values = {
    'user-username-input':'TT',
    'user-email-input':'user@example.com',
    'user-password-input':'password',
    'user-role-input':'User',
    'user-client-input':'client-1',
    'user-machine-input':'machine-1',
  };
  const modal = { dataset:{ editIndex:'' }, remove(){} };
  const sandbox = {
    console,
    window:{
      BSF_API_CONFIG:{ enabled:true },
      BSF_API:{
        async createUser(){ createCalls += 1; },
        async updateUser(){ throw new Error('unexpected update'); },
      },
    },
    document:{
      getElementById(id){
        if(id === 'user-modal') return modal;
        if(id === 'user-mobile-input') return input;
        if(id === 'user-mobile-error') return error;
        if(id === 'page-content') return { innerHTML:'' };
        return Object.prototype.hasOwnProperty.call(values, id) ? { value:values[id] } : null;
      },
    },
    alert(){ throw new Error('invalid mobile should use inline validation'); },
    currentClient:'',
    isClientScopedRole(){ return true; },
    clientEscape(value){ return String(value ?? ''); },
    bsfEscapeHtml(value){ return String(value ?? ''); },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename:'users.js' });

  await vm.runInContext('saveUserModal()', sandbox);

  assert.equal(createCalls, 0);
  assert.equal(error.textContent, 'Please enter a real phone number, not repeated digits');
  assert.equal(error.style.display, 'block');
  assert.equal(input['aria-invalid'], 'true');
  assert.equal(input.focused, true);
});

test('Add User can create a customer-scoped user without a machine', async () => {
  let created = null;
  const alerts = [];
  const modal = { dataset:{ editIndex:'' }, remove(){} };
  const values = {
    'user-username-input':'unassigned-user',
    'user-email-input':'user@example.com',
    'user-mobile-input':'+852 9123 4567',
    'user-password-input':'password',
    'user-role-input':'User',
    'user-client-input':'client-1',
    'user-machine-input':'',
  };
  const sandbox = {
    console,
    window:{
      BSF_API_CONFIG:{ enabled:true },
      BSF_API:{
        async createUser(payload){ created = payload; },
        async updateUser(){ throw new Error('unexpected update'); },
      },
      BSF_LOAD_DIRECTORY_DATA:async () => true,
    },
    document:{
      getElementById(id){
        if(id === 'user-modal') return modal;
        if(id === 'page-content') return { innerHTML:'' };
        return Object.prototype.hasOwnProperty.call(values, id) ? { value:values[id] } : null;
      },
    },
    alert(message){ alerts.push(String(message)); },
    currentClient:'',
    isClientScopedRole(){ return true; },
    clientEscape(value){ return String(value ?? ''); },
    bsfEscapeHtml(value){ return String(value ?? ''); },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename:'users.js' });

  await vm.runInContext('saveUserModal()', sandbox);

  assert.deepEqual(alerts, []);
  assert.equal(created.clientId, 'client-1');
  assert.equal(Object.prototype.hasOwnProperty.call(created, 'machineId'), false);
  assert.equal(created.role, 'User');
});

test('Add User can create a fully unassigned user when no customer is available', async () => {
  let created = null;
  const alerts = [];
  const modal = { dataset:{ editIndex:'' }, remove(){} };
  const values = {
    'user-username-input':'unassigned-user',
    'user-email-input':'user@example.com',
    'user-mobile-input':'+852 9123 4567',
    'user-password-input':'password',
    'user-role-input':'User',
    'user-client-input':'',
    'user-machine-input':'',
  };
  const sandbox = {
    console,
    window:{
      BSF_API_CONFIG:{ enabled:true },
      BSF_API:{
        async createUser(payload){ created = payload; },
        async updateUser(){ throw new Error('unexpected update'); },
      },
      BSF_LOAD_DIRECTORY_DATA:async () => true,
    },
    document:{
      getElementById(id){
        if(id === 'user-modal') return modal;
        if(id === 'page-content') return { innerHTML:'' };
        return Object.prototype.hasOwnProperty.call(values, id) ? { value:values[id] } : null;
      },
    },
    alert(message){ alerts.push(String(message)); },
    currentClient:'',
    isClientScopedRole(){ return true; },
    clientEscape(value){ return String(value ?? ''); },
    bsfEscapeHtml(value){ return String(value ?? ''); },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename:'users.js' });

  await vm.runInContext('saveUserModal()', sandbox);

  assert.deepEqual(alerts, []);
  assert.equal(created.clientId, null);
  assert.equal(Object.prototype.hasOwnProperty.call(created, 'machineId'), false);
  assert.equal(created.role, 'User');
});

test('mobile field contains the requested helper and immediate validation', () => {
  assert.match(source, /Please enter the account holder\\'s mobile number, including the country code if applicable, e\.g\. \+852 9123 4567/);
  assert.match(source, /oninput="validateUserMobileField\(\)"/);
  assert.match(source, /digits\.length===8/);
  assert.match(source, /digits\.length===11 && digits\.startsWith\('1'\)/);
});

test('user creation no longer exposes the redundant single-machine field', () => {
  assert.doesNotMatch(source, /Linked Machine/);
  assert.doesNotMatch(source, /user-machine-input/);
  assert.doesNotMatch(source, /machineId:machineId/);
  assert.match(source, /role:role,clientId:clientId \|\| null,status:statusValue/);
});

test('client admin Add User hides the linked customer field', () => {
  assert.match(source, /const clientAdmin = typeof currentRole !== 'undefined' && currentRole === 'client-admin'/);
  assert.match(source, /\(clientAdmin \? 'none' : 'block'\)/);
});

test('frontend mobile validation matches the backend acceptance cases', () => {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename:'users.js' });
  const validate = (value) => vm.runInContext(`userMobileValidationMessage(${JSON.stringify(value)})`, sandbox);

  assert.equal(validate('12345'), 'Phone number must be 6–15 digits');
  assert.equal(validate('+86abc'), 'Phone number can only contain digits and spaces, with an optional leading +');
  assert.equal(validate('1111111'), 'Please enter a real phone number, not repeated digits');
  assert.equal(validate('1234567890'), 'Cannot determine the country code; please include it, e.g. +852 or +86');
  assert.equal(validate('91234567'), '');
  assert.equal(validate('13812345678'), '');
  assert.equal(validate('+8613812345678'), '');
});

test('filtered client user rows keep their original record ids for edit and delete', () => {
  assert.match(source, /safe\.userId = String\(user\.id \|\| ''\)/);
  assert.match(source, /deleteUserRecord\(\\'' \+ u\.userId \+ '\\'\)/);
  assert.match(source, /userRecords\.findIndex\(function\(user\)\{ return String\(user\.id\) === String\(userRef\); \}\)/);
  assert.match(source, /if\(!user\.id\)\{ alert\('User record is incomplete\. Refresh the page and try again\.'\); return; \}/);
  assert.doesNotMatch(source, /onclick="deleteUserRecord\(\$\{i\}\)"/);
  assert.match(source, /userRecords\.splice\(index, 1\)/);
  assert.match(source, /Permanently delete user/);
  assert.match(source, /from BSF and the vendor system/);
  assert.match(source, /from BSF local records/);
  assert.match(source, /user\.statusValue === 'disabled'/);
});

test('user management exposes vendor account update and complete device assignment', () => {
  assert.match(source, /openUserAssignmentModal/);
  assert.match(source, /getUserAssignments\(user\.id\)/);
  assert.match(source, /setUserAssignments\(modal\.dataset\.userId, deviceIds\)/);
  assert.match(source, /The checked devices are the complete final assignment/);
  assert.match(source, /Permanently delete user/);
  assert.match(source, /from BSF and the vendor system/);
  assert.match(source, /id="user-username-input"[^>]*(?!readonly)/);
  assert.match(source, /id="user-status-input"/);
  assert.match(source, /status:statusValue/);
});

test('unmanaged vendor accounts expose a vendor-only delete action', () => {
  assert.match(source, /safe\.vendorUserId = String\(user\.vendorUserId \|\| ''\)/);
  assert.match(source, /deleteVendorUserRecord/);
  assert.match(source, /Delete Vendor Account/);
  assert.match(source, /There is no linked BSF user record/);
  assert.match(source, /window\.BSF_API\.deleteVendorUser\(vendorId\)/);
});

test('Add User opens the modal in create mode without a record id', () => {
  assert.match(source, /const isAdd = userRef === undefined \|\| userRef === null \|\| userRef === ''/);
  assert.match(source, /const index = isAdd\s*\? -1/);
  assert.match(source, /if\(!isAdd && typeof userRef !== 'number' && !isEdit\)/);
});

test('User form exposes one name field and uses Username as the display value', () => {
  assert.doesNotMatch(source, /Full Name/);
  assert.doesNotMatch(source, /user-name-input/);
  assert.match(source, />Username<\/th>/);
  assert.match(source, /userName:userName/);
});

test('device assignment modal loads assigned devices and submits the complete checked set', async () => {
  let assignmentRequest = null;
  let submitted = null;
  const alerts = [];
  const modal = {
    dataset:{},
    innerHTML:'',
    removed:false,
    querySelectorAll(){
      return [
        { dataset:{ deviceId:'30' } },
        { dataset:{ deviceId:'32' } },
      ];
    },
    remove(){ this.removed = true; },
  };
  const sandbox = {
    console,
    window:{
      BSF_API:{
        async getUserAssignments(id){
          assignmentRequest = id;
          return {
            assignedList:[{ id:30, deviceName:'Composter A', deviceSerialNum:'SN-A' }],
            unassignedList:[{ id:31, deviceName:'Composter B', deviceSerialNum:'SN-B' }],
          };
        },
        async setUserAssignments(id, deviceIds){
          submitted = { id, deviceIds };
        },
      },
    },
    document:{
      getElementById(id){
        if(id === 'page-content') return null;
        return modal.removed ? null : modal;
      },
      createElement(){ return modal; },
      body:{ appendChild(){} },
    },
    alert(message){ alerts.push(String(message)); },
    clientEscape(value){ return String(value ?? ''); },
    bsfEscapeHtml(value){ return String(value ?? ''); },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename:'users.js' });
  vm.runInContext(`userRecords = [{ id:'11111111-1111-4111-8111-111111111111', username:'child', name:'Child User' }]`, sandbox);

  await vm.runInContext("openUserAssignmentModal('11111111-1111-4111-8111-111111111111')", sandbox);
  assert.equal(assignmentRequest, '11111111-1111-4111-8111-111111111111');
  assert.match(modal.innerHTML, /Composter A/);
  assert.match(modal.innerHTML, /Composter B/);
  assert.match(modal.innerHTML, /data-device-id="30"/);
  assert.doesNotMatch(modal.innerHTML, /SN-A/);
  assert.doesNotMatch(modal.innerHTML, /SN-B/);

  await vm.runInContext('saveUserAssignments()', sandbox);
  assert.deepEqual(JSON.parse(JSON.stringify(submitted)), {
    id:'11111111-1111-4111-8111-111111111111',
    deviceIds:[30, 32],
  });
  assert.deepEqual(alerts, ['Device assignments updated']);
});
