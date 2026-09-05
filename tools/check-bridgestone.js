import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
const p='D:/DX_User/Data_Abhishek/Abhishek/Dynahaul given by Amit sir 15july/Tipper demo/.env'
const raw=fs.readFileSync(p,'utf8')
const env={}; raw.split('\n').forEach(l=>{const i=l.indexOf('='); if(i>-1) env[l.slice(0,i).trim()]=l.slice(i+1).trim()})
const supa=createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{autoRefreshToken:false,persistSession:false}})
const MRF_SITE='f8d09fa7-04e9-4429-b394-b969f1ea9a66'
async function q(){
  const {data:makes}=await supa.from('tyres').select('make').limit(1000)
  const cnt={}
  makes.forEach(r=>{const k=r.make||'NULL'; cnt[k]=(cnt[k]||0)+1})
  console.log('tyres make global',cnt)
  const {data:vis}=await supa.from('tyres').select('tyre_no,make').ilike('tyre_no','VIS2509%')
  console.log('VIS tyres',vis)
  const {data:vehicles}=await supa.from('vehicles').select('id,vehicle_no').eq('site_id',MRF_SITE)
  const ids=vehicles.map(v=>v.id)
  const {data:logs}=await supa.from('tyre_activity_log').select('tyre_id,vehicle_id').in('vehicle_id',ids).limit(1000)
  const tyreIds=[...new Set(logs.map(l=>l.tyre_id))]
  const {data:tyresForSite}=await supa.from('tyres').select('tyre_no,make').in('id',tyreIds)
  const siteCnt={}
  tyresForSite.forEach(r=>{siteCnt[r.make]=(siteCnt[r.make]||0)+1})
  console.log('tyres linked to MRF site via logs',siteCnt, 'sample',tyresForSite.slice(0,5))
  const {data:bridgestone}=await supa.from('tyres').select('id,tyre_no,make').ilike('make','%bridgestone%')
  console.log('bridgestone tyres',bridgestone)
  const {data:bridgestoneLogs}=await supa.from('tyre_activity_log').select('tyre_id,activity_type,activity_date').in('tyre_id', bridgestone.map(b=>b.id)).limit(5)
  console.log('bridgestone logs sample',bridgestoneLogs)
  // check inspectionRecords brand via tyres mapping
  const {data:allTyres}=await supa.from('tyres').select('id,tyre_no,make').in('id',tyreIds.slice(0,20))
  console.log('all tyres sample for site',allTyres.slice(0,10))
}
q().then(()=>process.exit(0))
