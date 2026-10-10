import {createCampScene} from './scene.js';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
$('#interaction-hint').textContent=matchMedia('(pointer: coarse)').matches?'拖动平移 · 双指缩放与旋转 · 点击位置探索':'拖动平移 · 右键旋转 · 滚轮缩放';
const state={view:'overview',night:false,selectedPoi:'camp',layers:{tents:true,food:true,mirrors:true,stalls:true,route:false,labels:true},ready:false,fallback:false};
const content={
 camp:{no:'01',label:'主空间',title:'声光主空间',kicker:'01 / SOUND & LIGHT',description:'黑色围护的声光空间，让身体动作成为画面。在这里观看、聚集与共创。',tags:['声光交互','视觉共创'],note:'营地布局为方案示意，设施以现场安排为准。'},
 entrance:{no:'02',label:'石碑入口',title:'双石碑入口',kicker:'02 / THE ENTRANCE',description:'两块黑色石碑之间是营地入口。主空间门洞与石碑通道对齐，朝向停车场一侧的场地大门。',tags:['双石碑标识','从停车场进入'],note:'入场时请结合现场标识与工作人员指引。'},
 mirrors:{no:'03',label:'镜面装置',title:'镜面装置',kicker:'03 / MIRROR FIELD',description:'4 块高 1.8 米的薄片镜面装置交错设置在主空间侧后方。夜景中，红色激光在镜面之间连成一组光线。',tags:['4 块薄片镜面','高度 1.8m','夜景激光连线'],note:'镜面装置与光线为方案示意。'},
 tents:{no:'04',label:'帐篷区',title:'帐篷区',kicker:'04 / STAY A WHILE',description:'约 10 顶小型双人帐篷集中布置在主空间一侧，将入口和另一侧草地留给通行、聚集与交流。',tags:['约 10 顶双人帐篷','集中一侧'],note:'图中帐篷排布为方案示意，以现场安排为准。'},
 food:{no:'05',label:'餐车',title:'餐车',kicker:'05 / TAKE A BREAK',description:'餐车与海娜纹身、嬉皮服饰两个摊位相邻。在声光体验之间，可以停下来休息、补给与逛一逛。',tags:['1 辆餐车','旁设 2 个摊位'],note:'餐车与摊位位置为方案示意，以现场安排为准。'},
 henna:{no:'06',label:'海娜纹身',title:'海娜纹身摊位',kicker:'06 / HENNA',description:'在餐车旁预留海娜纹身摊位，面向营地开放的交流空间，方便停留与体验。',tags:['预留摊位','餐车旁'],note:'摊位内容与具体布置以现场安排为准。'},
 clothes:{no:'07',label:'嬉皮服饰',title:'嬉皮服饰摊位',kicker:'07 / HIPPIE CLOTHING',description:'在餐车旁预留嬉皮服饰摊位，与海娜纹身形成小型营地市集，并给通行留出空间。',tags:['预留摊位','营地市集'],note:'摊位内容与具体布置以现场安排为准。'},
 parking:{no:'08',label:'停车场',title:'停车场',kicker:'08 / YOUR ARRIVAL',description:'抵达停车场后，沿场地道路前往入口，再进入由双石碑标记的黑石营地。',tags:['抵达起点','查看入场指引'],note:'路线为位置示意，具体通行安排以主办方现场指引为准。'}
};
let api=null,renderer=null,noticeTimer,frame=0,disposed=false;
const hotspotEls=new Map();
for(const [id,c] of Object.entries(content)){
 const el=document.createElement('button');el.type='button';el.className='hotspot'+(id==='camp'?' active':'');el.dataset.poi=id;el.setAttribute('aria-label',`查看${c.title}`);el.innerHTML=`<span class="pin-circle">${c.no}</span><span>${c.label}</span>`;el.hidden=true;$('#hotspots').append(el);hotspotEls.set(id,el);
}
function toast(message){$('#notice').textContent=message;$('#notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('#notice').hidden=true,4500);}
function finishLoading(){state.ready=true;$('#loading').classList.add('done');setTimeout(()=>$('#loading').hidden=true,reducedMotion?0:650);}
function setView(view,move=true){
 state.view=view;document.body.classList.toggle('photo',view==='photo');$('#photo-mode').hidden=view!=='photo';
 api?.setPaused?.(view==='photo');
 $$('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-pressed',String(b.dataset.view===view));});
 $('#night-toggle').disabled=view==='photo';$('#layers-toggle').disabled=view==='photo';$('#compass small').textContent=view==='top'?'俯视':view==='camp'?'营地':'全场';
 if(view==='photo'){$('#layers-panel').hidden=true;$('#layers-toggle').setAttribute('aria-expanded','false');}
 else if(move)api?.setView(view);
}
function selectPoi(id,move=true){
 const c=content[id];if(!c)return;state.selectedPoi=id;$('#panel-title').textContent=c.title;$('#panel-compact-title').textContent=`${c.title} · 查看介绍`;$('#panel-kicker').textContent=c.kicker;$('#panel-description').textContent=c.description;$('#panel-note').textContent=c.note;$('#panel-tags').replaceChildren(...c.tags.map(text=>{const el=document.createElement('span');el.textContent=text;return el;}));
 $$('[data-poi]').forEach(el=>{el.classList.toggle('active',el.dataset.poi===id);el.setAttribute('aria-pressed',String(el.dataset.poi===id));});
 $('#camp-photo-open').hidden=!['camp','entrance'].includes(id);
 if(id==='parking'){state.layers.route=true;api?.setLayer('route',true);$('input[data-layer=route]').checked=true;}
 if(move){setView(id==='parking'?'overview':'camp',false);api?.select(id);if(innerWidth<=820)toggleInfo(false);}
}
$('#night-toggle').addEventListener('click',()=>{state.night=!state.night;api?.setNight(state.night);document.body.classList.toggle('night',state.night);$('#night-label').textContent=state.night?'夜景':'昼景';$('#night-toggle').setAttribute('aria-pressed',String(state.night));$('#night-toggle use').setAttribute('href',state.night?'#i-moon':'#i-sun');});
$('#layers-toggle').addEventListener('click',()=>{const open=$('#layers-panel').hidden;$('#layers-panel').hidden=!open;$('#layers-toggle').setAttribute('aria-expanded',String(open));});
$$('[data-layer]').forEach(el=>el.addEventListener('change',()=>{state.layers[el.dataset.layer]=el.checked;if(el.dataset.layer!=='labels')api?.setLayer(el.dataset.layer,el.checked);else $('#hotspots').hidden=!el.checked;}));
$$('[data-view]').forEach(el=>el.addEventListener('click',()=>setView(el.dataset.view)));
$$('[data-poi]').forEach(el=>el.addEventListener('click',()=>selectPoi(el.dataset.poi)));
$('#reset-view').addEventListener('click',()=>{api?.reset();setView('overview',false);selectPoi('camp',false);});
function toggleInfo(force){const collapsed=force??!document.body.classList.contains('info-collapsed');document.body.classList.toggle('info-collapsed',collapsed);$('#info-toggle').setAttribute('aria-expanded',String(!collapsed));}
$('#info-toggle').addEventListener('click',()=>toggleInfo());
if(innerWidth<=820)toggleInfo(true);
function layoutPanels(){const panel=$('.explore-panel');if(innerWidth>820){panel.style.maxHeight=`${Math.max(120,$('#info-panel').offsetTop-panel.offsetTop-12)}px`;panel.style.overflowY='auto';}else{panel.style.maxHeight='';panel.style.overflowY='';}}
const panelResize=new ResizeObserver(layoutPanels);panelResize.observe($('#info-panel'));window.addEventListener('resize',layoutPanels);layoutPanels();
$('#nav-open').addEventListener('click',()=>$('#nav-modal').showModal());$('#modal-close').addEventListener('click',()=>$('#nav-modal').close());
$('#show-route').addEventListener('click',()=>{state.layers.route=true;$('input[data-layer=route]').checked=true;api?.setLayer('route',true);$('#nav-modal').close();setView('overview');toast('已显示停车场到营地的入场指引示意。');});
$('#camp-photo-open').addEventListener('click',()=>$('#review-modal').showModal());$('#review-close').addEventListener('click',()=>$('#review-modal').close());
$$('[data-review]').forEach(el=>el.addEventListener('click',()=>{$('#review-image').src=`assets/camp-${el.dataset.review}-review.png`;$('#review-image').alt=`黑石营地${el.dataset.review==='top'?'俯拍':'斜视'}视觉方案`;$$('[data-review]').forEach(b=>b.classList.toggle('active',b===el));}));
for(const dialog of $$('dialog'))dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
function setPhoto(type){$('#photo-image').src=`assets/aerial-${type==='top'?'top':'oblique'}.png`;$('#photo-image').alt=`场地${type==='top'?'俯拍':'斜视'}航拍照片`;$('#photo-top').setAttribute('aria-pressed',String(type==='top'));$('#photo-oblique').setAttribute('aria-pressed',String(type!=='top'));}
$('#photo-top').addEventListener('click',()=>setPhoto('top'));$('#photo-oblique').addEventListener('click',()=>setPhoto('oblique'));
document.addEventListener('keydown',e=>{if(e.target.closest('input,button,a')||$('dialog[open]'))return;if(e.key==='Escape'){setView('overview');$('#layers-panel').hidden=true;}if(e.key==='1')setView('overview');if(e.key==='2')setView('camp');if(e.key==='3')setView('top');});

