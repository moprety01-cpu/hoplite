// Readable source of globe.js.
// build.mjs strips the comments and ALL whitespace, so the code never needs a space between tokens,
// and it must never contain a backtick, a backslash, "${", "/*" or "*/".
A=23;                                     // the hour this program shows (0..23)
M="%MAP%";                                // world map 120x60, run-length encoded: sea, land, sea, ...
F=String.fromCharCode;Z=Math;T=Z.PI;
W=88;H=40;R=60;C=120;                     // canvas 88x40 characters, map 120x60 cells
P=[];v=0;
[...M].map(e=>{for(j=e.charCodeAt()-43;j--;)P.push(v);v=1-v});
N=(A+1)%24;                               // the next hour
l=-.7-N*T/12;                             // central meridian: 40°W at hour 0, then 15° west per hour
Q=Z.cos(.35);S=Z.sin(.35);                // camera 20° above the equator
s=c.slice(0,c.indexOf('/'+'*'));          // my own code (c), without the old padding...
s='A='+N+s.slice(s.indexOf(';'));         // ...with the hour advanced by one
g=[];o=[];                                // g: canvas, o: ocean cells in reading order
for(y=0;y<H;y++)for(x=0;x<W;x++){
  u=(x+.5)/W*2-1;v=1-(y+.5)/H*2;d=1-u*u-v*v;g.push(F(d>0?LANDCODE:32));
  if(d>0){z=Z.sqrt(d);a=v*Q+z*S;b=z*Q-v*S;              // orthographic projection
    P[Z.floor((.5-Z.asin(a)/T)*R)*C+Z.floor((l+Z.atan2(u,b))/T/2*C+C*1.5)%C]||o.push(y*W+x)}}
n=o.length;
t=s+'/'+'*'+"И·всё-таки·она·вертится·";  // the ocean left over after the code is a comment
for(e=0;t.length<n-2;)t+=s[e++%s.length];
t+='*'+'/';
for(i=0;i<n;i++)g[o[i]]=t[i];             // the code becomes the ocean
h='eval(c='+F(96);r=F(96)+".replace(/["+F(92)+"s"+F(LANDCODE)+"]/g,''))";
[...h].map((e,i)=>g[i]=e);[...r].map((e,i)=>g[W*H-r.length+i]=e);
for(o=[],y=0;y<H;)o.push(g.slice(y*W,++y*W).join('').trimEnd());
console.log(o.join(F(10)))
