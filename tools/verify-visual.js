import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
const envPath='D:/DX_User/Data_Abhishek/Abhishek/Dynahaul given by Amit sir 15july/Tipper demo/.env'
const raw=fs.readFileSync(envPath,'utf8')
const env={}; raw.split('\n').forEach(l=>{const i=l.indexOf('='); if(i>-1) env[l.slice(0,i).trim()]=l.slice(i+1).trim()})
const supa=createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{autoRefreshToken:false,persistSession:false}})
const SITE_ID='f8d09fa7-04e9-4429-b394-b969f1ea9a66'
async function q(){
  const {count:tyres}=await supa.from('tyres').select('id',{count:'exact',head:true}).ilike('tyre_no','VIS2509%')
  const {count:logs}=await supa.from('tyre_activity_log').select('id',{count:'exact',head:true}).gte('activity_date','2026-03-01')
  const {data:brand}=await supa.from('tyres').select('make').ilike('tyre_no','VIS2509%')
  const mix={}
  brand.forEach(r=>mix[r.make]=(mix[r.make]||0)+1)
  const {data:fuel}=await supa.from('fuel_trip_entries').select('entry_date,truck_no,total_kms').eq('site_id',SITE_ID).gte('entry_date','2026-04-01').order('entry_date')
  const months={}
  fuel.forEach(r=>{const m=r.entry_date.slice(0,7); months[m]=(months[m]||0)+1})
  const {data:act}=await supa.from('tyre_activity_log').select('activity_type').gte('activity_date','2026-03-01')
  const actMix={}
  act.forEach(r=>actMix[r.activity_type]=(actMix[r.activity_type]||0)+1)
  console.log('VIS tyres',tyres,'mix',mix)
  console.log('recent logs >=2026-03-01',logs,actMix)
  console.log('fuel by month',months,'sample',fuel.slice(0,3))
  const {data:rtd}=await supa.from('tyre_activity_log').select('rtd1').gte('activity_date','2026-03-01').not('rtd1','is',null).limit(5)
  console.log('rtd sample',rtd)
}
q().then(()=>process.exit(0))
