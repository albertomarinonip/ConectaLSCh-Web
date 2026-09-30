import {FEATURE_VERSION,FEATURE_SIZE,TIME_STEPS,resampleTimed,sequenceQuality} from '../multimodal-frame.js';
// Integration seam, not automatically enabled in the PWA. Supply an audited ORT build.
export class OnnxRecognizer {
  static async load(ort,modelBytes,manifest,{allowExperimental=false,executionProviders=['wasm']}={}){
    if(manifest.format!=='conectalsch-model-v1'||manifest.featureVersion!==FEATURE_VERSION||manifest.featureSize!==FEATURE_SIZE||manifest.timeSteps!==TIME_STEPS)throw Error('El modelo usa otro contrato de características');
    if(!Array.isArray(manifest.labels)||manifest.labels.length<3||new Set(manifest.labels).size!==manifest.labels.length||!manifest.labels.includes(manifest.unknownLabel))throw Error('Etiquetas de modelo inválidas');
    if(!Number.isFinite(manifest.threshold)||manifest.threshold<=0||manifest.threshold>=1||!Number.isFinite(manifest.margin)||manifest.margin<0||manifest.margin>=1)throw Error('Faltan umbrales de rechazo válidos');
    if(manifest.deploymentStatus!=='validated'&&!allowExperimental)throw Error('Modelo experimental: falta validación para uso real');
    const session=await ort.InferenceSession.create(modelBytes,{executionProviders});
    return new OnnxRecognizer(ort,session,manifest);
  }
  constructor(ort,session,manifest){this.ort=ort;this.session=session;this.manifest=manifest}
  async predict(observations,{eventComplete=false,eventId=null}={}){
    if(!eventComplete||observations.length<8)return {kind:'waiting',reason:'Esperando una seña completa'};
    const q=sequenceQuality(observations);
    if(q.handCoverage<.85||q.identityCoverage<.7)return {kind:'uncertain',reason:'Seguimiento insuficiente'};
    const sampled=resampleTimed(observations),data=new Float32Array(sampled.flatMap(o=>o.vector));
    if(data.length!==TIME_STEPS*FEATURE_SIZE||!data.every(Number.isFinite))throw Error('Entrada de modelo inválida');
    const m=this.manifest,input=new this.ort.Tensor('float32',data,[1,TIME_STEPS,FEATURE_SIZE]);
    const output=await this.session.run({[m.inputName]:input});
    const logits=Array.from(output[m.outputName]?.data||[]);
    if(logits.length!==m.labels.length||!logits.every(Number.isFinite))throw Error('Salida de modelo inválida');
    const maximum=Math.max(...logits),exps=logits.map(v=>Math.exp(v-maximum)),sum=exps.reduce((a,b)=>a+b,0);
    const ranked=exps.map((v,i)=>({label:m.labels[i],score:v/sum})).sort((a,b)=>b.score-a.score),[best,second]=ranked;
    if(best.label===m.unknownLabel||best.score<m.threshold||best.score-second.score<m.margin)return {kind:'uncertain',reason:'DESCONOCIDO o salida ambigua'};
    if((m.requiredChannels?.[best.label]||[]).some(c=>(c==='face'?q.faceCoverage:q.poseCoverage)<.7))return {kind:'uncertain',reason:'Falta un canal necesario para esta seña'};
    return {kind:'candidate',label:best.label,modelScore:best.score,dynamic:true,eventComplete:true,eventId,reason:'Modelo temporal: seña aislada'};
  }
  async close(){await this.session.release()}
}
