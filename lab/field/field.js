"use strict";
const $ = id => document.getElementById(id);
const field = $("field"), screen = field.getContext("2d");
const raster = document.createElement("canvas");
const W = raster.width = 64, H = raster.height = 40;
const px = raster.getContext("2d", {willReadFrequently:true});
const video = document.createElement("video");
video.playsInline = true; video.muted = true;
const red = "#ee5647", blue = "#506cf9", paper = "#162428";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x-b.x, a.y-b.y);
const controls = {practice:"practiceControls",find:"findControls",follow:"followControls",world:"worldControls"};
const instructions = {
  practice:"Start sound and drag the red object. Try the top and bottom edges, then add a blue object and move either one. Arrow keys move the red object.",
  find:"A red and a blue object are hidden. Listen for the smooth red sound and tap where you think it is. With a keyboard, move the crosshair with the arrows and press Enter.",
  follow:"Start a run. Listen for the moving red object and follow it with your finger on the blank field for six seconds. Trace and target are revealed together. Arrow keys also work.",
  world:"Choose a photo or start the camera. The rings mark the patches you can hear. Move a bright object left, right, up and down to hear the same mapping."
};
let mode="practice", two=false, regions=[], ctx=null, voices=[], audible=false, stream=null, photo=null;
let worldEpoch=0, lastAudio=0, findDone=false, run=null, take=null, pointer=null, dragged=0, cursor={x:.5,y:.5};
const session=[];let findStarted=0;
let objects=[{x:.30,y:.62,c:red},{x:.75,y:.32,c:blue}];
function text(s=""){ $("status").textContent=s; }
function setMode(m){
  worldEpoch++; stopCamera(); run=null; take=null; pointer=null; mode=m; cursor={x:.5,y:.5};
  $("traceResult").textContent=""; text(); $("instruction").textContent=instructions[m];
  for(const [key,id] of Object.entries(controls)) $(id).hidden=key!==m;
  for(const b of document.querySelectorAll("[data-mode]")) b.setAttribute("aria-pressed",String(b.dataset.mode===m));
  $("track").textContent="Start a 6-second run";
  if(m==="find") newFind();
  if(m==="practice") objects=[{x:.30,y:.62,c:red},{x:.75,y:.32,c:blue}];
  lastAudio=0; regions=[];
}
function stopCamera(){if(stream){for(const track of stream.getTracks())track.stop();stream=null;}video.srcObject=null;$("camera").textContent="Start rear camera";}
function randomPoint(){return {x:.15+.70*Math.random(),y:.16+.68*Math.random()};}
function newFind(){
  findStarted=performance.now();
  const a=randomPoint();let b=randomPoint();while(dist(a,b)<.38)b=randomPoint();
  objects=[{...a,c:red},{...b,c:blue}];findDone=false;cursor={x:.5,y:.5};text("Listen, then mark the red object.");$("traceResult").textContent="";
}
function circle(x,y,r,c,context,w,h){context.fillStyle=c;context.beginPath();context.arc(x*w,y*h,r,0,2*Math.PI);context.fill();}
function drawSource(){
  px.fillStyle=paper;px.fillRect(0,0,W,H);
  if(mode==="world"){
    const src=stream&&video.readyState>=2?video:photo;
    if(src){const sw=src.videoWidth||src.naturalWidth, sh=src.videoHeight||src.naturalHeight;
      const scale=Math.min(W/sw,H/sh),dw=sw*scale,dh=sh*scale;
      // Extend the photo edges across letterboxing for consistent border estimation.
      px.drawImage(src,0,0,W,H);
      if(dw<W-.5){const left=(W-dw)/2;px.drawImage(src,0,0,1,sh,0,0,left,H);px.drawImage(src,sw-1,0,1,sh,W-left,0,left,H);}
      if(dh<H-.5){const top=(H-dh)/2;px.drawImage(src,0,0,sw,1,0,0,W,top);px.drawImage(src,0,sh-1,sw,1,0,H-top,W,top);}
      px.drawImage(src,(W-dw)/2,(H-dh)/2,dw,dh);
    }
  }else if(mode!=="follow"||run||take){
    const count=mode==="practice"&&!two?1:2;
    for(const o of objects.slice(0,count)) circle(o.x,o.y,3.5,o.c,px,W,H);
  }
}
// The encoder receives only camera/image pixels. No target or game coordinates enter this function.
function encodePixels(data,w,h){
  const edge=[[],[],[]];
  for(let i=0;i<w*h;i++){const x=i%w,y=Math.floor(i/w);if(x===0||y===0||x===w-1||y===h-1)
    for(let ch=0;ch<3;ch++)edge[ch].push(data[i*4+ch]);}
  const bg=edge.map(channel=>channel.sort((a,b)=>a-b)[channel.length>>1]);
  const mark=new Uint8Array(w*h),queue=new Int32Array(w*h),found=[];
  for(let i=0;i<w*h;i++){
    const k=i*4;if(Math.hypot(data[k]-bg[0],data[k+1]-bg[1],data[k+2]-bg[2])<62)mark[i]=1;
  }
  for(let i=0;i<w*h;i++){
    if(mark[i])continue;
    let head=0,end=1,xsum=0,ysum=0,r=0,g=0,b=0;queue[0]=i;mark[i]=1;
    while(head<end){
      const j=queue[head++],k=4*j,x=j%w,y=Math.floor(j/w);
      xsum+=x+.5;ysum+=y+.5;r+=data[k];g+=data[k+1];b+=data[k+2];
      for(const n of [x?j-1:-1,x+1<w?j+1:-1,y?j-w:-1,y+1<h?j+w:-1]){
        if(n<0||mark[n])continue;const m=n*4;
        if(Math.abs(data[k]-data[m])+Math.abs(data[k+1]-data[m+1])+Math.abs(data[k+2]-data[m+2])>115)continue;
        mark[n]=1;queue[end++]=n;
      }
    }
    if(end<8)continue;
    const rgb=[r/end,g/end,b/end]; const contrast=Math.hypot(...rgb.map((v,k)=>v-bg[k]));
    found.push({x:xsum/(end*w),y:ysum/(end*h),rgb,area:end/(w*h),score:Math.sqrt(end)*contrast});
  }
  return found.sort((a,b)=>b.score-a.score).slice(0,2);
}
function assign(next,prev){
  const cost=(a,b)=>!b?1.4:dist(a,b)+Math.hypot(...a.rgb.map((v,i)=>(v-b.rgb[i])/255));
  if(next.length===2 && cost(next[0],prev[1])+cost(next[1],prev[0])<cost(next[0],prev[0])+cost(next[1],prev[1]))return [next[1],next[0]];
  if(next.length===1 && prev[1] && cost(next[0],prev[1])<cost(next[0],prev[0]))return [null,next[0]];
  return next;
}
function openAudio(){
  if(ctx)return;ctx=new AudioContext();
  for(let i=0;i<2;i++){
    const pan=ctx.createStereoPanner();pan.connect(ctx.destination);
    const partials=[1,2,3,5].map(n=>{const osc=ctx.createOscillator(),gain=ctx.createGain();gain.gain.value=0;
      osc.connect(gain).connect(pan);osc.start();return {osc,gain,n};});
    voices.push({pan,partials});
  }
}
async function startAudio(){
  openAudio();await ctx.resume();audible=true;$("sound").textContent="Mute sound";$("sound").setAttribute("aria-pressed","true");lastAudio=0;
}
function mute(){
  audible=false;if(ctx)for(const v of voices)for(const p of v.partials)p.gain.gain.setTargetAtTime(0,ctx.currentTime,.012);
  $("sound").textContent="Start sound";$("sound").setAttribute("aria-pressed","false");
}
function updateAudio(next){
  regions=assign(next,regions);if(!ctx||!audible)return;
  const now=ctx.currentTime;
  voices.forEach((voice,i)=>{
    const v=regions[i];if(!v){for(const p of voice.partials)p.gain.gain.setTargetAtTime(0,now,.018);return;}
    const f=220*2**(1.8*(1-v.y));voice.pan.pan.setTargetAtTime(2*v.x-1,now,.012);
    const [r,g,b]=v.rgb,sum=r+g+b||1;
    const amps=[1+.8*r/sum,.08+.85*g/sum,.03+1.3*b/sum,.02+.85*b/sum];
    const norm=Math.hypot(...amps),level=.052*Math.min(1,.5+2.4*Math.sqrt(v.area));
    voice.partials.forEach(({osc,gain,n},j)=>{osc.frequency.setTargetAtTime(f*n,now,.012);gain.gain.setTargetAtTime(level*amps[j]/norm,now,.016);});
  });
}
function overlayDot(p,color,r=8){
  screen.beginPath();screen.arc(p.x*field.width,p.y*field.height,r,0,2*Math.PI);screen.strokeStyle=color;screen.lineWidth=2.8;screen.stroke();
}
function path(points,color){if(!points.length)return;screen.strokeStyle=color;screen.lineWidth=3;screen.beginPath();points.forEach((p,i)=>screen[i?"lineTo":"moveTo"](p.x*field.width,p.y*field.height));screen.stroke();}
function display(){
  screen.fillStyle=paper;screen.fillRect(0,0,field.width,field.height);
  const hidden=(mode==="find"&&!findDone)||(mode==="follow"&&!take);
  if(!hidden){screen.imageSmoothingEnabled=true;screen.drawImage(raster,0,0,field.width,field.height);}
  if(mode==="world")for(const r of regions.filter(Boolean))overlayDot(r,"#f1eddc",13);
  if(mode==="find")overlayDot(cursor,"#e9de9e");
  if(mode==="follow"){if(take){path(take.truth,"#fe7766");path(take.guess.filter(Boolean),"#e9de9e");}else overlayDot(cursor,"#e9de9e");}
}
function startRun(){
  if(mode!=="follow")return;
  const start=randomPoint(),end={x:1-start.x,y:1-start.y},mid=randomPoint();
  if(dist(start,end)<.42){start.x=.19;end.x=.81;}
  run={t:performance.now(),start,end,mid,truth:[],guess:[],sample:0,hasInput:false};
  const samples=Array.from({length:21},(_,i)=>{const t=i/20,u=1-t;return {x:u*u*start.x+2*u*t*mid.x+t*t*end.x,y:u*u*start.y+2*u*t*mid.y+t*t*end.y};});
  const corners=[{x:.15,y:.16},{x:.85,y:.16},{x:.15,y:.84},{x:.85,y:.84}];
  const clearance=p=>Math.min(...samples.map(q=>dist(p,q)));
  const distractor=corners.sort((a,b)=>clearance(b)-clearance(a))[0];
  objects=[{...start,c:red},{...distractor,c:blue}];take=null;cursor={x:.5,y:.5};pointer=null;
  $("track").textContent="Restart run";text("Follow the smooth sound. Drag anywhere in the field.");$("traceResult").textContent="";
}
function stepRun(now){
  const t=clamp((now-run.t)/6000,0,1),u=1-t;
  objects[0]={x:u*u*run.start.x+2*u*t*run.mid.x+t*t*run.end.x,y:u*u*run.start.y+2*u*t*run.mid.y+t*t*run.end.y,c:red};
  if(now-run.sample>=50){run.sample=now;run.truth.push({...objects[0],t:Math.round(now-run.t)});run.guess.push(run.hasInput?{...cursor}:null);}
  if(t<1)return;
  take=run;run=null;$("track").textContent="Try another path";
  const d=take.guess.flatMap((g,i)=>g?[dist(g,take.truth[i])]:[]);
  text(d.length?"Red is the target path. Pale yellow is your trace.":"No trace recorded. Start again and drag across the field.");
  if(d.length){session.push({activity:"follow", t_ms:take.truth.map(p=>p.t), target:take.truth.map(({x,y})=>[x,y]), response:take.guess.map(p=>p?[p.x,p.y]:null)});$("export").hidden=false;}
  if(d.length)$("traceResult").textContent="Input covered "+Math.round(100*d.length/take.truth.length)+"% of the run. Average distance from target: "+Math.round(100*d.reduce((a,b)=>a+b,0)/d.length/Math.SQRT2)+"% of the field diagonal.";
}
function tick(now){
  if(run)stepRun(now);
  if(now-lastAudio>=32){lastAudio=now;drawSource();updateAudio(encodePixels(px.getImageData(0,0,W,H).data,W,H));}
  display();requestAnimationFrame(tick);
}
function point(e){const b=field.getBoundingClientRect();return {x:clamp((e.clientX-b.left)/b.width,0,1),y:clamp((e.clientY-b.top)/b.height,0,1)};}
function markFind(){if(findDone)return;findDone=true;const t=objects[0],g=cursor;
  session.push({activity:"find",target:[t.x,t.y],distractor:[objects[1].x,objects[1].y],response:[g.x,g.y],elapsed_ms:Math.round(performance.now()-findStarted),audio_active:audible});$("export").hidden=false;
  const quadrant=p=>(p.y<.5?"upper ":"lower ")+(p.x<.5?"left":"right");
  text("Red was "+quadrant(t)+". Your mark was "+quadrant(g)+".");
  $("traceResult").textContent="Distance to red: "+Math.round(100*dist(t,g)/Math.SQRT2)+"% of the field diagonal.";}