function fallbackProjection(){const w=innerWidth,h=innerHeight,s=Math.min(w,h),ox=(w-s)/2,oy=(h-s)/2;const center=[.478,.488],forward=[.12-center[0],.16-center[1]],yaw=Math.atan2(-forward[0],-forward[1]);const local=(x,z)=>[center[0]+(x*Math.cos(yaw)+z*Math.sin(yaw))/120,center[1]+(-x*Math.sin(yaw)+z*Math.cos(yaw))/120];const p={camp:center,entrance:local(0,-9),tents:local(-8.5,1),food:local(7,-8),mirrors:local(7.6,6.65),henna:local(9,-4),clothes:local(9,0),parking:[.12,.16]};return Object.entries(p).map(([id,[x,y]])=>({id,x:ox+x*s,y:oy+y*s,visible:true}));}
function tick(){if(disposed)return;frame++;if(frame%2===0&&state.layers.labels&&state.view!=='photo'){
 const points=state.fallback?fallbackProjection():(api?.projectPoints?.()??[]);
 for(const p of points){const el=hotspotEls.get(p.id);if(!el)continue;const hide=!p.visible||(p.id==='tents'&&!state.layers.tents)||(p.id==='food'&&!state.layers.food)||(p.id==='mirrors'&&!state.layers.mirrors)||(['henna','clothes'].includes(p.id)&&!state.layers.stalls);el.hidden=hide;if(!hide){el.style.left=`${p.x}px`;el.style.top=`${p.y-12}px`;}}
 }requestAnimationFrame(tick);}
