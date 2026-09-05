import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
const p='D:/DX_User/Data_Abhishek/Abhishek/Dynahaul given by Amit sir 15july/Tipper demo/.env'
const raw=fs.readFileSync(p,'utf8')
const env={}; raw.split('\n').forEach(l=>{const i=l.indexOf('='); if(i>-1) env[l.slice(0,i).trim()]=l.slice(i+1).trim()})
const supa=createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{autoRefreshToken:false,persistSession:false}})
async function q(){
  const {data:ups}=await supa.from('user_profiles').select('id,username,role,site_id').limit(10)
  console.log('user_profiles 10', JSON.stringify(ups,null,2))
  const mrf='f8d09fa7-04e9-4429-b394-b969f1ea9a66'
  const arch='4a68fb71-9822-47b2-b07b-03f5b9eeee39'
  for(const sid of [mrf,arch]){
    const {count:vc}=await supa.from('vehicles').select('id',{count:'exact',head:true}).eq('site_id',sid)
    const {count:fc}=await supa.from('fuel_trip_entries').select('id',{count:'exact',head:true}).eq('site_id',sid)
    const {data:vehIds}=await supa.from('vehicles').select('id').eq('site_id',sid)
    const ids=(vehIds||[]).map(v=>v.id)
    let act=0
    if(ids.length){
      const {count}=await supa.from('tyre_activity_log').select('id',{count:'exact',head:true}).in('vehicle_id',ids)
      act=count
    }
    console.log(sid, 'vehicles',vc,'fuel',fc,'activity via veh',act)
  }
  const {data:siteMrf}=await supa.from('sites').select('*').eq('id',mrf).maybeSingle()
  console.log('site mrf',siteMrf)
  const {data:siteArch}=await supa.from('sites').select('*').eq('id',arch).maybeSingle()
  console.log('site arch',siteArch)
  const {data:fuelSample}=await supa.from('fuel_trip_entries').select('site_id,truck_no,entry_date,total_kms,total_fuel_consumed').limit(3)
  console.log('fuel sample',fuelSample)
  const {data:actSample}=await supa.from('tyre_activity_log').select('activity_date,activity_type,tyre_id,vehicle_id,rtd1,rtd2,psi_found,removal_reason').limit(5)
  console.log('activity sample',actSample)
}
q().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)})
