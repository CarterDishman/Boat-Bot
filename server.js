import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {validateRoute,sampleRoute,evaluate,distance} from './lib/passage.js';
const port=Number(process.env.PORT)||3000;
const cache=new Map(), pending=new Map();
async function upstream(url,ttl=3600000,type='json') {
  const key=String(url),saved=cache.get(key);
  if(saved&&Date.now()-saved.at<ttl)return saved;
  if(pending.has(key))return pending.get(key);
  const task=(async()=>{
    const response=await fetch(url,{signal:AbortSignal.timeout(20000),headers:{'User-Agent':'BoatBot/0.1 (personal cruising dashboard)','Accept':type==='json'?'application/json':'text/plain'}});
    if(!response.ok)throw new Error(`Forecast provider returned ${response.status}. Try again later.`);
    const result={data:type==='json'?await response.json():await response.text(),at:Date.now()};
    if(cache.size>=350)cache.delete(cache.keys().next().value);
    cache.set(key,result);return result;
  })();pending.set(key,task);
  try{return await task;}finally{pending.delete(key);}
}
const urlFor=(base,params)=>{const u=new URL(base);Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,v));return u;};
function coordinates(lat,lon){lat=Number(lat);lon=Number(lon);if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)throw new Error('Invalid coordinates.');return {lat,lon};}
async function forecast(points) {
  const coords={latitude:points.map(p=>p.lat.toFixed(4)).join(','),longitude:points.map(p=>p.lon.toFixed(4)).join(','),timezone:'GMT',timeformat:'unixtime',forecast_days:7};
  const requests=await Promise.allSettled([
    upstream(urlFor('https://api.open-meteo.com/v1/forecast',{...coords,hourly:'temperature_2m,precipitation_probability,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code',wind_speed_unit:'kn',temperature_unit:'fahrenheit'})),
    upstream(urlFor('https://marine-api.open-meteo.com/v1/marine',{...coords,hourly:'wave_height,wave_period,wave_direction,wind_wave_height,wind_wave_period,swell_wave_height,swell_wave_period',length_unit:'imperial',cell_selection:'sea'}))
  ]);
  const errors=[]; const data=requests.map((r,i)=>{if(r.status==='rejected'){errors.push(`${i?'Marine':'Weather'} unavailable: ${r.reason.message}`);return null;}return r.value;});
  const list=d=>!d?[]:Array.isArray(d.data)?d.data:[d.data];
  const w=list(data[0]),m=list(data[1]);
  return {forecasts:points.map((_,i)=>({weather:w[i]??null,marine:m[i]??null})),fetchedAt:data.filter(Boolean).map(d=>d.at),errors};
}
async function alerts(point) {
  try {
    const result=await upstream(urlFor('https://api.weather.gov/alerts/active',{point:`${point.lat.toFixed(4)},${point.lon.toFixed(4)}`}),300000);
    return {status:'checked',scope:'NWS point query only; U.S. coverage. An empty response does not establish worldwide warning coverage.',items:(result.data.features??[]).map(f=>({event:f.properties.event,headline:f.properties.headline,description:f.properties.description,instruction:f.properties.instruction,url:f.properties['@id'],expires:f.properties.expires})),fetchedAt:result.at};
  }catch{return {status:'unavailable',items:[],scope:'Official warnings unavailable here. Check the local marine authority.'};}
}
async function buoys(point) {
  try {
    const result=await upstream('https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt',600000,'text');
    const rows=result.data.split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>l.trim().split(/\s+/)).filter(v=>v.length>=19).map(v=>{
      const number=i=>v[i]==='MM'?null:Number(v[i]);
      const lat=number(1),lon=number(2);
      return {id:v[0],lat,lon,nm:distance(point,{lat,lon}),time:Date.UTC(+v[3],+v[4]-1,+v[5],+v[6],+v[7]),wind:number(9)===null?null:number(9)*1.943844,gust:number(10)===null?null:number(10)*1.943844,height:number(11)===null?null:number(11)*3.28084,dominantPeriod:number(12),meanPeriod:number(13)};
    }).filter(r=>Number.isFinite(r.nm)&&r.nm<150&&Date.now()-r.time<6*3600000).sort((a,b)=>a.nm-b.nm).slice(0,3);
    return {status:'checked',items:rows};
  }catch{return {status:'unavailable',items:[]};}
}
async function body(req){let raw='';for await(const c of req){raw+=c;if(raw.length>20000)throw new Error('Request too large.');}return JSON.parse(raw);}
const clients=new Map();
function allow(req){const now=Date.now(),key=req.socket.remoteAddress;let r=clients.get(key);if(!r||now-r.at>60000){r={at:now,n:0};clients.set(key,r);}if(clients.size>2000)clients.clear();return ++r.n<=45;}
const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css'};
const server=http.createServer(async(req,res)=>{
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  try {
    const u=new URL(req.url,'http://localhost');
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if(u.pathname==='/health')return send(200,{ok:true});
    if(u.pathname.startsWith('/api/')&&!allow(req))return send(429,{error:'Too many requests. Wait a minute.'});
    if(u.pathname==='/api/search'&&req.method==='GET') {
      const name=(u.searchParams.get('q')??'').trim().slice(0,100);if(name.length<2)return send(200,{results:[]});
      const r=await upstream(urlFor('https://geocoding-api.open-meteo.com/v1/search',{name,count:8,language:'en',format:'json'}),86400000);return send(200,r.data);
    }
    if(u.pathname==='/api/local'&&req.method==='GET') {
      if(!u.searchParams.has('lat')||!u.searchParams.has('lon'))throw new Error('Coordinates required.');
      const point=coordinates(u.searchParams.get('lat'),u.searchParams.get('lon'));
      const [f,a,b]=await Promise.all([forecast([point]),alerts(point),buoys(point)]);
      return send(200,{...f,alerts:a,buoys:b,point});
    }
    if(u.pathname==='/api/passage'&&req.method==='POST') {
      const route=validateRoute(await body(req)); const slow=Math.max(1,route.speed-0.5),fast=route.speed+0.5;
      const samples=sampleRoute(route.points,slow),f=await forecast(samples),windows=[];
      for(let h=0;h<72;h++) {
        const departure=route.departure+h*3600000;
        const variants=[slow,route.speed,fast].map(s=>evaluate(samples,f.forecasts,departure,s,route));
        const rank={fits:0,marginal:1,incomplete:2,exceeds:3};
        const worst=[...variants].sort((a,b)=>rank[b.status]-rank[a.status])[0];
        windows.push({...variants[1],status:worst.status,reasons:[...new Set(variants.flatMap(v=>v.reasons))],maxGust:Math.max(...variants.map(v=>v.maxGust??-Infinity)),maxHeight:Math.max(...variants.map(v=>v.maxHeight??-Infinity)),minPeriod:Math.min(...variants.map(v=>v.minPeriod??Infinity)),variants:variants.map(({details,...v})=>v),details:h===0?variants[1].details:undefined});
      }
      // Check warnings across the route rather than only at the departure point.
      const checkPoints=samples.filter((_,i)=>i===0||i===samples.length-1||i%Math.max(1,Math.ceil(samples.length/6))===0);
      const checks=await Promise.all(checkPoints.map(alerts));
      const items=[...new Map(checks.flatMap(a=>a.items).map(a=>[a.url??a.headline,a])).values()];
      return send(200,{length:route.length,samples:samples.length,speeds:[slow,route.speed,fast],windows,...f,forecasts:undefined,alerts:{status:checks.every(a=>a.status==='checked')?'checked':'partial',items,scope:'NWS checks at sampled route points; U.S. coverage only. Warnings are separate from numeric window ratings.'}});
    }
    if(files[u.pathname]&&req.method==='GET') {
      const content=await readFile(new URL(`./public/${files[u.pathname]}`,import.meta.url));res.writeHead(200,{'Content-Type':u.pathname.endsWith('.js')?'text/javascript':u.pathname.endsWith('.css')?'text/css':'text/html','Cache-Control':'no-cache'});res.end(content);return;
    }
    send(404,{error:'Not found'});
  }catch(error){send(400,{error:error.message??'Unable to complete request.'});}
});
server.listen(port,'0.0.0.0',()=>console.log(`Boat Bot listening on ${port}`));
