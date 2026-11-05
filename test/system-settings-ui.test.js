import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/ui/pages/system.js'), 'utf8');

test('Settings exposes device-level GHG configuration fields', () => {
  assert.match(source, /id="ghg-machine-select"/);
  assert.match(source, />HK Island</);
  assert.match(source, />Non-HK Island</);
  assert.match(source, /id="ghg-solar"/);
  assert.match(source, /id="ghg-monthly-distance"/);
  assert.match(source, /saveGhgConfiguration/);
  assert.doesNotMatch(source, /id="ghg-formula"/);
});

test('Settings saves the selected machine GHG values through the local backend', async () => {
  const alerts = [];
  let saved = null;
  const device = {
    id:'365701012616B60D',
    backendId:'machine-1',
    vendorDeviceId:'501',
    region:'',
    ghgFormula:{},
  };
  const values = {
    'ghg-machine-select':{ value:'501' },
    'ghg-region':{ value:'hk' },
    'ghg-solar':{ value:'true' },
    'ghg-monthly-distance':{ value:'140' },
  };
  const sandbox = {
    console,
    devices:[device],
    bsfEscapeHtml(value){ return String(value ?? ''); },
    document:{
      getElementById(id){
        return Object.prototype.hasOwnProperty.call(values, id) ? values[id] : null;
      },
    },
    window:{
      BSF_API_CONFIG:{ enabled:true },
      BSF_API:{
        async saveGhgConfiguration(payload){ saved = payload; return {}; },
      },
    },
    alert(message){ alerts.push(String(message)); },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename:'system.js' });

  await vm.runInContext("saveSystemSetting('ghg')", sandbox);

  assert.deepEqual(JSON.parse(JSON.stringify(saved)), {
    machineId:'machine-1',
    vendorDeviceId:'501',
    region:'hk',
    solar:true,
    monthlyDistanceKm:140,
  });
  assert.deepEqual(alerts, ['Settings saved']);
  assert.equal(device.region, 'hk');
  assert.deepEqual({ ...device.ghgFormula }, { solar:true, monthlyDistanceKm:140 });
});
