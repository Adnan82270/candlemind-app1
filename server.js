// Zero-dependency backend. Run: TWELVEDATA_API_KEY=xxx node server.js
const http=require("http"),fs=require("fs"),path=require("path");
const KEY=process.env.TWELVEDATA_API_KEY,PORT=process.env.PORT||3000,ORIGIN=process.env.ALLOWED_ORIGIN||"";
const PAIRS=new Set(["EUR/USD","GBP/USD","USD/JPY","AUD/USD","USD/CAD","USD/CHF","NZD/USD"]);
const IV={60:"1min",300:"5min",900:"15min"};
const STATIC={"/":"index.html","/index.html":"index.html","/manifest.webmanifest":"manifest.webmanifest","/sw.js":"sw.js","/icon-192.png":"icon-192.png","/icon-512.png":"icon-512.png"};
const TYPES={html:"text/html",webmanifest:"application/manifest+json",js:"text/javascript",png:"image/png"};
const {aggregateTicks}=require('./ticks');// used when a tick provider is added
const reqs=[];let lastRateLimitAt=null,lastError=null,lastOk=null;const cache=new Map();
const BASE=process.env.TWELVEDATA_BASE||"https://api.twelvedata.com";
async function fetchC(pair,tf,n,fresh){
 const k=pair+tf,hit=cache.get(k);
 if(hit&&Date.now()-hit.at<(fresh?5000:15000)&&hit.v.length>=n)return hit;
 const u=`${BASE}/time_series?symbol=${encodeURIComponent(pair)}&interval=${IV[tf]}&outputsize=${n+1}&timezone=UTC&order=ASC&apikey=${KEY}`;
 reqs.push(Date.now());const r=await fetch(u,{signal:AbortSignal.timeout(8000)});
 if(r.status===429){lastRateLimitAt=new Date().toISOString();throw{code:429,msg:"Provider rate limit"}}
 const j=await r.json();if(j.status==="error")throw{code:j.code===429?429:502,msg:"Provider error: "+String(j.message).split(KEY).join("***")};
 const m=j.meta||{};
 if(String(m.symbol).toUpperCase()!==pair)throw{code:502,msg:`Provider returned symbol ${m.symbol}, expected ${pair}`};
 if(m.interval!==IV[tf])throw{code:502,msg:`Provider returned interval ${m.interval}, expected ${IV[tf]}`};
 let v=(j.values||[]).map(x=>({t:Date.parse(String(x.datetime).replace(" ","T")+"Z"),o:+x.open,h:+x.high,l:+x.low,c:+x.close}));
 v=v.filter(x=>Number.isFinite(x.t+x.o+x.h+x.l+x.c)&&x.t+tf*1000<=Date.now()); // drop forming candle
 if(v.length<60)throw{code:502,msg:"Provider returned too few completed candles ("+v.length+")"};
 const e={at:Date.now(),v,meta:m};cache.set(k,e);lastOk=new Date().toISOString();return e}
const view=(e,n)=>{const v=e.v.slice(-n);return{provider:"twelvedata",symbol:e.meta.symbol,interval:e.meta.interval,exchange:e.meta.exchange||"",supportedIntervals:Object.values(IV),latestT:v.at(-1).t,fetchedAt:new Date(e.at).toISOString(),candles:v}};
var CORS_;const send=(res,c,o,h={})=>{res.writeHead(c,{"Content-Type":"application/json",...CORS,...h});res.end(JSON.stringify(o))};
const fail=(res,e)=>{lastError=(e.msg||'Provider unreachable')+' @ '+new Date().toISOString();send(res,e.code||502,{error:e.msg||'Provider unreachable'})};
const CORS=ORIGIN?{"Access-Control-Allow-Origin":ORIGIN,"Access-Control-Allow-Headers":"Content-Type, Cache-Control, Pragma","Access-Control-Allow-Methods":"GET, OPTIONS"}:{};
http.createServer(async(req,res)=>{
 console.log(new Date().toISOString(),req.method,req.url.replace(/apikey=[^&]*/,"apikey=***"));
 if(req.method==="OPTIONS"){res.writeHead(204,CORS);return res.end()}
 const u=new URL(req.url,"http://x");
 if(u.pathname==="/api/status")return send(res,200,{configured:!!KEY,provider:"twelvedata",lastOk,lastError,lastRateLimitAt,requestsLastMinute:reqs.filter(t=>Date.now()-t<60000).length,supportedIntervals:Object.values(IV)});
 if(u.pathname==="/api/verify"){
  const pair=u.searchParams.get("pair"),tf=+u.searchParams.get("tf");
  if(!PAIRS.has(pair)||!IV[tf])return send(res,400,{error:"Unsupported pair or timeframe (provider offers 1m, 5m, 15m)"});
  if(!KEY)return send(res,503,{error:"TWELVEDATA_API_KEY not set on server"});
  try{const d=view(await fetchC(pair,tf,100,true),100),last=d.candles.at(-1);
   return send(res,200,{provider:d.provider,symbol:d.symbol,interval:d.interval,supportedIntervals:d.supportedIntervals,count:d.candles.length,firstCandleUTC:new Date(d.candles[0].t).toISOString(),latestCandleUTC:new Date(d.latestT).toISOString(),ageSeconds:Math.round((Date.now()-d.latestT)/1000),lastCandle:last,fetchedAt:d.fetchedAt})}
  catch(e){return fail(res,e)}}
 if(u.pathname==="/api/candles"){
  const pair=u.searchParams.get("pair"),tf=+u.searchParams.get("tf"),n=Math.min(500,Math.max(60,+u.searchParams.get("n")||200));
  if(!PAIRS.has(pair))return send(res,400,{error:"Unsupported pair"});
  if(!IV[tf])return send(res,400,{error:"Unsupported timeframe (provider offers 1m, 5m, 15m)"});
  if(!KEY)return send(res,503,{error:"TWELVEDATA_API_KEY not set on server"});
  try{send(res,200,view(await fetchC(pair,tf,n,u.searchParams.get("fresh")==="1"),n))}catch(e){fail(res,e)}
  return}
 const f=STATIC[u.pathname];if(!f){res.writeHead(404);return res.end()}
 res.writeHead(200,{"Content-Type":TYPES[f.split(".").pop()]||"application/octet-stream"});res.end(fs.readFileSync(path.join(__dirname,f)))
}).listen(PORT,()=>console.log("CandleMind on :"+PORT+(KEY?"":" (no API key: live data unavailable)")));
