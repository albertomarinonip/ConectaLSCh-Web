export function feature(r){
 if(!r.landmarks?.length||r.landmarks.some(h=>h.length!==21||h.some(p=>![p.x,p.y,p.z].every(Number.isFinite))))return null;
 let hands=r.landmarks.map(lm=>{const w=lm[0];let sc=.001;for(const p of lm)sc=Math.max(sc,Math.hypot(p.x-w.x,p.y-w.y));let v=[];for(const p of lm)v.push((p.x-w.x)/sc,(p.y-w.y)/sc,(p.z-w.z)/sc);return{x:w.x,v}}).sort((a,b)=>a.x-b.x);
 const z=new Array(63).fill(0);return [...(hands[0]?.v||z),...(hands[1]?.v||z)];
}
export function resample(s,n=9){if(s.length<2)return s;return Array.from({length:n},(_,i)=>s[Math.round(i*(s.length-1)/(n-1))])}
export function d(a,b){let x=0;for(let i=0;i<a.length;i++){let q=a[i]-b[i];x+=q*q}return Math.sqrt(x/a.length)}
export function dtw(A,B){let n=A.length,m=B.length,D=Array.from({length:n+1},()=>new Float32Array(m+1).fill(Infinity));D[0][0]=0;for(let i=1;i<=n;i++)for(let j=1;j<=m;j++){let c=d(A[i-1],B[j-1]);D[i][j]=c+Math.min(D[i-1][j],D[i][j-1],D[i-1][j-1])}return D[n][m]/(n+m)}

// MediaPipe x/z use image width and y uses height. Convert the live vector to
// the known template aspect before applying the unchanged legacy scale/DTW.
// No orientation, handedness or mirroring invariance is introduced.
export function adaptAspect(frame,ratio){
 if(!Number.isFinite(ratio)||ratio<=0||Math.abs(ratio-1)<1e-9)return frame;
 const output=[];
 for(let start=0;start<126;start+=63){let scale=0;
 for(let i=start;i<start+63;i+=3)scale=Math.max(scale,Math.hypot(frame[i]*ratio,frame[i+1]));
 for(let i=start;i<start+63;i+=3)output.push(scale?frame[i]*ratio/scale:0,scale?frame[i+1]/scale:0,scale?frame[i+2]*ratio/scale:0);
 }
 return output;
}
export function scoreTemplates(query,templates,videoAspect){
 const converted=new Map();return templates.map(t=>{
 let q=query;
 if(Number.isFinite(t.aspectRatio)&&t.aspectRatio>0&&Number.isFinite(videoAspect)&&videoAspect>0){
 const ratio=videoAspect/t.aspectRatio;
 if(!converted.has(ratio))converted.set(ratio,query.map(f=>adaptAspect(f,ratio)));
 q=converted.get(ratio);
 }
 return {label:t.label,d:dtw(q,t.seq)};
 });
}
