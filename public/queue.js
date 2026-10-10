'use strict';
(() => {
  const API = '/api';
  const $ = id => document.getElementById('queue-' + id);
  const TOKEN_KEY = 'fxmp-token', PENDING_KEY = 'fxmp-pending';
  let selected = null, sequence = 0, writing = false;
  const message = (value, ok=false) => { $('notice').textContent=value; $('notice').classList.toggle('ok',ok); };
  function loginRequired() {
    sequence++; selected=null;localStorage.removeItem(TOKEN_KEY);$('login').hidden=false;$('panel').hidden=true;$('detail').hidden=true;
    message('请先登录发布工作台账号。');
  }
  async function api(path, {method='GET', body, keepalive=false, timeoutMs=20000}={}) {
    const {response:res,payload:data}=await window.XhsRequest.json(API+path,{method,cache:'no-store',keepalive,
      headers:{Authorization:'Bearer '+(localStorage.getItem(TOKEN_KEY)||''),...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{})},timeoutMs);
    if(!res.ok){if(res.status===403)loginRequired();throw Object.assign(new Error(data.message||'请求失败，请重试。'),{status:res.status});}return data.data;
  }
  function options(select,values,emptyLabel) {
    const previous=select.value;select.replaceChildren(new Option(emptyLabel,''),...values.map(v=>new Option(v,v)));
    if(values.includes(previous))select.value=previous;
  }
  function invalidate() {
    sequence++;selected=null;$('detail').hidden=true;disablePublish(true);$('publish').removeAttribute('href');
  }
  async function load(keepSelection=false) {
    if(!localStorage.getItem(TOKEN_KEY)){loginRequired();return;}
    if(!keepSelection)invalidate();
    const s=sequence;message('正在读取飞书素材…');$('refresh').disabled=true;
    try {
      const params=new URLSearchParams({status:$('status').value,account:$('account').value,jw:$('jw').value});
      const data=await api('/queue/records?'+params);
      if(s!==sequence)return;
      $('login').hidden=true;$('panel').hidden=false;
      options($('account'),data.accounts,'全部账号');options($('jw'),data.numbers,'全部编号');
      $('count').textContent=`当前 ${data.items.length} 条素材 · 发布状态：${$('status').value==='all'?'全部':$('status').value}`;
      $('list').replaceChildren();
      if(!data.items.length){const p=document.createElement('p');p.className='hint';p.textContent='当前筛选没有素材，可切换账号、JW 编号或发布状态。';$('list').append(p);}
      for(const row of data.items){
        const button=document.createElement('button');button.type='button';button.className='queue-row';button.dataset.recordId=row.id;
        const title=document.createElement('strong');title.textContent=row.title;
        const meta=document.createElement('span');meta.textContent=`${row.account} · ${row.jw} · ${row.template} · ${row.mediaCount} 张 · ${row.status}`;
        button.classList.toggle('active',selected?.id===row.id);
        button.append(title,meta);button.addEventListener('click',()=>choose(row));$('list').append(button);
      }
      message('飞书素材已读取，点击一条笔记预览并准备图片。',true);
    }catch(e){message(e.message);}finally{$('refresh').disabled=false;}
  }
  function state(status) {
    selected.status=status;$('record-status').textContent='是否发布：'+status;
    disablePublish(status==='是'||writing);
    $('publish').textContent=status==='是'?'已回写为是 · 可在下方纠正状态':'发布 · 带入小红书并回写为是';
    $('mark').disabled=writing||status==='是';$('undo').disabled=writing||status==='否';
  }
  function disablePublish(disabled) {
    $('publish').setAttribute('aria-disabled',String(disabled));$('publish').tabIndex=disabled?-1:0;
  }
  function refreshLaunch() {
    $('publish').removeAttribute('href');
    if(!selected)return;
    const device=window.XhsDirectRoute.detectPlatform(navigator.userAgent,navigator.platform,navigator.maxTouchPoints);
    const mode=$('platform').value==='auto'?device:$('platform').value;
    if(!device||(mode==='android_scheme'?'android':mode)!==device)return;
    try{$('publish').href=window.XhsDirectRoute.buildLaunch(content(selected),mode);}catch(e){message(e.message);}
  }
  async function choose(row) {
    invalidate();const s=sequence;
    message(`正在准备 ${row.account} / ${row.jw} 的 ${row.mediaCount} 张图片，请稍候…`);
    for(const b of $('list').children)b.classList.toggle('active',b.dataset.recordId===row.id);
    try {
      const data=await api('/queue/records/'+encodeURIComponent(row.id)+'/prepare',{method:'POST',timeoutMs:180000});
      if(s!==sequence)return;selected=data;
      $('identity').textContent=`${data.account} · ${data.jw} · ${data.template}`;$('title').textContent=data.title;
      $('body').textContent=data.body;$('tags').textContent=data.tags;$('media-count').textContent=`${data.images.length} 张图片 · 顺序保留`;
      $('images').replaceChildren();
      data.images.forEach((src,i)=>{const card=document.createElement('div');card.className='preview';const img=document.createElement('img');img.src=src;img.alt=`素材第 ${i+1} 张`;const label=document.createElement('span');label.textContent=`第 ${i+1} 张`;card.append(img,label);$('images').append(card);});
      $('detail').hidden=false;state(data.status);refreshLaunch();message('素材已准备好，请核对小红书当前登录账号后发布。',true);
      $('detail').scrollIntoView({behavior:'smooth',block:'start'});
    }catch(e){if(s===sequence)message(e.message);}
  }
  function content(task) {return {type:'normal',title:task.title,content:task.body+(task.tags?'\n\n'+task.tags:''),images:task.images};}
  function validTask() {
    if(!selected)throw new Error('请先选择一条素材。');
    if(selected.expiresAt<=Date.now())throw new Error('素材链接已过期，请重新点击这条笔记加载。');
    return selected;
  }
  async function write(task,status) {
    if(writing)throw new Error('正在回写，请稍候。');writing=true;
    if(selected?.token===task.token)state(selected.status);
    localStorage.setItem(PENDING_KEY,JSON.stringify({token:task.token,status,id:task.id}));
    try {
      const result=await api('/queue/tasks/'+task.token+'/status',{method:'POST',body:{status},keepalive:true,timeoutMs:20000});
      localStorage.removeItem(PENDING_KEY);
      if(selected?.token===task.token){state(result.status);await load(true);}
      message(`飞书回读确认：${task.account||''} ${task.jw||''} 的“是否发布”已改为“${result.status}”。`,true);
    }catch(e){
      const terminal=[400,404,409,410].includes(e.status);if(terminal)localStorage.removeItem(PENDING_KEY);
      message('回写尚未确认：'+e.message+(terminal?' 请重新加载笔记。':' 返回网页后会重试，也可刷新飞书确认。'));throw e;
    }
    finally{writing=false;if(selected?.token===task.token)state(selected.status);}
  }
  $('login-form').addEventListener('submit',async e=>{
    e.preventDefault();$('login-button').disabled=true;
    try{
      const {response:res,payload:d}=await window.XhsRequest.json(API+'/login',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({username:$('username').value,password:$('password').value})},20000);
      if(!res.ok)throw new Error(d.message||'登录失败。');localStorage.setItem(TOKEN_KEY,d.data.token);$('password').value='';await load();
    }catch(e){message(e.message);}finally{$('login-button').disabled=false;}
  });
  for(const id of ['account','jw','status'])$(id).addEventListener('change',()=>{if(id==='account')$('jw').value='';load();});
  $('refresh').addEventListener('click',()=>load());
  $('logout').addEventListener('click',()=>{localStorage.removeItem(PENDING_KEY);loginRequired();});
  $('platform').addEventListener('change',refreshLaunch);
  $('publish').addEventListener('click',e=>{
    try {
      const task=validTask();if(writing||task.status==='是'){e.preventDefault();return;}
      if(/MicroMessenger|wxwork|WeCom|Weibo|DingTalk|AlipayClient|;\s*wv\b/i.test(navigator.userAgent))throw new Error('请在 Safari、Chrome 或系统浏览器中打开后发布。');
      const device=window.XhsDirectRoute.detectPlatform(navigator.userAgent,navigator.platform,navigator.maxTouchPoints);
      const mode=$('platform').value==='auto'?device:$('platform').value;
      if(!device||(mode==='android_scheme'?'android':mode)!==device)throw new Error('请在对应手机浏览器打开本页；电脑可筛选和预览素材。');
      if(!$('publish').getAttribute('href'))throw new Error('交接链接未准备好，请重新选择素材。');
      // Preserve this visible anchor's native click navigation and the user's gesture.
      write(task,'是').catch(()=>{});
      message('已发起小红书交接，飞书回写中。请在小红书核对并完成发布。');
    }catch(error){e.preventDefault();message(error.message);}
  });
  $('mark').addEventListener('click',()=>{try{write(validTask(),'是').catch(()=>{});}catch(e){message(e.message);}});
  $('undo').addEventListener('click',()=>{try{write(validTask(),'否').catch(()=>{});}catch(e){message(e.message);}});
  $('copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(content(validTask()).content);message('正文和标签已复制。',true);}catch(e){message(e.message);}});
  async function recover() {
    if(writing||!localStorage.getItem(TOKEN_KEY))return;
    let pending;try{pending=JSON.parse(localStorage.getItem(PENDING_KEY));}catch{localStorage.removeItem(PENDING_KEY);return;}
    if(pending){try{await write({...pending},pending.status);}catch{} }
    else if(selected){const task=selected;try{const d=await api('/queue/records?status=all&jw='+encodeURIComponent(task.jw)+'&account='+encodeURIComponent(task.account));const row=d.items.find(r=>r.id===task.id);if(selected===task&&row)state(row.status);}catch(e){message(e.message);} }
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)recover();});
  load().then(recover);
})();
