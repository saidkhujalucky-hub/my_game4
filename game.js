/* Hero Tycoon — self-contained browser edition (no libraries or server). */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const canvas = $('world');
const gl = canvas.getContext('webgl', {alpha:false, antialias:true, powerPreference:'high-performance'});
const error = msg => { $('err').textContent = msg; $('err').classList.remove('hidden'); };
if (!gl) { error('WebGL недоступен. Включите аппаратное ускорение браузера и обновите страницу.'); return; }
const HEROES = [
 ['Неоновый Рыцарь','⚡','#22ddff','Импульсный меч · универсальный герой'],
 ['Огненный Страж','🔥','#ff754c','Пламенный рывок · мощный удар'],
 ['Ледяной Воин','❄️','#7ddcfc','Морозная волна · сильная защита'],
 ['Грозовой Титан','🌩️','#bb9bff','Электрический разряд · большая сила'],
 ['Теневой Ниндзя','🥷','#907cff','Быстрый выпад · ловкость'],
 ['Лазерный Штурмовик','🔴','#ff4868','Энергетический луч · атака'],
 ['Лесной Хранитель','🌿','#67ed9f','Целительная энергия · живучесть'],
 ['Космический Странник','🪐','#e1a2ff','Космический импульс · контроль'],
 ['Золотой Паладин','🛡️','#ffca68','Защитное поле · прочность'],
 ['Водный Страж','🌊','#58a9ff','Волна силы · скорость'],
 ['Кибер Самурай','🤖','#ff83bf','Кибер-клинок · быстрый бой'],
 ['Кристальный Маг','💎','#64ffe1','Кристаллический взрыв · магия']
];
const TWO_PI=Math.PI*2, RING=70;
const rgb = hex => {const n=parseInt(hex.slice(1),16); return [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255];};
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const bases=HEROES.map((h,i)=>{const a=-Math.PI/2+i*TWO_PI/12;return {x:Math.cos(a)*RING,z:Math.sin(a)*RING,color:rgb(h[2]),angle:a,level:i===0?1:1+((i*3)%3),raid:0};});
let selected=0, started=false, paused=false, hero={x:bases[0].x,z:bases[0].z+7,hp:100,maxHp:100,facing:0},
 coins=180, level=1, kills=0, raids=0, income=12, capture=0, owned=false, time=0, secClock=0, lastFrame=0,
 attackUntil=0, nextAttack=0, nextSkill=0, yaw=Math.PI, isDragging=false, draggingX=0,
 flash=0, toastTimer=0, savedOnce=false, victoryTicks=0;
