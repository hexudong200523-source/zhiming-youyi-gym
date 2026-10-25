import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {SSAOPass} from 'three/addons/postprocessing/SSAOPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {MeshoptDecoder} from './vendor/meshopt_decoder.mjs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {RectAreaLightUniformsLib} from 'three/addons/lights/RectAreaLightUniformsLib.js';

const $ = id => document.getElementById(id);
const $$ = selector => [...document.querySelectorAll(selector)];
const mobile = matchMedia('(max-width: 800px)').matches;
const V = a => new THREE.Vector3(...a);
let manifest, schemes, model, activeScheme, selected, sceneNodes = new Map(), materials = [], equipment = [];
let mode = 'orbit', plan = false, overview = false, clay = false, hiddenEquipment = new Set(), roofCut = false, roofAssembled = true;
let zoneIsolation = false;
let currentZone = null, cameraTween = null, savedPerspective = null, ready = false;
let overrides = {path:'sample',wall:'scheme',metal:'silver'}, keys = new Set(), joystick = {x:0,y:0}, lift = 0;
const lightsState = {sun:115,ambient:80,artificial:65,temperature:3800,time:14,exposure:102};
const scene = new THREE.Scene();
scene.background = new THREE.Color('#e5e7df');
const renderer = new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,mobile?1.35:1.75));
renderer.setSize(innerWidth,innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.shadowMap.enabled = true;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('viewport').appendChild(renderer.domElement);
renderer.domElement.tabIndex = 0;
const perspective = new THREE.PerspectiveCamera(67,innerWidth/innerHeight,.055,350);
perspective.position.set(45.8,1.65,-15.2);
perspective.lookAt(17,1.9,-12.7);
const ortho = new THREE.OrthographicCamera(-30,30,18,-18,.1,250);
let camera = perspective;
let fineShadows=!mobile;
const composer=new EffectComposer(renderer);
const beautyPass=new RenderPass(scene,camera);composer.addPass(beautyPass);
const aoPass=new SSAOPass(scene,camera,innerWidth,innerHeight,12);aoPass.kernelRadius=.3;aoPass.minDistance=.0005;aoPass.maxDistance=.045;
composer.addPass(aoPass);composer.addPass(new OutputPass());
function renderScene(){if(fineShadows&&ready&&!plan){beautyPass.camera=camera;aoPass.camera=camera;composer.render();}else renderer.render(scene,camera);}
let controls = new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true; controls.dampingFactor=.075; controls.minDistance=.35; controls.maxDistance=120; controls.maxPolarAngle=Math.PI*.97;
controls.target.set(17,1.9,-12.7); controls.update();
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const lookEuler = new THREE.Euler(0,0,0,'YXZ');
const tmpVec = new THREE.Vector3();
let toastTimer;
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3600);}
function escapeHTML(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function displayName(s){
 const match=s.match(/^CAD_([^_]+)_(.*)$/);
 if(match){
  const raw=match[2],key=raw.toLowerCase().replace(/[\s_\-]/g,'');
  const types=[['verticalplatetree','杠铃片收纳架'],['dumbbellrack','哑铃架'],['powercage','力量架'],['olympicbench','奥林匹克卧推凳'],['multipurposebench','多用途训练凳'],['superbench','可调训练凳'],['flatbench','平板训练凳'],['bench','训练凳'],['inclinepress','上斜推胸机'],['chestpress','推胸机'],['convergingshoulder','汇聚式肩推机'],['shoulderpress','肩推机'],['shouldpress','肩推机'],['latpulldown','高位下拉机'],['pulldown','高位下拉机'],['diverginglowrow','分动划船机'],['lowrow','低位划船机'],['seatedrow','坐姿划船机'],['seatedcalf','坐姿提踵机'],['angledlegpress','斜蹬腿机'],['pronelegcurl','俯卧腿弯举机'],['legcurl','腿弯举机'],['legextension','腿屈伸机'],['bicepcurl','二头弯举机'],['tricepextension','三头伸展机'],['lateralraise','侧平举机'],['innerthigh','内收肌训练机'],['pecfly','夹胸机'],['gluteextension','臀部后蹬机'],['seateddip','坐姿臂屈伸机'],['artisclimb','攀爬训练机'],['tuoyuan','椭圆机'],['ftsglide','综合绳索训练器']];
  const known=types.find(([k])=>key.includes(k));
  const label=known?known[1]:/^a\$c/i.test(raw)?'原图器械组件':`${raw.replace(/_2D|2d/g,'').replace(/_/g,' ')} 器械`;
  return `${label} · ${match[1]}`;
 }
 return s.replace('原图连接龙门架_原生站位','龙门架训练站 · ').replace('原图龙门架连接_','龙门架连接段 · ').replace(/^原图/,'').replace(/_+/g,' · ');
}

// The geometry is imported directly from the user's SKP. All treatments below
// change display materials, lights or visibility; equipment transforms are never edited.
RectAreaLightUniformsLib.init();
const pmrem = new THREE.PMREMGenerator(renderer);
const roomEnv = new RoomEnvironment();
const environment = pmrem.fromScene(roomEnv,.035).texture;
scene.environment = environment; scene.environmentIntensity=.6;
roomEnv.dispose(); pmrem.dispose();
const hemi = new THREE.HemisphereLight('#eaf2ff','#6a675c',1.65);scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff1d9',3.2);sun.position.set(12,25,10);sun.target.position.set(26,0,-9);scene.add(sun,sun.target);
sun.castShadow=true;sun.shadow.mapSize.set(mobile?2048:4096,mobile?2048:4096);
Object.assign(sun.shadow.camera,{left:-37,right:37,top:29,bottom:-29,near:.2,far:100});
sun.shadow.bias=-.00008;sun.shadow.normalBias=.025;sun.shadow.radius=3;
const interiorLights=[];
for(const x of [8,20,32,44]){
 const l=new THREE.RectAreaLight('#fff1db',3.3,10,7);l.position.set(x,3.3,-9);l.lookAt(x,0,-9);scene.add(l);interiorLights.push(l);
}
const fill=new THREE.DirectionalLight('#c9e1f1',.8);fill.position.set(30,3,-30);scene.add(fill);


const proposedFinish=new THREE.Group();scene.add(proposedFinish);
const roofFinishMaterial=new THREE.MeshStandardMaterial({color:'#eeeae0',roughness:.86,side:THREE.DoubleSide});
const fixtureMaterial=new THREE.MeshStandardMaterial({color:'#f5f2e7',emissive:'#fff1da',emissiveIntensity:1.5,roughness:.4});
for(const z of [-1.8,-20.414]){
 const verts=new Float32Array([0,4.08,z,53.92,4.08,z,53.92,6.28,-11.107,0,6.28,-11.107]);
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(verts,3));geo.setIndex([0,1,2,0,2,3]);geo.computeVertexNormals();
 const panel=new THREE.Mesh(geo,roofFinishMaterial);panel.receiveShadow=true;proposedFinish.add(panel);
}
for(const x of [6,14,22,30,38,46])for(const z of [-5,-16]){
 const fixture=new THREE.Mesh(new THREE.BoxGeometry(5,.055,.075),fixtureMaterial);fixture.position.set(x,3.88,z);proposedFinish.add(fixture);
}

