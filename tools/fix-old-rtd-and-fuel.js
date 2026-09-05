import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
const envPath='D:/DX_User/Data_Abhishek/Abhishek/Dynahaul given by Amit sir 15july/Tipper demo/.env'
const raw=fs.readFileSync(envPath,'utf8')
const env={}; raw.split('\n').forEach(l=>{const i=l.indexOf('='); if(i>-1) env[l.slice(0,i).trim()]=l.slice(i+1).trim()})
const supa=createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{autoRefreshToken:false,persistSession:false}})
const SITE_ID='f8d09fa7-04e9-4429-b394-b969f1ea9a66'
async function fix(){
  // 1) Top up fuel for July-Sep to have ~50 trucks like April-June
  const {data:vehicles}=await supa.from('vehicles').select('id,vehicle_no').eq('site_id',SITE_ID)
  const needMonths=['2026-07','2026-08','2026-09']
  const existingTrucks=new Set()
  for(const m of needMonths){
    const {data:rows}=await supa.from('fuel_trip_entries').select('truck_no').eq('site_id',SITE_ID).gte('entry_date',m+'-01').lt('entry_date',m+'-32')
    ;(rows||[]).forEach(r=>existingTrucks.add(m+':'+r.truck_no))
  }
  const toInsert=[]
  for(const m of needMonths){
    for(const v of vehicles){
      if(existingTrucks.has(m+':'+v.vehicle_no)) continue
      const trips=Math.floor(Math.random()*12)+24
      const kms=Math.floor(Math.random()*2200)+6400
      const fuel=+(kms/(Math.random()*0.6+2.6)).toFixed(1)
      const prod=Math.floor(Math.random()*5000)+9000
      const day=String(Math.floor(Math.random()*26)+2).padStart(2,'0')
      toInsert.push({id:crypto.randomUUID(), site_id:SITE_ID, vehicle_id:v.id, truck_no:v.vehicle_no, entry_date:m+'-'+day, total_trips:trips, total_kms:kms, total_fuel_consumed:fuel, total_production:prod})
    }
  }
  console.log('fuel to insert for balance',toInsert.length)
  for(let i=0;i<toInsert.length;i+=200){
    const chunk=toInsert.slice(i,i+200)
    const {error}=await supa.from('fuel_trip_entries').insert(chunk)
    if(error) throw error
  }
  console.log('fuel balanced')

  // 2) Report old bad RTD counts (do not delete, just report)
  const {count:bad}=await supa.from('tyre_activity_log').select('id',{count:'exact',head:true}).gt('rtd1',30)
  console.log('old bad rtd1>30 count',bad,' (left as is, VIS tyres will dominate charts)')
  const {count:visGood}=await supa.from('tyre_activity_log').select('id',{count:'exact',head:true}).gte('activity_date','2026-04-01').lt('rtd1',30).gt('rtd1',1)
  console.log('recent good rtd 1-30 count',visGood)
}
fix().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)})
