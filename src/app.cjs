'use strict';
const path=require('node:path');
const express=require('express'),helmet=require('helmet'),jwt=require('jsonwebtoken');
const {rateLimit}=require('express-rate-limit');
const {createAccountService}=require('./services/accounts.cjs');
function createApp({service,accountsFile,secret,trustProxy='loopback',demo=false}) {
  const app=express(),accounts=createAccountService({accountsFile});
  app.disable('x-powered-by');app.set('trust proxy',trustProxy);
  app.use(helmet({contentSecurityPolicy:{directives:{
    defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],
    imgSrc:["'self'",'https:'],connectSrc:["'self'"],formAction:["'self'"],
    upgradeInsecureRequests:demo?null:[]}},
    // Local demo is HTTP. Production TLS is terminated at the reverse proxy.
    strictTransportSecurity:demo?false:undefined}));
  app.use(express.json({limit:'16kb'}));
  const run=fn=>async(req,res,next)=>{try{await fn(req,res,next);}catch(e){next(e);}};
  app.get('/api/health',(_req,res)=>res.json({ok:true,demo}));
  app.post('/api/login',rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:'draft-8',legacyHeaders:false,
    message:{code:429,message:'登录尝试过多，请稍后重试。'}}),run(async(req,res)=>{
    const identity=await accounts.authenticate(req.body?.username,req.body?.password);
    if(!identity)return res.status(403).json({code:403,message:'账号或密码不正确。'});
    const token=jwt.sign(identity,secret,{algorithm:'HS256',expiresIn:'12h',issuer:'fxmp',audience:'fxmp-publisher'});
    res.set('Cache-Control','no-store').json({code:200,data:{token}});
  }));
  app.get('/api/queue/media/:token/:index',run(async(req,res)=>{
    const m=await service.media(req.params.token,Number(req.params.index));
    res.set({'Content-Type':m.type,'Cache-Control':'no-store','Referrer-Policy':'no-referrer',
      'Cross-Origin-Resource-Policy':'cross-origin'}).send(m.bytes);
  }));
  app.use('/api/queue',run(async(req,res,next)=>{
    let identity;
    try{identity=jwt.verify(String(req.headers.authorization||'').replace(/^Bearer /,''),secret,
      {algorithms:['HS256'],issuer:'fxmp',audience:'fxmp-publisher'});}catch{}
    if(!identity||!await accounts.isPublisher(identity))return res.status(403).json({code:403,message:'请重新登录发布工作台。'});
    req.publisher=identity;res.set('Cache-Control','no-store');next();
  }));
  app.get('/api/queue/records',run(async(req,res)=>res.json({code:200,data:await service.list(req.query)})));
  app.post('/api/queue/records/:id/prepare',run(async(req,res)=>{
    const data=await service.prepare(req.params.id);
    if(demo)data.images=data.images.map((_,i)=>`/api/queue/media/${data.token}/${i+1}`);
    res.json({code:200,data});
  }));
  app.post('/api/queue/tasks/:token/status',run(async(req,res)=>res.json({code:200,data:await service.setStatus(req.params.token,req.body?.status,req.publisher.username)})));
  if(demo)app.get('/',run(async(_req,res)=>{
    const html=await require('node:fs/promises').readFile(path.join(__dirname,'../public/index.html'),'utf8');
    res.type('html').send(html.replace('<h1>飞书素材发布</h1>','<h1>飞书素材发布 · 演示</h1><p class="notice">仅模拟表格和占位图片，不连接飞书，不进行真实 App 交接。</p>'));
  }));
  app.use(express.static(path.join(__dirname,'../public'),{index:'index.html',maxAge:0}));
  app.use((_req,res)=>res.status(404).json({code:404,message:'页面不存在。'}));
  app.use((e,_req,res,_next)=>{
    const status=e.status||500;
    // No raw Axios errors, request headers, passwords or private configuration in logs/responses.
    res.status(status).json({code:status,message:e.status&&!e.type&&status!==413?e.message:'服务操作失败，请检查配置或稍后重试。'});
  });
  return app;
}
module.exports={createApp};
