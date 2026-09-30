import {handShape,handScale} from './multimodal-frame.js';
// Detect each hand's activity separately. Opposing movements must not cancel.
export class MotionEventSegmenter {
  constructor(){this.reset()}
  reset(){this.state='READY';this.pre=[];this.event=[];this.prev=null;this.activeCount=0;this.activeSince=null;this.quietSince=null;this.startedAt=0;this.lastActivity=0;this.missingSince=null}
  _activity(obs,aspect){
    if(!this.prev)return 0;
    const dt=obs.time-this.prev.time;if(dt<=0)return 0;
    const a=this.prev.multimodal?.slots||this.prev.hands,b=obs.multimodal?.slots||obs.hands;
    let activity=0;
    for(let i=0;i<2;i++){
      const x=a[i],y=b[i];if(!x||!y)continue;
      const scale=Math.max(.02,(handScale(x,aspect)+handScale(y,aspect))/2);
      const travel=Math.hypot((y[0].x-x[0].x)*aspect,y[0].y-x[0].y)/scale;
      const sx=handShape(x,aspect),sy=handShape(y,aspect);
      const shape=Math.sqrt(sx.reduce((s,v,j)=>s+(v-sy[j])**2,0)/sx.length);
      const fingerChange=Math.max(...[4,8,12,16,20].map(j=>Math.hypot(sx[j*3]-sy[j*3],sx[j*3+1]-sy[j*3+1],sx[j*3+2]-sy[j*3+2])));
      activity=Math.max(activity,(travel+Math.min(fingerChange,.45)*.35+Math.min(shape,.35)*.2)*50/Math.max(25,dt));
    }return activity;
  }
  push({feature,hands,time,aspectRatio=1,visual=null,multimodal=null}){
    if(this.prev && (time<=this.prev.time||time-this.prev.time>350)){
      const wasMoving=this.state==='MOVING';this.reset();
      if(wasMoving)return {state:'READY',completed:null,activity:0,aborted:'Interrupción de fotogramas'};
    }
    if(!feature||!hands?.length){
      this.missingSince??=time;
      if(this.state==='MOVING' && time-this.missingSince<=120)return {state:'MOVING',completed:null,activity:0};
      const wasMoving=this.state==='MOVING';this.reset();
      return {state:'READY',completed:null,activity:0,aborted:wasMoving?'Se perdieron las manos durante la seña':null};
    }
    this.missingSince=null;
    const obs={feature:feature.slice(),hands:hands.map(h=>h.map(p=>({x:p.x,y:p.y,z:p.z}))),time,visual,multimodal};
    const activity=this._activity(obs,aspectRatio);this.lastActivity=activity;
    if(this.state==='READY'){
      this.pre.push(obs);
      // Preserve the lead-in by elapsed time across different camera frame rates.
      while(this.pre.length>1 && (time-this.pre[0].time>350 || this.pre.length>60))this.pre.shift();
      if(activity>=.04){this.activeCount++;this.activeSince??=time}else{this.activeCount=0;this.activeSince=null}
      if(this.activeCount>=2 && time-this.activeSince>=50){this.state='MOVING';this.startedAt=this.pre[0].time;this.event=this.pre.slice();this.quietSince=null}
    }else{
      this.event.push(obs);
      if(activity<=.016)this.quietSince??=time;else this.quietSince=null;
      const duration=time-this.startedAt;
      if(duration>=260&&this.quietSince!==null&&time-this.quietSince>=180&&this.event.length>=8){
        const frames=this.event.slice(),completed={reason:'settled',frames,id:frames[0].time+':'+frames.at(-1).time};
        this.reset();this.prev=obs;return {state:'COMPLETE',activity,completed};
      }
      // A timeout is not evidence that a linguistic movement was completed.
      if(duration>=4500){this.reset();return {state:'READY',activity,completed:null,aborted:'La seña no tuvo un final estable'} }
    }
    this.prev=obs;return {state:this.state,completed:null,activity};
  }
}
