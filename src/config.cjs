'use strict';
const path = require('node:path');
require('dotenv').config({quiet:true});
function readConfig(env=process.env) {
  const demo = env.DEMO_MODE==='1' || process.argv.includes('--demo');
  const publicURL = String(env.APP_PUBLIC_URL || (demo?'https://demo.example.invalid':'')).replace(/\/$/,'');
  let parsed;try { parsed=new URL(publicURL); } catch { throw new Error('请配置 APP_PUBLIC_URL。'); }
  if(parsed.protocol!=='https:' || parsed.username || parsed.password || parsed.pathname!=='/' || parsed.search || parsed.hash)
    throw new Error('APP_PUBLIC_URL 必须是 HTTPS 网站根地址，不含路径、凭据或查询参数。');
  if(!demo && (!env.SESSION_SECRET || env.SESSION_SECRET.length<32))throw new Error('SESSION_SECRET 至少32字符，请先运行 npm run setup。');
  const port=Number(env.PORT||3000);
  if(!Number.isInteger(port)||port<0||port>65535)throw new Error('PORT 不正确。');
  const proxy=env.TRUST_PROXY||'loopback';
  if(!['loopback','1','false'].includes(proxy))throw new Error('TRUST_PROXY 只允许 loopback、1 或 false。');
  return {demo,publicURL,port,host:env.HOST||'127.0.0.1',secret:env.SESSION_SECRET,
    trustProxy:proxy==='1'?1:proxy==='false'?false:'loopback',
    feishuFile:path.resolve(env.FEISHU_CONFIG_FILE||'data/feishu.json'),
    accountsFile:path.resolve(env.PUBLISH_ACCOUNTS_FILE||'data/publish-accounts.json'),
    cacheDir:path.resolve(env.MEDIA_CACHE_DIR||'data/media')};
}
module.exports={readConfig};
