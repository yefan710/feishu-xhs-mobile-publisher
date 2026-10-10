'use strict';
const {readConfig}=require('../src/config.cjs');
const {createQueueService,createFeishuAdapter}=require('../src/services/queue.cjs');
async function main(){
  const c=readConfig();if(c.demo)throw new Error('请关闭演示模式再检查真实飞书。');
  const service=createQueueService({adapter:createFeishuAdapter(c.feishuFile),cacheDir:c.cacheDir,publicBase:c.publicURL+'/api/queue'});
  const list=await service.list({status:'all'});
  console.log(JSON.stringify({ok:true,accounts:list.accounts.length,jwNumbers:list.numbers.length,eligibleRecords:list.items.length,mode:'read-only'},null,2));
  console.log('字段、读表权限已通过；附件下载与写入权限仍须按 TESTING.md 做独立验收。');
}
main().catch(e=>{console.error(e.status?e.message:'配置或连接检查失败，未进行写入。');process.exitCode=1;});