function seeded(seed){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
function canvasTexture(kind){
 const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d'),rand=seeded(1258),data=ctx.createImageData(512,512);
 for(let y=0;y<512;y++)for(let x=0;x<512;x++){
  const p=(y*512+x)*4; let r,g,b;
  if(kind==='wood'){
   const warp=x+4*Math.sin(y*.009)+1.5*Math.sin(y*.031+x*.014);
   let grain=Math.sin(warp*.38+Math.sin(warp*.04)*3)+.5*Math.sin(warp*1.21)+.2*Math.sin(warp*2.3);
   const seam=x<2||x>510?-19:0;const k=grain*7+(rand()-.5)*10+seam;
   r=168+k;g=164+k;b=149+k;
  }else if(kind==='rubber'){
   const n=(rand()-.5)*25;const speck=rand()>.94?13:0;r=91+n+speck;g=94+n+speck;b=89+n+speck;
  }else if(kind==='brushed'){const n=(rand()-.5)*10+Math.sin(y*3.8)*5;r=g=b=190+n;}
  else {const v=(Math.cos(x*.37)+1)*48+115;r=g=b=v;}
  data.data[p]=r;data.data[p+1]=g;data.data[p+2]=b;data.data[p+3]=255;
 }
 ctx.putImageData(data,0,0);const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());t.colorSpace=THREE.SRGBColorSpace;return t;
}
const textures={wood:canvasTexture('wood'),rubber:canvasTexture('rubber'),metal:canvasTexture('brushed'),fluted:canvasTexture('fluted')};
const roughnessTextures={};
for(const [k,t]of Object.entries(textures)){const q=t.clone();q.colorSpace=THREE.NoColorSpace;roughnessTextures[k]=q;}
const clayMat=new THREE.MeshStandardMaterial({color:'#e9e6dc',roughness:.88,metalness:0});
const clayGlass=new THREE.MeshStandardMaterial({color:'#d3e2df',transparent:true,opacity:.25,roughness:.4,depthWrite:false,side:THREE.DoubleSide});
const materialRoles = name => /环形动线/.test(name)?'path':/纯黑训练橡胶/.test(name)?'rubber':/暖白墙顶/.test(name)?'wall':/浅橡木/.test(name)?'wood':/花纹铝板|拉丝银色|抛光导杆|配重钢片|花器|Crom|Crome|Alluminio|INOX|Fsilver|Fsteel|vray_metal/.test(name)?'metal':/透明玻璃|Translucent_Glass/.test(name)?'glass':/灯具发光/.test(name)?'light':/石墨黑|Metal_Nero|metal_black/.test(name)?'frame':/黑色软包|橡胶|缝线|Gomma|Skin_Sel|PP_Imb/.test(name)?'pad':/草坪|叶片/.test(name)?'plant':'native';
function planarUV(mesh,scaleX,scaleY){
 const p=mesh.geometry.attributes.position, uv=new Float32Array(p.count*2),n=mesh.geometry.attributes.normal;
 for(let i=0;i<p.count;i++){
  const v=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);
  const nn=n?new THREE.Vector3().fromBufferAttribute(n,i).transformDirection(mesh.matrixWorld):new THREE.Vector3(0,1,0);
  if(Math.abs(nn.y)>.6){uv[i*2]=v.x/scaleX;uv[i*2+1]=-v.z/scaleY;}
  else if(Math.abs(nn.x)>.6){uv[i*2]=-v.z/scaleX;uv[i*2+1]=v.y/scaleY;}
  else{uv[i*2]=v.x/scaleX;uv[i*2+1]=v.y/scaleY;}
 }
 mesh.geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
}
function importMaterials(){
 model.updateMatrixWorld(true);
 model.traverse(node=>{if(node.userData?.id)sceneNodes.set(node.userData.id,node);});
 for(const component of manifest.components){
  const node=sceneNodes.get(component.id);if(!node)continue;
  node.userData.component=component;node.userData.originalPosition=node.position.clone();
  node.traverse(mesh=>{if(!mesh.isMesh)return;
   mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.componentId=component.id;
   const source=Array.isArray(mesh.material)?mesh.material:[mesh.material];
   const converted=source.map(old=>{
    const role=materialRoles(old.name);let mat;
    if(role==='glass')mat=new THREE.MeshPhysicalMaterial({name:old.name,color:'#dce9e8',metalness:0,roughness:.09,transparent:true,opacity:.22,depthWrite:false,side:THREE.DoubleSide});
    else{mat=old.clone();mat.roughness=.72;mat.metalness=0;mat.side=THREE.DoubleSide;}
    mat.userData={role,baseColor:old.color.clone(),sourceMap:old.map,sourceName:old.name,component};
    materials.push(mat);return mat;
   });
   mesh.material=Array.isArray(mesh.material)?converted:converted[0];mesh.userData.designMaterial=mesh.material;
   const roles=converted.map(m=>m.userData.role);
   if(roles.includes('path')||roles.includes('wood'))planarUV(mesh,.22,1.8);
   else if(roles.includes('rubber'))planarUV(mesh,.7,.7);
   else if(roles.includes('wall'))planarUV(mesh,1,1);
   if(roles.includes('glass')){mesh.castShadow=false;mesh.renderOrder=2;}
  });
 }
 equipment=manifest.components.filter(c=>c.equipment);
}
function applyMaterials(){
 if(!activeScheme)return;roofFinishMaterial.color.set(clay?'#e9e6dc':activeScheme.materials.ceiling.color);
 for(const m of materials){
  const {role,baseColor,sourceMap,component}=m.userData; m.map=null;m.bumpMap=null;m.roughnessMap=null;m.emissive?.set(0);m.emissiveIntensity=0;
  m.color.copy(baseColor);m.roughness=.76;m.metalness=0;
  if(role==='path'){
   m.map=textures.wood;m.bumpMap=roughnessTextures.wood;m.bumpScale=.002;m.roughness=.77;
   m.color.set(overrides.path==='warm'?'#f2dfc5':overrides.path==='pale'?'#f8fff4':'#ffffff');
   if(overrides.path==='stone'){m.map=null;m.bumpMap=roughnessTextures.rubber;m.bumpScale=.008;m.color.set('#a8aea6');m.roughness=.86;}
  }else if(role==='rubber'){m.color.set('#43494c');m.map=textures.rubber;m.bumpMap=roughnessTextures.rubber;m.bumpScale=.003;m.roughness=.94;}
  else if(role==='wall'){
   const ceiling=/屋面|梁|檩条|屋架|吊顶/.test(component.name);
   const spec=activeScheme.materials[ceiling?'ceiling':'wall'];m.color.set(spec.color);m.roughness=spec.roughness;m.metalness=spec.metalness;
   if(overrides.wall!=='scheme')m.color.set({warm:'#e8e1d1',white:'#f1f0e9',concrete:'#b8bbb2'}[overrides.wall]);
   if(activeScheme.id==='silver'&&/柱|墙墩/.test(component.name)){m.color.set('#c7cfca');m.metalness=.4;m.roughness=.43;}
   if(activeScheme.id==='athletic'&&/台柜|柜|台面/.test(component.name)){m.bumpMap=roughnessTextures.fluted;m.bumpScale=.014;}
  }else if(role==='wood'){
   m.color.set('#dad2bf');m.map=textures.wood;m.bumpMap=roughnessTextures.wood;m.bumpScale=.003;m.roughness=.68;
   if(activeScheme.id==='athletic'&&/柜|休息|台/.test(component.name)){m.color.set('#dfddd2');m.map=null;m.bumpMap=roughnessTextures.fluted;m.bumpScale=.002;}
  }else if(role==='metal'){
   m.color.set({silver:activeScheme.materials.featureMetal.color,graphite:'#4a514c',champagne:'#b9b09b'}[overrides.metal]);
   m.metalness=.85;m.roughness=activeScheme.materials.featureMetal.roughness;
   if(/抛光导杆/.test(m.name)){m.color.set('#c4ccc6');m.roughness=.19;}
   if(/配重钢片/.test(m.name)){m.color.set('#242a26');m.roughness=.48;}
   if(/花纹铝板/.test(m.name)&&sourceMap){m.map=sourceMap;m.color.set('#bec4be');}
  }else if(role==='glass'){m.color.set('#d7e5e1');m.roughness=.09;}
  else if(role==='frame'){m.color.set('#242b28');m.metalness=.72;m.roughness=.42;}
  else if(role==='pad'){m.color.set('#1c211e');m.roughness=.88;}
  else if(role==='plant'){m.map=sourceMap;m.roughness=.88;}
  else if(role==='light'){m.color.set('#fffbe9');m.emissive.set(kelvin(lightsState.temperature));m.emissiveIntensity=clay?0:lightsState.artificial/100*2.5;}
  else{m.map=sourceMap;m.roughness=/Plastic|Plastica|Nero|Rubber|Gomma/.test(m.name)?.78:/Metal|Anodiz|Fhighlight/.test(m.name)?.4:.65;m.metalness=/Metal|Anodiz|Fhighlight/.test(m.name)?.58:0;}
  m.needsUpdate=true;
 }
 model.traverse(o=>{if(o.isMesh){if(clay){const mats=Array.isArray(o.userData.designMaterial)?o.userData.designMaterial:[o.userData.designMaterial];o.material=mats.map(m=>m.userData.role==='glass'?clayGlass:clayMat);if(!Array.isArray(o.userData.designMaterial))o.material=o.material[0];}else o.material=o.userData.designMaterial;}});
}
function kelvin(t){t/=100;let r,g,b;if(t<=66){r=255;g=99.4708*Math.log(t)-161.1196;b=t<=19?0:138.5177*Math.log(t-10)-305.0448;}else{r=329.6987*Math.pow(t-60,-.1332);g=288.1222*Math.pow(t-60,-.0755);b=255;}return new THREE.Color(Math.min(255,Math.max(0,r))/255,Math.min(255,Math.max(0,g))/255,Math.min(255,Math.max(0,b))/255).convertSRGBToLinear();}
function updateLighting(){
 const s=lightsState,angle=(s.time-6)/12*Math.PI;
 sun.position.set(27+Math.cos(angle)*34,Math.max(2,Math.sin(angle)*27),11+Math.sin(angle*.7)*11);
 sun.intensity=s.sun/100*1.85;sun.color.copy(kelvin(s.time>16?3800:5600));
 hemi.intensity=s.ambient/100*1.05;fill.intensity=s.ambient/100*.5;scene.environmentIntensity=s.ambient/100*.5;
 interiorLights.forEach(l=>{l.color.copy(kelvin(s.temperature));l.intensity=s.artificial/100*6.2;});
 renderer.shadowMap.needsUpdate=true;renderer.toneMappingExposure=s.exposure/100;fixtureMaterial.emissive.copy(kelvin(s.temperature));fixtureMaterial.emissiveIntensity=clay?0:s.artificial/100*2.5;
 const dayColor=new THREE.Color('#e5e7df'),nightColor=new THREE.Color('#26332f');scene.background.copy(nightColor).lerp(dayColor,Math.min(1,s.sun/60+.12));
 for(const m of materials)if(m.userData.role==='light'){m.emissive.copy(kelvin(s.temperature));m.emissiveIntensity=clay?0:s.artificial/100*2.5;}
 for(const k of ['sun','ambient','artificial','temperature','time','exposure']){
  $(k+'Range').value=s[k];$(k+'Output').textContent=k==='temperature'?`${s[k]} K`:k==='time'?`${String(Math.floor(s[k])).padStart(2,'0')}:${String(Math.round(s[k]%1*60)).padStart(2,'0')}`:k==='exposure'?(s[k]/100).toFixed(2):`${Math.round(s[k])}%`;
 }
}
function applyScheme(id,reset=true){
 activeScheme=schemes.schemes.find(s=>s.id===id)||schemes.schemes[1];
 if(reset){overrides={path:'sample',wall:'scheme',metal:'silver'};Object.assign(lightsState,{sun:activeScheme.lighting.daylight*100,ambient:80,artificial:activeScheme.lighting.ceiling*100,temperature:activeScheme.lighting.kelvin,exposure:activeScheme.lighting.exposure*100,time:14});}
 $$('.scheme-card').forEach(b=>b.classList.toggle('active',b.dataset.scheme===activeScheme.id));
 $('schemeTop').textContent=`${activeScheme.code} / ${activeScheme.name}`;
 if(!currentZone)$('zoneSubtitle').textContent=`新模型实景视角 · ${activeScheme.name}`;
 applyMaterials();updateLighting();updateSwatches();
}
const swatchOptions={
 path:[['sample','灰米木纹 · 图 1','#a6a28e','repeating-linear-gradient(92deg,#b4b09b,#999780 2px,#b4b09b 4px)'],['pale','浅灰木纹','#ccd0c0','repeating-linear-gradient(92deg,#ced0c0,#b5baa8 2px,#ced0c0 4px)'],['warm','暖灰木纹','#b8aa8e','repeating-linear-gradient(92deg,#bead8f,#a19273 2px,#bead8f 4px)'],['stone','浅灰矿物面','#b4b9aa','linear-gradient(135deg,#bec2b6,#a4ad9c)']],
 wall:[['scheme','随方案','#e9e6d9'],['white','净白涂层','#f4f3eb'],['warm','暖白涂层','#e8dfca'],['concrete','浅灰微水泥','#aeb7a5']],
 metal:[['silver','拉丝银色','#bbc4bb','linear-gradient(130deg,#7f8c81,#e1e7dc,#9ea99e)'],['graphite','石墨金属','#454f44','linear-gradient(130deg,#29332c,#677060,#354032)'],['champagne','浅香槟金属','#b1aa91','linear-gradient(130deg,#8c846e,#d9d0b6,#a79d84)']]
};
function buildDesignUI(){
 $('schemeCards').innerHTML=schemes.schemes.map(s=>`<button class="scheme-card" data-scheme="${s.id}"><span class="scheme-row"><span class="scheme-code">${s.code}</span><span class="scheme-name">${s.name}</span></span><div class="scheme-subtitle">${s.tagline}</div><span class="palette">${s.palette.map(c=>`<i style="background:${c}"></i>`).join('')}</span></button>`).join('');
 $$('.scheme-card').forEach(b=>b.onclick=()=>{applyScheme(b.dataset.scheme);toast(`已切换 · ${activeScheme.name}`);});
 for(const [type,options]of Object.entries(swatchOptions)){
  $(type+'Swatches').innerHTML=options.map(([id,label,c,bg])=>`<button class="swatch" data-material="${type}" data-value="${id}" style="background:${bg||c}" title="${label}" aria-label="${label}"></button>`).join('');
 }
 $$('.swatch').forEach(b=>b.onclick=()=>{overrides[b.dataset.material]=b.dataset.value;applyMaterials();updateSwatches();if(clay)toast('材质已设置，退出白模后查看');});
}
function updateSwatches(){for(const type of Object.keys(swatchOptions)){$(type+'Label').textContent=swatchOptions[type].find(o=>o[0]===overrides[type])?.[1]||'随方案';}$$('.swatch').forEach(b=>b.classList.toggle('active',overrides[b.dataset.material]===b.dataset.value));}
function isRoof(component){return component.roof||/屋面|屋架|横梁|檩条|吊顶|柔光顶/.test(component.tag);}
function updateVisibility(){
 const topHidden=new Set(manifest.scenes[1]?.hidden_tags||[]);
 for(const c of manifest.components){const o=sceneNodes.get(c.id);if(!o)continue;let visible=!c.defaultHidden&&!hiddenEquipment.has(c.id);
  if(zoneIsolation&&currentZone&&c.equipment&&!currentZone.componentIds.includes(c.id))visible=false;
  if((plan||overview)&&topHidden.has(c.tag))visible=false;
  if(isRoof(c)&&(roofCut||plan||overview))visible=false;
  if(manifest.displacedAssembly?.componentIds.includes(c.id)){
   o.position.copy(o.userData.originalPosition);
   if(roofAssembled)o.position.add(V(manifest.displacedAssembly.alignmentTranslation));
   else visible=false;
  }
  o.visible=visible;
 }
 renderer.shadowMap.needsUpdate=true;proposedFinish.visible=roofAssembled&&!roofCut&&!plan&&!overview;model.updateMatrixWorld(true);updateEquipmentCounter();
}
function setMode(next,announce=true){
 if(plan)togglePlan(false);
 mode=next;overview=false;camera=perspective;controls.object=camera;controls.enabled=mode==='orbit';cameraTween=null;
 if(mode!=='orbit'){
  if(camera.position.y>8){camera.position.set(45.8,1.65,-15.2);camera.lookAt(17,1.9,-12.7);}
  if(mode==='walk')camera.position.y=currentZone?.id==='terrace'?4.25:1.65;
  lookEuler.setFromQuaternion(camera.quaternion,'YXZ');
 }else{camera.getWorldDirection(tmpVec);controls.target.copy(camera.position).addScaledVector(tmpVec,5);controls.update();}
 $$('.view-toolbar [data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
 $('overviewBtn').classList.remove('active');
 document.body.classList.toggle('walking',mode!=='orbit');
 $('touchControls').classList.toggle('hidden',mode==='orbit');
 $$('.height-controls').forEach(e=>e.style.display=mode==='fly'?'flex':'none');
 $('statusText').textContent=mode==='orbit'?'拖动环视 · 滚轮缩放 · 双击器械定位':mode==='walk'?'拖动画面转头 · WASD 移动 · Shift 加速 · 触屏使用摇杆':'拖动画面转头 · WASD 移动 · Q / E 升降 · Shift 加速';
 updateVisibility();if(announce)toast(mode==='orbit'?'环视模式':mode==='walk'?'漫游模式 · 拖动转头，WASD 或摇杆移动':'自由飞行 · Q / E 升降');
 renderer.domElement.focus({preventScroll:true});
}
function transitionTo(eye,target,duration=850){
 if(mode!=='orbit')setMode('orbit',false);
 cameraTween={start:performance.now(),duration,from:camera.position.clone(),to:V(eye),targetFrom:controls.target.clone(),targetTo:V(target)};
 controls.enabled=true;
}
function enterZone(id){
 if(!ready)return;const z=manifest.zones.find(z=>z.id===id);if(!z)return;
 if(plan)togglePlan(false);setMode('orbit',false);overview=false;currentZone=z;updateVisibility();
 transitionTo(z.eye,z.target);$('zoneTitle').textContent=z.name;$('zoneSubtitle').textContent=z.description;
 $('zoneCounter').textContent=`${String(manifest.zones.indexOf(z)+1).padStart(2,'0')} / ${String(manifest.zones.length).padStart(2,'0')}`;
 $$('.zone-button').forEach(b=>b.classList.toggle('active',b.dataset.zone===id));
 $('zoneDock').classList.remove('open');
 if(mobile)collapsePanel(true);toast(`已到达 · ${z.name}`);
}
function buildZones(){
 $('zoneButtons').innerHTML=manifest.zones.map((z,i)=>`<button class="zone-button" data-zone="${z.id}"><small>${String(i+1).padStart(2,'0')}</small>${z.name}</button>`).join('');
 $$('.zone-button').forEach(b=>b.onclick=()=>enterZone(b.dataset.zone));
 $('zoneCounter').textContent=`01 / ${String(manifest.zones.length).padStart(2,'0')}`;
}
function fitPlan(){
 const aspect=innerWidth/innerHeight;let width=72,height=width/aspect;
 if(height<42){height=42;width=height*aspect;}
 ortho.left=-width/2;ortho.right=width/2;ortho.top=height/2;ortho.bottom=-height/2;ortho.updateProjectionMatrix();
}
function togglePlan(force){
 const next=typeof force==='boolean'?force:!plan;if(next===plan)return;
 cameraTween=null;
 if(next){savedPerspective={position:perspective.position.clone(),quaternion:perspective.quaternion.clone(),target:controls.target.clone(),mode,overview,panelCollapsed:$('inspector').classList.contains('collapsed')};
  collapsePanel(true);
  plan=true;camera=ortho;ortho.position.set(27,80,-5);ortho.up.set(0,0,-1);ortho.lookAt(27,0,-5);fitPlan();
  controls.object=ortho;controls.target.set(27,0,-5);controls.enableRotate=false;controls.enabled=true;controls.update();
  $('statusText').textContent='正投影平面 · 滚轮或双指缩放 · 右键或双指拖动平移';
 }else{plan=false;camera=perspective;controls.object=camera;controls.enableRotate=true;
  if(savedPerspective){perspective.position.copy(savedPerspective.position);perspective.quaternion.copy(savedPerspective.quaternion);controls.target.copy(savedPerspective.target);mode=savedPerspective.mode;overview=savedPerspective.overview;collapsePanel(savedPerspective.panelCollapsed);}
  controls.enabled=mode==='orbit';if(controls.enabled)controls.update();else lookEuler.setFromQuaternion(perspective.quaternion,'YXZ');$('statusText').textContent=mode==='orbit'?'拖动环视 · 滚轮缩放 · 双击器械定位':'拖动画面转头 · WASD 移动 · Shift 加速';
 }
 $('planBtn').classList.toggle('active',plan);$('planBtn').setAttribute('aria-label',plan?'返回三维':'平面图');$('planBtn').querySelector('span').textContent=plan?'返回三维':'平面图';
 document.body.classList.toggle('plan-mode',plan);document.body.classList.toggle('walking',!plan&&mode!=='orbit');
 $('touchControls').classList.toggle('hidden',plan||mode==='orbit');updateVisibility();
}
function showOverview(){if(plan)togglePlan(false);setMode('orbit',false);overview=true;currentZone=null;updateVisibility();controls.maxPolarAngle=Math.PI*.97;transitionTo([31,39,24],[27,0,-8.5],1000);$('overviewBtn').classList.add('active');$('zoneTitle').textContent='一眼读懂，全场关系。';$('zoneSubtitle').textContent='剖开屋顶，查看原模型布局与连续动线。';}
function resetView(){if(!ready)return;if(plan)togglePlan(false);setMode('orbit',false);currentZone=null;zoneIsolation=false;$('isolateZone').checked=false;updateVisibility();transitionTo([45.8,1.65,-15.2],[17,1.9,-12.7]);$('zoneTitle').textContent='自由力量区';$('zoneCounter').textContent=`01 / ${String(manifest.zones.length).padStart(2,'0')}`;$('zoneSubtitle').textContent=`新模型实景视角 · ${activeScheme.name}`;}
const eyeIcon='<svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
function renderEquipment(){
 const query=$('equipmentSearch').value.trim().toLowerCase();const list=equipment.filter(c=>(c.name+' '+displayName(c.name)).toLowerCase().includes(query));
 $('equipmentList').innerHTML=list.map(c=>`<div class="equipment-row ${selected?.id===c.id?'selected':''}" data-id="${c.id}"><button class="device-focus" title="${escapeHTML(c.name)}" data-focus="${c.id}">${escapeHTML(displayName(c.name))}<small>${escapeHTML(c.tag.replace(/^\d+_/,'').replace('原图',''))}</small></button><button class="device-visibility ${hiddenEquipment.has(c.id)?'off':''}" data-visibility="${c.id}" aria-label="${hiddenEquipment.has(c.id)?'显示':'隐藏'}${escapeHTML(c.name)}" aria-pressed="${!hiddenEquipment.has(c.id)}">${eyeIcon}</button></div>`).join('')||'<p class="fine-note">没有找到符合名称的设备。</p>';
 $$('[data-focus]').forEach(b=>b.onclick=()=>focusComponent(b.dataset.focus));
 $$('[data-visibility]').forEach(b=>b.onclick=()=>toggleEquipment(b.dataset.visibility));updateEquipmentCounter();
}
function updateEquipmentCounter(){if(!equipment.length)return;$('equipmentCount').textContent=`${equipment.filter(c=>sceneNodes.get(c.id)?.visible).length} / ${equipment.length} 个组件显示`;}
function toggleEquipment(id){if(hiddenEquipment.has(id))hiddenEquipment.delete(id);else hiddenEquipment.add(id);updateVisibility();renderEquipment();if(selected?.id===id&&hiddenEquipment.has(id))clearSelection();}
function focusComponent(id){
 const c=manifest.components.find(c=>c.id===id);if(!c)return;if(plan)togglePlan(false);setMode('orbit',false);
 if(zoneIsolation&&!currentZone?.componentIds.includes(id)){zoneIsolation=false;$('isolateZone').checked=false;currentZone=null;}
 hiddenEquipment.delete(id);updateVisibility();const b=new THREE.Box3(V(c.bounds[0]),V(c.bounds[1])),center=b.getCenter(new THREE.Vector3()),size=b.getSize(new THREE.Vector3());
 const distance=Math.max(size.length()*1.2,3);let direction=camera.position.clone().sub(center).setY(.35).normalize();
 const pos=center.clone().addScaledVector(direction,distance);pos.y=Math.max(1.7,center.y+size.y*.65);
 transitionTo(pos.toArray(),center.toArray());selectComponent(c);renderEquipment();
}
let selectedHelper;
function selectComponent(c){if(!c?.equipment)return;selected=c;$('selectionName').textContent=displayName(c.name);$('selectionCard').classList.remove('hidden');
 if(selectedHelper){scene.remove(selectedHelper);selectedHelper.geometry.dispose();selectedHelper.material.dispose();}
 selectedHelper=new THREE.Box3Helper(new THREE.Box3(V(c.bounds[0]),V(c.bounds[1])),0x9baa79);selectedHelper.material.transparent=true;selectedHelper.material.opacity=.5;scene.add(selectedHelper);
}
function clearSelection(){selected=null;$('selectionCard').classList.add('hidden');if(selectedHelper){scene.remove(selectedHelper);selectedHelper.geometry.dispose();selectedHelper.material.dispose();selectedHelper=null;}}
function pick(event,double=false){
 if(!ready)return;const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);
 const hits=raycaster.intersectObject(model,true);const hit=hits.find(h=>{let o=h.object;while(o){if(!o.visible)return false;o=o.parent;}return h.object.userData.componentId;});
 if(hit){const c=manifest.components.find(c=>c.id===hit.object.userData.componentId);if(c?.equipment){double?focusComponent(c.id):selectComponent(c);return;}}clearSelection();
}
function drawMiniMap(){
 if(!manifest)return;const c=$('miniMap'),ctx=c.getContext('2d'),w=c.width,h=c.height,pad=8,sx=(w-2*pad)/54,sy=(h-2*pad)/31;
 const xy=(x,z)=>[pad+x*sx,pad+(z+20.5)*sy];ctx.clearRect(0,0,w,h);ctx.fillStyle='#e5e9dc';let p=xy(0,-20.414);ctx.fillRect(...p,53.9*sx,18.614*sy);
 ctx.strokeStyle='#9ba990';ctx.lineWidth=1;ctx.strokeRect(...p,53.9*sx,18.614*sy);
 ctx.fillStyle='#d0dcc3';p=xy(.728,0);ctx.fillRect(...p,12.5*sx,10.3*sy);
 for(const d of equipment){if(hiddenEquipment.has(d.id))continue;const a=xy(d.bounds[0][0],d.bounds[0][2]),b=xy(d.bounds[1][0],d.bounds[1][2]);ctx.fillStyle='#7e8e71';ctx.fillRect(a[0],a[1],Math.max(1,b[0]-a[0]),Math.max(1,b[1]-a[1]));}
 const cp=xy(perspective.position.x,perspective.position.z);perspective.getWorldDirection(tmpVec);const t=xy(perspective.position.x+tmpVec.x*3,perspective.position.z+tmpVec.z*3);
 ctx.beginPath();ctx.moveTo(cp[0],cp[1]);ctx.lineTo(t[0],t[1]);ctx.strokeStyle='#3d6346';ctx.lineWidth=2;ctx.stroke();ctx.beginPath();ctx.arc(cp[0],cp[1],4,0,Math.PI*2);ctx.fillStyle='#3d6346';ctx.fill();ctx.strokeStyle='#fffff6';ctx.lineWidth=1.5;ctx.stroke();
}
async function loadGallery(){
 try{const entries=await fetch('assets/gallery.json').then(r=>r.json());
 $('renderGallery').innerHTML='';for(const entry of entries){const scheme=schemes.schemes.find(s=>s.id===entry.scheme)||schemes.schemes[1];const b=document.createElement('button');b.className='gallery-item';const img=new Image();img.src=entry.src;img.alt=`${scheme.name}效果讨论稿`;img.loading='lazy';b.append(img);const strong=document.createElement('strong');strong.textContent=`${scheme.code} / ${scheme.name}`;b.append(strong);const small=document.createElement('small');small.textContent=entry.caption||scheme.tagline;b.append(small);b.onclick=()=>{$('largeRender').src=entry.src;$('renderCaption').textContent=`${scheme.name} · ${entry.caption||'SU 视图 + imagegen 设计讨论稿'}`;$('renderDialog').showModal();};$('renderGallery').append(b);}
 if(!entries.length)$('renderGallery').innerHTML='<p class="fine-note">效果讨论稿正在整理。当前可先通过「方案」切换三组实时材质与灯光。</p>';
 }catch{$('renderGallery').innerHTML='<p class="fine-note">效果图暂不可用，三维场景可正常探索。</p>';}
}
function collapsePanel(collapsed){$('inspector').classList.toggle('collapsed',collapsed);$('panelToggle').classList.toggle('visible',collapsed);}
function tab(name){$$('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===name);b.setAttribute('aria-selected',String(b.dataset.tab===name));});$$('.panel-content').forEach(e=>e.classList.toggle('hidden',e.id!=='tab-'+name));}
function savePreset(){try{localStorage.setItem('youyi-design-v2',JSON.stringify({scheme:activeScheme.id,overrides,lightsState,hidden:[...hiddenEquipment],clay,roofCut,roofAssembled}));toast('当前搭配已保存在此浏览器');}catch{toast('浏览器未允许保存本地搭配');}}
function loadPreset(){try{const raw=localStorage.getItem('youyi-design-v2');if(!raw){toast('还没有保存的搭配');return;}const s=JSON.parse(raw);overrides={...overrides,...s.overrides};Object.assign(lightsState,s.lightsState);hiddenEquipment=new Set((s.hidden||[]).filter(id=>equipment.some(c=>c.id===id)));clay=!!s.clay;roofCut=!!s.roofCut;roofAssembled=s.roofAssembled!==false;$('clayToggle').checked=clay;$('roofToggle').checked=roofCut;$('roofAssemble').checked=roofAssembled;applyScheme(s.scheme,false);updateVisibility();renderEquipment();toast('已读取你的搭配');}catch{toast('已保存搭配无法读取，请重新保存');}}

// App-level UI events.
$$('[data-tab]').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
$$('[data-mode]').forEach(b=>b.onclick=()=>ready&&setMode(b.dataset.mode));
$('startWalk').onclick=()=>{if(ready){setMode('walk');if(mobile)collapsePanel(true);}};
$('planBtn').onclick=()=>ready&&togglePlan();$('miniMapPlan').onclick=()=>ready&&togglePlan();$('overviewBtn').onclick=()=>ready&&showOverview();
document.querySelector('.brand').onclick=e=>{e.preventDefault();resetView();};
$('zonesToggle').onclick=()=>$('zoneDock').classList.toggle('open');
$('closePanel').onclick=()=>collapsePanel(true);$('panelToggle').onclick=()=>collapsePanel(false);
$('fineShadows').checked=fineShadows;$('fineShadows').onchange=e=>{fineShadows=e.target.checked;toast(fineShadows?'细腻阴影已开启':'已切换流畅显示');};
$('clayToggle').onchange=e=>{clay=e.target.checked;applyMaterials();toast(clay?'白模研究 · 暂时隐藏材质':'恢复方案材质');};
$('roofToggle').onchange=e=>{roofCut=e.target.checked;updateVisibility();};
$('roofAssemble').onchange=e=>{roofAssembled=e.target.checked;updateVisibility();toast(roofAssembled?'显示屋面与灯具设计建议':'已隐藏设计建议，原生屋架保留');};
$('resetMaterials').onclick=()=>{overrides={path:'sample',wall:'scheme',metal:'silver'};applyMaterials();updateSwatches();toast('已恢复当前方案材质');};
$('savePreset').onclick=savePreset;$('loadPreset').onclick=loadPreset;
$('equipmentSearch').oninput=renderEquipment;
$('isolateZone').onchange=e=>{if(!e.target.checked){zoneIsolation=false;updateVisibility();toast('已恢复全场器械范围');return;}if(!currentZone){zoneIsolation=false;e.target.checked=false;updateVisibility();toast('先通过「探索区域」进入一个区域');return;}zoneIsolation=true;updateVisibility();toast('已聚焦当前区域器械');};
$('showAll').onclick=()=>{hiddenEquipment.clear();zoneIsolation=false;$('isolateZone').checked=false;updateVisibility();renderEquipment();toast('全部器械组件已显示');};
$('hideAll').onclick=()=>{hiddenEquipment=new Set(equipment.map(c=>c.id));updateVisibility();renderEquipment();clearSelection();toast('全部器械组件已隐藏');};
$('selectionClose').onclick=clearSelection;$('focusSelected').onclick=()=>selected&&focusComponent(selected.id);$('hideSelected').onclick=()=>selected&&toggleEquipment(selected.id);
$('helpBtn').onclick=()=>$('helpDialog').showModal();$('detailsBtn').onclick=()=>$('detailsDialog').showModal();
$$('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$$('dialog').forEach(d=>d.onclick=e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});
$('fullscreenBtn').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('当前浏览器不支持全屏，可使用系统全屏');}};
$('captureBtn').onclick=()=>{if(!ready)return;try{renderScene();const a=document.createElement('a');a.download=`之名友谊店-${activeScheme.name}-${plan?'平面':'视图'}.png`;a.href=renderer.domElement.toDataURL('image/png');a.click();toast('已保存当前三维视图');}catch{toast('当前浏览器暂不支持导出视图');}};
for(const k of Object.keys(lightsState))$(k+'Range').oninput=e=>{lightsState[k]=Number(e.target.value);updateLighting();$$('[data-light]').forEach(b=>b.classList.remove('active'));};
$$('[data-light]').forEach(b=>b.onclick=()=>{Object.assign(lightsState,b.dataset.light==='day'?{sun:115,ambient:80,artificial:65,temperature:4000,time:14,exposure:102}:b.dataset.light==='golden'?{sun:95,ambient:55,artificial:50,temperature:3200,time:17,exposure:108}:{sun:0,ambient:25,artificial:135,temperature:3500,time:18,exposure:115});updateLighting();$$('[data-light]').forEach(q=>q.classList.toggle('active',q===b));});
$('miniMap').onclick=e=>{if(!ready)return;const r=e.currentTarget.getBoundingClientRect(),x=((e.clientX-r.left)/r.width*240-8)/224*54,z=((e.clientY-r.top)/r.height*120-8)/104*31-20.5;const nearest=manifest.zones.reduce((a,b)=>Math.hypot(a.eye[0]-x,a.eye[2]-z)<Math.hypot(b.eye[0]-x,b.eye[2]-z)?a:b);enterZone(nearest.id);};

let drag=null;
renderer.domElement.addEventListener('pointerdown',e=>{drag={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:false};renderer.domElement.setPointerCapture(e.pointerId);});
renderer.domElement.addEventListener('pointermove',e=>{
 if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.lastX,dy=e.clientY-drag.lastY;drag.lastX=e.clientX;drag.lastY=e.clientY;
 if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>5)drag.moved=true;
 if(mode!=='orbit'&&!plan){lookEuler.y-=dx*.0032;lookEuler.x=THREE.MathUtils.clamp(lookEuler.x-dy*.0032,-Math.PI*.47,Math.PI*.47);perspective.quaternion.setFromEuler(lookEuler);}
});
renderer.domElement.addEventListener('pointerup',e=>{if(drag&&!drag.moved)pick(e);drag=null;});
renderer.domElement.addEventListener('pointercancel',()=>drag=null);
renderer.domElement.addEventListener('dblclick',e=>pick(e,true));
renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());
addEventListener('keydown',e=>{if(/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)||document.querySelector('dialog[open]'))return;const code=e.code;if(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight'].includes(code)){keys.add(code);if(mode!=='orbit')e.preventDefault();}});
addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>{keys.clear();joystick={x:0,y:0};lift=0;});
$('joystick').addEventListener('pointerdown',e=>{e.currentTarget.setPointerCapture(e.pointerId);updateJoystick(e);});
$('joystick').addEventListener('pointermove',e=>{if(e.buttons)updateJoystick(e);});
for(const ev of ['pointerup','pointercancel'])$('joystick').addEventListener(ev,()=>{joystick={x:0,y:0};$('joystickKnob').style.transform='none';});
function updateJoystick(e){const r=$('joystick').getBoundingClientRect();let x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2;const len=Math.hypot(x,y);if(len>31){x*=31/len;y*=31/len;}joystick={x:x/31,y:y/31};$('joystickKnob').style.transform=`translate(${x}px,${y}px)`;}
for(const [id,d]of [['riseBtn',1],['lowerBtn',-1]]){$(id).onpointerdown=e=>{e.currentTarget.setPointerCapture(e.pointerId);lift=d;};$(id).onpointerup=$(id).onpointercancel=()=>lift=0;}
function resize(){renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);perspective.aspect=innerWidth/innerHeight;perspective.updateProjectionMatrix();fitPlan();}
addEventListener('resize',resize);
function animate(){
 requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.05);
 if(cameraTween){const t=Math.min(1,(performance.now()-cameraTween.start)/cameraTween.duration),e=1-Math.pow(1-t,3);camera.position.lerpVectors(cameraTween.from,cameraTween.to,e);controls.target.lerpVectors(cameraTween.targetFrom,cameraTween.targetTo,e);if(t===1)cameraTween=null;}
 if(controls.enabled)controls.update();
 if(ready&&!plan&&mode!=='orbit'&&!document.querySelector('dialog[open]')){
  let forward=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-joystick.y;
  let right=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+joystick.x;
  const speed=(keys.has('ShiftLeft')||keys.has('ShiftRight')?7:2.5)*dt;
  const f=new THREE.Vector3();perspective.getWorldDirection(f);if(mode==='walk')f.y=0;f.normalize();const side=new THREE.Vector3().crossVectors(f,new THREE.Vector3(0,1,0)).normalize();
  const motion=f.multiplyScalar(forward).add(side.multiplyScalar(right));if(motion.length()>1)motion.normalize();perspective.position.addScaledVector(motion,speed);
  if(mode==='fly')perspective.position.y+=((keys.has('KeyE')?1:0)-(keys.has('KeyQ')?1:0)+lift)*speed;
  perspective.position.x=THREE.MathUtils.clamp(perspective.position.x,-7,63);perspective.position.z=THREE.MathUtils.clamp(perspective.position.z,-26,20);perspective.position.y=THREE.MathUtils.clamp(perspective.position.y,.3,45);
 }
 renderScene();
 if(ready&&Math.floor(performance.now()/100)%2===0)drawMiniMap();
}
async function init(){
 try{
  [manifest,schemes]=await Promise.all([fetch('assets/model-manifest.json').then(r=>{if(!r.ok)throw Error('模型说明无法载入');return r.json();}),fetch('assets/schemes.json').then(r=>r.json())]);
  $('loadingText').textContent='载入高精度器械与材质，首次打开请稍候…';
  const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('assets/model.gltf',e=>{if(e.total)$('loadBar').style.width=`${10+e.loaded/e.total*75}%`;});
  model=gltf.scene;scene.add(model);
  try { const wood=await new THREE.TextureLoader().loadAsync('assets/greywood.png'); wood.wrapS=wood.wrapT=THREE.RepeatWrapping; wood.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy()); wood.colorSpace=THREE.SRGBColorSpace; textures.wood.dispose(); textures.wood=wood; roughnessTextures.wood.dispose(); roughnessTextures.wood=wood.clone(); roughnessTextures.wood.colorSpace=THREE.NoColorSpace; } catch(e) { console.warn('使用程序木纹作为备用材质',e.message); }
  importMaterials();buildDesignUI();buildZones();applyScheme('daylight');updateVisibility();renderEquipment();await loadGallery();
  $('loadBar').style.width='100%';$('modelStats').textContent=`${manifest.componentCount} 个可控对象 · ${(manifest.triangleCount/1000000).toFixed(2)}M 三角面 · 米制模型`;
  $('modelDetails').textContent=`来源：${manifest.sourceSkp}。完整原生几何经分组和网页压缩，共 ${manifest.componentCount} 个显示对象、${manifest.equipmentCount} 个器械与配件对象。主训练层标高 4.6 米，网页坐标以训练层为零点。屋架保持原位。可关闭的屋面封板和灯具是设计建议。`;
  if(mobile)collapsePanel(true);
  ready=true;renderScene();$('loading').classList.add('loaded');setTimeout(()=>$('loading').remove(),700);
  window.zhimingViewer={getState:()=>({ready,scheme:activeScheme.id,mode,plan,overview,clay,roofCut,roofAssembled,hiddenEquipment:[...hiddenEquipment],componentCount:sceneNodes.size,equipmentCount:equipment.length,camera:camera.position.toArray(),renderer:renderer.info.render}),setMode,togglePlan,enterZone,applyScheme,focusComponent};
 }catch(error){console.error(error);$('loadingText').textContent='模型暂时无法打开';$('loadBar').style.width='0';const msg=document.createElement('p');msg.style.cssText='max-width:460px;text-align:center;font-size:11px;line-height:1.8';msg.textContent=`请通过网站链接或本地 HTTP 服务访问。${error.message}`;$('loading').append(msg);}
}
animate();init();