const bots=HEROES.slice(1).map((h,j)=>{const b=bases[j+1];return {x:b.x+(j%3-1)*3,z:b.z+5,hp:65,maxHp:65,respawn:0,hit:0,move:0,angle:0,lastHit:-3,home:j+1};});
const keys={}; let joyX=0,joyY=0;
function showToast(msg){$('toast').textContent=msg;$('toast').classList.add('show');toastTimer=3;}
function save(){try{localStorage.setItem('hero_tycoon_pages_v1',JSON.stringify({coins:Math.round(coins),level,kills,raids,selected,owned}));}catch{}}
function load(){try{const s=JSON.parse(localStorage.getItem('hero_tycoon_pages_v1')||'null');if(s){coins=Math.max(0,Number(s.coins)||180);level=clamp(Number(s.level)||1,1,25);kills=Math.max(0,Number(s.kills)||0);raids=Math.max(0,Number(s.raids)||0);selected=clamp(Number(s.selected)||0,0,11);owned=!!s.owned;savedOnce=true;}}catch{}}
load(); income=12+level*6-6+(owned?10:0);bases[0].level=level;
const grid=$('heroGrid');
HEROES.forEach((h,i)=>{const btn=document.createElement('button');btn.type='button';btn.className='hero-card';btn.innerHTML=`<span class="hero-emoji">${h[1]}</span><span class="hero-name">${h[0]}</span>`;btn.addEventListener('click',()=>selectHero(i));grid.appendChild(btn);});
function selectHero(i){selected=i;[...grid.children].forEach((el,n)=>el.classList.toggle('active',n===i));$('selectedText').textContent=String(i+1).padStart(2,'0')+' / 12';$('heroPortrait').textContent=HEROES[i][1];$('heroTitle').textContent=HEROES[i][0];$('heroDesc').textContent=HEROES[i][3];$('heroLabel').textContent=HEROES[i][0].toUpperCase();}
selectHero(selected);
function updateUI(){
 $('coins').textContent=Math.floor(coins).toLocaleString('ru-RU');
 $('income').textContent='+'+income+'/с';$('baseLvl').textContent=level;
 $('hpTxt').textContent=Math.ceil(hero.hp)+'/'+hero.maxHp;$('hpFill').style.width=(hero.hp/hero.maxHp*100)+'%';
 $('kills').textContent=kills;$('raids').textContent=raids;
 const price=priceFor();$('upgradePrice').textContent='◆ '+price+' монет · E';$('upgradeBtn').disabled=coins<price;
 const cd=Math.max(0,Math.ceil(nextSkill-time));$('skillBtn').disabled=cd>0;$('skillCooldown').textContent=cd>0?'ПЕРЕЗАРЯДКА '+cd+'с':'ГОТОВО · Q';
 $('quest1').textContent=(level>=2?'✓':'↗')+' Улучши свою базу';$('quest1').classList.toggle('done',level>=2);
 $('quest2').textContent=(kills>0?'✓':'⚔')+' Победи соперника';$('quest2').classList.toggle('done',kills>0);
 $('quest3').textContent=(owned?'✓':'◆')+' Захвати центр арены';$('quest3').classList.toggle('done',owned);
 const label=dist(hero,{x:0,z:0})<12&&!owned?'◆ ЗАХВАТ КРИСТАЛЛА: '+Math.floor(capture/6*100)+'%':(owned?'✓ КРИСТАЛЛ ПОД ВАШИМ КОНТРОЛЕМ':'◆ ЦЕНТРАЛЬНЫЙ КРИСТАЛЛ — СВОБОДЕН');
 $('arenaLabel').textContent=label;
}
function priceFor(){return Math.round(110*Math.pow(1.48,level-1));}
function upgrade(){if(!started||paused)return;const cost=priceFor();if(coins<cost){showToast('Не хватает монет для улучшения');return;}if(level>=25){showToast('Максимальный уровень базы!');return;}coins-=cost;level++;bases[0].level=level;income=6+level*6+(owned?10:0);hero.maxHp+=8;hero.hp=Math.min(hero.maxHp,hero.hp+24);showToast('✦ База улучшена до уровня '+level+'! Доход увеличен');save();updateUI();}
function hitBot(b,dmg){if(b.respawn>0)return;b.hp-=dmg;b.hit=.3;if(b.hp<=0){b.respawn=7;b.hp=0;kills++;coins+=65;showToast('⚔ Победа! +65 монет');save();}}
function attack(){if(!started||paused||time<nextAttack)return;nextAttack=time+.52;attackUntil=time+.22;
 let hits=0;for(const b of bots){if(b.respawn>0)continue;const d=dist(hero,b);if(d<10){const ang=Math.atan2(b.x-hero.x,b.z-hero.z);const diff=Math.atan2(Math.sin(ang-hero.facing),Math.cos(ang-hero.facing));if(Math.abs(diff)<1.65){hitBot(b,35+selected%3*7+level*2);hits++;}}}
 if(!hits){bases.forEach((b,i)=>{if(i>0&&dist(hero,b)<17&&time-b.raid>13){b.raid=time;coins+=80+level*4;raids++;showToast('◆ Рейд на базу №'+(i+1)+'! +'+(80+level*4)+' монет');save();}});}}
