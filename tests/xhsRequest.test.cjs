const {test}=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const target=path.join(__dirname,'../public/request.js');
function load(fetch,extras={}) {
 const context=vm.createContext({fetch,setTimeout,clearTimeout,AbortController,AbortSignal:{},...extras});
 if(fs.existsSync(target))vm.runInContext(fs.readFileSync(target,'utf8'),context);
 assert.equal(typeof context.XhsRequest?.json,'function','missing legacy-browser request helper');return context.XhsRequest;
}
test('an older browser without AbortSignal.timeout still fetches and decodes JSON',async()=>{
 const options={method:'POST',keepalive:true,headers:{Authorization:'Bearer fixture'},body:'{}'};let actual;
 const helper=load(async(url,opts)=>{actual=opts;return{ok:true,status:200,json:async()=>({data:{verified:true}})};});
 const result=await helper.json('/status',options,1000);
 assert.equal(result.payload.data.verified,true);assert.equal(result.response.status,200);assert.equal(actual.keepalive,true);assert.equal(actual.body,'{}');
});
test('timeout aborts pending fetch and reports a readable error',async()=>{
 let signal;const helper=load((url,opts)=>{signal=opts.signal;return new Promise(()=>{});});
 await assert.rejects(helper.json('/slow',{},10),/超时/);assert.equal(signal.aborted,true);
});
test('slow JSON body parsing is also covered by the timeout',async()=>{
 const helper=load(async()=>({json:()=>new Promise(()=>{})}));
 await assert.rejects(helper.json('/slow-body',{},10),/超时/);
});
test('request remains usable without AbortController and falls back to a bounded wait',async()=>{
 const helper=load(async()=>({json:async()=>({ok:true})}),{AbortController:undefined});
 assert.equal((await helper.json('/ok',{},100)).payload.ok,true);
 const slow=load(()=>new Promise(()=>{}),{AbortController:undefined});await assert.rejects(slow.json('/slow',{},10),/超时/);
});
test('completed requests cancel their timeout and preserve non-timeout failures',async()=>{
 let cancelled=0;const helper=load(async()=>({json:async()=>({ok:true})}),{setTimeout:()=>77,clearTimeout:id=>{assert.equal(id,77);cancelled++;}});
 await helper.json('/ok',{},100);assert.equal(cancelled,1);
 const failure=load(async()=>{throw new Error('network fixture');});await assert.rejects(failure.json('/fail',{},100),/network fixture/);
});
