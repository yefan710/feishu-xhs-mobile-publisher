'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const base=path.join(__dirname,'../public');
class Element {
  constructor(){this.value='';this.children=[];this.attrs={};this.dataset={};this.listeners={};this.classList={toggle(){}};this.hidden=false;}
  addEventListener(name,fn){this.listeners[name]=fn;}
  setAttribute(k,v){this.attrs[k]=v;} getAttribute(k){return this.attrs[k]??null;} removeAttribute(k){delete this.attrs[k];}
  set href(v){this.attrs.href=v;} get href(){return this.attrs.href;}
  append(...values){this.children.push(...values);} replaceChildren(...values){this.children=values;}
  scrollIntoView(){} click(){throw new Error('Synthetic navigation must not be used');}
}
async function page() {
  const nodes=new Map(),writes=[];
  for(const [,id] of fs.readFileSync(path.join(base,'index.html'),'utf8').matchAll(/id="(queue-[^"]+)"/g))nodes.set(id,new Element());
  nodes.get('queue-status').value='否';nodes.get('queue-platform').value='auto';
  const row={id:'fixture-row',account:'fixture-account',jw:'JW12345',template:'fixture',mediaCount:18,status:'否',title:'中文标题'};
  const task={...row,body:'正文',tags:'#测试',token:'fixture-token',expiresAt:Date.now()+60000,
    images:Array.from({length:18},(_,i)=>`https://example.com/${i+1}.jpg`)};
  const storage=new Map([['fxmp-token','fixture']]);
  const context=vm.createContext({URL,URLSearchParams,TextEncoder,btoa,setTimeout,
    navigator:{userAgent:'Mozilla/5.0 (Linux; Android 13; vivo) VivoBrowser/19',platform:'Linux',maxTouchPoints:5},
    location:{hostname:'example.com'},Option:class{constructor(text,value){this.textContent=text;this.value=value;}},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    document:{getElementById:id=>nodes.get(id),createElement:()=>new Element(),addEventListener(){},hidden:false},
    XhsRequest:{json:async(url,options)=>{
      if(url.endsWith('/status')){writes.push(options);return new Promise(()=>{});}
      const data=url.endsWith('/prepare')?task:{accounts:[row.account],numbers:[row.jw],items:[row]};
      return {response:{ok:true},payload:{data}};
    }}});
  context.window=context;
  vm.runInContext(fs.readFileSync(path.join(base,'direct-route.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(base,'queue.js'),'utf8'),context);
  await new Promise(resolve=>setTimeout(resolve,0));
  await nodes.get('queue-list').children[0].listeners.click();
  return{nodes,writes};
}
test('a Vivo Android click preserves native Intent navigation while starting keepalive writeback',async()=>{
  const {nodes,writes}=await page(),link=nodes.get('queue-publish');
  const before=link.href;assert.match(before,/^intent:\/\/share_sdk\?data=/);
  assert.equal(link.getAttribute('aria-disabled'),'false');
  let prevented=false;link.listeners.click({preventDefault(){prevented=true;}});
  assert.equal(prevented,false);assert.equal(link.href,before,'writeback must not remove the clicked href');
  assert.equal(writes.length,1);assert.equal(writes[0].keepalive,true);assert.equal(JSON.parse(writes[0].body).status,'是');
});
test('manual Android alternate refreshes the link; incompatible selections prevent navigation and writes',async()=>{
  const {nodes,writes}=await page(),select=nodes.get('queue-platform'),link=nodes.get('queue-publish');
  select.value='android_scheme';select.listeners.change();assert.match(link.href,/^xhsdiscover:\/\/share_sdk\?data=/);
  select.value='ios';select.listeners.change();assert.equal(link.getAttribute('href'),null);
  let prevented=false;link.listeners.click({preventDefault(){prevented=true;}});
  assert.equal(prevented,true);assert.equal(writes.length,0);
});