function skill(){if(!started||paused||time<nextSkill)return;nextSkill=time+10;attackUntil=time+.6;let hits=0;bots.forEach(b=>{if(b.respawn<=0&&dist(hero,b)<19){hitBot(b,58+level*3);hits++;}});hero.hp=Math.min(hero.maxHp,hero.hp+18);showToast('✦ '+HEROES[selected][0]+': суперсила!'+(hits?' Поражено: '+hits:''));}
function restart(){try{localStorage.removeItem('hero_tycoon_pages_v1');}catch{}location.reload();}
function pause(v){paused=v;$('pause').classList.toggle('hidden',!v);save();}
$('start').addEventListener('click',()=>{started=true;paused=false;$('overlay').classList.add('hidden');$('gameUI').classList.remove('hidden');hero.facing=0;showToast('Построй базу и захвати центральный кристалл!');});
$('upgradeBtn').addEventListener('click',upgrade);$('attackBtn').addEventListener('click',attack);$('skillBtn').addEventListener('click',skill);
$('menuBtn').addEventListener('click',()=>pause(true));$('resumeBtn').addEventListener('click',()=>pause(false));$('restartBtn').addEventListener('click',restart);
window.addEventListener('keydown',e=>{if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();keys[e.code]=true;if(e.repeat)return;if(e.code==='Escape'&&started)pause(!paused);if(e.code==='Space')attack();if(e.code==='KeyQ')skill();if(e.code==='KeyE')upgrade();});
window.addEventListener('keyup',e=>{keys[e.code]=false;});window.addEventListener('blur',()=>{for(const k in keys)keys[k]=false;});
canvas.addEventListener('pointerdown',e=>{isDragging=true;draggingX=e.clientX;canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(isDragging&&started&&!paused){yaw+=(e.clientX-draggingX)*.007;draggingX=e.clientX;}});
canvas.addEventListener('pointerup',()=>isDragging=false);canvas.addEventListener('pointercancel',()=>isDragging=false);
const joystick=$('joystick'),stick=$('stick');
function moveStick(e){const rect=joystick.getBoundingClientRect(),cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;joyX=clamp((e.clientX-cx)/40,-1,1);joyY=clamp((e.clientY-cy)/40,-1,1);const len=Math.hypot(joyX,joyY);if(len>1){joyX/=len;joyY/=len;}stick.style.transform=`translate(${joyX*36}px,${joyY*36}px)`;}
joystick.addEventListener('pointerdown',e=>{joystick.setPointerCapture(e.pointerId);moveStick(e);});joystick.addEventListener('pointermove',e=>{if(e.buttons||e.pointerType==='touch')moveStick(e);});
const releaseStick=()=>{joyX=joyY=0;stick.style.transform='translate(0,0)';};joystick.addEventListener('pointerup',releaseStick);joystick.addEventListener('pointercancel',releaseStick);

