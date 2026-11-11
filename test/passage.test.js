import {test} from 'node:test';
import assert from 'node:assert/strict';
import {distance,sampleRoute,evaluate,validateRoute} from '../lib/passage.js';
const start=Date.UTC(2026,0,1);
const samples=[{lat:30,lon:-80,nm:0},{lat:30.1,lon:-80,nm:6.5}];
function forecasts(gust=20,height=3.9,period=6.1){return samples.map(()=>({weather:{hourly:{time:[start/1000,start/1000+3600,start/1000+7200],wind_gusts_10m:[gust,gust,gust],weather_code:[0,0,0]}},marine:{hourly:{time:[start/1000,start/1000+3600,start/1000+7200],wave_height:[height,height,height],wave_period:[period,period,period]}}}));}
const limits={gust:20,height:4,period:6};
test('20-knot gust fits, above 20 is excluded',()=>{assert.equal(evaluate(samples,forecasts(),start,6.5,limits).status,'fits');assert.equal(evaluate(samples,forecasts(20.01),start,6.5,limits).status,'exceeds');});
test('strict wave preference boundaries are marginal',()=>{assert.equal(evaluate(samples,forecasts(20,4,6.1),start,6.5,limits).status,'marginal');assert.equal(evaluate(samples,forecasts(20,3.9,6),start,6.5,limits).status,'marginal');});
test('null and horizon gaps never fit',()=>{const f=forecasts();f[1].marine.hourly.wave_height[1]=null;assert.equal(evaluate(samples,f,start,6.5,limits).status,'incomplete');assert.equal(evaluate(samples,forecasts(),start+7200000,6.5,limits).status,'incomplete');});
test('surrounding-hour gust spike is preserved',()=>{const f=forecasts();f[0].weather.hourly.wind_gusts_10m[1]=26;assert.equal(evaluate(samples,f,start+1800000,6.5,limits).status,'exceeds');});
test('thunderstorm flags an otherwise fitting candidate',()=>{const f=forecasts();f[0].weather.hourly.weather_code[0]=95;assert.equal(evaluate(samples,f,start,6.5,limits).status,'exceeds');});
test('route crosses date line without detouring around globe',()=>{const p=sampleRoute([{lat:0,lon:179.9},{lat:0,lon:-179.9}],6);assert.ok(p.every(p=>Math.abs(p.lon)>179));assert.ok(Math.abs(p.at(-1).nm-12)<.1);});
test('route samples no more than an hour apart',()=>{const p=sampleRoute([{lat:31.03,lon:-81.31},{lat:30.85,lon:-81.25},{lat:30.70,lon:-81.35}],6);for(let i=1;i<p.length;i++)assert.ok(p[i].nm-p[i-1].nm<=6.001);assert.ok(distance(p[0],p.at(-1))>10);});
test('rejects coordinates and dates outside supported bounds',()=>{assert.throws(()=>validateRoute({points:[{lat:91,lon:0},{lat:0,lon:0}]}));assert.throws(()=>validateRoute({points:[{lat:1,lon:0},{lat:0,lon:0}],speed:6,gust:20,height:4,period:6,departure:'invalid'}));});
