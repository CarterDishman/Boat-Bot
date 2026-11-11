const $=s=>document.querySelector(s);
const labels={fits:'Fits preferences',marginal:'Marginal',incomplete:'Incomplete',exceeds:'Exceeds limits / storms'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=(n,d=1)=>typeof n==='number'&&Number.isFinite(n)?n.toFixed(d):'—';
const time=t=>new Date(t).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const badge=s=>`<span class="badge ${s}">${labels[s]}</span>`;
function tab(name){document.querySelectorAll('.panel').forEach(p=>p.hidden=p.id!==name);document.querySelectorAll('.tab').forEach(t=>{t.classList.toggle('active',t.dataset.tab===name);t.setAttribute('aria-current',t.dataset.tab===name?'page':'false');});if(name==='passage')requestAnimationFrame(()=>{initMap();routeMap?.invalidateSize();});}
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>tab(b.dataset.tab));$('#go-passage').onclick=()=>tab('passage');
$('#back-to-passage').onclick=()=>{tab('passage');$('#passage').scrollIntoView({behavior:'smooth',block:'start'});};
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
  $('#location-source').textContent=name==='Your current location'?'Using browser-provided location. Accuracy depends on your device.':'Using a location you selected; this is not automatic tracking.';$('#location-title').textContent=name;$('#coordinate-form').elements.lat.value=point.lat;$('#coordinate-form').elements.lon.value=point.lon;save('boatbot-location',{point,name});
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
function locationSuggestions(input,target,onSelect){
 let timer,sequence=0,controller=null,items=[],active=-1;
 input.autocomplete='off';input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls',target.id);input.setAttribute('aria-expanded','false');
 target.classList.add('location-dropdown');target.setAttribute('role','listbox');target.setAttribute('aria-label','Location suggestions');target.hidden=true;
 function close(){clearTimeout(timer);sequence++;controller?.abort();target.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;}
 function highlight(index){active=index;const options=target.querySelectorAll('[role="option"]');options.forEach((o,i)=>{o.setAttribute('aria-selected',String(i===active));o.classList.toggle('highlighted',i===active);});if(options[active]){input.setAttribute('aria-activedescendant',options[active].id);options[active].scrollIntoView({block:'nearest'});}else input.removeAttribute('aria-activedescendant');}
 function select(p){close();input.value=p.name;onSelect(p);}
 async function search(){
  clearTimeout(timer);const query=input.value.trim(),request=++sequence;controller?.abort();items=[];active=-1;input.removeAttribute('aria-activedescendant');
  if(query.length<2){close();return;}
  controller=new AbortController();target.textContent='Searching…';target.hidden=false;input.setAttribute('aria-expanded','true');
  try{const r=await fetch(`/api/search?q=${encodeURIComponent(query)}`,{signal:controller.signal});const d=await r.json();if(request!==sequence)return;if(!r.ok)throw new Error(d.error||'Search unavailable.');items=d.results??[];target.innerHTML='';if(!items.length){target.textContent='No places found. Try a nearby town or enter coordinates.';return;}items.forEach((p,i)=>{const b=document.createElement('button');b.type='button';b.className='result-location';b.id=`${target.id}-option-${i}`;b.setAttribute('role','option');b.setAttribute('aria-selected','false');b.tabIndex=-1;b.textContent=[p.name,p.admin1,p.country].filter(Boolean).join(', ');b.onpointerdown=e=>e.preventDefault();b.onclick=()=>select(p);target.append(b);});}catch(e){if(request!==sequence||e.name==='AbortError')return;target.textContent=e.message;}
 }
 input.addEventListener('input',()=>{close();target.innerHTML='';items=[];if(input.value.trim().length>=2)timer=setTimeout(search,300);});
 input.addEventListener('keydown',e=>{
  if(e.key==='Escape'){close();return;}
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(target.hidden){search();return;}if(items.length)highlight((active+(e.key==='ArrowDown'?1:-1)+items.length)%items.length);return;}
  if(e.key==='Enter'){e.preventDefault();if(active>=0&&!target.hidden)select(items[active]);else search();}
 });
 input.addEventListener('blur',()=>setTimeout(close,150));
 document.addEventListener('pointerdown',e=>{if(e.target!==input&&!target.contains(e.target))close();});
 return {search,close};
}
const localSuggestions=locationSuggestions($('#search'),$('#search-results'),p=>loadLocation({lat:p.latitude,lon:p.longitude},[p.name,p.admin1,p.country].filter(Boolean).join(', ')));
$('#search-form').onsubmit=e=>{e.preventDefault();localSuggestions.search();};

