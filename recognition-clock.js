// CPU inference time is not evidence of stability or of missing camera frames.
// Count at most one normal 100 ms observation interval per fresh camera frame.
export class ObservationClock{
 constructor(){this.reset()}
 reset(){this.time=0;this.lastStart=null;this.lastEnd=null}
 finish(end){this.lastEnd=end}
 observe(start,end){
 const interrupted=this.lastEnd!==null&&start-this.lastEnd>350;
 if(this.lastStart!==null&&!interrupted)this.time+=Math.max(0,Math.min(100,start-this.lastStart));
 this.lastStart=start;this.lastEnd=end;
 return {time:this.time,interrupted};
 }
}
