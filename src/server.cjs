'use strict';
const crypto=require('node:crypto'),fs=require('node:fs/promises');
const {readConfig}=require('./config.cjs'),{createApp}=require('./app.cjs');
const {createQueueService,createFeishuAdapter}=require('./services/queue.cjs');
async function main() {
  const c=readConfig();let demo;
  if(c.demo){demo=await require('./demo.cjs').demoResources();c.accountsFile=demo.accountsFile;c.cacheDir=demo.cacheDir;}
  const service=createQueueService({adapter:demo?.adapter||createFeishuAdapter(c.feishuFile),cacheDir:c.cacheDir,publicBase:c.publicURL+'/api/queue'});
  const app=createApp({service,accountsFile:c.accountsFile,secret:c.secret||crypto.randomBytes(32).toString('hex'),trustProxy:c.trustProxy,demo:c.demo});
  const timer=setInterval(()=>service.cleanExpired().catch(()=>{}),15*60*1000);timer.unref();
  await service.cleanExpired();
  const server=app.listen(c.port,c.host,()=>console.log(`发布工作台已启动：http://${c.host}:${server.address().port}${c.demo?'（仅模拟数据：demo / demo-only-password）':''}`));
  server.on('error',()=>{console.error('监听失败，请检查端口和 HOST。');process.exitCode=1;});
  let closing=false;
  async function close(){if(closing)return;closing=true;clearInterval(timer);server.close(async()=>{if(demo)await fs.rm(demo.dir,{recursive:true,force:true});});}
  process.on('SIGTERM',close);process.on('SIGINT',close);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
