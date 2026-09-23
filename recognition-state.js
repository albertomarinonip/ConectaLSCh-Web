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
 // Open-set recognition: "none" is the normal result unless a label is backed
 // by a consensus of independent personal examples. We intentionally do not
 // choose the nearest label just because it is the nearest one.
 const groups=new Map();
 for(const score of scores){
   if(!Number.isFinite(score?.d)||score.d<0)continue;
   if(!groups.has(score.label))groups.set(score.label,[]);
   groups.get(score.label).push(score);
 }
 const labels=[];
 const finiteScoreCount=[...groups.values()].reduce((n,a)=>n+a.length,0);
 for(const [label,items] of groups){
   items.sort((a,b)=>a.d-b.d);
   const dynamic=!!items[0]?.dynamic;
   // A vote is stricter than the final aggregate distance. For dynamic signs it
   // must agree in shape AND trajectory, not only in the weighted total.
   const votes=items.filter(x=>{
     if(x.motionComplete===false)return false;
     if(dynamic)return x.d<=0.18 && x.shapeD<=0.19 && x.motionD<=(x.envelope?.motion??0.18) && (x.pathD??0)<=(x.envelope?.path??0.24) && x.motionSimilar!==false && x.motionRatio!==false;
     return x.d<=0.115;
   });
   const required=items.length>=4?3:items.length>=2?2:1;
   if(votes.length<required)continue;
   const used=votes.slice(0,required);
   // Median/mean-like consensus score prevents one exceptionally close sample
   // from dominating an otherwise unrelated everyday movement.
   const consensusD=used.reduce((s,x)=>s+x.d,0)/used.length;
   const best=used[0];
   labels.push({...best,label,d:consensusD,rawBestD:best.d,supportD:used.at(-1).d,
     supportCount:items.length,voteCount:votes.length,requiredVotes:required,supported:true});
 }
 labels.sort((a,b)=>a.d-b.d);
 const [best,second]=labels;
 if(!best)return finiteScoreCount?{kind:'uncertain',reason:'Distancia/consenso: movimiento desconocido; ningún grupo de ejemplos coincide'}:{kind:'waiting',reason:'Sin plantillas activas comparables'};
 const margin=second?second.d-best.d:Infinity;
 const details={best,second,margin};
 const maxDistance=best.dynamic?0.17:0.115;
 if(best.d>maxDistance)return {kind:'uncertain',...details,reason:'Movimiento desconocido: consenso insuficiente'};
 if(margin<LIMITS.minMargin)return {kind:'uncertain',...details,reason:'Ambigüedad: dos señas se parecen demasiado'};
 if(second&&margin/Math.max(second.d,0.001)<LIMITS.minRelativeMargin)return {kind:'uncertain',...details,reason:'Ambigüedad: margen relativo insuficiente'};
 return {kind:'candidate',label:best.label,d:best.d,dynamic:!!best.dynamic,...details,reason:'Coincidencia respaldada por varios ejemplos personales'};
}

export class SignGate{
 constructor(){this.reset()}
 reset(){this.latched='';this.pose=null;this.absentSince=null;this.changedSince=null;this.lastAt=null;this.cooldownUntil=0;this.clearCandidate()}
 clearCandidate(){this.candidate='';this.since=0;this.count=0}
 // Pausing or a dropped frame must not release an already spoken sign.
 interrupt(){this.clearCandidate();this.absentSince=null;this.changedSince=null;this.lastAt=null}
 step({now,hands,pose=null,match={kind:'waiting'}}){
 if(this.lastAt!==null&&now-this.lastAt>LIMITS.maxGapMs){this.clearCandidate();this.absentSince=null;this.changedSince=null}
 this.lastAt=now;
 if(now<this.cooldownUntil){this.clearCandidate();return {kind:'waiting'}}
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
 // A completed dynamic movement is already a bounded sign event: confirm at its end
 // instead of waiting for an additional static hold. Distance/margin checks above still apply.
 if(match.dynamic&&match.eventComplete){
   this.latched=match.label;this.pose=pose?.slice();this.cooldownUntil=now+350;this.clearCandidate();
   return {kind:'confirmed',label:match.label,speak:true};
 }
 if(this.candidate!==match.label){this.candidate=match.label;this.since=now;this.count=1}else this.count++;
 const needFrames=match.dynamic?2:LIMITS.stableFrames,needMs=match.dynamic?100:LIMITS.stableMs;
 if(this.count<needFrames||now-this.since<needMs)return {kind:'waiting'};
 this.latched=match.label;this.pose=pose?.slice();this.cooldownUntil=now+350;this.clearCandidate();
 return {kind:'confirmed',label:match.label,speak:true};
 }
}
