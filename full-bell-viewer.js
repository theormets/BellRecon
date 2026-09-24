async function startFullBellModels(){
  const canvases=[...document.querySelectorAll('.full-bell-canvas')];
  await Promise.all(canvases.map(startFullBellCanvas));
}

async function startFullBellCanvas(canvas){
  const status=document.getElementById(canvas.dataset.modelStatus);
  try{
    const gl=canvas.getContext('webgl',{antialias:true,alpha:false});
    if(!gl)throw Error('3D rendering is unavailable here. Download the STL or open the engineering drawing.');
    const source=canvas.dataset.modelSource;
    let raw;
    if(canvas.dataset.modelSourceKind==='asset')raw=await (await ResearchAssets.bytes(source,true)).arrayBuffer();
    else{const response=await fetch(source);if(!response.ok)throw Error('The supplied STL model could not be loaded.');raw=await response.arrayBuffer();}
    const view=new DataView(raw),count=view.getUint32(80,true);
    if(raw.byteLength!==84+count*50)throw Error('Unsupported STL layout');
    const vertices=new Float32Array(count*18),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];let j=0;
    for(let face=0;face<count;face++){
      const offset=84+50*face;
      for(let vertex=0;vertex<3;vertex++){
        for(let axis=0;axis<3;axis++){const point=view.getFloat32(offset+12+vertex*12+axis*4,true);vertices[j++]=point;min[axis]=Math.min(min[axis],point);max[axis]=Math.max(max[axis],point);}
        for(let axis=0;axis<3;axis++)vertices[j++]=view.getFloat32(offset+axis*4,true);
      }
    }
    const center=min.map((value,axis)=>(value+max[axis])/2),span=Math.max(...max.map((value,axis)=>value-min[axis])),normalise=1/(span*.6);
    for(let i=0;i<vertices.length;i+=6)for(let axis=0;axis<3;axis++)vertices[i+axis]=(vertices[i+axis]-center[axis])*normalise;
    const shader=(type,sourceCode)=>{const shaderObject=gl.createShader(type);gl.shaderSource(shaderObject,sourceCode);gl.compileShader(shaderObject);if(!gl.getShaderParameter(shaderObject,gl.COMPILE_STATUS))throw Error('3D shader unavailable');return shaderObject;};
    const program=gl.createProgram();
    gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec3 p;attribute vec3 n;uniform vec3 u;uniform vec3 v;uniform vec3 w;uniform vec2 scale;varying vec3 normal;void main(){gl_Position=vec4(dot(p,u)*scale.x,dot(p,v)*scale.y,-dot(p,w)*0.1,1.0);normal=vec3(dot(n,u),dot(n,v),dot(n,w));}'));
    gl.attachShader(program,shader(gl.FRAGMENT_SHADER,'precision mediump float;varying vec3 normal;void main(){vec3 N=normalize(normal);if(!gl_FrontFacing)N=-N;vec3 L=normalize(vec3(-0.4,0.65,1.0));float d=max(dot(N,L),0.0);float s=pow(max(dot(reflect(-L,N),vec3(0.0,0.0,1.0)),0.0),35.0);vec3 c=vec3(0.64,0.36,0.18)*(0.38+0.65*d)+vec3(0.35)*s;gl_FragColor=vec4(c,1.0);}'));
    gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('3D viewer could not initialise');gl.useProgram(program);
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW);
    for(const[name,offset]of[['p',0],['n',12]]){const location=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,3,gl.FLOAT,false,24,offset);}
    const loc={};for(const key of ['u','v','w','scale'])loc[key]=gl.getUniformLocation(program,key);
    let yaw=.55,elev=.4,zoom=.95;
    function draw(){const width=canvas.clientWidth,height=canvas.clientHeight,dpr=Math.min(devicePixelRatio||1,2);canvas.width=width*dpr;canvas.height=height*dpr;gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(.929,.941,.91,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);const c=Math.cos(yaw),s=Math.sin(yaw),ce=Math.cos(elev),se=Math.sin(elev);gl.uniform3f(loc.u,c,s,0);gl.uniform3f(loc.v,-s*se,c*se,ce);gl.uniform3f(loc.w,s*ce,-c*ce,se);gl.uniform2f(loc.scale,zoom/(width/height),zoom);gl.drawArrays(gl.TRIANGLES,0,count*3);}
    const reset=()=>{yaw=.55;elev=.4;zoom=.95;draw();};
    document.getElementById(canvas.dataset.modelControls).querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>{const value=button.dataset.view;zoom=.95;if(value==='front'){yaw=0;elev=0;}else if(value==='right'){yaw=Math.PI/2;elev=0;}else if(value==='top'){yaw=0;elev=Math.PI/2;}else return reset();draw();});
    const pointers=new Map();let previousPinch=0;
    canvas.onpointerdown=event=>{canvas.setPointerCapture(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});previousPinch=0;};
    canvas.onpointermove=event=>{const old=pointers.get(event.pointerId);if(!old)return;pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});if(pointers.size===2){const[a,b]=[...pointers.values()],distance=Math.hypot(a.x-b.x,a.y-b.y);if(previousPinch)zoom=Math.max(.35,Math.min(2.8,zoom*distance/previousPinch));previousPinch=distance;}else{yaw+=(event.clientX-old.x)*.01;elev+=(event.clientY-old.y)*.01;}draw();};
    canvas.onpointerup=canvas.onpointercancel=event=>{pointers.delete(event.pointerId);previousPinch=0;};
    canvas.addEventListener('wheel',event=>{event.preventDefault();zoom=Math.max(.35,Math.min(2.8,zoom*Math.exp(-event.deltaY*.001)));draw();},{passive:false});canvas.ondblclick=reset;canvas.tabIndex=0;
    canvas.onkeydown=event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();yaw+=event.key==='ArrowLeft'?-.12:event.key==='ArrowRight'?.12:0;elev+=event.key==='ArrowUp'?.12:event.key==='ArrowDown'?-.12:0;draw();}};
    new ResizeObserver(draw).observe(canvas);status.textContent='';draw();
  }catch(error){status.textContent=error.message;}
}


document.addEventListener('DOMContentLoaded',startFullBellModels);