$('#coordinate-form').onsubmit=e=>{e.preventDefault();const f=e.currentTarget;loadLocation({lat:Number(f.elements.lat.value),lon:Number(f.elements.lon.value)},'Selected coordinates');};
$('#locate').onclick=()=>{if(!navigator.geolocation){status('#local-status','Location is unavailable. Search or enter coordinates.',true);return;}status('#local-status','Waiting for location permission…');navigator.geolocation.getCurrentPosition(p=>loadLocation({lat:p.coords.latitude,lon:p.coords.longitude},'Your current location'),e=>status('#local-status',`${e.message} Search or enter coordinates instead.`,true),{timeout:15000,maximumAge:300000});};
const form=$('#passage-form');
let routeRevision=0;
function dateInput(ms){const d=new Date(ms);return new Date(d-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
form.elements.departure.value=dateInput(Math.ceil(Date.now()/3600000)*3600000);
let routeMap=null,routeLayer=null,routePoints=[],routeHistory=[],addingWaypoint=false,departureMode='next';
const preferencesForm=$('#preferences-form'), preferencesDialog=$('#preferences-dialog');
let preferences={speed:6.5,gust:20,height:4,period:6,vessel:'',...read('boatbot-preferences')};
const oldPassage=read('boatbot-passage');
if(!read('boatbot-preferences')&&oldPassage)for(const key of ['speed','gust','height','period'])if(Number(oldPassage[key])>0)preferences[key]=Number(oldPassage[key]);
function applyPreferences(){
  for(const [key,value]of Object.entries(preferences))if(preferencesForm.elements[key])preferencesForm.elements[key].value=value;
  form.elements.speed.value=preferences.speed;
  $('#summary-speed').innerHTML=`${number(+preferences.speed)} <small>kn</small>`;
  $('#summary-gust').innerHTML=`${number(+preferences.gust,0)} <small>kn</small>`;
  $('#summary-waves').innerHTML=`&lt; ${number(+preferences.height,1)} <small>ft</small>`;
  $('#summary-period').textContent=`mean period > ${preferences.period} s`;
  $('#edit-limits').innerHTML=`Gusts ≤${esc(preferences.gust)} kn · waves &lt;${esc(preferences.height)} ft · mean period &gt;${esc(preferences.period)} s <span>Edit</span>`;
  updateRouteOverview();
}
$('#open-preferences').onclick=$('#edit-limits').onclick=()=>preferencesDialog.showModal();
$('#close-preferences').onclick=()=>preferencesDialog.close();
preferencesForm.onsubmit=e=>{e.preventDefault();preferences={...Object.fromEntries(new FormData(preferencesForm))};save('boatbot-preferences',preferences);applyPreferences();preferencesDialog.close();invalidateResults();};
function routeDistance(a,b){const r=n=>n*Math.PI/180;const x=Math.sin(r(b.lat-a.lat)/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(r(b.lon-a.lon)/2)**2;return 3440.065*2*Math.atan2(Math.sqrt(x),Math.sqrt(Math.max(0,1-x)));}
function totalDistance(){return routePoints.slice(1).reduce((s,p,i)=>s+routeDistance(routePoints[i],p),0);}
function updateRouteOverview(){const nm=totalDistance(),speed=+form.elements.speed.value;$('#route-distance').innerHTML=routePoints.length>1?`${number(nm)} <small>nm</small>`:'—';$('#route-duration').textContent=nm&&speed?`${Math.floor(nm/speed)}h ${Math.round(nm/speed%1*60)}m`:'—';$('#route-count').textContent=routePoints.length;}
function invalidateResults(){removeInspectionMap();routeRevision++;passage=null;$('#passage-content').innerHTML='';$('#window-content').innerHTML='<div class="empty"><h3>Your route or preferences have changed.</h3><p>Check the updated passage to find fresh departure windows.</p></div>';}
function snapshotRoute(){routeHistory.push(JSON.stringify(routePoints));if(routeHistory.length>30)routeHistory.shift();}
function persistRoute(){save('boatbot-route-v2',routePoints);}
function routeChanged(){ invalidateResults();renderRoute();persistRoute();status('#passage-status','');}
function fitRoute(){if(!routeMap)return;routeMap.invalidateSize();if(routePoints.length>1)routeMap.fitBounds(routePoints.map(p=>[p.lat,p.lon]),{padding:[40,40],maxZoom:12});else if(routePoints[0])routeMap.setView([routePoints[0].lat,routePoints[0].lon],9);}
function initMap(){
 if(routeMap)return;
 if(!window.L){$('#map-status').textContent='Map could not load. Use advanced coordinates to plan your passage.';return;}
 const loc=read('boatbot-location')?.point??{lat:27,lon:-77};
 routeMap=L.map('route-map',{scrollWheelZoom:false,worldCopyJump:true}).setView([loc.lat,loc.lon],5);
 L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(routeMap).on('tileerror',()=>{$('#map-status').textContent='Some background map tiles are unavailable. Route coordinates remain editable; check your nautical charts.';});
 routeLayer=L.layerGroup().addTo(routeMap);
 routeMap.on('click',e=>{
   if(!addingWaypoint)return;
   if(routePoints.length>=12){$('#map-status').textContent='Maximum 12 route points. Remove one before adding another.';return;}
   const p={lat:e.latlng.lat,lon:((e.latlng.lng+180)%360+360)%360-180,name:'Waypoint'};
   snapshotRoute();
   if(routePoints.length<2)routePoints.push(p);else{
     let best=1,cost=Infinity;
     for(let i=1;i<routePoints.length;i++){const extra=routeDistance(routePoints[i-1],p)+routeDistance(p,routePoints[i])-routeDistance(routePoints[i-1],routePoints[i]);if(extra<cost){cost=extra;best=i;}}
     routePoints.splice(best,0,p);
   }
   setAdding(false);routeChanged();
 });renderRoute();fitRoute();
}
function renderRoute(){
 const first=routePoints[0],last=routePoints.length>1?routePoints.at(-1):null;
 $('#from-selection').textContent=first?`${first.name||'Departure'} · ${first.lat.toFixed(3)}, ${first.lon.toFixed(3)}`:'Choose a departure';
 $('#to-selection').textContent=last?`${last.name||'Destination'} · ${last.lat.toFixed(3)}, ${last.lon.toFixed(3)}`:'Choose a destination';
 form.elements.points.value=routePoints.map(p=>`${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`).join('\n');
 $('#undo-route').disabled=!routeHistory.length;
 $('#map-instruction').textContent=addingWaypoint?'Click the map to place a waypoint.':'Drag a marker to adjust. Select a point below to center it.';
 updateRouteOverview();
 $('#waypoint-list').innerHTML='';
 routePoints.forEach((p,i)=>{
  const li=document.createElement('li'),b=document.createElement('button');b.type='button';b.className='waypoint-focus';b.textContent=`${i===0?'A':i===routePoints.length-1?'B':i} · ${p.name||'Waypoint'}`;b.onclick=()=>{initMap();routeMap?.setView([p.lat,p.lon],11);};
  const coord=document.createElement('span');coord.textContent=`${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}`;
  const remove=document.createElement('button');remove.type='button';remove.className='text-button';remove.textContent='Remove';remove.setAttribute('aria-label',`Remove route point ${i+1}`);remove.onclick=()=>{snapshotRoute();routePoints.splice(i,1);routeChanged();};
  li.append(b,coord,remove);$('#waypoint-list').append(li);
 });
 if(!routeLayer)return;routeLayer.clearLayers();
 if(routePoints.length>1)L.polyline(routePoints.map(p=>[p.lat,p.lon]),{color:'#236d66',weight:3,dashArray:'8 6'}).addTo(routeLayer);
 routePoints.forEach((p,i)=>{
  const label=i===0?'A':i===routePoints.length-1?'B':String(i);
  const marker=L.marker([p.lat,p.lon],{draggable:true,autoPan:true,title:`Route point ${i+1}: ${p.name||'Waypoint'}`,icon:L.divIcon({className:'route-marker',html:`<span>${label}</span>`,iconSize:[30,30],iconAnchor:[15,15]})}).addTo(routeLayer);
  marker.bindTooltip(`${label} · ${esc(p.name||'Waypoint')}`);
  marker.on('dragend',()=>{snapshotRoute();const v=marker.getLatLng();routePoints[i]={...p,lat:v.lat,lon:((v.lng+180)%360+360)%360-180};routeChanged();});
 });
}
function setAdding(value){addingWaypoint=value;$('#add-waypoint').setAttribute('aria-pressed',String(value));$('#add-waypoint').textContent=value?'Cancel adding':'＋ Add waypoint';$('#map-instruction').textContent=value?'Click the map to place a waypoint.':'Drag markers to adjust your route.';}
$('#add-waypoint').onclick=()=>{initMap();setAdding(!addingWaypoint);};$('#fit-route').onclick=fitRoute;
$('#undo-route').onclick=()=>{if(!routeHistory.length)return;routePoints=JSON.parse(routeHistory.pop());routeChanged();fitRoute();};
$('#clear-route').onclick=()=>{snapshotRoute();routePoints=[];$('#route-from').value='';$('#route-to').value='';routeChanged();};
function choosePlace(kind,p){snapshotRoute();const point={lat:p.latitude,lon:p.longitude,name:p.name};if(kind==='from'){if(routePoints.length)routePoints[0]=point;else routePoints.push(point);}else{if(!routePoints.length){status('#passage-status','Choose a departure first.',true);return;}if(routePoints.length===1)routePoints.push(point);else routePoints[routePoints.length-1]=point;}routeChanged();initMap();fitRoute();}
const routeSuggestions={};
for(const kind of ['from','to'])routeSuggestions[kind]=locationSuggestions($(`#route-${kind}`),$(`#${kind}-results`),p=>choosePlace(kind,p));
document.querySelectorAll('[data-search]').forEach(b=>b.onclick=()=>routeSuggestions[b.dataset.search].search());
$('#use-saved-location').onclick=()=>{const loc=read('boatbot-location');if(!loc){status('#passage-status','Select a location in Today aboard first.',true);return;}choosePlace('from',{latitude:loc.point.lat,longitude:loc.point.lon,name:loc.name});$('#route-from').value=loc.name;};
$('#apply-coordinates').onclick=()=>{try{const next=form.elements.points.value.trim().split('\n').map(l=>{const parts=l.split(',').map(s=>s.trim());if(parts.length!==2||parts.some(x=>!x))throw new Error('Use latitude, longitude on each line.');const lat=Number(parts[0]),lon=Number(parts[1]);if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)throw new Error('Check the coordinate ranges.');return{lat,lon,name:'Charted point'};});if(next.length<2||next.length>12)throw new Error('Enter 2–12 coordinates.');snapshotRoute();routePoints=next;routeChanged();initMap();fitRoute();}catch(e){status('#passage-status',e.message,true);}};
function setDepartureMode(mode){departureMode=mode;$('#departure-control').hidden=mode==='next';$('#when-next').classList.toggle('selected',mode==='next');$('#when-date').classList.toggle('selected',mode==='date');$('#when-next').setAttribute('aria-pressed',String(mode==='next'));$('#when-date').setAttribute('aria-pressed',String(mode==='date'));form.elements.departure.required=mode==='date';$('#when-hint').textContent=mode==='next'?'Compare hourly departures over the next 72 hours.':'Compare 72 hourly departures starting at your chosen time.';invalidateResults();}
$('#when-next').onclick=()=>setDepartureMode('next');$('#when-date').onclick=()=>setDepartureMode('date');
form.elements.speed.oninput=()=>{updateRouteOverview();invalidateResults();};form.elements.departure.oninput=invalidateResults;
$('#example').onclick=()=>{snapshotRoute();routePoints=[{lat:31.03,lon:-81.31,name:'Brunswick offshore'},{lat:30.85,lon:-81.25,name:'Offshore waypoint'},{lat:30.70,lon:-81.35,name:'St. Marys offshore'}];$('#route-from').value='Brunswick offshore';$('#route-to').value='St. Marys offshore';routeChanged();initMap();fitRoute();};
const restored=read('boatbot-route-v2');
if(Array.isArray(restored))routePoints=restored.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180).slice(0,12);
else if(oldPassage?.points){try{routePoints=oldPassage.points.split('\n').map(l=>{const [lat,lon]=l.split(',').map(Number);return{lat,lon,name:'Saved waypoint'};}).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon));}catch{}}

