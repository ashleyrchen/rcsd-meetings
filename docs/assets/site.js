(function(){
  var root=document.querySelector('[data-search-page]');
  if(!root)return;
  var input=document.querySelector('[data-search-input]');
  var status=document.querySelector('[data-search-status]');
  var out=root.querySelector('[data-search-results]');
  var months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  var data=[];var ready=false;var pending=null;
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function fmtDate(d){var p=String(d||'').split('-');if(p.length!==3)return d||'';return months[(+p[1])-1]+' '+(+p[2])+', '+p[0]}
  function highlight(frag,terms){
    var lower=frag.toLowerCase();var ranges=[];
    for(var i=0;i<terms.length;i++){var term=terms[i];if(!term)continue;var from=0;var idx;while((idx=lower.indexOf(term,from))>=0){ranges.push([idx,idx+term.length]);from=idx+term.length}}
    if(!ranges.length)return frag;
    ranges.sort(function(a,b){return a[0]-b[0]});
    var merged=[ranges[0]];for(var r=1;r<ranges.length;r++){var last=merged[merged.length-1];if(ranges[r][0]<=last[1]){if(ranges[r][1]>last[1])last[1]=ranges[r][1]}else merged.push(ranges[r])}
    var res='';var pos=0;for(var m=0;m<merged.length;m++){res+=frag.slice(pos,merged[m][0])+'<mark>'+frag.slice(merged[m][0],merged[m][1])+'</mark>';pos=merged[m][1]}
    return res+frag.slice(pos)
  }
  function snippet(text,terms){
    var lc=text.toLowerCase();var pos=-1;
    for(var i=0;i<terms.length;i++){var p=lc.indexOf(terms[i]);if(p>=0&&(pos<0||p<pos))pos=p}
    if(pos<0)pos=0;
    var start=pos>70?pos-70:0;var end=pos+200<text.length?pos+200:text.length;
    var frag=(start>0?'… ':'')+text.slice(start,end)+(end<text.length?' …':'');
    return highlight(esc(frag),terms)
  }
  function render(q){
    var phrase=q.toLowerCase().trim();
    if(!phrase){out.innerHTML='';status.textContent='';return}
    var terms=[phrase];
    var res=[];
    for(var i=0;i<data.length;i++){var r=data[i];var hay=(r.t+' '+r.b+' '+r.m+' '+r.c+' '+r.d).toLowerCase();if(hay.indexOf(phrase)>=0)res.push(r)}
    res.sort(function(a,b){return a.d<b.d?1:a.d>b.d?-1:0});
    status.textContent=res.length+' result'+(res.length===1?'':'s');
    var lim=res.slice(0,300);var html='';
    for(var k=0;k<lim.length;k++){var x=lim[k];
      html+='<article class="record-card"><div class="eyebrow">'+esc(x.c)+' · '+esc(fmtDate(x.d))+(x.a?' · '+esc(x.a):'')+'</div>'+
      '<h2><a href="'+esc(x.u)+'">'+esc(x.t||'Untitled')+'</a></h2>'+
      (x.m?'<p class="muted">'+esc(x.m)+'</p>':'')+
      '<p class="snippet">'+snippet(x.b||x.t||'',terms)+'</p></article>'}
    if(res.length>lim.length)html+='<p class="notice">Showing the first '+lim.length+' of '+res.length+' results. Add another word to narrow your search.</p>';
    out.innerHTML=html
  }
  function load(cb){if(ready){cb();return}status.textContent='Loading search index…';fetch(root.dataset.index).then(function(r){return r.json()}).then(function(j){data=j;ready=true;cb()}).catch(function(){status.textContent='Could not load the search index.'})}
  function run(){var q=input.value.trim();var u=new URL(window.location.href);if(q)u.searchParams.set('q',q);else u.searchParams.delete('q');history.replaceState(null,'',u);if(!q){out.innerHTML='';status.textContent='';return}load(function(){render(q)})}
  input.addEventListener('input',function(){clearTimeout(pending);pending=setTimeout(run,180)});
  var initial=new URL(window.location.href).searchParams.get('q');
  if(initial){input.value=initial;run()}
})();