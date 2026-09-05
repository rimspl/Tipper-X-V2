import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
const envPath='D:/DX_User/Data_Abhishek/Abhishek/Dynahaul given by Amit sir 15july/Tipper demo/.env'
const raw=fs.readFileSync(envPath,'utf8')
const env={}
raw.split('\n').forEach(l=>{const i=l.indexOf('=');if(i>-1) env[l.slice(0,i).trim()]=l.slice(i+1).trim()})
const supa=createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{autoRefreshToken:false,persistSession:false}})
async function probe(){
  const email='dxuser1.rimspl@gmail.com'
  const {data:prof,error:e1}=await supa.from('user_profiles').select('id,username,role,site_id,customer_id').ilike('username',email).limit(1).maybeSingle()
  console.log('user_profiles lookup:',prof,e1?.message)
  let siteId=prof?.site_id
  if(!siteId){
    const {data:sites}=await supa.from('sites').select('id,site_name').limit(5)
    console.log('all sites (no siteId):',sites)
    if(sites?.length) siteId=sites[0].id
  } else {
    const {data:s}=await supa.from('sites').select('id,site_name,customer_id,target_tyre_life,target_life_unit,tyre_price,fleet_size,annual_demand').eq('id',siteId).maybeSingle()
    console.log('site:',s)
  }
  if(!siteId){console.log('NO SITE ID, abort');return}
  console.log('siteId',siteId)
  const counts={}
  for(const t of ['vehicles','tyres','tyre_activity_log','fuel_trip_entries','fitter_tyre_card_entries','fitter_pressure_check_entries','fitter_tyre_inspection_entries','fitter_tyre_removal_entries']){
    const {count,error}=await supa.from(t).select('id',{count:'exact',head:true})
    counts[t]= count ?? `err:${error?.message}`
  }
  console.log('global counts',counts)
  const perSite={}
  {
    const {count}=await supa.from('vehicles').select('id',{count:'exact',head:true}).eq('site_id',siteId)
    perSite.vehicles_site=count
  }
  {
    const {count}=await supa.from('fuel_trip_entries').select('id',{count:'exact',head:true}).eq('site_id',siteId)
    perSite.fuel_site=count
  }
  for(const t of ['fitter_tyre_card_entries','fitter_pressure_check_entries','fitter_tyre_inspection_entries','fitter_tyre_removal_entries']){
    const {count}=await supa.from(t).select('id',{count:'exact',head:true}).eq('site_id',siteId)
    perSite[t]=count
  }
  console.log('per site',perSite)
  const {data:tyreRows}=await supa.from('tyres').select('tyre_no,make,status,total_life_run').limit(5)
  console.log('tyres sample',tyreRows)
  const {data:vehRows}=await supa.from('vehicles').select('vehicle_no,site_id,current_odometer').eq('site_id',siteId).limit(5)
  console.log('vehicles sample',vehRows)
}
probe().then(()=>process.exit(0))
