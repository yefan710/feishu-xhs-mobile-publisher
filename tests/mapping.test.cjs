'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fieldMapping,mapRecord}=require('../src/services/queue.cjs');
test('mapped fields preserve canonical identity without leaking unmapped table content',()=>{
  const mapping=fieldMapping({fields:{'课件编号':'JW编号','账户名称':'账号','是否发布':'发布完成'}});
  const result=mapRecord({record_id:'recX',fields:{JW编号:'JW123',账号:'A',发布完成:'否',私人备注:'private'}},mapping);
  assert.equal(result.fields['课件编号'],'JW123');assert.equal(result.fields['是否发布'],'否');
  assert.equal(result.fields['私人备注'],undefined);assert.equal(result.record_id,'recX');
});
test('duplicate or empty mapped fields fail before remote changes',()=>{
  assert.throws(()=>fieldMapping({fields:{'课件编号':'账户名称'}}),/映射/);
  assert.throws(()=>fieldMapping({fields:{'笔记正文':''}}),/映射/);
});
