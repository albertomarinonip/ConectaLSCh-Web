import { rms } from './recognition-state.js';

function handCenterAndScale(hands, aspect=1){
  if(!Array.isArray(hands)||!hands.length)return null;
  const centers=[];
  for(const lm of hands){
    if(!Array.isArray(lm)||lm.length<21)continue;
    const w=lm[0];let scale=.001;
    for(const p of lm)scale=Math.max(scale,Math.hypot((p.x-w.x)*aspect,p.y-w.y));
    centers.push({x:w.x*aspect,y:w.y,scale});
  }
  if(!centers.length)return null;
  return {x:centers.reduce((s,p)=>s+p.x,0)/centers.length,
          y:centers.reduce((s,p)=>s+p.y,0)/centers.length,
          scale:centers.reduce((s,p)=>s+p.scale,0)/centers.length};
}

export class MotionEventSegmenter{
  constructor(){this.reset()}
  reset(){this.state='READY';this.pre=[];this.event=[];this.prev=null;this.activeCount=0;this.quietSince=0;this.startedAt=0;this.lastActivity=0}
  _activity(obs,aspect){
    if(!this.prev)return 0;
    const a=handCenterAndScale(this.prev.hands,aspect),b=handCenterAndScale(obs.hands,aspect);
    const travel=a&&b?Math.hypot(b.x-a.x,b.y-a.y)/Math.max(.02,(a.scale+b.scale)/2):0;
    const shape=Number.isFinite(rms(this.prev.feature,obs.feature))?rms(this.prev.feature,obs.feature):0;
    return travel + Math.min(shape,.35)*.45;
  }
  push({feature,hands,time,aspectRatio=1,visual=null}){
    if(!feature||!hands?.length){
      if(this.state==='MOVING'&&this.event.length>=6){const done=this._finish('hands-left');this.reset();return done}
      this.reset();return {state:'READY',completed:null,activity:0};
    }
    const obs={feature:feature.slice(),hands:hands.map(h=>h.map(p=>({x:p.x,y:p.y,z:p.z}))),time,visual};
    const activity=this._activity(obs,aspectRatio);this.lastActivity=activity;
    const START=.055, END=.024;
    if(this.state==='READY'){
      this.pre.push(obs);if(this.pre.length>6)this.pre.shift();
      this.activeCount=activity>=START?this.activeCount+1:0;
      if(this.activeCount>=2){this.state='MOVING';this.startedAt=this.pre[0]?.time??time;this.event=this.pre.slice();this.quietSince=0}
    }else{
      this.event.push(obs);
      if(activity<=END){if(!this.quietSince)this.quietSince=time}
      else this.quietSince=0;
      const duration=time-this.startedAt;
      if(duration>=260&&this.quietSince&&time-this.quietSince>=140&&this.event.length>=6){
        const done=this._finish('settled');this.reset();this.prev=obs;return done;
      }
      if(duration>=3000){const done=this._finish('max-duration');this.reset();this.prev=obs;return done}
    }
    this.prev=obs;
    return {state:this.state,completed:null,activity};
  }
  _finish(reason){
    let frames=this.event.slice();
    // Remove most of the quiet tail used only to prove that the movement ended.
    if(reason==='settled'&&frames.length>7)frames=frames.slice(0,-1);
    return {state:'COMPLETE',activity:this.lastActivity,completed:{reason,frames}};
  }
}
