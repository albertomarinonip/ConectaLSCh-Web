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


// Motion descriptor: wrist trajectory relative to the first frame, normalized by
// hand size. This preserves movement that hands-relative shape features remove.
export function motionSequence(landmarkFrames, aspectRatio=1){
 if(!Array.isArray(landmarkFrames)||landmarkFrames.length<2)return [];
 const normalized=landmarkFrames.map(hands=>{
  if(!Array.isArray(hands)||!hands.length)return null;
  return hands.map(lm=>{
   const w=lm[0];let scale=.001;
   for(const p of lm)scale=Math.max(scale,Math.hypot((p.x-w.x)*aspectRatio,p.y-w.y));
   return {x:w.x*aspectRatio,y:w.y,scale};
  }).sort((a,b)=>a.x-b.x);
 });
 const first=normalized.find(Boolean);if(!first)return [];
 return normalized.map(hands=>{
  if(!hands)return [0,0,0,0];
  const out=[];
  for(let i=0;i<2;i++){const h=hands[i],base=first[i];
   if(!h||!base)out.push(0,0);else out.push((h.x-base.x)/base.scale,(h.y-base.y)/base.scale);
  }
  return out;
 });
}
export function motionDistance(queryLandmarks,templateLandmarks,queryAspect=1,templateAspect=1){
 const a=motionSequence(queryLandmarks,queryAspect),b=motionSequence(templateLandmarks,templateAspect);
 if(a.length<2||b.length<2)return 0;
 return dtw(resample(a,18),resample(b,18));
}

// Total normalized wrist travel. Used to distinguish a completed dynamic sign
// from merely holding a similar hand shape still.
export function motionAmount(landmarkFrames, aspectRatio=1){
 const s=motionSequence(landmarkFrames,aspectRatio);
 if(s.length<2)return 0;let total=0;
 for(let i=1;i<s.length;i++){let sum=0,count=0;for(let h=0;h<2;h++){const k=h*2;
  const a=s[i-1],b=s[i];if(!a||!b)continue;const dx=b[k]-a[k],dy=b[k+1]-a[k+1];
  if(Number.isFinite(dx)&&Number.isFinite(dy)){sum+=Math.hypot(dx,dy);count++}}
  if(count)total+=sum/count;
 }
 return total;
}


// Remove quiet preparation/end frames from a dynamic sign. The threshold is
// relative to that capture, so a naturally faster/slower repetition is accepted.
export function trimMotionLandmarks(frames,aspectRatio=1){
 if(!Array.isArray(frames)||frames.length<6)return frames||[];
 const centers=frames.map(hands=>{
  if(!Array.isArray(hands)||!hands.length)return null;
  const pts=hands.map(h=>h?.[0]).filter(Boolean);if(!pts.length)return null;
  return {x:pts.reduce((a,p)=>a+p.x*aspectRatio,0)/pts.length,y:pts.reduce((a,p)=>a+p.y,0)/pts.length};
 });
 const speed=[];for(let i=1;i<centers.length;i++){const a=centers[i-1],b=centers[i];speed.push(a&&b?Math.hypot(b.x-a.x,b.y-a.y):0)}
 const peak=Math.max(...speed,0);if(peak<0.004)return frames;
 const threshold=Math.max(0.003,peak*0.16);let first=speed.findIndex(v=>v>=threshold),last=-1;for(let i=speed.length-1;i>=0;i--)if(speed[i]>=threshold){last=i;break}
 if(first<0||last<0)return frames;first=Math.max(0,first-2);last=Math.min(frames.length-1,last+3);
 return last-first+1>=5?frames.slice(first,last+1):frames;
}


// Direction/path descriptor for open-set rejection. DTW can align unrelated
// motions too generously; this preserves the sign's net direction and path shape.
export function motionPathDescriptor(landmarkFrames, aspectRatio=1){
 const seq=motionSequence(landmarkFrames,aspectRatio);if(seq.length<3)return null;
 const r=resample(seq,9), dims=4, out=[];
 for(let k=0;k<dims;k++){const end=r.at(-1)[k]-r[0][k];out.push(end)}
 let travel=0;for(let i=1;i<r.length;i++){let z=0;for(let k=0;k<dims;k++)z+=(r[i][k]-r[i-1][k])**2;travel+=Math.sqrt(z/dims)}
 out.push(travel);
 // coarse signed trajectory relative to start
 for(const idx of [2,4,6,8])for(let k=0;k<dims;k++)out.push(r[idx][k]-r[0][k]);
 return out;
}
export function descriptorDistance(a,b){
 if(!a||!b||a.length!==b.length)return Infinity;let s=0;for(let i=0;i<a.length;i++){const q=a[i]-b[i];s+=q*q}return Math.sqrt(s/a.length);
}

// Rich kinematic descriptor derived from the raw 21-point hand landmarks.
// It keeps global travel, palm orientation and finger opening through time.
export function handKinematicSequence(landmarkFrames, aspectRatio=1){
 if(!Array.isArray(landmarkFrames)||landmarkFrames.length<2)return [];
 return landmarkFrames.map(hands=>{
  const ordered=(Array.isArray(hands)?hands:[]).map(lm=>{
   if(!Array.isArray(lm)||lm.length<21)return null;
   const w=lm[0], mid=lm[9], idx=lm[5], pinky=lm[17];
   let sc=.001;for(const p of lm)sc=Math.max(sc,Math.hypot((p.x-w.x)*aspectRatio,p.y-w.y));
   const angle=Math.atan2((mid.y-w.y),((mid.x-w.x)*aspectRatio));
   const spread=[4,8,12,16,20].reduce((s,i)=>s+Math.hypot((lm[i].x-w.x)*aspectRatio,lm[i].y-w.y),0)/(5*sc);
   const palm=Math.hypot((pinky.x-idx.x)*aspectRatio,pinky.y-idx.y)/sc;
   return {x:w.x*aspectRatio,y:w.y,sc,angle,spread,palm};
  }).filter(Boolean).sort((a,b)=>a.x-b.x);
  const out=[];for(let i=0;i<2;i++){const h=ordered[i];out.push(h?.x??0,h?.y??0,h?.angle??0,h?.spread??0,h?.palm??0)}return out;
 });
}
export function kinematicDistance(aFrames,bFrames,aAspect=1,bAspect=1){
 const A=handKinematicSequence(aFrames,aAspect),B=handKinematicSequence(bFrames,bAspect);if(A.length<2||B.length<2)return Infinity;
 const norm=(S)=>{const first=S[0];return S.map(v=>v.map((x,i)=>i%5<2?x-first[i]:x));};
 return dtw(resample(norm(A),18),resample(norm(B),18));
}
