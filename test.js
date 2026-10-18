const vm=require("vm"),fs=require("fs");
const src=fs.readFileSync("index.html","utf8").match(/<script>([\s\S]*)<\/script>/)[1];
const store={};const el=()=>({value:"800",innerHTML:"",dataset:{},classList:{add(){},remove(){}},getContext:()=>({scale(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fillRect(){},fillText(){}}),style:{},clientWidth:300,clientHeight:300});
let fetchImpl=async()=>{throw new Error("net down")};
const ctx={console,setTimeout,clearInterval,setInterval,Date,Math,
 document:{querySelector:()=>el(),documentElement:{dataset:{}},hidden:false},
 localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>store[k]=v},navigator:{},location:{protocol:"file:"},
 addEventListener(){},devicePixelRatio:1,getComputedStyle:()=>({getPropertyValue:()=>"#fff"}),fetch:(...a)=>fetchImpl(...a)};
vm.createContext(ctx);vm.runInContext(src,ctx);
let pass=0,fail=0;const ok=(n,c)=>{c?pass++:fail++;console.log((c?"PASS ":"FAIL ")+n)};
const run=s=>vm.runInContext(s,ctx),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const mk=(n,f)=>Array.from({length:n},(_,i)=>{const c=f(i);return{t:Date.now()-(n-i+2)*60000,o:c-.0002,h:c+.0004,l:c-.0004,c}});
ctx.mk=mk;
(async()=>{
 ok("EMA of constant = constant",run("ema(Array(50).fill(2),9).at(-1)")===2);
 run("var up=mk(120,i=>1+i*0.0004+Math.sin(i)*0.00005)");run("var dn=mk(120,i=>1-i*0.0004+Math.sin(i)*0.00005)");
 ok("RSI >95 on steady rise",run("ind(up).rsi")>95);ok("RSI <5 on steady fall",run("ind(dn).rsi")<5);
 ok("EMA order bullish on rise",run("(()=>{const I=ind(up);return I.e9>I.e21&&I.e21>I.e50})()"));
 ok("uptrend not DOWN",run("signal(up).dir")!=="DOWN");ok("downtrend not UP",run("signal(dn).dir")!=="UP");
 ok("<60 candles = NO TRADE",run("signal(up.slice(0,30)).dir")==="NO");
 ok("signal ignores future candles",run("(()=>{const a=signal(up.slice(0,100)).score,f=up.slice();for(let i=100;i<120;i++)f[i]={...f[i],c:9,h:9.1,l:8.9,o:9};return a===signal(f.slice(0,100)).score})()"));
 ok("flat market = NO TRADE",run("signal(mk(120,i=>1+(i%2)*0.00001)).dir")==="NO");
 run("S.src='demo';S.tf=900;S.exp=900;S.pair='EUR/USD'");run("analyze()");await sleep(800);run("analyze()");await sleep(800);
 ok("same candle: only 1 history entry",run("H.length")===1);ok("duplicate message shown",run("msg").includes("already analyzed"));
 run("saveS()");ok("settings persisted",JSON.parse(store.cm_s).tf===900);
 await run("backtest()");const bt=run("BT");ok("backtest counts add up",!bt.err&&bt.cor+bt.inc+bt.tie+bt.nt===bt.N-59-bt.k);
 ok("backtest rows = predictions",bt.rows.length===bt.cor+bt.inc+bt.tie);

 const post=o=>({ok:true,json:async()=>o});
 const resp=(c,o={})=>post({provider:"mock",symbol:"EUR/USD",interval:"1min",supportedIntervals:["1min","5min","15min"],latestT:c.at(-1).t,candles:c,...o});
 const fresh=()=>mk(80,i=>1+i*.0001+Math.sin(i)*.0002).map(x=>({...x,t:x.t+60000}));
 const rej=async(s)=>{try{await run(s);return ""}catch(e){return e.message}};
 run("S.src='live';S.tf=10");ok("unsupported live timeframe rejected",/Unsupported/.test(await rej("load('EUR/USD',10,100)")));
 run("S.tf=60");ok("API failure -> error",/Data provider error/.test(await rej("load('EUR/USD',60,100)")));
 fetchImpl=async()=>resp(mk(80,i=>1+i*.0001).map(x=>({...x,h:x.l-1})));ok("malformed candles rejected",/Invalid/.test(await rej("load('EUR/USD',60,80)")));
 fetchImpl=async()=>{const c=fresh();return resp(c,{symbol:"GBP/USD"})};ok("symbol mismatch rejected",/mismatch/.test(await rej("load('EUR/USD',60,80)")));
 fetchImpl=async()=>{const c=fresh();return resp(c,{interval:"5min"})};ok("interval mismatch rejected",/mismatch/.test(await rej("load('EUR/USD',60,80)")));
 fetchImpl=async()=>{const c=fresh();return resp(c,{latestT:1})};ok("timestamp mismatch rejected",/timestamp/.test(await rej("load('EUR/USD',60,80)")));
 fetchImpl=async()=>{const c=fresh();c[70].t-=600000;c[71].t=c[70].t+60000;return resp(c)};ok("gap/ordering problems rejected",await rej("load('EUR/USD',60,80)")!=="");
 fetchImpl=async()=>{const c=mk(80,i=>1+i*.0001).map((x,i)=>({...x,t:Date.now()-5*86400000+i*60000}));return resp(c)};
 run("analyze()");await sleep(800);ok("stale live data -> DATA UNAVAILABLE",run("last.dir")==="NA"&&/STALE/.test(run("last.why")));
 fetchImpl=async()=>resp(fresh());run("H=[]");run("analyze()");await sleep(800);
 ok("fresh live data -> UP/DOWN/NO with source meta",["UP","DOWN","NO"].includes(run("last.dir"))&&run("last.meta.provider")==="mock"&&run("META.symbol")==="EUR/USD");
 ok("latest price equals last candle close",Math.abs(run("last.price")-run("getCandles('EUR/USD',60,80).at(-1).c"))<1e-12);
 run("S.tf=60;S.exp=30");run("analyze()");await sleep(800);ok("expiry not multiple of candle -> blocked",run("last.dir")==="NA"&&/multiple/.test(run("last.why")));

 // --- live pipeline: new-candle vs same-candle ---
 run("S.src='live';S.tf=60;S.exp=60;S.autoLive=true;H=[];failAt=0;lastErr=''");
 const want=Math.floor((Date.now()-8000)/60000)-1;let calls=0;
 const cands=li=>mk(80,i=>1+i*.0001+Math.sin(i)*.0002).map((x,i)=>({...x,t:(li-(79-i))*60000}));
 fetchImpl=async()=>{calls++;return resp(cands(want))};
 run("liveTick()");await sleep(800);ok("auto-analysis created 1 signal for the new candle",run("H.length")===1&&run("H[0].idx")===want&&run("H[0].id").endsWith("|"+want));
 ok("connection indicator LIVE after verified fetch",run("conn()[0]")==="LIVE");
 const c1=calls;run("liveTick()");await sleep(300);ok("liveTick does not refetch/re-signal same candle",calls===c1&&run("H.length")===1);
 run("analyze()");await sleep(800);ok("manual Analyze on same candle adds nothing",run("H.length")===1);
 fetchImpl=async()=>resp(cands(want+1));run("analyze()");await sleep(800);ok("genuinely new candle allows a new signal",run("H.length")===2);
 fetchImpl=async()=>{throw new Error("net down")};run("failAt=0;analyze()");await sleep(800);ok("fetch failure -> OFFLINE + DATA UNAVAILABLE",run("conn()[0]")==="OFFLINE"&&run("last.dir")==="NA");
 run("S.src='live';S.tf=10");ok("unsupported tf not in LIVE_TFS",!run("LIVE_TFS.includes(S.tf)"));
 const {aggregateTicks}=require("./ticks");const ag=aggregateTicks([{t:1000,p:1},{t:5000,p:1.2},{t:9000,p:.9},{t:12000,p:1.1},{t:16000,p:1.3}],10);
 ok("tick aggregation to 10s candles",ag.length===2&&ag[0].o===1&&ag[0].h===1.2&&ag[0].l===.9&&ag[0].c===.9&&ag[1].c===1.3);

 // --- connection-failure diagnostics ---
 const L0=ctx.location;
 fetchImpl=async()=>{throw new TypeError("Failed to fetch")};run("S.src='live';S.tf=60;S.api=''");
 ctx.location={protocol:"https:",hostname:"x.claudeusercontent.com",origin:"https://x.claudeusercontent.com"};
 ok("Artifact host -> explains no backend possible",/Claude Artifact/.test(await rej("load('EUR/USD',60,80)")));
 ctx.location={protocol:"https:",hostname:"app.example.com",origin:"https://app.example.com"};run("S.api='http://1.2.3.4:3000'");
 ok("https page + http backend -> mixed-content message",/Mixed content/.test(await rej("load('EUR/USD',60,80)")));
 run("S.api='https://api.example.com'");ok("network failure -> names URL and CORS/ALLOWED_ORIGIN",/api\.example\.com[\s\S]*ALLOWED_ORIGIN/.test(await rej("load('EUR/USD',60,80)")));
 fetchImpl=async()=>({ok:false,status:404,json:async()=>{throw new Error("html")}});
 ok("HTML/404 reply -> 'no CandleMind backend'",/no CandleMind backend/.test(await rej("load('EUR/USD',60,80)")));
 fetchImpl=async()=>({ok:false,status:503,json:async()=>({error:"TWELVEDATA_API_KEY not set on server"})});
 ok("503 key-missing surfaced",/HTTP 503.*TWELVEDATA_API_KEY/.test(await rej("load('EUR/USD',60,80)")));
 fetchImpl=async()=>({ok:false,status:429,json:async()=>({error:"Provider rate limit"})});
 ok("429 rate limit surfaced",/HTTP 429.*rate limit/.test(await rej("load('EUR/USD',60,80)")));
 ok("failed fetch never yields LIVE",run("conn()[0]")!=="LIVE");
 ctx.location=L0;run("S.api=''");
 console.log(`\n${pass} passed, ${fail} failed`);process.exit(fail?1:0)})();
