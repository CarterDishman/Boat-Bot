const $=s=>document.querySelector(s);
const labels={fits:'Fits preferences',marginal:'Marginal',incomplete:'Incomplete',exceeds:'Exceeds limits / storms'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=(n,d=1)=>typeof n==='number'&&Number.isFinite(n)?n.toFixed(d):'—';
const time=t=>new Date(t).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const badge=s=>`<span class="badge ${s}">${labels[s]}</span>`;
function tab(name){document.querySelectorAll('.panel').forEach(p=>p.hidden=p.id!==name);document.querySelectorAll('.tab').forEach(t=>{t.classList.toggle('active',t.dataset.tab===name);t.setAttribute('aria-current',t.dataset.tab===name?'page':'false');});}
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>tab(b.dataset.tab));$('#go-passage').onclick=()=>tab('passage');
$('#timezone').textContent=Intl.DateTimeFormat().resolvedOptions().timeZone;
function status(id,message,error=false){const e=$(id);e.textContent=message;e.classList.toggle('error',error);}
async function api(path,options){const r=await fetch(path,options);const d=await r.json();if(!r.ok)throw new Error(d.error||'Request failed.');return d;}
function save(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch{/* App remains usable if storage is disabled. */}}
function read(key){try{return JSON.parse(localStorage.getItem(key));}catch{return null;}}
function warnings(a){return `<div class="warning"><strong>Official warnings · ${a.status==='checked'?'NWS queried': 'coverage incomplete'}</strong><p>${esc(a.scope)}</p>${a.items.map(i=>`<details><summary>${esc(i.headline||i.event)}</summary><p>${esc(i.description)}</p><p>${esc(i.instruction)}</p></details>`).join('')}${!a.items.length?'<p>No alerts returned by this query. This does not establish that conditions are suitable.</p>':''}</div>`;}
function freshness(d){return `<p class="hint">Forecast downloaded ${d.fetchedAt.length?d.fetchedAt.map(time).join(' / '):'not available'} · Open-Meteo Best Match · forecast run time not supplied · waves use mean period</p>${d.errors.map(e=>`<p class="warning">${esc(e)}</p>`).join('')}`;}
function table(head,rows){return `<div class="table-wrap"><table><thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;}
let localRequest=0;
async function loadLocation(point,name){
  const request=++localRequest;status('#local-status','Fetching weather, marine conditions, warnings, and observations…');$('#local-content').innerHTML='';
  $('#location-title').textContent=name;$('#coordinate-form').elements.lat.value=point.lat;$('#coordinate-form').elements.lon.value=point.lon;save('boatbot-location',{point,name});
  try{
    const d=await api(`/api/local?lat=${point.lat}&lon=${point.lon}`);if(request!==localRequest)return;
    const f=d.forecasts[0],w=f.weather?.hourly,m=f.marine?.hourly,now=Date.now()/1000;
    const i=w?.time.findIndex(t=>t>=now)??-1;
    const value=k=>i>=0?w[k]?.[i]:null;
    const mi=m?.time.findIndex(t=>t>=now)??-1;
    const marine=k=>mi>=0?m[k]?.[mi]:null;
    $('#local-content').innerHTML=`<p class="muted">Next forecast hour · ${i>=0?time(w.time[i]*1000):'unavailable'} · ${point.lat.toFixed(3)}, ${point.lon.toFixed(3)}</p><div class="metrics">${[['Wind',value('wind_speed_10m'),'kn'],['Gusts',value('wind_gusts_10m'),'kn'],['Significant waves',marine('wave_height'),'ft'],['Mean wave period',marine('wave_period'),'sec']].map(([label,n,unit])=>`<div class="metric"><span>${label}</span><strong>${number(n)} <small>${unit}</small></strong></div>`).join('')}</div>${freshness(d)}${warnings(d.alerts)}<h3>Next 24 hours</h3>${table(['Time','Wind / gust · kn','Direction','Waves · ft','Mean period · s','Rain chance','Temp · °F'],i<0?[]:w.time.slice(i,i+24).map((t,j)=>{const k=i+j,mk=m?.time.indexOf(t)??-1;return `<tr><td>${time(t*1000)}</td><td>${number(w.wind_speed_10m[k])} / ${number(w.wind_gusts_10m[k])}</td><td>${number(w.wind_direction_10m[k],0)}°</td><td>${number(mk>=0?m.wave_height[mk]:null)}</td><td>${number(mk>=0?m.wave_period[mk]:null)}</td><td>${number(w.precipitation_probability[k],0)}%</td><td>${number(w.temperature_2m[k],0)}</td></tr>`;}))}<h3>Nearby observations</h3><p class="hint">Stations within 150 nm, reported within six hours. A station may be exposed to very different conditions. These are observations, not forecasts.</p><div class="buoys">${d.buoys.items.length?d.buoys.items.map(b=>`<article class="buoy"><strong><a href="https://www.ndbc.noaa.gov/station_page.php?station=${encodeURIComponent(b.id)}" target="_blank" rel="noreferrer">${esc(b.id)}</a> · ${number(b.nm,0)} nm away</strong><p>Observed ${time(b.time)}</p><p>Wind ${number(b.wind)} / gust ${number(b.gust)} kn</p><p>Waves ${number(b.height)} ft · mean ${number(b.meanPeriod)} s</p><p class="hint">Dominant period ${number(b.dominantPeriod)} s</p></article>`).join(''):`<p class="muted">${d.buoys.status==='checked'?'No recent nearby station observations returned.':'Buoy service unavailable.'}</p>`}</div>`;
    status('#local-status',d.errors.length?'Some forecast data is unavailable.':'Updated.');
  }catch(e){if(request===localRequest)status('#local-status',e.message,true);}
}
$('#search-form').onsubmit=async e=>{e.preventDefault();const target=$('#search-results');target.textContent='Searching…';try{const d=await api(`/api/search?q=${encodeURIComponent($('#search').value)}`);target.innerHTML='';if(!d.results?.length){target.textContent='No places found. Try a nearby town or enter coordinates.';return;}d.results.forEach(p=>{const b=document.createElement('button');b.type='button';b.className='result-location';const name=[p.name,p.admin1,p.country].filter(Boolean).join(', ');b.textContent=name;b.onclick=()=>{target.innerHTML='';loadLocation({lat:p.latitude,lon:p.longitude},name);};target.append(b);});}catch(e){target.textContent=e.message;}};
$('#coordinate-form').onsubmit=e=>{e.preventDefault();const f=e.currentTarget;loadLocation({lat:Number(f.elements.lat.value),lon:Number(f.elements.lon.value)},'Selected coordinates');};
$('#locate').onclick=()=>{if(!navigator.geolocation){status('#local-status','Location is unavailable. Search or enter coordinates.',true);return;}status('#local-status','Waiting for location permission…');navigator.geolocation.getCurrentPosition(p=>loadLocation({lat:p.coords.latitude,lon:p.coords.longitude},'Your current location'),e=>status('#local-status',`${e.message} Search or enter coordinates instead.`,true),{timeout:15000,maximumAge:300000});};
const form=$('#passage-form');
function dateInput(ms){const d=new Date(ms);return new Date(d-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
form.elements.departure.value=dateInput(Math.ceil(Date.now()/3600000)*3600000);
const saved=read('boatbot-passage');if(saved)for(const [k,v] of Object.entries(saved))if(form.elements[k]&&k!=='departure')form.elements[k].value=v;
$('#example').onclick=()=>{form.elements.name.value='Brunswick → St. Marys offshore';form.elements.points.value='31.03, -81.31\n30.85, -81.25\n30.70, -81.35';};
let passage=null;
function renderWindows(){if(!passage)return;const d=passage,filter=$('#window-filter').value;const shown=d.windows.filter(w=>filter==='all'||filter===w.status);const fit=d.windows.find(w=>w.status==='fits');
  // Consecutive hourly candidates are grouped, never interpreted as sub-hourly guarantees.
  const groups=[];for(const w of d.windows){if(w.status!=='fits')continue;const last=groups.at(-1);if(last&&w.departure===last.end+3600000)last.end=w.departure;else groups.push({start:w.departure,end:w.departure});}
  $('#window-content').innerHTML=`<div class="window-summary"><h3>${fit?'First candidate fitting your preferences':'No complete fit in this scan'}</h3><p>${fit?`${time(fit.departure)} · arrives ${time(fit.arrival)}`:'Review marginal, incomplete, and excluded departures below.'}</p><p>${number(d.length)} nm · ${d.samples} route samples · speed checks ${d.speeds.map(s=>number(s)).join(' / ')} kn</p></div>${groups.length?`<p class="muted">Consecutive fitting hourly departures: ${groups.map(g=>`${time(g.start)}${g.end!==g.start?' – '+time(g.end):''}`).join('; ')}.</p>`:''}<p class="hint">72 hourly departure candidates. Ratings use the worst result across three speeds. Farther-ahead forecasts are less certain; no independent model agreement check is included. NWS warnings are displayed separately below.</p>${freshness(d)}${warnings(d.alerts)}${table(['Departure / arrival','Assessment','Max gust · kn','Max waves · ft','Min mean period · s','Why'],shown.map(w=>`<tr><td>${time(w.departure)}<br><span class="hint">→ ${time(w.arrival)}</span></td><td>${badge(w.status)}</td><td>${number(w.maxGust)}</td><td>${number(w.maxHeight)}</td><td>${number(w.minPeriod)}</td><td>${esc(w.reasons.join('; ')||'Fits sampled numeric preferences')}</td></tr>`))}${!shown.length?'<p>No departures match this filter.</p>':''}`;
}
$('#window-filter').onchange=renderWindows;
form.onsubmit=async e=>{
  e.preventDefault();const raw=Object.fromEntries(new FormData(form));save('boatbot-passage',raw);$('#calculate').disabled=true;status('#passage-status','Checking hourly route samples and 72 departure times. This may take up to a minute…');$('#passage-content').innerHTML='';
  try{
    const points=raw.points.trim().split('\n').map(l=>{const parts=l.trim().split(',').map(s=>s.trim());if(parts.length!==2||parts.some(p=>p===''))throw new Error('Use latitude, longitude on each waypoint line.');return {lat:Number(parts[0]),lon:Number(parts[1])};});
    const d=await api('/api/passage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({points,departure:new Date(raw.departure).toISOString(),speed:+raw.speed,gust:+raw.gust,height:+raw.height,period:+raw.period})});
    passage=d;renderWindows();const first=d.windows[0];$('#passage-content').innerHTML=`<h3>${esc(raw.name)}</h3><p>${badge(first.status)} · ${number(d.length)} nm · arrival ${time(first.arrival)}</p>${warnings(d.alerts)}<p class="hint">Conditions below are for the requested planning speed; the overall rating also checks ±0.5 kn. Each sample uses the worse of the surrounding forecast hours.</p>${table(['Expected time','Position','Gust · kn','Waves · ft','Mean period · s'],first.details.map(p=>`<tr><td>${time(p.time)}</td><td>${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}</td><td>${number(p.gust)}</td><td>${number(p.height)}</td><td>${number(p.period)}</td></tr>`))}`;status('#passage-status','Passage checked. Open Window finder to compare departures.');tab('windows');
  }catch(e){status('#passage-status',e.message,true);}finally{$('#calculate').disabled=false;}
};
const locationSaved=read('boatbot-location');loadLocation(locationSaved?.point??{lat:31.15,lon:-81.49},locationSaved?.name??'Brunswick, Georgia');
