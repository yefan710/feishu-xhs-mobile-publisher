'use strict';
// Synthetic fixtures only: no network calls, no real Feishu records or materials.
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {hashPassword}=require('./services/accounts.cjs');
const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ2kAAAAASUVORK5CYII=','base64');
function createDemoAdapter() {
  const fields=['课件编号','账户名称','使用模板名','笔记标题','笔记正文','笔记标签'].map(field_name=>({field_name,type:1}));
  fields.push({field_name:'图片/视频',type:17,field_id:'fldDemoMedia'},
    {field_name:'是否发布',type:3,property:{options:[{name:'是'},{name:'否'}]}});
  const row=(id,account,jw,status)=>({record_id:id,fields:{'课件编号':jw,'账户名称':account,'使用模板名':'演示模板',
    '笔记标题':'演示素材 '+jw,'笔记正文':'这是模拟记录，仅验证筛选与回写；图片为占位像素。\n不连接真实飞书。',
    '笔记标签':'#演示 #课件','是否发布':status,'图片/视频':Array.from({length:3},(_,i)=>({name:`demo_${i+1}.png`,file_token:'demo'+i}))}});
  const records=[row('recDemoA','演示账号A','JW10001','否'),row('recDemoB','演示账号B','JW10001','否'),row('recDemoC','演示账号A','JW10002','是')];
  return {fields:async()=>structuredClone(fields),records:async()=>structuredClone(records),
    get:async id=>structuredClone(records.find(r=>r.record_id===id)),
    update:async(id,values)=>Object.assign(records.find(r=>r.record_id===id).fields,values),
    download:async()=>({bytes:image,type:'image/png'})};
}
async function demoResources() {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fxmp-demo-'));
  const accountsFile=path.join(dir,'accounts.json');
  await fs.writeFile(accountsFile,JSON.stringify({accounts:[{username:'demo',role:'xhs_publisher',...await hashPassword('demo-only-password')}]}),{mode:0o600});
  return {dir,accountsFile,cacheDir:path.join(dir,'media'),adapter:createDemoAdapter()};
}
module.exports={createDemoAdapter,demoResources};
