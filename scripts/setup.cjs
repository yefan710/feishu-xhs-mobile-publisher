'use strict';
const fs=require('node:fs/promises'),crypto=require('node:crypto'),path=require('node:path');
async function main(){
  await fs.mkdir('data',{recursive:true,mode:0o700});
  const i=process.argv.indexOf('--public-url'),url=i>=0?process.argv[i+1]:'https://publish.example.com';
  if(!url||!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(url))throw new Error('--public-url 需要 HTTPS 根地址。');
  let template=await fs.readFile('.env.example','utf8');
  template=template.replace('SESSION_SECRET=','SESSION_SECRET='+crypto.randomBytes(32).toString('hex'))
    .replaceAll('https://publish.example.com',url).replace('APP_DOMAIN=publish.example.com','APP_DOMAIN='+new URL(url).hostname);
  for(const [file,content] of [['.env',template],['data/feishu.json',await fs.readFile('config/feishu.example.json','utf8')]]){
    try{await fs.writeFile(file,content,{flag:'wx',mode:0o600});console.log('已创建 '+file+'（内容不输出）');}
    catch(e){if(e.code!=='EEXIST')throw e;console.log('保留已有 '+file);}
  }
  console.log('下一步：填写 data/feishu.json，创建发布账号，然后运行 npm run check:feishu。');
}
main().catch(()=>{console.error('初始化失败，请检查参数与目录权限。');process.exitCode=1;});
