import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
const p='D:/DX_User/Data_Abhishek/Abhishek/Dynahaul given by Amit sir 15july/Tipper demo/.env'
const raw=fs.readFileSync(p,'utf8')
const env={}; raw.split('\n').forEach(l=>{const i=l.indexOf('='); if(i>-1) env[l.slice(0,i).trim()]=l.slice(i+1).trim()})
const supa=createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{autoRefreshToken:false,persistSession:false}})
async function q(){
  const {data:unk}=await supa.from('tyres').select('id,tyre_no,make').is('make', null)
  console.log('null tyres',unk)
  const {data:unk2}=await supa.from('tyres').select('id,tyre_no,make').eq('make','UNKNOWN')
  console.log('UNKNOWN tyres',unk2)
  const all=[...(unk||[]),...(unk2||[])]
  if(all.length){
    const {error}=await supa.from('tyres').update({make:'MRF'}).in('id',all.map(u=>u.id))
    console.log('fix unknown',error||'ok')
  }
  const {data:chk}=await supa.from('tyres').select('make').limit(1000)
  const cnt={}
  chk.forEach(r=>{cnt[r.make]=(cnt[r.make]||0)+1})
  console.log(cnt)
}
q().then(()=>process.exit(0))
