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
    machineId:'machine-1',
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
  assert.equal(created.machineId, null);
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
  assert.equal(created.machineId, null);
  assert.equal(created.role, 'User');
});

test('mobile field contains the requested helper and immediate validation', () => {
  assert.match(source, /Please enter the account holder\\'s mobile number, including the country code if applicable, e\.g\. \+852 9123 4567/);
  assert.match(source, /oninput="validateUserMobileField\(\)"/);
  assert.match(source, /digits\.length===8/);
  assert.match(source, /digits\.length===11 && digits\.startsWith\('1'\)/);
});

test('machine options only show locally linked machines for the selected customer', () => {
  const sandbox = {
    scopedDevices(){
      return [
        { id:'VENDOR-ONLY', backendId:'', vendorDeviceId:'vendor-1', serial:'VENDOR-ONLY', clientId:'client-1' },
        { id:'SERIAL-LOCAL', backendId:'machine-2', vendorDeviceId:'vendor-2', serial:'SERIAL-LOCAL', clientId:'client-1' },
        { id:'OTHER-CLIENT', backendId:'machine-3', vendorDeviceId:'vendor-3', serial:'OTHER-CLIENT', clientId:'client-2' },
      ];
    },
    clientEscape(value){ return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename:'users.js' });

  const markup = sandbox.userMachineOptions('client-1', '');
  assert.doesNotMatch(markup, /VENDOR-ONLY/);
  assert.doesNotMatch(markup, /OTHER-CLIENT/);
  assert.match(markup, /<option value="machine-2">SERIAL-LOCAL<\/option>/);
});

test('machine selection stays empty until a customer is selected', () => {
  const sandbox = {
    scopedDevices(){ return [{ id:'SERIAL-LOCAL', backendId:'machine-2', clientId:'client-1' }]; },
    clientEscape(value){ return String(value ?? ''); },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename:'users.js' });

  const markup = sandbox.userMachineOptions('', '');
  assert.match(markup, /<option value="">Select machine<\/option>/);
  assert.doesNotMatch(markup, /SERIAL-LOCAL/);
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
  assert.match(source, /deleteUserRecord\('\$\{u\.userId\}'\)/);
  assert.match(source, /userRecords\.findIndex\(function\(user\)\{ return String\(user\.id\) === String\(userRef\); \}\)/);
  assert.match(source, /if\(!user\.id\)\{ alert\('User record is incomplete\. Refresh the page and try again\.'\); return; \}/);
  assert.doesNotMatch(source, /onclick="deleteUserRecord\(\$\{i\}\)"/);
  assert.match(source, /userRecords\.splice\(index, 1\)/);
  assert.match(source, /Permanently delete user/);
  assert.match(source, /The vendor account is not deleted/);
  assert.match(source, /user\.statusValue === 'disabled'/);
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
