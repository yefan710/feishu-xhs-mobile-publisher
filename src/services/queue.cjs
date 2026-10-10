'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const axios = require('axios');
const TEXT = ['课件编号', '账户名称', '使用模板名', '笔记标题', '笔记正文', '笔记标签'];
const FIELD_NAMES = [...TEXT, '图片/视频', '是否发布'];
function fieldMapping(config={}) {
  const mapping=Object.fromEntries(FIELD_NAMES.map(name=>[name,config.fields?.[name]??name]));
  if(Object.values(mapping).some(v=>typeof v!=='string'||!v.trim())||new Set(Object.values(mapping)).size!==FIELD_NAMES.length)
    throw error('字段映射必须是八个不同的非空字段名称。',503);
  return mapping;
}
function mapRecord(record,mapping) {
  if(!record)return record;
  return {...record,fields:Object.fromEntries(FIELD_NAMES.map(name=>[name,record.fields?.[mapping[name]]]))};
}
const MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const text = value => Array.isArray(value) ? value.map(v => v.text || '').join('') : String(value || '');
const error = (message, status = 400) => Object.assign(new Error(message), { status });
const validateId = id => { if (!/^rec[a-zA-Z0-9]+$/.test(id || '')) throw error('记录编号不正确。'); };
const digest = record => crypto.createHash('sha256').update(JSON.stringify([
  ...TEXT.map(key => text(record.fields[key])), (record.fields['图片/视频'] || []).map(a => [a.file_token, a.name]),
])).digest('hex');
function normalized(record) {
  const f = record.fields || {};
  return { id: record.record_id, jw: text(f['课件编号']), account: text(f['账户名称']), template: text(f['使用模板名']),
    title: text(f['笔记标题']), status: text(f['是否发布']) || '否', mediaCount: (f['图片/视频'] || []).length };
}
function createFeishuAdapter(configFile) {
  let auth, configPromise, nextDownloadAt=0;
  const config = () => configPromise ||= fs.readFile(configFile, 'utf8').then(s => {
    const c = JSON.parse(s.replace(/^\uFEFF/, ''));
    if (!['app_id','app_secret','app_token','table_id'].every(k => c[k])) throw error('飞书服务配置不完整。', 503);
    c.mapping=fieldMapping(c);
    return c;
  }).catch(() => { configPromise = null; throw error('飞书服务尚未配置，请联系管理员。', 503); });
  async function request(method, suffix, opts = {}) {
    const c = await config();
    try {
      if (!auth || auth.expiry <= Date.now()) {
        const {data} = await axios.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
          {app_id:c.app_id, app_secret:c.app_secret}, {timeout:25000});
        if (data.code !== 0) throw error('飞书授权失败（'+data.code+'）。', 502);
        auth = {token:data.tenant_access_token, expiry:Date.now()+(data.expire-120)*1000};
      }
      const r = await axios({method, url:'https://open.feishu.cn/open-apis/'+suffix,
        headers:{Authorization:'Bearer '+auth.token}, timeout:45000, maxContentLength:20*1024*1024, ...opts});
      if (opts.responseType === 'arraybuffer') return r;
      if (r.data.code !== 0) {
        if ([99991663,99991664].includes(r.data.code)) auth = null;
        throw error('飞书请求失败（'+r.data.code+'），请检查权限或稍后重试。', 502);
      }
      return r.data.data;
    } catch(e) {
      if (e.status) throw e;
      // Axios errors embed headers and credentials; never log or expose the original error.
      throw error('飞书网络请求失败，请稍后重试。', 502);
    }
  }
  const table = async () => { const c=await config();return `bitable/v1/apps/${c.app_token}/tables/${c.table_id}`; };
  async function all(kind) {
    const rows=[];let token='';
    do {
      const d=await request('GET',(await table())+'/'+kind,{params:{page_size:kind==='fields'?100:500,...(token?{page_token:token}:{})}});
      rows.push(...(d.items || []));token=d.has_more?d.page_token:'';
      if(d.has_more&&!token)throw error('飞书分页返回不完整，请重试。',502);
    } while(token);
    return rows;
  }
  return {
    fields:async()=>{
      const c=await config(),reverse=Object.fromEntries(Object.entries(c.mapping).map(([k,v])=>[v,k]));
      return (await all('fields')).filter(f=>Object.hasOwn(reverse,f.field_name)).map(f=>({...f,field_name:reverse[f.field_name]}));
    },
    records:async()=>{const c=await config();return (await all('records')).map(r=>mapRecord(r,c.mapping));},
    get:async id=>mapRecord((await request('GET',(await table())+'/records/'+id)).record,(await config()).mapping),
    update:async (id,values)=>{
      const c=await config();
      return request('PUT',(await table())+'/records/'+id,{data:{fields:Object.fromEntries(Object.entries(values).map(([k,v])=>[c.mapping[k],v]))}});
    },
    download:async (record,fieldId,attachment)=>{
      const c=await config();
      // Space starts across concurrent workers/phones to respect the media API rate limit.
      const delay=Math.max(0,nextDownloadAt-Date.now());nextDownloadAt=Math.max(Date.now(),nextDownloadAt)+220;
      if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
      const extra=JSON.stringify({bitablePerm:{tableId:c.table_id,attachments:{[fieldId]:{[record.record_id]:[attachment.file_token]}}}});
      const r=await request('GET',`drive/v1/medias/${encodeURIComponent(attachment.file_token)}/download`,{params:{extra},responseType:'arraybuffer'});
      return {bytes:Buffer.from(r.data),type:String(r.headers['content-type']||'').split(';')[0]};
    },
  };
}
function createQueueService(options = {}) {
  const cacheDir=options.cacheDir || path.resolve('data/media');
  const publicBase=String(options.publicBase || '').replace(/\/$/,'');
  if(!/^https:\/\//.test(publicBase))throw error('必须配置公开 HTTPS 素材地址。',503);
  const adapter=options.adapter || createFeishuAdapter(process.env.FEISHU_CONFIG_FILE || path.resolve('data/feishu.json'));
  const now=options.now || Date.now, ttl=options.ttlMs || 2*60*60*1000;
  const preparing=new Map(), writes=new Map();
  let schema;
  async function checkSchema() {
    if(schema && schema.until>now())return schema.mediaId;
    const fields=await adapter.fields(), byName=Object.fromEntries(fields.map(f=>[f.field_name,f]));
    if(TEXT.some(k=>byName[k]?.type!==1)||byName['图片/视频']?.type!==17||byName['是否发布']?.type!==3 ||
      !['是','否'].every(s=>byName['是否发布'].property?.options?.some(o=>o.name===s))) throw error('飞书发布表字段或“是/否”选项已变化，已停止操作。',409);
    schema={mediaId:byName['图片/视频'].field_id,until:now()+60000};return schema.mediaId;
  }
  function valid(record) {
    if(!record)throw error('未找到该条飞书记录。',404);
    const row=normalized(record);
    if(!/^JW\d+$/i.test(row.jw)||!row.account||!row.template||!row.title||!text(record.fields['笔记正文'])) throw error('这条记录内容不完整，请先在飞书补齐。');
    if(!['是','否'].includes(row.status))throw error('这条记录发布状态不正确。',409);
    return row;
  }
  async function task(token) {
    if(!/^[a-f0-9]{48}$/.test(token||''))throw error('素材凭证不正确。');
    let t;try {t=JSON.parse(await fs.readFile(path.join(cacheDir,token,'task.json'),'utf8'));}catch{throw error('素材准备记录不存在，请重新选择笔记。',404);}
    if(t.expiresAt<=now())throw error('素材链接已过期，请重新加载这条笔记。',410);
    return t;
  }
  async function prepareInner(id) {
    validateId(id);const mediaId=await checkSchema();const record=await adapter.get(id), row=valid(record);
    const attachments=record.fields['图片/视频'] || [];
    if(!attachments.length||attachments.length>18||attachments.some(a=>!a.file_token||!/^.+\.(png|jpe?g|webp|gif)$/i.test(a.name||''))) throw error('当前交接只支持完整的 1–18 张图文素材；视频或不支持的附件需另行处理。');
    const token=crypto.randomBytes(24).toString('hex'), dir=path.join(cacheDir,token);
    await fs.mkdir(dir,{recursive:true});
    try {
      const files=new Array(attachments.length);let cursor=0;
      await Promise.all(Array.from({length:3},async()=>{
        while(cursor<attachments.length){const i=cursor++, a=attachments[i];
          const {bytes,type}=await adapter.download(record,mediaId,a);
          if(!MIME.has(type)||!bytes.length||bytes.length>20*1024*1024)throw error('图片下载不完整或格式不支持，已停止交接。',502);
          await fs.writeFile(path.join(dir,String(i+1)),bytes);files[i]={type,size:bytes.length};
        }
      }));
      const data={...row,token,body:text(record.fields['笔记正文']),tags:text(record.fields['笔记标签']),expiresAt:now()+ttl,
        fingerprint:digest(record),files,images:files.map((_,i)=>`${publicBase}/media/${token}/${i+1}`)};
      await fs.writeFile(path.join(dir,'task.json'),JSON.stringify(data));
      const {fingerprint,files:ignored,...result}=data;return result;
    } catch(e) { throw e; } // Partial downloads have no manifest and cannot be served.
  }
  async function setStatus(token,status,actor='admin') {
    if(!['是','否'].includes(status))throw error('发布状态只允许“是”或“否”。');
    await checkSchema();const t=await task(token);
    if(writes.has(t.id))return writes.get(t.id).then(()=>setStatus(token,status,actor));
    const pending=(async()=>{
      const record=await adapter.get(t.id);valid(record);
      if(digest(record)!==t.fingerprint)throw error('飞书素材或账号已发生变化，请重新加载后发布。',409);
      if(normalized(record).status!==status)await adapter.update(t.id,{'是否发布':status});
      const readback=await adapter.get(t.id);
      if(normalized(readback).status!==status)throw error('飞书状态回读未通过，请刷新确认后重试。',502);
      await fs.appendFile(path.join(cacheDir,'status-audit.jsonl'),JSON.stringify({at:new Date(now()).toISOString(),actor,id:t.id,jw:t.jw,account:t.account,status,verified:true})+'\n');
      return {id:t.id,status,verified:true};
    })();writes.set(t.id,pending);
    try{return await pending;}finally{writes.delete(t.id);}
  }
  async function cleanExpired() {
    const dirs=await fs.readdir(cacheDir,{withFileTypes:true}).catch(()=>[]);
    for(const d of dirs){if(!d.isDirectory()||!/^[a-f0-9]{48}$/.test(d.name))continue;
      const dir=path.join(cacheDir,d.name);
      const expiry=await fs.readFile(path.join(dir,'task.json'),'utf8').then(s=>JSON.parse(s).expiresAt).catch(async()=> (await fs.stat(dir)).mtimeMs+ttl);
      if(expiry<now())await fs.rm(dir,{recursive:true,force:true});
    }
  }
  return {
    async list(filters={}) {
      await checkSchema();const status=filters.status??'否';
      if(!['是','否','all'].includes(status))throw error('发布状态筛选不正确。');
      const rows=(await adapter.records()).map(normalized).filter(r=>r.account&&/^JW\d+$/i.test(r.jw));
      const sort=a=>[...new Set(a)].sort((a,b)=>a.localeCompare(b,'zh-CN',{numeric:true}));
      return {accounts:sort(rows.map(r=>r.account)),numbers:sort(rows.filter(r=>!filters.account||r.account===filters.account).map(r=>r.jw)),
        items:rows.filter(r=>(status==='all'||r.status===status)&&(!filters.account||r.account===filters.account)&&(!filters.jw||r.jw===filters.jw)).reverse()};
    },
    async prepare(id) {validateId(id);if(!preparing.has(id))preparing.set(id,prepareInner(id).finally(()=>preparing.delete(id)));return preparing.get(id);},
    async media(token,index) {const t=await task(token);if(!Number.isInteger(index)||index<1||index>t.files.length)throw error('图片不存在。',404);
      return {bytes:await fs.readFile(path.join(cacheDir,token,String(index))),type:t.files[index-1].type};},
    setStatus, cleanExpired,
  };
}
module.exports={createQueueService,createFeishuAdapter,fieldMapping,mapRecord};
