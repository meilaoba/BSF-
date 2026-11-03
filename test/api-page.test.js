import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/ui/pages/api.js'), 'utf8');
const calls = [];
const sandbox = {
  console,
  window:{
    BSF_API:{
      async getVendorTemplates(params){
        calls.push(params);
        return {
          templates: [{
            id: 38,
            templateName: 'Mitsubishi_SS_CZ',
            points: [{
              id: 382,
              keyName: 'SingleAddMaterial',
              dataType: 5,
              reportsChanges: 1,
              unit: 'kg',
              iconId: 14,
              templateId: 38,
              showType: 2,
              sensorName: 'Single Feeding',
              sort: 1,
              customize: [{ color: '#ef4444', value: 0, label: 'Stop' }],
            }],
          }],
          pagination: { total: 1, current: 1, size: 10, pages: 1 },
        };
      },
    },
  },
  document:{
    getElementById(id){
      return id === 'api-template-section' ? { replaceWith(){} } : null;
    },
    createElement(){
      const wrapper = {};
      Object.defineProperty(wrapper, 'innerHTML', {
        set(value) {
          wrapper.firstElementChild = { markup:value };
        },
      });
      return wrapper;
    },
  },
  devices:[],
  rawDataRows:[],
  apiFilters:{ client:'', machine:'' },
  bsfEscapeHtml(value){
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
    })[character]);
  },
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename:'api.js' });

test('vendor templates render mapped point metadata', () => {
  vm.runInContext(`
    apiTemplateState.items = [{
      id: 38,
      templateName: 'Mitsubishi_SS_CZ',
      points: [{
        id: 382,
        keyName: 'SingleAddMaterial',
        dataType: 5,
        reportsChanges: 1,
        unit: 'kg',
        iconId: 14,
        templateId: 38,
        showType: 2,
        sensorName: 'Single Feeding',
        sort: 1,
        customize: [{ color: '#ef4444', value: 0, label: 'Stop' }]
      }]
    }];
    apiTemplateState.pagination = { total: 1, current: 1, size: 10, pages: 1 };
  `, sandbox);
  const markup = vm.runInContext('apiTemplateSectionMarkup()', sandbox);

  assert.match(markup, /Vendor Templates/);
  assert.match(markup, /Mitsubishi_SS_CZ/);
  assert.match(markup, /Single Feeding/);
  assert.match(markup, /SingleAddMaterial/);
  assert.match(markup, /kg/);
  assert.match(markup, /Value/);
  assert.match(markup, /Report changes/);
  assert.match(markup, /Stop: 0 \[#ef4444\]/);
});

test('template page requests the dedicated backend endpoint with pagination', async () => {
  calls.length = 0;
  vm.runInContext(`
    apiTemplateState.page = 1;
    apiTemplateState.items = [];
    apiTemplateState.loaded = false;
    apiTemplateState.error = '';
  `, sandbox);
  await vm.runInContext('loadApiTemplates(true)', sandbox);

  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{ pageNum:1, pageSize:10 }]);
  const state = vm.runInContext('({ loaded:apiTemplateState.loaded, page:apiTemplateState.page, total:apiTemplateState.pagination.total })', sandbox);
  assert.deepEqual(JSON.parse(JSON.stringify(state)), { loaded:true, page:1, total:1 });
});
