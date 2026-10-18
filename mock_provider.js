// MOCK of a Twelve-Data-shaped response. For testing server.js parsing ONLY. Not real market data.
const http=require("http");const mode=process.env.MODE||"ok";
http.createServer((q,r)=>{const u=new URL(q.url,"http://x"),iv=u.searchParams.get("interval"),step={"1min":6e4,"5min":3e5,"15min":9e5}[iv],n=+u.searchParams.get("outputsize");
 const now=Math.floor(Date.now()/step)*step,vals=[];for(let i=0;i<n;i++){const t=now-(n-1-i)*step,c=1.08+Math.sin(i/9)*.001;vals.push({datetime:new Date(t).toISOString().slice(0,19).replace("T"," "),open:String(c-.0001),high:String(c+.0003),low:String(c-.0003),close:String(c)})}
 r.setHeader("Content-Type","application/json");r.end(JSON.stringify({meta:{symbol:mode==="badsym"?"GBP/USD":u.searchParams.get("symbol"),interval:iv,type:"Physical Currency"},values:vals,status:"ok"}))}).listen(3222);
