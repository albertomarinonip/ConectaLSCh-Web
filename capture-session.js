import {MotionEventSegmenter} from './motion-event.js';
import {sequenceQuality,movementExtent,handShape} from './multimodal-frame.js';

export function checkCapture(frames,mode,requiredChannels=[]){
  if(frames.length<12)throw Error('Pocos fotogramas válidos. Repite con mejor luz o un dispositivo más rápido.');
  const os=frames.map(f=>f.multimodal),q=sequenceQuality(os);
  if(mode!=='background'){
    if(q.handCoverage<.9)throw Error('Las manos no estuvieron visibles durante toda la seña.');
    if(q.identityCoverage<.8)throw Error('No pude seguir la identidad de las manos. Repite con las manos separadas al comenzar.');
    if(q.handSlotCoverage.some(c=>c>=.5&&c<.9))throw Error('Una mano se perdió en parte de la seña. Repite con ambas manos visibles.');
    if(requiredChannels.includes('face')&&q.faceCoverage<.8)throw Error('Esta seña requiere rostro visible; faltó seguimiento facial.');
    if(requiredChannels.includes('pose')&&q.poseCoverage<.8)throw Error('Esta seña requiere cuerpo visible; muestra hombros y brazos.');
  }
  if(mode==='dynamic'&&movementExtent(os)<.15)throw Error('No se capturó una trayectoria clara. Repite el movimiento completo.');
  if(mode==='static'){
    if(movementExtent(os)>.2)throw Error('Hubo desplazamiento: selecciona «Con movimiento» o mantén la postura.');
    for(let slot=0;slot<2;slot++){
      const seen=os.filter(o=>o.slots[slot]);if(!seen.length)continue;
      const base=handShape(seen[0].slots[slot],seen[0].aspectRatio);
      if(seen.some(o=>{const s=handShape(o.slots[slot],o.aspectRatio);return Math.sqrt(s.reduce((sum,x,i)=>sum+(x-base[i])**2,0)/s.length)>.18}))throw Error('Cambió demasiado la forma de la mano para una postura fija.');
    }
  }
  return q;
}
// Reads the shared inference loop. Never runs another MediaPipe detection.
export function collectCapture({mode,getObservation,isCancelled,onFrame}){
  const segmenter=new MotionEventSegmenter(),fixed=[],start=performance.now(),timeout=mode==='dynamic'?6500:2200;
  let previous=null;
  return new Promise((resolve,reject)=>{
    function poll(){
      try{
        if(isCancelled()){resolve(null);return}
        const now=performance.now(),latest=getObservation();
        if(latest&&latest.time!==previous&&now-latest.time<400){
          previous=latest.time;
          const frame={time:latest.time,feature:latest.feature,hands:latest.result.landmarks||[],multimodal:latest.multimodal};
          let ev={state:'FIXED',activity:0};
          if(mode==='dynamic')ev=segmenter.push({...frame,aspectRatio:frame.multimodal.aspectRatio});
          else fixed.push(frame);
          if(ev.aborted)throw Error(ev.aborted+'. Repite la captura.');
          const frames=mode==='dynamic'?(ev.completed?.frames||segmenter.event):fixed;
          onFrame({latest,frames,activity:ev.activity,state:ev.state,progress:Math.min(100,(now-start)/timeout*100)});
          if(ev.completed){resolve(ev.completed.frames);return}
        }
        if(now-start>=timeout){
          if(mode==='dynamic')throw Error('No detecté inicio y final de una seña. Hazla completa y detén las manos al terminar.');
          resolve(fixed.slice(0,180));return;
        }
        requestAnimationFrame(poll);
      }catch(e){reject(e)}
    }
    requestAnimationFrame(poll);
  });
}
