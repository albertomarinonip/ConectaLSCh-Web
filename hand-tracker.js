// Slots follow a hand through time, never the left-to-right order in the image.
// Left/Right are MediaPipe labels; verify the camera convention on each platform.
const copy = h => h.map(p => ({x:p.x,y:p.y,z:p.z}));
const valid = h => Array.isArray(h) && h.length === 21 && h.every(p => p && [p.x,p.y,p.z].every(Number.isFinite));
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
export class HandIdentityTracker {
  constructor(){this.reset()}
  reset(){this.tracks=[null,null];this.lastTime=null}
  update(result,time){
    if(this.lastTime!==null && (time<=this.lastTime || time-this.lastTime>500))this.reset();
    this.lastTime=time;
    const detections=[];
    for(const [i,h] of (result.landmarks||[]).entries()){
      if(!valid(h))continue;
      const c=(result.handednesses||result.handedness||[])[i]?.[0];
      const label=c?.categoryName||c?.displayName;
      detections.push({landmarks:copy(h),hint:label==='Left'?0:label==='Right'?1:null,score:Number.isFinite(c?.score)?c.score:0});
      if(detections.length===2)break;
    }
    const cost=(d,slot)=>{
      const old=this.tracks[slot],w=d.landmarks[0];
      let value=d.hint===null?.04:(d.hint===slot?0:.55*d.score);
      if(old && time-old.time<=350){
        const dt=time-old.time;
        const px=old.landmarks[0].x+clamp(old.vx*dt,-.12,.12);
        const py=old.landmarks[0].y+clamp(old.vy*dt,-.12,.12);
        value+=Math.hypot(w.x-px,w.y-py);
        // Wrist-relative shape helps when two hands cross at nearly the same point.
        let shape=0;for(let j=1;j<21;j++)shape+=Math.hypot(d.landmarks[j].x-w.x-(old.landmarks[j].x-old.landmarks[0].x),d.landmarks[j].y-w.y-(old.landmarks[j].y-old.landmarks[0].y));
        value+=shape/40;
      } else value+=.08;
      return value;
    };
    let assignment=[];
    if(detections.length===1)assignment=[cost(detections[0],0)<=cost(detections[0],1)?0:1];
    if(detections.length===2){
      const straight=cost(detections[0],0)+cost(detections[1],1),swapped=cost(detections[0],1)+cost(detections[1],0);
      assignment=straight<=swapped?[0,1]:[1,0];
    }
    const slots=[null,null],identityConfidence=[0,0];
    detections.forEach((d,i)=>{
      const slot=assignment[i],old=this.tracks[slot],dt=old?time-old.time:0;
      const confident=d.hint===slot && d.score>=.7;
      const identity=confident?d.score:old && dt<=350?old.identityConfidence*.98:0;
      slots[slot]=d.landmarks;identityConfidence[slot]=identity;
      this.tracks[slot]={landmarks:d.landmarks,time,identityConfidence:identity,
        vx:dt>0?(d.landmarks[0].x-old.landmarks[0].x)/dt:0,
        vy:dt>0?(d.landmarks[0].y-old.landmarks[0].y)/dt:0};
    });
    return {slots,identityConfidence};
  }
}
