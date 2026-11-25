(function(){
var q=new URLSearchParams(location.search);var th=q.get('theme')||'dark';
var w=q.get('w')||(innerWidth<600?'390':innerWidth<1100?'820':'1280');
document.documentElement.setAttribute('data-theme',th);document.body.setAttribute('data-w',w);
document.querySelectorAll('[data-themelink]').forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();q.set('theme',a.dataset.themelink);location.search=q.toString()});if(a.dataset.themelink===th)a.classList.add('on')});
document.querySelectorAll('.seg a:not([data-themelink])').forEach(function(a){a.classList.toggle('on',a.textContent.trim()===w);a.addEventListener('click',function(e){e.preventDefault();q.set('w',a.textContent.trim());location.search=q.toString()})});
document.querySelectorAll('a[href]').forEach(function(a){var h=a.getAttribute('href');if(/\.html/.test(h)&&!/\?/.test(h)){var p=new URLSearchParams();p.set('theme',th);if(q.get('w'))p.set('w',q.get('w'));a.setAttribute('href',h.replace(/(#.*)?$/,'')+'?'+p.toString()+(h.indexOf('#')>-1?h.slice(h.indexOf('#')):''))}});
document.querySelectorAll('.vsw').forEach(function(sw){sw.querySelectorAll('button').forEach(function(b){b.addEventListener('click',function(){
sw.querySelectorAll('button').forEach(function(x){x.classList.remove('on')});b.classList.add('on');
var tg=document.getElementById(sw.dataset.for);tg.querySelectorAll(':scope > [data-v]').forEach(function(v){v.classList.toggle('hide',v.dataset.v!==b.dataset.v)})})})});
document.querySelectorAll('[data-play]').forEach(function(b){b.addEventListener('click',function(){var t=document.getElementById(b.dataset.play);t.classList.remove('play');void t.offsetWidth;t.classList.add('play')})});
document.querySelectorAll('[data-pulse]').forEach(function(b){b.addEventListener('click',function(){var t=document.getElementById(b.dataset.pulse);t.classList.remove('pulse');void t.offsetWidth;t.classList.add('pulse')})});
document.querySelectorAll('[data-toggle]').forEach(function(b){b.addEventListener('click',function(){document.getElementById(b.dataset.toggle).classList.toggle('hide')})});
document.querySelectorAll('[data-open]').forEach(function(b){b.addEventListener('click',function(){document.getElementById(b.dataset.open).classList.toggle('open')})});
})();
