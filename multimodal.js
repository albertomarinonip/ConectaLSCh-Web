// Compact non-identifying descriptors for LSCh context. We store geometry/expression,
// never camera images. Missing channels stay null and are never invented.
function avg(a){return a.length?a.reduce((s,v)=>s+v,0)/a.length:0}
function pointVector(obs,ids){if(!obs?.points)return null;const pts=ids.map(i=>obs.points[i]).filter(Boolean);if(pts.length<2)return null;const cx=avg(pts.map(p=>p.x)),cy=avg(pts.map(p=>p.y));let scale=.001;for(const p of pts)scale=Math.max(scale,Math.hypot(p.x-cx,p.y-cy));const out=[];for(const i of ids){const p=obs.points[i];out.push(p?(p.x-cx)/scale:0,p?(p.y-cy)/scale:0)}return out}
export function visualDescriptor(ch){
 const face=pointVector(ch?.face,[33,133,362,263,70,105,336,334,10,168]);
 const pose=pointVector(ch?.pose,[11,12,13,14,15,16]);
 const exp=ch?.expression||null;const expression=exp?[exp.browInnerUp||0,exp.browDownLeft||0,exp.browDownRight||0,exp.eyeWideLeft||0,exp.eyeWideRight||0,exp.eyeBlinkLeft||0,exp.eyeBlinkRight||0]:null;
 return {face,pose,expression};
}
function dist(a,b){if(!a||!b||a.length!==b.length)return null;let s=0;for(let i=0;i<a.length;i++)s+=(a[i]-b[i])**2;return Math.sqrt(s/a.length)}
function meanDesc(seq,key){const arr=seq?.map(x=>x?.[key]).filter(Boolean)||[];if(!arr.length)return null;const n=arr[0].length,out=new Array(n).fill(0);for(const a of arr)for(let i=0;i<n;i++)out[i]+=a[i];return out.map(v=>v/arr.length)}
export function visualDistance(live,trained){const parts=[];for(const key of ['face','pose','expression']){const d=dist(meanDesc(live,key),meanDesc(trained,key));if(Number.isFinite(d))parts.push(d)}return parts.length?avg(parts):null}
export function visualCoverage(seq){return {face:(seq||[]).filter(x=>x?.face).length,pose:(seq||[]).filter(x=>x?.pose).length,expression:(seq||[]).filter(x=>x?.expression).length}}