let passage=null,inspectionMap=null;
function removeInspectionMap(){if(inspectionMap){inspectionMap.remove();inspectionMap=null;}}
function renderWindows(){if(!passage)return;removeInspectionMap();const d=passage,filter=$('#window-filter').value;const shown=d.windows.filter(w=>filter==='all'||filter===w.status);const fit=d.windows.find(w=>w.status==='fits');
  // Consecutive hourly candidates are grouped, never interpreted as sub-hourly guarantees.
  const groups=[];for(const w of d.windows){if(w.status!=='fits')continue;const last=groups.at(-1);if(last&&w.departure===last.end+3600000)last.end=w.departure;else groups.push({start:w.departure,end:w.departure});}
  $('#window-content').innerHTML=`<div class="window-summary"><h3>${fit?'First candidate fitting your preferences':'No complete fit in this scan'}</h3><p>${fit?`${time(fit.departure)} · arrives ${time(fit.arrival)}`:'Review marginal, incomplete, and excluded departures below.'}</p><p>${number(d.length)} nm · ${d.samples} route samples · speed checks ${d.speeds.map(s=>number(s)).join(' / ')} kn</p></div>${groups.length?`<p class="muted">Consecutive fitting hourly departures: ${groups.map(g=>`${time(g.start)}${g.end!==g.start?' – '+time(g.end):''}`).join('; ')}.</p>`:''}<p class="hint">72 hourly departure candidates. Ratings use the worst result across three speeds. Farther-ahead forecasts are less certain; no independent model agreement check is included. NWS warnings are displayed separately below.</p>${freshness(d)}${warnings(d.alerts)}${windowCards(d)}<div id="candidate-detail" aria-live="polite"></div>${table(['Departure / arrival','Assessment','Max gust · kn','Max waves · ft','Min mean period · s','Why'],shown.map(w=>`<tr><td>${time(w.departure)}<br><span class="hint">→ ${time(w.arrival)}</span><br><button type="button" class="inspect-row text-button" data-candidate="${d.windows.indexOf(w)}">Inspect passage ↗</button></td><td>${badge(w.status)}</td><td>${number(w.maxGust)}</td><td>${number(w.maxHeight)}</td><td>${number(w.minPeriod)}</td><td>${esc(w.reasons.join('; ')||'Fits sampled numeric preferences')}</td></tr>`))}${!shown.length?'<p>No departures match this filter.</p>':''}`;
 document.querySelectorAll('[data-candidate]').forEach(b=>b.onclick=()=>showCandidate(+b.dataset.candidate));
}
function windowCards(d){
 const candidates=d.windows.filter(w=>w.status==='fits');
 const choices=candidates.filter((w,i)=>i===0||w.departure-candidates[i-1].departure>3600000).slice(0,3);
 if(!choices.length)choices.push(...d.windows.filter(w=>w.status==='marginal').slice(0,3));
 return choices.length?`<div class="candidate-cards">${choices.map(w=>`<article class="candidate-card">${badge(w.status)}<h3>${time(w.departure)}</h3><p>Arrive ${time(w.arrival)}</p><p>Gusts ${number(w.maxGust)} kn · waves ${number(w.maxHeight)} ft<br>Mean period ${number(w.minPeriod)} s</p><button type="button" class="secondary" data-candidate="${d.windows.indexOf(w)}">Inspect passage ↗</button></article>`).join('')}</div>`:'';
}
function showCandidate(index){
 const w=passage?.windows[index];if(!w)return;removeInspectionMap();
 $('#candidate-detail').innerHTML=`<section class="route-detail"><div class="section-heading"><div><p class="eyebrow">YOUR PASSAGE, ON THE MAP</p><h3>Along the passage · ${time(w.departure)}</h3></div><button type="button" id="close-inspection" class="secondary">Close inspection</button></div><p class="hint">Departure ${time(w.departure)} · arrival ${time(w.arrival)} · planning speed ${number(w.speed)} kn. Overall rating also checks ±0.5 kn.</p><div id="inspection-map" aria-label="Selected passage forecast route"></div><div class="map-legend"><span><i class="legend-dot fits-dot"></i>Fits preferences</span><span><i class="legend-dot marginal-dot"></i>Marginal waves</span><span><i class="legend-dot exceeds-dot"></i>Gust limit exceeded</span><span><i class="legend-dot missing-dot"></i>Missing data</span></div><p id="inspection-map-note" class="hint">Select a forecast point for its expected time and conditions. A is departure; B is arrival. General-purpose map, not a nautical chart. Colors reflect the displayed gust and wave values at planning speed; check the overall assessment and warnings separately.</p>${table(['Expected time','Position','Gust · kn','Waves · ft','Mean period · s'],w.details.map((p,i)=>`<tr><td><button type="button" class="text-button inspect-point" data-point="${i}">${time(p.time)} ↗</button></td><td>${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}</td><td>${number(p.gust)}</td><td>${number(p.height)}</td><td>${number(p.period)}</td></tr>`))}</section>`;
 $('#close-inspection').onclick=()=>{removeInspectionMap();$('#candidate-detail').innerHTML='';};
 const points=w.details;
 if(window.L&&points.length){
  // Keep longitudes continuous across the date line for a compact route view.
  const coords=points.map((p,i)=>{let lon=p.lon;if(i){const prev=points[i-1].lon;lon=prev+(((lon-prev+180)%360+360)%360-180);}return [p.lat,lon];});
  for(let i=1;i<coords.length;i++){while(coords[i][1]-coords[i-1][1]>180)coords[i][1]-=360;while(coords[i][1]-coords[i-1][1]<-180)coords[i][1]+=360;}
  inspectionMap=L.map('inspection-map',{scrollWheelZoom:false});
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(inspectionMap).on('tileerror',()=>{$('#inspection-map-note').textContent='Some background tiles are unavailable. Route points and forecast table remain available.';});
  L.polyline(coords,{color:'#236d66',weight:4,opacity:.8}).addTo(inspectionMap);
  const markers=points.map((p,i)=>{
   const missing=[p.gust,p.height,p.period].some(v=>typeof v!=='number'||!Number.isFinite(v));
   const color=missing?'#7a8994':p.gust>+preferences.gust?'#b34c36':p.height>=+preferences.height||p.period<=+preferences.period?'#bc8c28':'#39816a';
   const label=i===0?'A · Departure':i===points.length-1?'B · Arrival':`Forecast point ${i+1}`;
   const marker=L.circleMarker(coords[i],{radius:i===0||i===points.length-1?9:6,color:'#fff',weight:2,fillColor:color,fillOpacity:1}).addTo(inspectionMap);
   marker.bindTooltip(label,{permanent:i===0||i===points.length-1,direction:i===0?'top':'bottom'});
   marker.bindPopup(`<strong>${label}</strong><br>${esc(time(p.time))}<br>Gusts ${number(p.gust)} kn<br>Significant waves ${number(p.height)} ft<br>Mean period ${number(p.period)} s<br><small>${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}</small>`);return marker;
  });
  inspectionMap.fitBounds(coords,{padding:[35,35],maxZoom:12});
  document.querySelectorAll('.inspect-point').forEach(b=>b.onclick=()=>{const i=+b.dataset.point;inspectionMap.setView(coords[i],Math.max(inspectionMap.getZoom(),9));markers[i].openPopup();$('#inspection-map').scrollIntoView({behavior:'smooth',block:'center'});});
 }else{$('#inspection-map').hidden=true;$('#inspection-map-note').textContent='Map unavailable. Forecast details are listed below.';}
 $('#candidate-detail').scrollIntoView({behavior:'smooth',block:'start'});
}
$('#window-filter').onchange=renderWindows;
form.onsubmit=async e=>{
  e.preventDefault();const revision=routeRevision;const raw={...Object.fromEntries(new FormData(form)),gust:preferences.gust,height:preferences.height,period:preferences.period,name:routePoints.length>1?`${routePoints[0].name||'Departure'} → ${routePoints.at(-1).name||'Destination'}`:'Your passage'};raw.points=routePoints.map(p=>`${p.lat}, ${p.lon}`).join('\n');if(departureMode==='next')raw.departure=dateInput(Math.ceil(Date.now()/3600000)*3600000);save('boatbot-passage',raw);$('#calculate').disabled=true;status('#passage-status','Checking hourly route samples and 72 departure times. This may take up to a minute…');$('#passage-content').innerHTML='';
  try{
    if(routePoints.length<2)throw new Error('Choose both a departure and destination.');
    const points=raw.points.trim().split('\n').map(l=>{const parts=l.trim().split(',').map(s=>s.trim());if(parts.length!==2||parts.some(p=>p===''))throw new Error('Use latitude, longitude on each waypoint line.');return {lat:Number(parts[0]),lon:Number(parts[1])};});
    const d=await api('/api/passage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({points,departure:new Date(raw.departure).toISOString(),speed:+raw.speed,gust:+raw.gust,height:+raw.height,period:+raw.period})});
    if(revision!==routeRevision){status('#passage-status','Your route changed during the check. Find windows again for the updated route.',true);return;}passage=d;renderWindows();const first=d.windows[0];$('#passage-content').innerHTML=`<h3>${esc(raw.name)}</h3><p>${badge(first.status)} · ${number(d.length)} nm · arrival ${time(first.arrival)}</p>${warnings(d.alerts)}<p class="hint">Conditions below are for the requested planning speed; the overall rating also checks ±0.5 kn. Each sample uses the worse of the surrounding forecast hours.</p>${table(['Expected time','Position','Gust · kn','Waves · ft','Mean period · s'],first.details.map(p=>`<tr><td>${time(p.time)}</td><td>${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}</td><td>${number(p.gust)}</td><td>${number(p.height)}</td><td>${number(p.period)}</td></tr>`))}`;status('#passage-status','Passage checked. Open Window finder to compare departures.');tab('windows');
  }catch(e){status('#passage-status',e.message,true);}finally{$('#calculate').disabled=false;}
};
applyPreferences();renderRoute();
const locationSaved=read('boatbot-location');if(locationSaved?.point){$('#location-source').textContent='Using your last selected location on this device.';loadLocation(locationSaved.point,locationSaved.name);}else{status('#local-status','Choose a location above to see your outlook.');$('#location-source').textContent='No location selected. Search a place, enter coordinates, or allow browser location.';}
