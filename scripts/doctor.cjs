'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {readConfig}=require('../src/config.cjs'),{fieldMapping}=require('../src/services/queue.cjs');
async function main(){
  const c=readConfig();
  if(c.demo)throw new Error('doctor 用于生产配置，请关闭 DEMO_MODE。');
  if(c.publicURL.includes('example.'))throw new Error('请把示例域名换成真实域名。');
  const f=JSON.parse(await fs.readFile(c.feishuFile,'utf8'));
  if(!['app_id','app_secret','app_token','table_id'].every(k=>typeof f[k]==='string'&&f[k].trim()))throw new Error('飞书配置缺少必要值。');
  fieldMapping(f);
  const accounts=JSON.parse(await fs.readFile(c.accountsFile,'utf8'));
  if(!accounts.accounts?.some(a=>a.role==='xhs_publisher'&&!a.disabled&&a.salt&&a.hash))throw new Error('请先创建发布账号。');
  await fs.mkdir(c.cacheDir,{recursive:true,mode:0o700});
  const probe=path.join(c.cacheDir,'.write-probe-'+process.pid);await fs.writeFile(probe,'ok',{flag:'wx'});await fs.unlink(probe);
  console.log('本地配置和缓存写权限检查通过；此检查不证明公网可达、飞书权限或手机导入成功。');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
