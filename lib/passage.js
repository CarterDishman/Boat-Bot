export const NM = 1852;
const rad = n => n * Math.PI / 180;
export function distance(a, b) {
  const x = Math.sin(rad(b.lat-a.lat)/2)**2 + Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(rad(b.lon-a.lon)/2)**2;
  return 3440.065 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0,1-x)));
}
export function validateRoute(input) {
  if (!input || !Array.isArray(input.points) || input.points.length < 2 || input.points.length > 12) throw new Error('Enter 2–12 waypoints.');
  const points = input.points.map(p => {
    if (typeof p.lat !== 'number' || typeof p.lon !== 'number' || !Number.isFinite(p.lat) || !Number.isFinite(p.lon) || Math.abs(p.lat)>90 || Math.abs(p.lon)>180) throw new Error('Waypoint coordinates are invalid.');
    return {lat:p.lat,lon:p.lon};
  });
  const speed = Number(input.speed), gust = Number(input.gust), height = Number(input.height), period = Number(input.period);
  if (!(speed>=1 && speed<=30 && gust>0 && gust<=100 && height>0 && height<=40 && period>0 && period<=30)) throw new Error('Check speed and weather limits.');
  const departure = Date.parse(input.departure);
  if (!Number.isFinite(departure) || departure < Date.now()-3600000 || departure > Date.now()+7*86400000) throw new Error('Choose a departure within the next seven days.');
  const length = points.slice(1).reduce((sum,p,i)=>sum+distance(points[i],p),0);
  if (length<0.2 || length>600) throw new Error('This version supports routes from 0.2 to 600 nautical miles.');
  return {points,speed,gust,height,period,departure,length};
}
// Great-circle interpolation, including routes across the date line.
function interpolate(a,b,f) {
  const vector=p=>[Math.cos(rad(p.lat))*Math.cos(rad(p.lon)),Math.cos(rad(p.lat))*Math.sin(rad(p.lon)),Math.sin(rad(p.lat))];
  const u=vector(a),v=vector(b),omega=Math.acos(Math.max(-1,Math.min(1,u.reduce((s,x,i)=>s+x*v[i],0))));
  if (omega<1e-8) return {...a};
  const q=u.map((x,i)=>(Math.sin((1-f)*omega)*x+Math.sin(f*omega)*v[i])/Math.sin(omega));
  return {lat:Math.atan2(q[2],Math.hypot(q[0],q[1]))*180/Math.PI,lon:Math.atan2(q[1],q[0])*180/Math.PI};
}
export function sampleRoute(points, speed) {
  let cumulative=0; const samples=[{...points[0],nm:0}];
  for(let i=1;i<points.length;i++) {
    const length=distance(points[i-1],points[i]);
    // At most one hour between samples; cap total upstream work explicitly.
    const steps=Math.max(1,Math.ceil(length/speed));
    for(let j=1;j<=steps;j++) samples.push({...interpolate(points[i-1],points[i],j/steps),nm:cumulative+length*j/steps});
    cumulative+=length;
  }
  if(samples.length>110) throw new Error('Route needs too many hourly samples. Shorten the route or increase planning speed.');
  return samples;
}
function valuesAt(hourly,key,time) {
  if (!hourly?.time || !hourly[key]) return null;
  const hour=time/3600000;
  const first=hourly.time[0]/3600;
  const lo=Math.floor(hour-first),hi=Math.ceil(hour-first);
  if(lo<0||hi>=hourly.time.length) return null;
  const vals=[hourly[key][lo],hourly[key][hi]];
  return vals.every(v=>typeof v==='number'&&Number.isFinite(v)) ? vals : null;
}
export function evaluate(samples, forecasts, departure, speed, limits) {
  let maxGust=null,maxHeight=null,minPeriod=null,missing=false,exceeds=false,marginal=false,storm=false;
  const details=samples.map((p,i)=>{
    const time=departure+p.nm/speed*3600000, f=forecasts[i];
    // Use the worse of surrounding forecast hours; never interpolate away a threshold exceedance.
    const g=valuesAt(f.weather?.hourly,'wind_gusts_10m',time),h=valuesAt(f.marine?.hourly,'wave_height',time),t=valuesAt(f.marine?.hourly,'wave_period',time),w=valuesAt(f.weather?.hourly,'weather_code',time);
    const gust=g?Math.max(...g):null,height=h?Math.max(...h):null,period=t?Math.min(...t):null;
    if(gust===null||height===null||period===null||!w) missing=true;
    if(gust!==null) {maxGust=Math.max(maxGust??0,gust);if(gust>limits.gust) exceeds=true;}
    if(height!==null) {maxHeight=Math.max(maxHeight??0,height);if(height>=limits.height) marginal=true;}
    if(period!==null) {minPeriod=Math.min(minPeriod??Infinity,period);if(period<=limits.period) marginal=true;}
    if(w?.some(n=>n>=95)) storm=true;
    return {...p,time,gust,height,period};
  });
  const reasons=[];
  if(exceeds) reasons.push(`Gusts exceed ${limits.gust} kn`);
  if(storm) reasons.push('Thunderstorms forecast');
  if(missing) reasons.push('Required forecast data missing');
  if(maxHeight!==null&&maxHeight>=limits.height) reasons.push(`Waves reach ${maxHeight.toFixed(1)} ft`);
  if(minPeriod!==null&&minPeriod<=limits.period) reasons.push(`Mean wave period falls to ${minPeriod.toFixed(1)} s`);
  const status=exceeds||storm?'exceeds':missing?'incomplete':marginal?'marginal':'fits';
  return {departure,arrival:departure+samples.at(-1).nm/speed*3600000,speed,status,maxGust,maxHeight,minPeriod,reasons,details};
}