async function init(){
 try{api=await createCampScene($('#map'),{reducedMotion,onSelect:id=>{selectPoi(id,false);setView(id==='parking'?'overview':'camp',false);if(innerWidth<=820)toggleInfo(false);},onReady:data=>{renderer=data?.renderer??null;},onError:error=>{console.warn('3D scene unavailable',error);if(state.ready)toast('三维画面暂时中断，可以切换到实景照片查看。');}});finishLoading();}
 catch(error){console.warn('3D scene unavailable',error);state.fallback=true;$('#fallback-map').hidden=false;finishLoading();toast('当前浏览器显示航拍导览，可继续点击位置查看介绍。');}
 window.__campMap={...api,setView:mode=>setView(mode),select:id=>selectPoi(id),getAppState:()=>JSON.parse(JSON.stringify(state)),getDebugState:()=>({ready:state.ready,webgl:!!renderer,width:renderer?.domElement?.clientWidth??0,height:renderer?.domElement?.clientHeight??0,renderCalls:renderer?.info?.render?.calls??0,triangles:renderer?.info?.render?.triangles??0,points:renderer?.info?.render?.points??0,...api?.getState?.()?.counts})};
 selectPoi('camp',false);tick();
}
init();
window.addEventListener('pagehide',event=>{if(event.persisted){api?.setPaused?.(true);return;}disposed=true;panelResize.disconnect();api?.dispose?.();});
window.addEventListener('pageshow',event=>{if(event.persisted)api?.setPaused?.(state.view==='photo');});
