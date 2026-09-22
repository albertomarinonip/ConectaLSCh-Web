// Detection channels can later include face, expression and pose. No invented data.
export function observation(result,time){return {version:1,time,hands:(result.landmarks||[]).slice(0,2),handedness:result.handednesses||result.handedness||[],face:null,expression:null,pose:null}}
export const CONNECTIONS=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
export function drawHands(canvas,video,data,on){
 const width=video.videoWidth||640,height=video.videoHeight||480;
 if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height}
 const ctx=canvas.getContext('2d');ctx.clearRect(0,0,width,height);let count=0;
 if(on)for(const hand of data?.hands||[]){if(hand.length!==21||hand.some(p=>![p.x,p.y,p.z].every(Number.isFinite)))continue;
 ctx.strokeStyle=count?'#a5b8ff':'#83edd4';ctx.fillStyle='#f6fffd';ctx.lineWidth=Math.max(1.5,width/320);
 ctx.beginPath();for(const [a,b] of CONNECTIONS){ctx.moveTo(hand[a].x*width,hand[a].y*height);ctx.lineTo(hand[b].x*width,hand[b].y*height)}ctx.stroke();
 for(const p of hand){ctx.beginPath();ctx.arc(p.x*width,p.y*height,Math.max(2,width/220),0,Math.PI*2);ctx.fill()}count++;
 }
 return count;
}
