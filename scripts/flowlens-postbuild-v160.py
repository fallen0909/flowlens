from pathlib import Path

VERSION = '1.6.0'
FILES = ['flowlens-desktop.user.js', 'flowlens-mobile-all.user.js']

PATCH = r'''

/* FlowLens v1.6.0 bookmark display patch */
(() => {
  if (window.__flBookmarkPatch160) return;
  window.__flBookmarkPatch160 = true;
  const KEY='flowlens-page-bookmarks-v1';
  const SAVE='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4.5h12a1 1 0 0 1 1 1v15l-7-4-7 4v-15a1 1 0 0 1 1-1Z"/></svg>';
  const LIST='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h11M8 12h11M8 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/></svg>';
  const $=(s,r=document)=>r.querySelector(s), root=()=>document.getElementById('xiv-root'), bar=()=>$('#xiv-topbar .xiv-actions',root()||document);
  const norm=(u=location.href)=>{try{const x=new URL(u,location.href);x.hash='';return x.href}catch{return String(u||'').split('#')[0]}};
  const slug=u=>{try{const x=new URL(u,location.href),p=x.pathname.split('/').filter(Boolean);return /^x\.810114\.xyz$/i.test(x.hostname)&&p.length===1&&/^[A-Za-z0-9_]{2,64}$/.test(p[0])?p[0]:''}catch{return''}};
  const json=(t,f)=>{try{return JSON.parse(t||'')||f}catch{return f}};
  const cur=()=>{const u=norm(location.href);if(slug(u))return u;const a=[$('link[rel="canonical"]')?.href||'',$('meta[property="og:url"],meta[name="og:url"]')?.getAttribute('content')||'',u].filter(Boolean).map(norm);return a.find(slug)||a[0]||u};
  async function read(){try{if(typeof GM_getValue==='function')return json(await Promise.resolve(GM_getValue(KEY,'[]')),[])}catch{}try{return json(localStorage.getItem(KEY),[])}catch{return[]}}
  async function write(v){const a=v.slice(0,300),t=JSON.stringify(a);let ok=false;try{if(typeof GM_setValue==='function'){await Promise.resolve(GM_setValue(KEY,t));ok=true}}catch{}if(!ok){try{localStorage.setItem(KEY,t)}catch{}}window.dispatchEvent(new CustomEvent('flowlens:bookmarks-changed',{detail:{items:a}}))}
  const abs=r=>{try{return r?new URL(r,location.href).href:''}catch{return''}};
  function profile(u){const id=slug(u);let title=id?('@'+id):(document.title||u),cover='';if(id){const hit=Array.from(document.querySelectorAll('body *')).find(e=>(e.textContent||'').toLowerCase().includes('@'+id.toLowerCase())&&(e.textContent||'').length<260);if(hit){const parts=(hit.textContent||'').split(/\n|\r|\t| {2,}/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean),i=parts.findIndex(x=>x.toLowerCase().includes('@'+id.toLowerCase()));if(i>0)title=parts[i-1];for(let box=hit,n=0;box&&n<6;box=box.parentElement,n++){const img=box.querySelector?.('img[src]');cover=abs(img?.getAttribute('src')||img?.currentSrc||'');if(cover)break}}}if(!cover){const img=$('meta[property="og:image"],meta[name="twitter:image"],img[src]');cover=abs(img?.getAttribute('content')||img?.getAttribute('src')||img?.currentSrc||'')}return{title,cover}}
  const displayTitle=item=>{const id=slug(item?.url||''),t=String(item?.title||'').trim();return id&&(!t||t==='推图 - 推特看图纯享版'||t===item?.host)?('@'+id):(t||('@'+id)||item?.url||'未命名页面')};
  function style(){if($('#fl160-style'))return;const s=document.createElement('style');s.id='fl160-style';s.textContent=`#xiv-page-bookmarks-controls,#xiv-root .fl-bookmarks-tools{display:none!important}#xiv-root .fl160 span{display:none!important}#xiv-root .fl160 svg{width:21px!important;height:21px!important}#xiv-root .fl160[data-saved=true]{color:#ffb648!important;border-color:rgba(255,190,80,.56)!important;background:rgba(255,190,80,.22)!important}#xiv-root .fl160[data-saved=true] svg{fill:currentColor!important}#xiv-root .fl-bookmarks-panel{width:min(390px,calc(100vw - 18px))!important;max-height:min(78vh,620px)!important;border-radius:16px!important;top:max(62px,env(safe-area-inset-top,0px) + 58px)!important}#xiv-root .fl-bookmarks-head{padding:10px 12px!important}#xiv-root .fl-bookmarks-head h3{font-size:18px!important}#xiv-root .fl-bookmarks-close{width:32px!important;height:32px!important;font-size:18px!important}#xiv-root .fl-bookmarks-list{padding:4px 8px 10px!important}#xiv-root .fl-bookmarks-item{grid-template-columns:44px minmax(0,1fr) auto!important;gap:8px!important;padding:8px!important;margin:5px 0!important;border-radius:12px!important}#xiv-root .fl-bookmarks-cover{width:44px!important;height:44px!important;border-radius:10px!important}#xiv-root .fl-bookmarks-title{font-size:13px!important;line-height:1.25!important}#xiv-root .fl-bookmarks-host{margin-top:2px!important;font-size:11px!important;max-width:190px!important;direction:ltr!important}#xiv-root .fl-bookmarks-actions{gap:4px!important;grid-column:auto!important}#xiv-root .fl-bookmarks-actions [data-action=newtab]{display:none!important}#xiv-root .fl-bookmarks-item button{height:30px!important;padding:0 10px!important;font-size:13px!important}@media(max-width:560px){#xiv-root .fl-bookmarks-panel{left:6px!important;right:6px!important;width:auto!important}#xiv-root .fl-bookmarks-item{grid-template-columns:42px minmax(0,1fr) auto!important}#xiv-root .fl-bookmarks-item button{padding:0 8px!important}}`;document.documentElement.appendChild(s)}
  async function syncRows(){const panel=root()?.querySelector('.fl-bookmarks-panel');if(!panel)return;const items=await read();panel.querySelectorAll('.fl-bookmarks-item').forEach((row,i)=>{const it=items[i];if(!it?.url)return;const u=norm(it.url),count=Number(it.mediaCount||0),title=row.querySelector('.fl-bookmarks-title'),host=row.querySelector('.fl-bookmarks-host');row.dataset.flBookmarkUrl=u;if(title)title.textContent=displayTitle(it);if(host)host.textContent=`${u}${count?` · ${count} 项`:''}`})}
  async function syncBtn(){const b=root()?.querySelector('[data-fl160=save]');if(!b)return;const u=cur(),on=(await read()).some(x=>norm(x.url)===u);b.dataset.saved=on?'true':'false';b.title=on?'已收藏本页':'收藏本页'}
  async function save(e){const b=e.target?.closest?.('[data-fl160=save]');if(!b)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation?.();const u=cur(),m=profile(u),list=await read(),on=list.some(x=>norm(x.url)===u);if(on)await write(list.filter(x=>norm(x.url)!==u));else{const now=new Date().toISOString();await write([{url:u,title:m.title,host:new URL(u).hostname,cover:m.cover,mediaCount:document.querySelectorAll('#xiv-root .xiv-tile').length||0,createdAt:now,updatedAt:now},...list])}syncBtn();setTimeout(syncRows,80)}
  function openList(e){const b=e.target?.closest?.('[data-fl160=list]');if(!b)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation?.();window.dispatchEvent(new CustomEvent('flowlens:bookmark-list'));setTimeout(syncRows,80)}
  async function interceptOpen(e){const hit=e.target?.closest?.('#xiv-root .fl-bookmarks-panel [data-action=open],#xiv-root .fl-bookmarks-panel .fl-bookmarks-info');if(!hit)return;const row=hit.closest('.fl-bookmarks-item');let u=row?.dataset?.flBookmarkUrl||'';if(!u){const rows=Array.from(root()?.querySelectorAll('.fl-bookmarks-item')||[]),idx=rows.indexOf(row),items=await read();u=items[idx]?.url||''}u=norm(u);if(!slug(u))return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation?.();const api=window.__flowLensControl;if(api?.loadSavedPage){root()?.querySelector('.fl-bookmarks-panel')?.setAttribute('data-open','false');await api.loadSavedPage(u);setTimeout(syncRows,120)}}
  function mk(k,icon,title){const b=document.createElement('button');b.className='xiv-btn fl160';b.type='button';b.dataset.fl160=k;b.title=title;b.innerHTML=icon+'<span>'+title+'</span>';return b}
  function ensure(){style();const a=bar();if(!a)return;if(!$('[data-fl160=save]',a))a.insertBefore(mk('save',SAVE,'收藏本页'),a.firstElementChild||null);if(!$('[data-fl160=list]',a)){const s=$('[data-fl160=save]',a);a.insertBefore(mk('list',LIST,'收藏列表'),s?.nextSibling||a.firstElementChild||null)}syncBtn();syncRows()}
  document.addEventListener('click',interceptOpen,true);document.addEventListener('click',save,true);document.addEventListener('click',openList,true);window.addEventListener('flowlens:bookmarks-changed',()=>setTimeout(syncRows,80));ensure();setInterval(ensure,800);new MutationObserver(ensure).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['data-active','class','data-open']});
})();
'''

DIRECT_PATCH_OLD = '''  async function loadSavedPageInPlace(target) {
    const targetUrl = normalizedPageUrl(target);
    if (!targetUrl || !HTTP_PAGE_RE.test(targetUrl)) return false;

    let html = "";'''
DIRECT_PATCH_NEW = '''  async function loadSavedPageInPlace(target) {
    const targetUrl = normalizedPageUrl(target);
    if (!targetUrl || !HTTP_PAGE_RE.test(targetUrl)) return false;
    if (isQueueCandidateUrl(targetUrl)) {
      const switched = await loadGalleryQueueTargetInPlace(targetUrl);
      if (switched) return true;
    }

    let html = "";'''

for file_name in FILES:
    p = Path(file_name)
    s = p.read_text(encoding='utf-8')
    s = s.replace('// @version      1.5.4', f'// @version      {VERSION}')
    if 'direct-bookmark-in-flow-switch' not in s and DIRECT_PATCH_OLD in s:
        s = s.replace(DIRECT_PATCH_OLD, DIRECT_PATCH_NEW, 1)
    if 'FlowLens v1.6.0 bookmark display patch' not in s:
        s = s.rstrip() + PATCH + '\n'
    p.write_text(s, encoding='utf-8')
