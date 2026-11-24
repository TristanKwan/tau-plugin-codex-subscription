import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mergeModels} from './src/tau-models.js';
test('repairs old and unavailable entries and adds selectable new entries',()=>{
  const p={api:'openai-completions',models:[{id:'old'},{id:'retired'},{id:'custom',input:['text'],reasoning:false}]};
  const list=[{id:'old',input:['text','image'],reasoning:true},{id:'new'},{id:'custom',reasoning:true}];
  mergeModels(p,list);
  assert.deepEqual(p.models.filter(m=>m.input.includes('image')).map(m=>m.id),['old']);
  assert.deepEqual(p.models.filter(m=>m.reasoning).map(m=>m.id),['old']);
  assert.equal(p.models.length,4);
  const snapshot=structuredClone(p);
  mergeModels(p,list);
  assert.deepEqual(p,snapshot);
});
test('registers legacy and new models with both Tau token budgets',()=>{
  const p={api:'openai-completions',models:[{id:'legacy'}, {id:'custom',contextWindow:4096,maxTokens:512}]};
  mergeModels(p,[{id:'legacy',contextWindow:500000},{id:'new',contextWindow:4096,maxTokens:1024},{id:'old-bridge'}]);
  assert.deepEqual(p.models.map(m=>[m.contextWindow,m.maxTokens]),[[500000,8192],[4096,512],[4096,1024],[32768,8192]]);
});
