'use strict';
require('dotenv').config({quiet:true});
const fs=require('node:fs/promises'),path=require('node:path');
const {hashPassword}=require('../src/services/accounts.cjs');
function hiddenPassword(){
  if(!process.stdin.isTTY||!process.stdin.setRawMode)throw new Error('非交互运行请通过 PUBLISH_PASSWORD 环境变量提供密码，禁止命令行密码参数。');
  process.stdout.write('发布密码（输入隐藏）：');
  return new Promise((resolve,reject)=>{
    let value='';process.stdin.setRawMode(true);process.stdin.resume();process.stdin.setEncoding('utf8');
    const done=()=>{process.stdin.setRawMode(false);process.stdin.pause();process.stdin.removeListener('data',onData);process.stdout.write('\n');};
    const onData=data=>{for(const char of data){
      if(char==='\u0003'){done();reject(new Error('已取消。'));return;}
      if(char==='\r'||char==='\n'){done();resolve(value);return;}
      if(char==='\u007f'||char==='\b')value=value.slice(0,-1);
      else if(char>=' ')value+=char;
    }};
    process.stdin.on('data',onData);
  });
}
async function main(){
  const args=process.argv.slice(2),i=args.indexOf('--username'),username=args[i+1];
  if(i<0||!username||!/^[-_a-zA-Z0-9.@]{1,128}$/.test(username))throw new Error('使用 --username 设置英文、数字或 ._@- 登录名。');
  if(args.some(v=>v.startsWith('--password')))throw new Error('禁止通过命令行参数传密码。');
  const password=process.env.PUBLISH_PASSWORD||await hiddenPassword();delete process.env.PUBLISH_PASSWORD;
  if(password.length<12||password.length>512)throw new Error('密码长度需要12–512字符。');
  const file=path.resolve(process.env.PUBLISH_ACCOUNTS_FILE||'data/publish-accounts.json');
  let doc;try{doc=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw new Error('已有账号文件无法读取，未覆盖。');doc={accounts:[]};}
  if(!Array.isArray(doc.accounts))throw new Error('账号文件格式不正确。');
  if(doc.accounts.some(a=>a.username===username)&&!args.includes('--replace'))throw new Error('账号已存在；明确使用 --replace 才会更新密码并撤销旧登录。');
  doc.accounts=doc.accounts.filter(a=>a.username!==username);
  doc.accounts.push({username,role:'xhs_publisher',...await hashPassword(password)});
  await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});
  const temp=file+'.tmp-'+process.pid;
  await fs.writeFile(temp,JSON.stringify(doc,null,2)+'\n',{mode:0o600});await fs.rename(temp,file);
  console.log('发布账号已保存（只存加盐哈希，未输出密码）。');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
