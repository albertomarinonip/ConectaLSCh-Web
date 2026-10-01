import {anchors,relative,handShape,handScale,resampleTimed,sequenceQuality,movementExtent} from './multimodal-frame.js';
import {matchWindow} from './temporal-sequence.js';

const rms=(a,b)=>Math.sqrt(a.reduce((s,x,i)=>s+(x-b[i])**2,0)/a.length);
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
function alignedDistance(A,B,cost){
  const n=A.length,m=B.length,D=Array.from({length:n+1},()=>Array(m+1).fill(Infinity)),L=Array.from({length:n+1},()=>Array(m+1).fill(0));D[0][0]=0;
  for(let i=1;i<=n;i++)for(let j=1;j<=m;j++){
    const choices=[[i-1,j-1],[i-1,j],[i,j-1]].sort((a,b)=>D[a[0]][a[1]]-D[b[0]][b[1]]),[x,y]=choices[0];
    D[i][j]=cost(A[i-1],B[j-1])+D[x][y];L[i][j]=L[x][y]+1;
  }
  return D[n][m]/Math.max(1,L[n][m]);
}
function signature(os){return [0,1].filter(i=>os.filter(o=>o.slots[i]).length/os.length>=.5).join('')}
function descriptors(os){
  const bases=[0,1].map(i=>os.find(o=>o.slots[i]));
  return resampleTimed(os,24).map(o=>{
    const {body,face}=anchors(o);
    return {shape:o.slots.map(h=>handShape(h,o.aspectRatio)),
      path:o.slots.map((h,i)=>{const base=bases[i],b=base?.slots[i];return h&&b?[(h[0].x*o.aspectRatio-b[0].x*base.aspectRatio)/handScale(b,base.aspectRatio),(h[0].y-b[0].y)/handScale(b,base.aspectRatio)]:null}),
      body:o.slots.map(h=>relative(h?.[0],body,o.aspectRatio)),face:o.slots.map(h=>relative(h?.[0],face,o.aspectRatio)),
      expression:o.expression,pose:o.pose,aspectRatio:o.aspectRatio,bodyAnchor:body};
  });
}
function slotCost(a,b){
  const costs=[];for(let i=0;i<2;i++){
    if(a[i]&&b[i])costs.push(rms(a[i],b[i]));
    else if(!!a[i]!==!!b[i])costs.push(1);
  }return mean(costs)??1;
}
function contextCost(a,b){
  const location=[],pose=[],ex=[];
  for(const key of ['body','face'])for(let i=0;i<2;i++)if(a[key][i]&&b[key][i])location.push(rms(a[key][i],b[key][i])*(key==='face'?.3:1));
  for(const id of [13,14,15,16]){
    const ap=relative(a.pose?.points[id],a.bodyAnchor,a.aspectRatio),bp=relative(b.pose?.points[id],b.bodyAnchor,b.aspectRatio);
    if(ap&&bp)pose.push(rms(ap,bp));
  }
  for(const key of Object.keys(a.expression||{}))if(Number.isFinite(b.expression?.[key]))ex.push(Math.abs(a.expression[key]-b.expression[key]));
  // Identical optional channels cannot dilute a mismatch in a lexical channel.
  const parts=[mean(location),mean(pose),mean(ex)].filter(x=>x!==null);
  return parts.length?Math.max(...parts):null;
}
const cache=new WeakMap();
function templateDesc(t){if(!cache.has(t))cache.set(t,descriptors(t.observations));return cache.get(t)}
export function matchMultimodal(observations,templates,{eventComplete=false}={}){
  if(observations.length<8)return {kind:'waiting',reason:'Reuniendo observaciones multimodales'};
  const quality=sequenceQuality(observations);
  if(quality.handCoverage<.85 || quality.identityCoverage<.7)return {kind:'uncertain',reason:'Seguimiento o identidad de manos insuficiente; repite la seña'};
  const query=descriptors(observations),elapsed=observations.at(-1).time-observations[0].time,sig=signature(observations),groups=new Map();
  for(const t of templates){
    if(t.metadata.captureMode==='background')continue;
    const dynamic=t.metadata.captureMode==='dynamic',duration=t.timestamps.at(-1);
    if(elapsed<Math.max(250,duration*.45)||elapsed>duration*2.3)continue;
    if(signature(t.observations)!==sig)continue;
    if([...sig].some(i=>quality.handSlotCoverage[Number(i)]<.85))continue;
    if((t.metadata.requiredChannels||[]).some(c=>(c==='face'?quality.faceCoverage:quality.poseCoverage)<.7))continue;
    const desc=templateDesc(t),shapeD=alignedDistance(query,desc,(a,b)=>slotCost(a.shape,b.shape));
    const motionD=dynamic?alignedDistance(query,desc,(a,b)=>slotCost(a.path,b.path)):0;
    const comparable=query.some(a=>desc.some(b=>contextCost(a,b)!==null));
    const contextD=comparable?alignedDistance(query,desc,(a,b)=>contextCost(a,b)??.4):null;
    const extent=movementExtent(observations),needed=movementExtent(t.observations);
    const motionComplete=!dynamic||(eventComplete&&extent>=Math.max(.10,needed*.45));
    let distance=dynamic?.55*shapeD+.45*motionD:shapeD;
    if(contextD!==null)distance=.8*distance+.2*contextD;
    const acceptable=motionComplete&&shapeD<.22&&motionD<.32&&(contextD===null||contextD<.55)&&distance<.18;
    const key=JSON.stringify([t.label,t.metadata.variant||'principal',sig,dynamic]);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push({label:t.label,d:distance,shapeD,motionD,visualD:contextD,dynamic,motionComplete,acceptable,id:t.id,variant:t.metadata.variant,quality});
  }
  const candidates=[];
  for(const items of groups.values()){
    const unique=[...new Map(items.map(x=>[x.id,x])).values()].sort((a,b)=>a.d-b.d),votes=unique.filter(x=>x.acceptable);
    // Two separately captured examples for EACH hand/variant, not every variant together.
    if(votes.length<2)continue;
    candidates.push({...votes[0],d:(votes[0].d+votes[1].d)/2,voteCount:votes.length,requiredVotes:2});
  }
  const byLabel=new Map();for(const c of candidates)if(!byLabel.has(c.label)||c.d<byLabel.get(c.label).d)byLabel.set(c.label,c);
  const [best,second]=[...byLabel.values()].sort((a,b)=>a.d-b.d);
  if(!best){
    // Rejected examples are diagnostic evidence, never admission candidates.
    const rejected=[...groups.values()].map(items=>{
      const unique=[...new Map(items.map(x=>[x.id,x])).values()].sort((a,b)=>a.d-b.d);
      const votes=unique.filter(x=>x.acceptable).length;
      return {...unique[0],voteCount:votes,requiredVotes:2,supportCount:unique.length};
    }).sort((a,b)=>b.voteCount-a.voteCount||a.d-b.d);
    const nearest=rejected[0];
    const failures=nearest?[
      nearest.supportCount<2?'faltan repeticiones del mismo patrón de manos':null,
      !nearest.motionComplete?'movimiento incompleto':null,
      nearest.shapeD>=.22?'forma de mano diferente':null,
      nearest.motionD>=.32?'trayectoria diferente':null,
      nearest.visualD!==null&&nearest.visualD>=.55?'posición o expresión diferente':null,
      nearest.d>=.18?'distancia total alta':null,
      nearest.voteCount<2?'menos de dos coincidencias válidas':null
    ].filter(Boolean):[];
    return {kind:'uncertain',best:nearest,diagnosticOnly:true,
      reason:nearest?'DESCONOCIDO: '+failures.join('; '):'DESCONOCIDO: sin ejemplos con duración, manos y canales compatibles'};
  }
  const margin=second?second.d-best.d:Infinity;
  if(margin<.035)return {kind:'uncertain',best,second,margin,reason:'Dos señas tienen secuencias demasiado parecidas'};
  for(const t of templates.filter(t=>t.metadata.captureMode==='background'&&signature(t.observations)===sig)){
    const desc=templateDesc(t),shape=alignedDistance(query,desc,(a,b)=>slotCost(a.shape,b.shape)),path=alignedDistance(query,desc,(a,b)=>slotCost(a.path,b.path));
    const context=alignedDistance(query,desc,(a,b)=>contextCost(a,b)??.4);
    const negative=.8*(.55*shape+.45*path)+.2*context;
    if(negative<=best.d+.025)return {kind:'uncertain',best,reason:'El movimiento se parece a un ejemplo marcado como no-seña'};
  }
  return {kind:'candidate',label:best.label,d:best.d,dynamic:best.dynamic,best,second,margin,eventComplete,reason:'Secuencia temporal respaldada por dos capturas'};
}
export function matchPersonalWindow(frames,times,templates,aspect,landmarks,options={}){
  const modern=templates.filter(t=>t.sampleVersion===4),modernLabels=new Set(modern.map(t=>t.label));
  const legacy=templates.filter(t=>t.sampleVersion!==4&&!modernLabels.has(t.label));
  const a=modern.length?matchMultimodal(options.observations||[],modern,options):null;
  const b=legacy.length?matchWindow(frames,times,legacy,aspect,landmarks,options):null;
  if(a?.kind==='candidate'&&b?.kind==='candidate'&&a.label!==b.label)return {kind:'uncertain',reason:'Conflicto entre ejemplos nuevos y antiguos'};
  return a?.kind==='candidate'?a:b?.kind==='candidate'?b:a||b||{kind:'waiting',reason:'Sin ejemplos comparables'};
}
