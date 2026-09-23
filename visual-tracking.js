// Visual observations only. This module never produces a sign or a voice event.
export const FACE_LINES=[[33,160,158,133,153,144,33],[362,385,387,263,373,380,362],[70,63,105,66,107],[336,296,334,293,300],[10,168]];
export const BODY_LINES=[[11,12],[11,13,15],[12,14,16]];
const point=p=>p&&[p.x,p.y,p.z].every(Number.isFinite)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1;
function selectPoints(landmarks,indices,visible=false){const points={};for(const i of new Set(indices.flat())){const p=landmarks?.[i];if(point(p)&&(!visible||Number.isFinite(p.visibility)&&p.visibility>=.6))points[i]={x:p.x,y:p.y,z:p.z}}return points}
export function faceObservation(result){
 const landmarks=result?.faceLandmarks?.[0];if(!landmarks)return null;
 const points=selectPoints(landmarks,FACE_LINES);if(!Object.keys(points).length)return null;
 // The model does not certify lip visibility through a mask/hand. Never use or draw
 // inferred lips or mouth blendshapes; unavailable is explicitly different from zero.
 const upperExpression={};for(const c of result.faceBlendshapes?.[0]?.categories||[])if(/^(eye|brow)/.test(c.categoryName)&&Number.isFinite(c.score))upperExpression[c.categoryName]=c.score;
 const matrix=result.facialTransformationMatrixes?.[0]?.data;
 return {points,availability:'estimated',mouth:null,mouthAvailability:'unknown',headMatrix:matrix?.length===16&&Array.from(matrix).every(Number.isFinite)?Array.from(matrix):null,upperExpression};
}
export function poseObservation(result){const points=selectPoints(result?.landmarks?.[0],BODY_LINES,true);return Object.keys(points).length?{points,availability:'estimated'}:null}
export class VisualTracking{
 constructor(context){this.context=context;this.enabled=false;this.faceModel=null;this.poseModel=null;this.generation=0;this.interval=250;this.clear();this.status='Opcional. Solo seguimiento; no reconoce señas.'}
 clear(){this.face=null;this.pose=null;this.faceAt=-Infinity;this.poseAt=-Infinity;this.lastAt=-Infinity;this.next='face'}
 async enable(){
 const generation=++this.generation;this.status='Cargando seguimiento opcional…';
 try{const {lib,files}=await this.context();
 for(const [kind,Class,url,options] of [
 ['face',lib.FaceLandmarker,'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',{numFaces:1,outputFaceBlendshapes:true,outputFacialTransformationMatrixes:true}],
 ['pose',lib.PoseLandmarker,'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',{numPoses:1,outputSegmentationMasks:false}]
 ]){if(generation!==this.generation)return;try{const model=await Class.createFromOptions(files,{baseOptions:{modelAssetPath:url},runningMode:'VIDEO',...options});if(generation!==this.generation){model.close();return}this[kind+'Model']=model}catch{/* Either optional channel can fail independently. */}}
 this.enabled=!!(this.faceModel||this.poseModel);this.status=this.enabled?'Seguimiento visual preparado. Activa Seguimiento de señas.':'Seguimiento opcional no disponible. Las manos siguen funcionando.';
 }catch{this.status='No se pudo cargar el seguimiento opcional. Las manos siguen funcionando.'}
 }
 disable(){this.generation++;this.enabled=false;this.faceModel?.close();this.poseModel?.close();this.faceModel=null;this.poseModel=null;this.clear();this.status='Rostro/cuerpo OFF. El reconocimiento usa manos.'}
 process(video,now,{enabled,handMs}){
 if(!this.enabled)return;
 if(!enabled){this.clear();this.status='Rostro/cuerpo en pausa. Activa el overlay; se pausa al grabar.';return}
 // Hand detection wins the frame budget. No second animation loop is created.
 if(handMs>80){this.clear();this.status='Rostro/cuerpo en pausa para priorizar las manos.';return}
 if(now-this.lastAt<this.interval)return;this.lastAt=now;
 const kind=this.next;this.next=kind==='face'?'pose':'face';const model=this[kind+'Model'];if(!model)return;
 const started=performance.now();try{const result=model.detectForVideo(video,now);this[kind]=kind==='face'?faceObservation(result):poseObservation(result);this[kind+'At']=performance.now();this.status='Solo seguimiento · '+(this.face?'rostro estimado':'rostro no disponible')+' · '+(this.pose?'brazos estimados':'cuerpo no disponible')}catch{this[kind]=null;this.status='Canal visual no disponible; reconocimiento de manos activo.'}
 const elapsed=performance.now()-started;this.interval=elapsed>80?1000:250;
 }
 snapshot(now){return {face:now-this.faceAt<=600?this.face:null,expression:now-this.faceAt<=600?this.face?.upperExpression||null:null,pose:now-this.poseAt<=600?this.pose:null}}
}
export function drawVisualTracking(canvas,channels){
 const ctx=canvas.getContext('2d');const draw=(observation,lines,color)=>{if(!observation)return;ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=Math.max(1,canvas.width/500);const points=observation.points;
 for(const line of lines){ctx.beginPath();for(let i=1;i<line.length;i++){const a=points[line[i-1]],b=points[line[i]];if(a&&b){ctx.moveTo(a.x*canvas.width,a.y*canvas.height);ctx.lineTo(b.x*canvas.width,b.y*canvas.height)}}ctx.stroke()}
 for(const p of Object.values(points)){ctx.beginPath();ctx.arc(p.x*canvas.width,p.y*canvas.height,Math.max(1.5,canvas.width/350),0,Math.PI*2);ctx.fill()}
 };draw(channels.pose,BODY_LINES,'#d6b5fc');draw(channels.face,FACE_LINES,'#f4d68b');
}
