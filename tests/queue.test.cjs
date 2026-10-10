const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
let createQueueService;
try { ({createQueueService}=require('../src/services/queue.cjs')); } catch(e) { if(e.code!=='MODULE_NOT_FOUND')throw e; }
const fields=['课件编号','账户名称','使用模板名','笔记标题','笔记正文','笔记标签'].map(field_name=>({field_name,type:1}));
fields.push({field_name:'图片/视频',field_id:'fldMedia',type:17},{field_name:'是否发布',type:3,property:{options:[{name:'是'},{name:'否'}]}});
const row=(id,account,jw,status='否')=>({record_id:id,fields:{'账户名称':account,'课件编号':jw,'使用模板名':'模板3','是否发布':status,'笔记标题':'中文🌟标题','笔记正文':'正文\n第二行','笔记标签':'#教育 #课件','图片/视频':Array.from({length:18},(_,i)=>({file_token:'file'+i,name:`note_${i+1}.png`}))}});
async function setup(t){
  assert.equal(typeof createQueueService,'function','missing Feishu queue service');
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'xhs-queue-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const records=[row('recA','账号A','JW10001'),row('recB','账号B','JW10001'),row('recC','账号A','JW10002','是'),{record_id:'recEmpty',fields:{}}];
  const writes=[];let downloads=0;
  const adapter={fields:async()=>fields,records:async()=>records,get:async id=>structuredClone(records.find(r=>r.record_id===id)),update:async(id,values)=>{writes.push({id,values});Object.assign(records.find(r=>r.record_id===id).fields,values);},download:async()=>{downloads++;return {bytes:Buffer.from('89504e470d0a1a0a','hex'),type:'image/png'};}};
  let time=Date.now();const service=createQueueService({adapter,cacheDir:dir,publicBase:'https://api.example.test/api/queue',now:()=>time,ttlMs:10000});
  return{service,adapter,records,writes,downloads:()=>downloads,advance:()=>time+=11000};
}
test('default pending filter and account/JW intersections keep distinct Feishu rows',async t=>{
  const {service}=await setup(t);const all=await service.list({});assert.equal(all.items.length,2);assert.deepEqual(all.accounts,['账号A','账号B']);
  assert.equal((await service.list({account:'账号A',jw:'JW10001'})).items[0].id,'recA');
  assert.equal((await service.list({status:'是'})).items[0].id,'recC');
  assert.equal((await service.list({account:'账号B',jw:'JW10002'})).items.length,0);
});
test('preparation preserves all 18 media in order behind expiring public URLs',async t=>{
  const {service,downloads,advance}=await setup(t);const p=await service.prepare('recA');
  assert.equal(p.images.length,18);assert.equal(downloads(),18);assert.match(p.images[0],/^https:\/\/api.example.test/);
  assert.equal(p.images[17].endsWith('/18'),true);assert.equal(p.body,'正文\n第二行');
  assert.equal((await service.media(p.token,1)).type,'image/png');
  advance();await assert.rejects(service.media(p.token,1),/过期/);await assert.rejects(service.setStatus(p.token,'是'),/过期/);
});
test('idempotent status writes affect only the selected record and only 是否发布, with readback',async t=>{
  const {service,records,writes}=await setup(t);const p=await service.prepare('recA');
  const before=structuredClone(records);
  assert.equal((await service.setStatus(p.token,'是')).status,'是');await service.setStatus(p.token,'是');
  assert.deepEqual(writes,[{id:'recA',values:{'是否发布':'是'}}]);
  assert.deepEqual(records[1],before[1]);assert.equal(records[0].fields['笔记正文'],before[0].fields['笔记正文']);
  assert.equal((await service.setStatus(p.token,'否')).status,'否');
});
test('changed materials reject stale prepared tasks before any status write',async t=>{
  const {service,records,writes}=await setup(t);const p=await service.prepare('recA');records[0].fields['账户名称']='改名';
  await assert.rejects(service.setStatus(p.token,'是'),/变化/);assert.equal(writes.length,0);
  await assert.rejects(service.prepare('../recA'),/记录/);await assert.rejects(service.media('../bad',1),/凭证/);
});
test('video and incomplete materials are blocked without truncating or silent substitution',async t=>{
  const {service,records}=await setup(t);records[0].fields['图片/视频'][0].name='video.mp4';
  await assert.rejects(service.prepare('recA'),/图文/);
});
test('an upstream write that does not persist cannot be reported as verified',async t=>{
  const {service,adapter}=await setup(t);const p=await service.prepare('recA');adapter.update=async()=>{};
  await assert.rejects(service.setStatus(p.token,'是'),/回读/);
});