function move(p){
  cursor={...p};if(mode==="practice")Object.assign(objects[dragged],{x:clamp(p.x,.07,.93),y:clamp(p.y,.10,.90)});
  if(run)run.hasInput=true;
}
field.addEventListener("pointerdown",e=>{
  field.focus();field.setPointerCapture(e.pointerId);
  if(mode==="world"||mode==="find"&&findDone||mode==="follow"&&!run)return;
  pointer=e.pointerId;const p=point(e);
  if(mode==="practice")dragged=two&&dist(objects[1],p)<dist(objects[0],p)?1:0;
  move(p);if(mode==="find")markFind();
});
field.addEventListener("pointermove",e=>{if(pointer===e.pointerId&&mode!=="find")move(point(e));});
for(const event of ["pointerup","pointercancel"])field.addEventListener(event,e=>{if(pointer===e.pointerId){pointer=null;if(run)run.hasInput=false;}});
field.addEventListener("keydown",e=>{
  const delta={ArrowUp:[0,-.05],ArrowDown:[0,.05],ArrowLeft:[-.05,0],ArrowRight:[.05,0]}[e.key];
  if(mode==="find"&&e.key==="Enter"){e.preventDefault();markFind();return;}
  if(!delta||mode==="world")return;e.preventDefault();const p=mode==="practice"?objects[0]:cursor;dragged=0;
  move({x:clamp(p.x+delta[0],0,1),y:clamp(p.y+delta[1],0,1)});
});
$("sound").onclick=()=>{if(audible)mute();else startAudio().catch(()=>text("Audio could not start. Try the sound button again."));};
async function hear(){try{await startAudio();return true;}catch{text("Stereo audio is unavailable in this browser.");return false;}}
document.querySelectorAll("[data-mode]").forEach(el=>el.onclick=()=>{setMode(el.dataset.mode);if(mode==="find")hear();});
$("second").onclick=()=>{two=!two;$("second").setAttribute("aria-pressed",String(two));$("second").textContent=two?"Remove blue object":"Add blue object";};
$("nextFind").onclick=async()=>{if(await hear()&&mode==="find")newFind();};
$("track").onclick=async()=>{if(await hear())startRun();};
$("photo").onchange=async e=>{
  const file=e.target.files[0];if(!file)return;const token=++worldEpoch;stopCamera();
  const img=new Image(),url=URL.createObjectURL(file);img.src=url;
  try{await img.decode();if(token!==worldEpoch||mode!=="world")return;photo=img;await hear();text("Photo loaded. Rings show the sounding regions.");}
  catch{text("Could not read this image. Try a JPG or PNG.");}finally{URL.revokeObjectURL(url);e.target.value="";}
};
$("camera").onclick=async()=>{
  if(stream){++worldEpoch;stopCamera();text("Camera stopped.");return;}
  const token=++worldEpoch;
  try{
    const media=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:"environment"},width:{ideal:640},height:{ideal:400}}});
    if(token!==worldEpoch||mode!=="world"){media.getTracks().forEach(t=>t.stop());return;}
    stream=media;video.srcObject=media;await video.play();if(token!==worldEpoch)return;
    await hear();$("camera").textContent="Stop camera";text("Live camera. Move a colored object across a plain background.");
  }catch{if(token===worldEpoch){stopCamera();text("Camera unavailable. Check camera permission or open a photo.");}}
};
$("export").onclick=()=>{
  const obj={version:"field-1.0",runs:session};
  const url=URL.createObjectURL(new Blob([JSON.stringify(obj)],{type:"application/json"}));
  const a=document.createElement("a");a.href=url;a.download="sonovizio-field-runs.json";a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
};
document.addEventListener("visibilitychange",()=>{if(document.hidden){mute();worldEpoch++;stopCamera();if(run){run=null;text("Run interrupted. Start a new run.");}}});
setMode("practice");requestAnimationFrame(tick);
