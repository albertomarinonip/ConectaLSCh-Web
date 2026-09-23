// Admission filter shared by all personal examples; uncertainty never emits voice.
export const LIMITS = Object.freeze({maxDistance:0.16, minMargin:0.018,
 minRelativeMargin:0.10, stableMs:650, stableFrames:6, releaseMs:500,
 changedPoseDistance:0.24, maxGapMs:350});

export function rms(a,b){
 if(!a||!b||a.length!==b.length)return Infinity;
 let sum=0;for(let i=0;i<a.length;i++)sum+=(a[i]-b[i])**2;
 return Math.sqrt(sum/a.length);
}
export function chooseSign(scores){
 // Many examples of one sign must not compete as different signs.
 const labels=new Map();
 for(const {label,d} of scores){if(Number.isFinite(d)&&d>=0)labels.set(label,Math.min(labels.get(label)??Infinity,d))}
 const ranked=[...labels].map(([label,d])=>({label,d})).sort((a,b)=>a.d-b.d);
 const [best,second]=ranked;
 if(!best)return {kind:'waiting',reason:'Sin plantillas activas comparables'};
 const margin=second?second.d-best.d:Infinity;
 const details={best,second,margin};
 if(best.d>LIMITS.maxDistance)return {kind:'uncertain',...details,reason:'Distancia DTW supera '+LIMITS.maxDistance};
 if(margin<LIMITS.minMargin)return {kind:'uncertain',...details,reason:'Ambigüedad: margen entre señas menor que '+LIMITS.minMargin};
 if(second&&margin/Math.max(second.d,0.001)<LIMITS.minRelativeMargin)return {kind:'uncertain',...details,reason:'Ambigüedad: margen relativo insuficiente'};
 return {kind:'candidate',label:best.label,d:best.d,...details,reason:'Coincidencia; requiere estabilidad'};
}

export class SignGate{
 constructor(){this.reset()}
 reset(){this.latched='';this.pose=null;this.absentSince=null;this.changedSince=null;this.lastAt=null;this.clearCandidate()}
 clearCandidate(){this.candidate='';this.since=0;this.count=0}
 // Pausing or a dropped frame must not release an already spoken sign.
 interrupt(){this.clearCandidate();this.absentSince=null;this.changedSince=null;this.lastAt=null}
 step({now,hands,pose=null,match={kind:'waiting'}}){
 if(this.lastAt!==null&&now-this.lastAt>LIMITS.maxGapMs){this.clearCandidate();this.absentSince=null;this.changedSince=null}
 this.lastAt=now;
 if(!hands){
 this.clearCandidate();this.changedSince=null;this.absentSince??=now;
 if(now-this.absentSince>=LIMITS.releaseMs){this.latched='';this.pose=null}
 return {kind:'waiting'};
 }
 this.absentSince=null;
 if(this.latched){
 // Require actual hand-feature change, not a fluctuating label/confidence score.
 const changed=rms(pose,this.pose)>=LIMITS.changedPoseDistance;
 if(changed){this.changedSince??=now}else this.changedSince=null;
 if(this.changedSince!==null&&now-this.changedSince>=LIMITS.releaseMs){
 this.latched='';this.pose=null;this.changedSince=null;this.clearCandidate();
 return {kind:'waiting',clearBuffer:true};
 }
 this.clearCandidate();
 if(match.kind==='candidate'&&match.label===this.latched&&!changed)return {kind:'confirmed',label:this.latched,speak:false};
 return {kind:match.kind==='uncertain'?'uncertain':'waiting'};
 }
 if(match.kind!=='candidate'){this.clearCandidate();return {kind:match.kind==='uncertain'?'uncertain':'waiting'}}
 if(this.candidate!==match.label){this.candidate=match.label;this.since=now;this.count=1}else this.count++;
 if(this.count<LIMITS.stableFrames||now-this.since<LIMITS.stableMs)return {kind:'waiting'};
 this.latched=match.label;this.pose=pose?.slice();this.clearCandidate();
 return {kind:'confirmed',label:match.label,speak:true};
 }
}
