(function(){
 'use strict';
 var version='20261025-mobile1',done=false,failed=false,lastProgress=Date.now();
 var controller=new AbortController();
 var loading=document.getElementById('loading'),text=document.getElementById('loadingText'),hint=document.getElementById('loadingHint'),bar=document.getElementById('loadBar');
 var watchdog;
 function fail(message){
  if(failed)return;failed=true;done=false;clearInterval(watchdog);controller.abort();
  loading.classList.remove('loaded');loading.classList.add('failed');
  text.textContent='三维展馆暂未打开';
  hint.textContent=message||'网络或设备暂时无法完成加载。请重试，或先打开效果图。';
 }
 window.gymBoot={signal:controller.signal,mark:function(message,percent){if(failed)return;lastProgress=Date.now();text.textContent=message;bar.style.width=Math.max(3,Math.min(100,percent))+'%';},fail:fail,finish:function(){done=true;clearInterval(watchdog);bar.style.width='100%';text.textContent='场馆已就绪';}};
 document.getElementById('retryLoad').onclick=function(){var u=new URL(location.href);u.searchParams.set('v',version+'-'+Date.now());location.replace(u.href);};
 var lite=new URL(location.href);lite.searchParams.set('quality','lite');lite.searchParams.set('v',version);document.getElementById('liteLink').href=lite.href;
 window.addEventListener('error',function(event){if(!done&&!failed)fail('浏览器未能启动三维画面。可尝试流畅模式或先看效果图。');});
 window.addEventListener('unhandledrejection',function(event){if(!done&&!failed)fail('三维资源未能加载完成。请重试或先看效果图。');});
 document.addEventListener('visibilitychange',function(){if(!document.hidden)lastProgress=Date.now();});
 watchdog=setInterval(function(){if(!document.hidden&&!done&&!failed&&Date.now()-lastProgress>45000)fail('加载已超过 45 秒没有进展。请重试或先看效果图。');},1000);
 var script=document.createElement('script');script.src='viewer.bundle.js?v='+version;script.onerror=function(){fail('展馆程序下载失败，请重试。也可以直接打开效果图。');};document.body.appendChild(script);
})();
