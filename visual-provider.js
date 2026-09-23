// One shared MediaPipe runtime, one reusable hand model, lazy optional observers.
const VERSION='0.10.22-rc.20250304';
let contextPromise=null,handPromise=null;
export function visionContext(){
 if(!contextPromise)contextPromise=(async()=>{
 const lib=await import(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/+esm`);
 const files=await lib.FilesetResolver.forVisionTasks(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`);
 return {lib,files};
 })().catch(error=>{contextPromise=null;throw error});
 return contextPromise;
}
export function handModel(){
 if(!handPromise)handPromise=(async()=>{const {lib,files}=await visionContext();return lib.HandLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'},numHands:2,runningMode:'VIDEO',minHandDetectionConfidence:.4,minHandPresenceConfidence:.5,minTrackingConfidence:.4})})().catch(error=>{handPromise=null;throw error});
 return handPromise;
}
