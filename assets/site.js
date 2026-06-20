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
(function(){
  var root=document.querySelector('[data-allocation-explorer]');
  if(!root)return;
  var projects=JSON.parse(root.dataset.projects||'[]');
  var reportedTotals=JSON.parse(root.dataset.reportedTotals||'{}');
  var buttons=Array.prototype.slice.call(root.querySelectorAll('.allocation-controls button[data-campus]'));
  var input=root.querySelector('[data-allocation-search]');
  var chart=root.querySelector('[data-allocation-chart]');
  var status=root.querySelector('[data-allocation-status]');
  var listStatus=root.querySelector('[data-project-list-status]');
  var projectRows=Array.prototype.slice.call(root.querySelectorAll('[data-project-row]'));
  var expandAll=root.querySelector('[data-expand-all]');
  var closeAll=root.querySelector('[data-close-all]');
  var active='All campuses';
  var colors={'Mission College':'campus-mission','West Valley College':'campus-west-valley','District Services':'campus-district'};
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function money(n){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n)}
  function compact(n){if(n===0)return '$0M';return '$'+(n/1000000).toFixed(n>=10000000?0:1).replace(/\.0$/,'')+'M'}
  function scaleFor(value){
    if(value<=0)return {max:1,step:1};
    var rough=value/6;var power=Math.pow(10,Math.floor(Math.log10(rough)));var unit=rough/power;var nice=unit<=1?1:unit<=2?2:unit<=5?5:10;var step=nice*power;
    return {max:Math.ceil(value/step)*step,step:step}
  }
  function render(){
    var q=input.value.trim().toLowerCase();
    var matches=projects.filter(function(p){return (active==='All campuses'||p.campus===active)&&(!q||(p.name+' '+p.id).toLowerCase().indexOf(q)>=0)}).sort(function(a,b){return b.allocation-a.allocation});
    var visible=matches.slice(0,12);var total=!q&&Number.isFinite(reportedTotals[active])?reportedTotals[active]:matches.reduce(function(sum,p){return sum+p.allocation},0);
    status.textContent=matches.length+' project'+(matches.length===1?'':'s')+' · '+money(total)+' allocated'+(matches.length>visible.length?' · showing the largest 12':'');
    var visibleIds={};matches.forEach(function(p){visibleIds[p.id]=true});
    projectRows.forEach(function(row){var id=row.dataset.projectSearch.split(' ')[0].toUpperCase();row.hidden=!visibleIds[id]});
    listStatus.textContent=matches.length+' project'+(matches.length===1?'':'s')+', ordered by Measure W allocation.';
    if(!visible.length){chart.innerHTML='<div class="allocation-empty">No projects match this filter.</div>';return}
    var scale=scaleFor(visible[0].allocation);var rows='';
    for(var i=0;i<visible.length;i++){
      var p=visible[i];var width=p.allocation/scale.max*100;var campusClass=colors[p.campus]||'';
      rows+='<div class="allocation-row"><div class="allocation-project-label" title="'+esc(p.name)+'"><span>'+esc(p.name)+'</span><small>'+esc(p.id)+'</small></div><div class="allocation-plot" style="--grid-step:'+(scale.step/scale.max*100)+'%"><div class="allocation-bar '+campusClass+'" style="width:'+width+'%" tabindex="0" role="img" aria-label="'+esc(p.name)+', '+esc(p.campus)+': '+money(p.allocation)+' in Measure W funding"><span class="allocation-bar-value">'+money(p.allocation)+'</span></div></div></div>'
    }
    var ticks=[];for(var n=0;n<=scale.max;n+=scale.step)ticks.push('<span>'+compact(n)+'</span>');
    chart.innerHTML=rows+'<div class="allocation-axis"><span></span><div class="allocation-ticks">'+ticks.join('')+'</div></div>'
  }
  buttons.forEach(function(button){button.addEventListener('click',function(){active=button.dataset.campus;buttons.forEach(function(candidate){var selected=candidate===button;candidate.classList.toggle('active',selected);candidate.setAttribute('aria-pressed',String(selected))});render()})});
  input.addEventListener('input',render);
  expandAll.addEventListener('click',function(){projectRows.forEach(function(row){if(!row.hidden)row.open=true})});
  closeAll.addEventListener('click',function(){projectRows.forEach(function(row){row.open=false})});
  render()
})();
(function(){
  var root=document.querySelector('[data-records-page]');
  if(!root)return;
  var out=root.querySelector('[data-records-results]');
  var status=root.querySelector('[data-records-status]');
  var input=root.querySelector('[data-record-q]');
  var selects=Array.prototype.slice.call(root.querySelectorAll('[data-record-filter]'));
  var data=[];var pending=null;
  var paramKeys={b:'body',t:'type',s:'series',m:'measure',y:'year'};
  function esc(s){return String(s||'').replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function fmtDate(d){var p=String(d||'').split('-');if(p.length!==3)return d||'';return new Date(d+'T00:00:00Z').toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'})}
  function updateUrl(){var url=new URL(window.location.href);var q=input.value.trim();if(q)url.searchParams.set('q',q);else url.searchParams.delete('q');selects.forEach(function(select){var key=paramKeys[select.dataset.recordFilter];if(select.value)url.searchParams.set(key,select.value);else url.searchParams.delete(key)});history.replaceState(null,'',url)}
  function render(){
    var q=input.value.trim().toLowerCase();var chosen={};selects.forEach(function(select){chosen[select.dataset.recordFilter]=select.value});
    var matches=data.filter(function(record){if(q&&(record.n+' '+record.x).toLowerCase().indexOf(q)<0)return false;for(var key in chosen){if(chosen[key]&&record[key]!==chosen[key])return false}return true});
    status.textContent=matches.length.toLocaleString('en-US')+' record'+(matches.length===1?'':'s');
    var visible=matches.slice(0,300);var html='';
    visible.forEach(function(record){var tags=[record.s,record.m].filter(Boolean).map(function(tag){return '<span class="record-tag">'+esc(tag)+'</span>'}).join('');html+='<article class="record-card"><div class="eyebrow">'+esc(record.b)+' · '+esc(fmtDate(record.d))+' · '+esc(record.t)+'</div><h2><a href="'+esc(record.u)+'">'+esc(record.n)+'</a></h2><p class="muted">'+esc(record.x)+'</p><div class="record-tags">'+tags+'</div><div class="record-source-row"><a href="'+esc(record.u)+'">View record</a><a class="source-link" href="'+esc(record.o)+'" target="_blank" rel="noopener">Official source <span aria-hidden="true">↗</span></a></div></article>'});
    if(matches.length>visible.length)html+='<p class="notice">Showing the first '+visible.length+' records. Use another filter to narrow the catalog.</p>';
    out.innerHTML=html||'<p class="notice">No records match these filters.</p>';updateUrl()
  }
  var initial=new URL(window.location.href).searchParams;input.value=initial.get('q')||'';selects.forEach(function(select){var value=initial.get(paramKeys[select.dataset.recordFilter]);if(value&&Array.prototype.some.call(select.options,function(option){return option.value===value}))select.value=value});
  input.addEventListener('input',function(){clearTimeout(pending);pending=setTimeout(render,120)});selects.forEach(function(select){select.addEventListener('change',render)});
  fetch(root.dataset.index).then(function(response){return response.json()}).then(function(records){data=records;render()}).catch(function(){status.textContent='Could not load the records index.'})
})();