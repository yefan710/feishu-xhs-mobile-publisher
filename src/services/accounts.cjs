'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {promisify}=require('node:util');
const scrypt=promisify(crypto.scrypt);
async function hashPassword(password) {
  const salt=crypto.randomBytes(16).toString('hex');
  const hash=(await scrypt(password,salt,64)).toString('hex');
  return{salt,hash};
}
const version=a=>crypto.createHash('sha256').update(a.salt+':'+a.hash).digest('hex');
function createAccountService(options={}) {
  const env=options.env || process.env;
  async function accounts() {
    const file=options.accountsFile || env.PUBLISH_ACCOUNTS_FILE || path.resolve('data/publish-accounts.json');
    try {
      const data=JSON.parse(await fs.readFile(file,'utf8'));
      if(!Array.isArray(data.accounts))throw new Error();return data.accounts;
    }catch(e){if(e.code==='ENOENT')return[];throw new Error('发布账号配置无法读取，请联系管理员。');}
  }
  function valid(a) {return a && a.role==='xhs_publisher' && a.disabled!==true && /^[a-f0-9]{32}$/.test(a.salt || '') && /^[a-f0-9]{128}$/.test(a.hash || '');}
  return{
    async authenticate(username,password) {
      if(typeof username!=='string'||typeof password!=='string'||!username||!password||username.length>128||password.length>512)return null;
      const found=(await accounts()).filter(a=>a.username===username);
      if(found.length!==1 || !valid(found[0]))return null;
      const a=found[0], actual=await scrypt(password,a.salt,64);
      if(!crypto.timingSafeEqual(actual,Buffer.from(a.hash,'hex')))return null;
      return{role:'xhs_publisher',username,authVersion:version(a)};
    },
    async isPublisher(identity) {
      if(identity?.role!=='xhs_publisher')return false;
      const found=(await accounts()).filter(a=>a.username===identity.username);
      return found.length===1 && valid(found[0]) && identity.authVersion===version(found[0]);
    },
  };
}
module.exports={hashPassword,createAccountService};
