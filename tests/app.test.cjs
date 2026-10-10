'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),crypto=require('node:crypto');
const {createApp}=require('../src/app.cjs'),{demoResources}=require('../src/demo.cjs');
const {createQueueService}=require('../src/services/queue.cjs'),{readConfig}=require('../src/config.cjs');
async function setup(t){
  const resources=await demoResources();t.after(()=>fs.rm(resources.dir,{recursive:true,force:true}));
  const service=createQueueService({adapter:resources.adapter,cacheDir:resources.cacheDir,publicBase:'https://example.com/api/queue'});
  const app=createApp({service,accountsFile:resources.accountsFile,secret:crypto.randomBytes(32).toString('hex'),demo:true});
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base='http://127.0.0.1:'+server.address().port;
  async function call(url,method='GET',body,token){
    const r=await fetch(base+url,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
    return {r,data:await r.json()};
  }
  async function login(){return (await call('/api/login','POST',{username:'demo',password:'demo-only-password'})).data.data.token;}
  return {call,login,base,resources};
}
test('production fails closed on absent credentials and unsafe public URL',()=>{
  assert.throws(()=>readConfig({APP_PUBLIC_URL:'https://example.com'}),/SESSION_SECRET/);
  for(const url of ['http://example.com','https://u:p@example.com','https://example.com/path','https://example.com/?x=1'])
    assert.throws(()=>readConfig({APP_PUBLIC_URL:url,SESSION_SECRET:'x'.repeat(40)}));
  assert.equal(readConfig({APP_PUBLIC_URL:'https://example.com',SESSION_SECRET:'x'.repeat(40),TRUST_PROXY:'1'}).trustProxy,1);
  assert.throws(()=>readConfig({APP_PUBLIC_URL:'https://example.com',SESSION_SECRET:'x'.repeat(40),TRUST_PROXY:'true'}),/TRUST_PROXY/);
});
test('HTTP login → filter → prepare → public media → readback yes/no works with synthetic data',async t=>{
  const {call,login,base}=await setup(t),token=await login();
  const list=await call('/api/queue/records?account='+encodeURIComponent('演示账号A'),'GET',null,token);
  assert.equal(list.r.status,200,JSON.stringify(list.data));
  assert.equal(list.data.data.items.length,1);assert.equal(list.data.data.items[0].id,'recDemoA');
  const p=(await call('/api/queue/records/recDemoA/prepare','POST',null,token)).data.data;
  assert.equal(p.images.length,3);assert.equal(p.fingerprint,undefined);assert.equal(p.files,undefined);
  const image=await fetch(base+p.images[0]);assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');
  assert.equal(image.headers.get('cache-control'),'no-store');assert.equal(image.headers.get('x-content-type-options'),'nosniff');
  assert.equal(image.headers.get('cross-origin-resource-policy'),'cross-origin');
  const url='/api/queue/tasks/'+p.token+'/status';
  assert.equal((await call(url,'POST',{status:'是'},token)).data.data.verified,true);
  const after=(await call('/api/queue/records?status=all','GET',null,token)).data.data.items;
  assert.equal(after.find(r=>r.id==='recDemoA').status,'是');assert.equal(after.find(r=>r.id==='recDemoB').status,'否');
  assert.equal((await call(url,'POST',{status:'否'},token)).data.data.status,'否');
});
test('unauthenticated users cannot list, prepare or mutate; private files and traversal are inaccessible',async t=>{
  const {call,base}=await setup(t);
  for(const [url,method] of [['/api/queue/records','GET'],['/api/queue/records/recDemoA/prepare','POST'],['/api/queue/tasks/bad/status','POST']])
    assert.equal((await call(url,method)).r.status,403);
  for(const url of ['/.env','/data/feishu.json','/data/publish-accounts.json','/package.json','/src/server.cjs','/api/queue/media/bad/1']){
    const r=await fetch(base+url);assert.ok(r.status>=400);assert.doesNotMatch(await r.text(),/app_secret|demo-only-password|SESSION_SECRET=/);
  }
  assert.equal((await call('/api/login','POST',{username:'demo',password:'wrong'})).r.status,403);
});
test('disabling an account immediately revokes its existing session',async t=>{
  const {call,login,resources}=await setup(t),token=await login();
  const doc=JSON.parse(await fs.readFile(resources.accountsFile,'utf8'));doc.accounts[0].disabled=true;
  await fs.writeFile(resources.accountsFile,JSON.stringify(doc));
  assert.equal((await call('/api/queue/records','GET',null,token)).r.status,403);
});
test('invalid JSON does not echo credential fragments and login rate limiting is enforced',async t=>{
  const {base,call}=await setup(t);
  const r=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"password":"DO_NOT_ECHO_CREDENTIAL"'});
  assert.equal(r.status,400);assert.doesNotMatch(await r.text(),/DO_NOT_ECHO_CREDENTIAL/);
  let limited=false;for(let i=0;i<31;i++)if((await call('/api/login','POST',{username:'nobody',password:'wrong'})).r.status===429)limited=true;
  assert.equal(limited,true);
});
