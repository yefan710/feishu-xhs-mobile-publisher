'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),axios=require('axios');
const {createFeishuAdapter}=require('../src/services/queue.cjs');
test('Feishu adapter maps actual columns, paginates, writes only mapped status and downloads with attachment extra',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fxmp-adapter-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const file=path.join(dir,'feishu.json');
  await fs.writeFile(file,JSON.stringify({app_id:'fixture-app',app_secret:'fixture-secret',app_token:'fixture-base',table_id:'tblFixture',fields:{'课件编号':'编号','是否发布':'发布状态','图片/视频':'图'}}));
  const prior=axios.defaults.adapter;t.after(()=>axios.defaults.adapter=prior);
  const record={record_id:'recFixture',fields:{编号:'JW10001',账户名称:'A',图:[{file_token:'fixture-file',name:'a.png'}],发布状态:'否',私有附加列:'excluded'}};
  let tokenCalls=0,update,extra,fieldPages=0;
  axios.defaults.adapter=async c=>{
    let data;
    if(c.url.endsWith('/tenant_access_token/internal')){tokenCalls++;data={code:0,tenant_access_token:'fixture-token',expire:7200};}
    else if(c.url.endsWith('/fields')){
      fieldPages++;data={code:0,data:c.params.page_token?{items:[{field_name:'发布状态',type:3}]}:
        {items:[{field_name:'编号',type:1},{field_name:'课件编号',type:3}],has_more:true,page_token:'next'}};
    }else if(c.url.endsWith('/medias/fixture-file/download')){extra=JSON.parse(c.params.extra);return {status:200,statusText:'OK',headers:{'content-type':'image/png'},config:c,data:Buffer.from([1,2,3])};}
    else if(c.method==='put'){update=JSON.parse(c.data).fields;data={code:0,data:{record}};}
    else data={code:0,data:c.url.endsWith('/records')?{items:[record]}:{record}};
    return {status:200,statusText:'OK',headers:{},config:c,data};
  };
  const adapter=createFeishuAdapter(file);
  assert.deepEqual((await adapter.fields()).map(f=>f.field_name),['课件编号','是否发布']);assert.equal(fieldPages,2);
  const mapped=(await adapter.records())[0];assert.equal(mapped.fields['课件编号'],'JW10001');assert.equal(mapped.fields['私有附加列'],undefined);
  assert.equal((await adapter.get('recFixture')).fields['是否发布'],'否');
  await adapter.update('recFixture',{'是否发布':'是'});assert.deepEqual(update,{'发布状态':'是'});
  const media=await adapter.download(mapped,'fldFixture',mapped.fields['图片/视频'][0]);assert.equal(media.type,'image/png');
  assert.deepEqual(extra,{bitablePerm:{tableId:'tblFixture',attachments:{fldFixture:{recFixture:['fixture-file']}}}});
  assert.equal(tokenCalls,1);
});
test('Feishu transport failure sanitizes secret-bearing Axios errors',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fxmp-adapter-error-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const file=path.join(dir,'feishu.json');await fs.writeFile(file,JSON.stringify({app_id:'fixture',app_secret:'fixture',app_token:'fixture',table_id:'fixture'}));
  const prior=axios.defaults.adapter;t.after(()=>axios.defaults.adapter=prior);
  axios.defaults.adapter=async()=>{throw new Error('DO_NOT_EXPOSE_SECRET_HEADER');};
  await assert.rejects(createFeishuAdapter(file).records(),e=>e.status===502&&!e.message.includes('DO_NOT_EXPOSE'));
});
