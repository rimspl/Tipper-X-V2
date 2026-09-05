import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
const p='D:/DX_User/Data_Abhishek/Abhishek/Dynahaul given by Amit sir 15july/Tipper demo/.env'
const raw=fs.readFileSync(p,'utf8')
const env={}; raw.split('\n').forEach(l=>{const i=l.indexOf('='); if(i>-1) env[l.slice(0,i).trim()]=l.slice(i+1).trim()})
const supa=createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{autoRefreshToken:false,persistSession:false}})
const MRF_SITE='f8d09fa7-04e9-4429-b394-b969f1ea9a66'
async function fix(){
  console.log('Fixing Bridgestone/Michelin etc -> MRF for MRF Fleet site...')
  const {data:vehicles}=await supa.from('vehicles').select('id').eq('site_id',MRF_SITE)
  const vIds=vehicles.map(v=>v.id)
  console.log('MRF vehicles',vIds.length)
  const {data:logs}=await supa.from('tyre_activity_log').select('tyre_id').in('vehicle_id',vIds).limit(10000)
  const tyreIds=[...new Set(logs.map(l=>l.tyre_id))]
  console.log('tyreIds linked to MRF site',tyreIds.length)
  const {data:vis}=await supa.from('tyres').select('id').ilike('tyre_no','VIS2509%')
  const visIds=vis.map(v=>v.id)
  console.log('VIS ids',visIds.length)
  const allIds=[...new Set([...tyreIds,...visIds])]
  console.log('total unique to fix',allIds.length)
  // fetch current makes for those ids
  let updated=0
  for(let i=0;i<allIds.length;i+=100){
    const chunk=allIds.slice(i,i+100)
    const {data:tyres}=await supa.from('tyres').select('id,make').in('id',chunk)
    const nonMrf=tyres.filter(t=>String(t.make).trim().toUpperCase()!=='MRF')
    if(nonMrf.length===0) continue
    const ids=nonMrf.map(t=>t.id)
    console.log(`chunk ${i}: ${nonMrf.length} non-MRF -> updating`, nonMrf.slice(0,3).map(t=>t.make))
    const {error}=await supa.from('tyres').update({make:'MRF'}).in('id',ids)
    if(error){ console.error('update error',error); throw error}
    updated+=ids.length
  }
  console.log('Updated',updated,'tyres to MRF')
  // verify
  const {data:check}=await supa.from('tyres').select('make').in('id',allIds.slice(0,500))
  const cnt={}
  check.forEach(r=>{cnt[r.make]=(cnt[r.make]||0)+1})
  console.log('after fix sample cnt',cnt)
  const {data:visCheck}=await supa.from('tyres').select('tyre_no,make').ilike('tyre_no','VIS2509%').limit(5)
  console.log('VIS after',visCheck)
  const {data:global}=await supa.from('tyres').select('make').limit(1000)
  const gcnt={}
  global.forEach(r=>{gcnt[r.make]=(gcnt[r.make]||0)+1})
  console.log('global after (sample 1000)',gcnt)

  // fix seed file to generate only MRF next time
  const seedPath='D:/DX_User/Data_Abhishek/Abhishek/Dynahaul given by Amit sir 15july/Tipper demo/tools/seed-visual-perfect.js'
  let seed=fs.readFileSync(seedPath,'utf8')
  if(seed.includes("make:'Apollo'")){
    seed=seed.replace(/const BRANDS=\[[\s\S]*?^\]/m, "const BRANDS=[\n  {make:'MRF', otd:25.0, weight:10},\n]")
    // simpler: replace whole definition
  }
  // ensure BRANDS only MRF
  const mrfOnly=`const BRANDS=[
  {make:'MRF', otd:25.0, weight:10},
]`
  seed=seed.replace(/const BRANDS=\[[\s\S]*?\n\]/, mrfOnly)
  fs.writeFileSync(seedPath, seed,'utf8')
  console.log('seed-visual-perfect.js updated to MRF only')
}
fix().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)})
