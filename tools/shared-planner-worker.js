// HIIT Co. shared planner: deploy as a Cloudflare Worker with a D1 binding named DB.
// Store a strong team access code (at least 16 characters) as the TEAM_KEY secret.
// Do not paste the team access code into this file or GitHub.
const ORIGIN = 'https://maxwellhj.github.io';
const HEADERS = {'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'GET, PUT, OPTIONS',
'Access-Control-Allow-Headers':'Content-Type, Authorization','Cache-Control':'no-store','Content-Type':'application/json','Vary':'Origin'};
function reply(data,status=200){return new Response(JSON.stringify(data),{status,headers:HEADERS});}
function validDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;}
function text(value,max,optional=false){if(optional&&(value===undefined||value===''))return '';if(typeof value!=='string'||!value.trim()||value.length>max)throw Error('Invalid text');return value.trim();}
function sanitizePlanner(input){
if(!input||!Array.isArray(input.events)||!Array.isArray(input.tasks)||input.events.length>2000||input.tasks.length>5000)throw Error('Invalid planner');
const ids=new Set();
const events=input.events.map(e=>{if(!validDate(e.date))throw Error('Invalid event date');const id=text(e.id,120);if(ids.has(id))throw Error('Duplicate event');ids.add(id);return {id,title:text(e.title,160),date:e.date,colour:['blue','green','purple','rose','teal','slate'].includes(e.colour)?e.colour:'blue'};});
ids.clear();
const tasks=input.tasks.map(t=>{
if(!validDate(t.date))throw Error('Invalid task date');
const id=text(t.id,120);if(ids.has(id))throw Error('Duplicate task');ids.add(id);
const eventId=text(t.eventId,120,true);if(eventId&&!events.some(e=>e.id===eventId))throw Error('Unknown event');
const remindAt=t.remindAt||'';
if(remindAt&&(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(remindAt)||!validDate(remindAt.slice(0,10))||Number(remindAt.slice(11,13))>23||Number(remindAt.slice(14))>59))throw Error('Invalid reminder');
let recurrence=null;
if(t.recurrence){
const r=t.recurrence;
if(!['interval','month-day','nth-weekday'].includes(r.kind))throw Error('Invalid recurrence');
recurrence={kind:r.kind,preset:text(r.preset||'custom',40)};
if(r.kind==='interval'){if(!Number.isInteger(r.interval)||r.interval<1||r.interval>365||!['days','weeks','months'].includes(r.unit))throw Error('Invalid repeat interval');recurrence.interval=r.interval;recurrence.unit=r.unit;recurrence.day=r.day||Number(t.date.slice(8));}
if(r.kind==='month-day'){if(!Number.isInteger(r.day)||r.day<1||r.day>31)throw Error('Invalid month day');recurrence.day=r.day;}
if(r.kind==='nth-weekday'){if(![1,2,3,4,-1].includes(r.ordinal)||!Number.isInteger(r.weekday)||r.weekday<0||r.weekday>6)throw Error('Invalid weekday');recurrence.ordinal=r.ordinal;recurrence.weekday=r.weekday;}
}
return {id,title:text(t.title,160),date:t.date,eventId,remindAt,recurrence,done:!!t.done};
});
return {events,tasks};
}
async function authorised(request,key){
if(typeof key!=='string'||key.length<16)return false;
const sent=request.headers.get('Authorization')||'';
const encoder=new TextEncoder();
const a=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(sent)));
const b=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode('Bearer '+key)));
let difference=0;for(let i=0;i<a.length;i++)difference|=a[i]^b[i];return difference===0;
}
export default {async fetch(request,env){
const url=new URL(request.url);
if(url.pathname!=='/planner')return reply({error:'Not found'},404);
if(request.headers.get('Origin')&&request.headers.get('Origin')!==ORIGIN)return reply({error:'Origin not allowed'},403);
if(request.method==='OPTIONS')return new Response(null,{status:204,headers:HEADERS});
if(!env.DB||!env.TEAM_KEY||env.TEAM_KEY.length<16)return reply({error:'Shared planner setup is incomplete'},503);
if(!await authorised(request,env.TEAM_KEY))return reply({error:'Incorrect team access code'},401);
try{
if(request.method==='GET'){
const row=await env.DB.prepare('SELECT version, data FROM planner_state WHERE id=1').first();
if(!row)return reply({error:'Run the database setup SQL first'},503);
return reply({version:row.version,data:JSON.parse(row.data)});
}
if(request.method==='PUT'){
if(Number(request.headers.get('Content-Length')||0)>1000000)return reply({error:'Planner is too large'},413);
const body=await request.text();if(body.length>1000000)return reply({error:'Planner is too large'},413);
let input,clean;try{input=JSON.parse(body);if(!Number.isInteger(input.version)||input.version<0)throw Error('Invalid version');clean=sanitizePlanner(input.data);}catch(e){return reply({error:'Invalid planner data: '+e.message},400);}
const result=await env.DB.prepare('UPDATE planner_state SET data=?, version=version+1 WHERE id=1 AND version=?').bind(JSON.stringify(clean),input.version).run();
if(!result.meta.changes)return reply({error:'Another laptop saved changes first. Reload the shared version before editing again.'},409);
return reply({version:input.version+1,data:clean});
}
return reply({error:'Method not allowed'},405);
}catch(error){return reply({error:'Shared storage is unavailable. Check the database binding and setup SQL.'},503);}
}};
