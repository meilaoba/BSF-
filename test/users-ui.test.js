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
    'user-name-input':'TT',
    'user-email-input':'3310103205@qq.com',
    'user-mobile-input':'1783773595',
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
    fullName:'TT',
    email:'3310103205@qq.com',
    mobile:'1783773595',
    password:'password',
    role:'User',
    clientId:'client-1',
    machineId:'machine-1',
    status:'active',
  });
});

test('filtered client user rows keep their original record ids for edit and delete', () => {
  assert.match(source, /safe\.userId = String\(user\.id \|\| ''\)/);
  assert.match(source, /deleteUserRecord\('\$\{u\.userId\}'\)/);
  assert.match(source, /userRecords\.findIndex\(function\(user\)\{ return String\(user\.id\) === String\(userRef\); \}\)/);
  assert.match(source, /if\(!user\.id\)\{ alert\('User record is incomplete\. Refresh the page and try again\.'\); return; \}/);
  assert.doesNotMatch(source, /onclick="deleteUserRecord\(\$\{i\}\)"/);
  assert.match(source, /userRecords\.splice\(index, 1\)/);
});