// WebGL math and primitive 3D meshes. Completely offline and dependency-free.
function matMul(a,b){const out=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)out[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return out;}
function perspective(fov,aspect,n,f){const q=1/Math.tan(fov/2),o=new Float32Array(16);o[0]=q/aspect;o[5]=q;o[10]=(f+n)/(n-f);o[11]=-1;o[14]=2*f*n/(n-f);return o;}
function lookAt(eye,at,up){let z=[eye[0]-at[0],eye[1]-at[1],eye[2]-at[2]];let l=Math.hypot(...z);z=z.map(v=>v/l);let x=[up[1]*z[2]-up[2]*z[1],up[2]*z[0]-up[0]*z[2],up[0]*z[1]-up[1]*z[0]];l=Math.hypot(...x);x=x.map(v=>v/l);const y=[z[1]*x[2]-z[2]*x[1],z[2]*x[0]-z[0]*x[2],z[0]*x[1]-z[1]*x[0]];return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-(x[0]*eye[0]+x[1]*eye[1]+x[2]*eye[2]),-(y[0]*eye[0]+y[1]*eye[1]+y[2]*eye[2]),-(z[0]*eye[0]+z[1]*eye[1]+z[2]*eye[2]),1]);}
function model(x,y,z,sx,sy,sz,a=0){const c=Math.cos(a),s=Math.sin(a);return new Float32Array([c*sx,0,-s*sx,0,0,sy,0,0,s*sz,0,c*sz,0,x,y,z,1]);}
function shader(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
let program;
try{program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,`attribute vec3 p; attribute vec3 n; uniform mat4 mvp; uniform mat4 m; varying vec3 normal; varying float fogD; varying float heightV; void main(){vec4 w=m*vec4(p,1.);gl_Position=mvp*vec4(p,1.);normal=mat3(m)*n;fogD=length(w.xyz-vec3(0.,10.,0.));heightV=w.y;}`));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`precision mediump float;uniform vec3 color;uniform vec3 sky;uniform float glow;varying vec3 normal;varying float fogD;varying float heightV;void main(){vec3 n=normalize(normal);float lit=.57+.43*max(dot(n,normalize(vec3(-.5,1.,.7))),0.);vec3 col=color*(lit+glow);float fog=clamp((fogD-94.)/175.,0.,.61);col=mix(col,sky,fog);gl_FragColor=vec4(col,1.);}`));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));}catch(e){error('Ошибка WebGL: '+e.message);return;}
gl.useProgram(program);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);
const loc={p:gl.getAttribLocation(program,'p'),n:gl.getAttribLocation(program,'n'),mvp:gl.getUniformLocation(program,'mvp'),m:gl.getUniformLocation(program,'m'),color:gl.getUniformLocation(program,'color'),sky:gl.getUniformLocation(program,'sky'),glow:gl.getUniformLocation(program,'glow')};
function mesh(vertices,normals){const result={count:vertices.length/3,v:gl.createBuffer(),n:gl.createBuffer()};gl.bindBuffer(gl.ARRAY_BUFFER,result.v);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,result.n);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(normals),gl.STATIC_DRAW);return result;}
function cubeMesh(){const V=[],N=[],faces=[[[1,0,0],[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5],[.5,-.5,.5]],[[-1,0,0],[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5],[-.5,-.5,-.5]],[[0,1,0],[-.5,.5,-.5],[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5]],[[0,-1,0],[-.5,-.5,.5],[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5]],[[0,0,1],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5],[-.5,-.5,.5]],[[0,0,-1],[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5],[.5,-.5,-.5]]];for(const face of faces){const [n,...v]=face;for(const idx of [0,1,2,0,2,3]){V.push(...v[idx]);N.push(...n);}}return mesh(V,N);}
function roundMesh(sides=12,stacks=7){const V=[],N=[];for(let i=0;i<stacks;i++){const a=-Math.PI/2+i*Math.PI/stacks,b=-Math.PI/2+(i+1)*Math.PI/stacks;for(let j=0;j<sides;j++){const c=j*TWO_PI/sides,d=(j+1)*TWO_PI/sides;const pts=[[a,c],[b,c],[b,d],[a,c],[b,d],[a,d]];for(const [lat,lon] of pts){const p=[Math.cos(lat)*Math.cos(lon)*.5,Math.sin(lat)*.5,Math.cos(lat)*Math.sin(lon)*.5];V.push(...p);N.push(...p.map(v=>v*2));}}}return mesh(V,N);}
function cylinderMesh(sides=16,tip=.5){const V=[],N=[];for(let i=0;i<sides;i++){const a=i*TWO_PI/sides,b=(i+1)*TWO_PI/sides;const v0=[Math.cos(a)*.5,-.5,Math.sin(a)*.5],v1=[Math.cos(b)*.5,-.5,Math.sin(b)*.5],v2=[Math.cos(b)*tip,.5,Math.sin(b)*tip],v3=[Math.cos(a)*tip,.5,Math.sin(a)*tip];for(const p of [v0,v1,v2,v0,v2,v3]){V.push(...p);N.push(Math.cos(a),.2,Math.sin(a));}for(const p of [[0,-.5,0],v1,v0]){V.push(...p);N.push(0,-1,0);}for(const p of [[0,.5,0],v3,v2]){V.push(...p);N.push(0,1,0);}}return mesh(V,N);}
const meshes={cube:cubeMesh(),sphere:roundMesh(),cylinder:cylinderMesh(),cone:cylinderMesh(12,0)};
let vp;
function draw(type,x,y,z,sx,sy,sz,col,rot=0,glow=0){const g=meshes[type],m=model(x,y,z,sx,sy,sz,rot);gl.uniformMatrix4fv(loc.m,false,m);gl.uniformMatrix4fv(loc.mvp,false,matMul(vp,m));gl.uniform3fv(loc.color,col);gl.uniform1f(loc.glow,glow);gl.bindBuffer(gl.ARRAY_BUFFER,g.v);gl.vertexAttribPointer(loc.p,3,gl.FLOAT,false,0,0);gl.enableVertexAttribArray(loc.p);gl.bindBuffer(gl.ARRAY_BUFFER,g.n);gl.vertexAttribPointer(loc.n,3,gl.FLOAT,false,0,0);gl.enableVertexAttribArray(loc.n);gl.drawArrays(gl.TRIANGLES,0,g.count);}
const COL={ground:[.14,.28,.26],grass:[.12,.35,.31],path:[.20,.34,.41],dark:[.07,.14,.25],shadow:[.06,.16,.20],metal:[.48,.62,.78],white:[.78,.92,1],gold:[1,.76,.22],water:[.13,.55,.67],leaf:[.10,.48,.36],trunk:[.32,.24,.24],purple:[.44,.27,.78],red:[.91,.20,.33],core:[.26,.89,1],black:[.13,.18,.30]};
function colMix(a,b,t){return [a[0]*(1-t)+b[0]*t,a[1]*(1-t)+b[1]*t,a[2]*(1-t)+b[2]*t];}
function seeded(i){let n=Math.sin(i*127.1+77.7)*43758.5453;return n-Math.floor(n);}
const trees=[];for(let i=0;i<95;i++){const a=seeded(i+17)*TWO_PI,r=23+seeded(i+434)*95;const x=Math.cos(a)*r,z=Math.sin(a)*r;if(bases.some(b=>Math.hypot(b.x-x,b.z-z)<20))continue;trees.push({x,z,s:1+seeded(i+1000)*1.1});}
const monoliths=[];for(let i=0;i<16;i++){const a=i*TWO_PI/16,r=34;monoliths.push({x:Math.cos(a)*r,z:Math.sin(a)*r});}
function drawBase(b,i){
 const mine=i===0,color=mine?rgb(HEROES[selected][2]):b.color;
 draw('cylinder',b.x,.13,b.z,28,.55,28,COL.dark);
 draw('cylinder',b.x,.48,b.z,25,.17,25,colMix(color,COL.dark,.74));
 draw('cylinder',b.x,.6,b.z,20,.14,20,colMix(color,COL.black,.58));
 const iscale=1+(i===0?level:b.level)*.19;
 draw('cube',b.x,2.0*iscale,b.z,7,4*iscale,7,COL.black);
 draw('cube',b.x,4.25*iscale,b.z,6.6,.48,6.6,color,0,.2);
 draw('cube',b.x,4.65*iscale,b.z,5.0,.23,5.0,COL.metal);
 for(let j=0;j<4;j++){const a=Math.PI/4+j*Math.PI/2,x=b.x+Math.cos(a)*8,z=b.z+Math.sin(a)*8;draw('cylinder',x,1.9,z,2.1,3.8,2.1,COL.metal);draw('cone',x,4.1,z,3.0,2.5,3.0,color,0,.15);draw('sphere',x,5.3,z,1.15,1.15,1.15,color,0,.42);}
 draw('cylinder',b.x,5.1*iscale,b.z,2.8,1.0,2.8,COL.white);
 draw('sphere',b.x,6.3*iscale+Math.sin(time*2+i)*.34,b.z,2.2,2.2,2.2,color,0,.56);
 // Decorative gates, short walls, and illuminated income generators.
 for(let j=0;j<3;j++){const a=j*Math.PI*2/3+.1,x=b.x+Math.sin(a)*11,z=b.z+Math.cos(a)*11;draw('cylinder',x,1.1,z,3.2,2.4,3.2,COL.dark);draw('cylinder',x,2.45,z,3.6,.45,3.6,COL.gold);draw('sphere',x,3.15,z,1.5,1.5,1.5,COL.gold,0,.45);}
 for(let k=0;k<2;k++){const t=b.angle+Math.PI*.6+(k?Math.PI*.8:0);const x=b.x+Math.cos(t)*14,z=b.z+Math.sin(t)*14;draw('cube',x,1.9,z,2.7,3.8,2.7,COL.dark);draw('cube',x,3.6,z,3.4,.38,3.4,color);}
 if(mine&&level>=3){for(let k=0;k<Math.min(7,level-1);k++){const a=k*TWO_PI/Math.min(7,level-1);draw('sphere',b.x+Math.sin(a)*4.5,7.8*iscale+Math.sin(time*2+k)*.45,b.z+Math.cos(a)*4.5,.65,.65,.65,COL.gold,0,.45);}}
}
function drawCharacter(p,i,player){if(!player&&p.respawn>0)return;const c=rgb(HEROES[i][2]),s=player?1.22:1.04,y=Math.sin(time*4+i)*.13,body=p.hit>0?COL.white:c;
 draw('sphere',p.x,.27,p.z,3.4,.10,2.2,COL.shadow);
 draw('cube',p.x,2.5*s+y,p.z,1.8*s,2.7*s,1.2*s,body,p.facing??p.angle,player?.3:0);
 draw('sphere',p.x,4.5*s+y,p.z,1.5*s,1.5*s,1.5*s,colMix(c,COL.white,.40),0,.12);
 draw('cube',p.x,4.6*s+y,p.z+.56*s,1.06*s,.30*s,.32*s,COL.dark,p.facing??p.angle);
 for(const j of [-1,1]){draw('cube',p.x+j*1.25*s,2.35*s+y,p.z,.55*s,2.1*s,.65*s,c);draw('cube',p.x+j*.46*s,.75*s+y,p.z,.70*s,1.5*s,.75*s,COL.dark);}
 draw('cube',p.x+1.53*s,2.1*s+y,p.z+0.25*s,.22*s,3.35*s,.22*s,COL.white,-.27,.4);
 draw('sphere',p.x+1.53*s,3.8*s+y,p.z+.25*s,.52*s,.52*s,.52*s,c,0,.6);
 if((player&&time<attackUntil)||(!player&&p.hit>0))draw('sphere',p.x,2.9*s,p.z,4.4,4.4,4.4,c,0,.2);
}
function drawWorld(){
 draw('cube',0,-.65,0,250,1.1,250,COL.ground);
 // Arena water channels and hex-like stepping slabs.
 draw('cylinder',0,-.02,0,55,.12,55,COL.water);
 draw('cylinder',0,.14,0,44,.18,44,COL.dark);
 draw('cylinder',0,.25,0,29,.30,29,COL.path);
 draw('cylinder',0,.38,0,22,.25,22,COL.dark);
 for(let i=0;i<12;i++){const b=bases[i],a=b.angle;draw('cube',Math.cos(a)*40,.13,Math.sin(a)*40,5,.15,54,COL.path,Math.PI/2-a);}
 for(const t of trees){draw('cylinder',t.x,1.7*t.s,t.z,.85*t.s,3.6*t.s,.85*t.s,COL.trunk);draw('cone',t.x,4.0*t.s,t.z,4.5*t.s,5.8*t.s,4.5*t.s,COL.leaf);draw('cone',t.x,6*t.s,t.z,3.25*t.s,4.3*t.s,3.25*t.s,colMix(COL.leaf,COL.water,.25));}
 for(const o of monoliths){draw('cylinder',o.x,2.2,o.z,1.1,4.4,1.1,COL.metal);draw('sphere',o.x,4.7,o.z,1.4,1.4,1.4,COL.core,0,.3);}
 bases.forEach(drawBase);
 // Raised crystal beacon.
 draw('cylinder',0,1.15,0,13,2.2,13,COL.metal);
 draw('cylinder',0,2.9,0,8,1.5,8,COL.dark);
 draw('cylinder',0,5.5,0,4.8,5.2,4.8,COL.purple);
 draw('cone',0,11.5+Math.sin(time*2)*.5,0,9,9,9,owned?COL.gold:COL.core,0,.5);
 draw('cone',0,15.7+Math.sin(time*2)*.5,0,7,-7,7,owned?COL.gold:COL.core,0,.42);
 for(let j=0;j<6;j++){const a=time*.3+j*TWO_PI/6;draw('sphere',Math.cos(a)*9,9+Math.sin(time*2+j)*2,Math.sin(a)*9,1.05,1.05,1.05,owned?COL.gold:COL.core,0,.6);}
 bots.forEach((b,j)=>drawCharacter(b,j+1,false));drawCharacter(hero,selected,true);
 // Short lived strike effect.
 if(time<attackUntil){draw('sphere',hero.x+Math.sin(hero.facing)*4.8,2.5,hero.z+Math.cos(hero.facing)*4.8,2.7,2.7,2.7,rgb(HEROES[selected][2]),0,.8);}
}
function drawMinimap(){const c=$('minimap'),ctx=c.getContext('2d');if(!ctx)return;const w=c.width,h=c.height,mx=x=>w/2+x*.71,mz=z=>h/2+z*.71;ctx.clearRect(0,0,w,h);ctx.fillStyle='#071c30';ctx.beginPath();ctx.arc(w/2,h/2,88,0,TWO_PI);ctx.fill();ctx.strokeStyle='#2c6787';ctx.lineWidth=2;ctx.beginPath();ctx.arc(w/2,h/2,89,0,TWO_PI);ctx.stroke();bases.forEach((b,i)=>{ctx.strokeStyle='#285a7b';ctx.beginPath();ctx.moveTo(w/2,h/2);ctx.lineTo(mx(b.x),mz(b.z));ctx.stroke();ctx.fillStyle=i===0?'#3be4ff':'#f88372';ctx.beginPath();ctx.arc(mx(b.x),mz(b.z),i===0?6:3.7,0,TWO_PI);ctx.fill();});ctx.fillStyle=owned?'#ffd66c':'#70faff';ctx.beginPath();ctx.arc(w/2,h/2,6,0,TWO_PI);ctx.fill();bots.forEach(b=>{if(b.respawn>0)return;ctx.fillStyle='#ff9083';ctx.beginPath();ctx.arc(mx(b.x),mz(b.z),3.1,0,TWO_PI);ctx.fill();});ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(mx(hero.x),mz(hero.z),4.7,0,TWO_PI);ctx.fill();ctx.strokeStyle='#fff';ctx.beginPath();ctx.moveTo(mx(hero.x),mz(hero.z));ctx.lineTo(mx(hero.x)+Math.sin(hero.facing)*12,mz(hero.z)+Math.cos(hero.facing)*12);ctx.stroke();}
function update(dt){time+=dt;secClock+=dt;
 let right=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0)+joyX;
 let fwd=(keys.KeyW||keys.ArrowUp?1:0)-(keys.KeyS||keys.ArrowDown?1:0)-joyY;
 const l=Math.hypot(right,fwd);if(l>0.12){right/=l;fwd/=l;const speed=(selected===4?18:14.5)*dt;const dx=right*Math.cos(yaw)-fwd*Math.sin(yaw),dz=-right*Math.sin(yaw)-fwd*Math.cos(yaw);hero.x=clamp(hero.x+dx*speed,-115,115);hero.z=clamp(hero.z+dz*speed,-115,115);hero.facing=Math.atan2(dx,dz);}
 for(const b of bots){if(b.respawn>0){b.respawn-=dt;if(b.respawn<=0){const base=bases[b.home];b.x=base.x;b.z=base.z;b.hp=b.maxHp;}continue;}
 b.hit=Math.max(0,b.hit-dt);b.move+=dt;
 let tx=0,tz=0;const d=dist(b,hero);if(d<22){tx=hero.x;tz=hero.z;}else if(b.move%20>11){const base=bases[b.home];tx=base.x;tz=base.z;}else{tx=0;tz=0;}
 const a=Math.atan2(tx-b.x,tz-b.z);b.angle=a;const speed=(d<22?6.0:3.8)*dt;b.x+=Math.sin(a)*speed;b.z+=Math.cos(a)*speed;
 if(d<4.5&&time-b.lastHit>2.3){b.lastHit=time;hero.hp=Math.max(0,hero.hp-9);flash=.35;}
 }
 if(dist(hero,{x:0,z:0})<11&&!owned){capture+=dt;if(capture>=6){capture=6;owned=true;income+=10;coins+=250;showToast('◆ Кристалл захвачен! +250 монет, +10/с');save();}}else if(!owned)capture=Math.max(0,capture-dt*.8);
 while(secClock>=1){secClock-=1;coins+=income;hero.hp=Math.min(hero.maxHp,hero.hp+1.3);victoryTicks++;if(victoryTicks%15===0)save();}
 if(hero.hp<=0){hero.hp=hero.maxHp;hero.x=bases[0].x;hero.z=bases[0].z+7;coins=Math.max(0,coins-60);showToast('Герой возродился на базе (−60 монет)');}
 if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)$('toast').classList.remove('show');}
 flash=Math.max(0,flash-dt);updateUI();
}
function render(){const dpr=Math.min(window.devicePixelRatio||1,1.7),w=Math.max(1,Math.round(canvas.clientWidth*dpr)),h=Math.max(1,Math.round(canvas.clientHeight*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}gl.viewport(0,0,w,h);
 gl.clearColor(flash>0?.74:.47,flash>0?.25:.67,.79,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
 const cam=started?hero:{x:0,z:0};const cameraAngle=started?yaw:Math.PI*.28+time*.06;
 const eye=started?[cam.x+Math.sin(cameraAngle)*20,14,cam.z+Math.cos(cameraAngle)*20]:[Math.sin(cameraAngle)*132,98,Math.cos(cameraAngle)*132];
 const target=started?[cam.x,2.2,cam.z]:[0,0,0];
 vp=matMul(perspective(started?Math.PI/3.15:Math.PI/3.65,w/h,.1,360),lookAt(eye,target,[0,1,0]));
 gl.uniform3fv(loc.sky,[.47,.67,.79]);drawWorld();if(started)drawMinimap();}
function frame(ms){const dt=Math.min(.04,(ms-lastFrame)/1000||0);lastFrame=ms;if(!paused){if(started)update(dt);else time+=dt*.75;}render();requestAnimationFrame(frame);}
window.addEventListener('beforeunload',save);
updateUI();requestAnimationFrame(frame);
})();
