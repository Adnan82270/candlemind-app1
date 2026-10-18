// Aggregates time-ordered ticks [{t:ms,p:price}] into OHLC candles of tf seconds (for a future tick/streaming provider).
function aggregateTicks(ticks,tf){const m=new Map();for(const x of ticks){const b=Math.floor(x.t/(tf*1000))*tf*1000,c=m.get(b);
 if(!c)m.set(b,{t:b,o:x.p,h:x.p,l:x.p,c:x.p});else{c.h=Math.max(c.h,x.p);c.l=Math.min(c.l,x.p);c.c=x.p}}
 return[...m.values()].sort((a,b)=>a.t-b.t)}
module.exports={aggregateTicks};
