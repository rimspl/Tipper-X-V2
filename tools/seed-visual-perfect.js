import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const envPath='D:/DX_User/Data_Abhishek/Abhishek/Dynahaul given by Amit sir 15july/Tipper demo/.env'
const raw=fs.readFileSync(envPath,'utf8')
const env={}
raw.split('\n').forEach(l=>{const i=l.indexOf('='); if(i>-1) env[l.slice(0,i).trim()]=l.slice(i+1).trim()})
const supa=createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{autoRefreshToken:false,persistSession:false}})

const SITE_ID='f8d09fa7-04e9-4429-b394-b969f1ea9a66'
const BRANDS=[
  {make:'MRF', otd:25.0, weight:10},
]
const SIZES=['12.00R24','11.00R20','12.00R24','295/80R22.5']
const POSITIONS=['FL','FR','RL-Outer','RL-Inner','RR-Outer','RR-Inner']
const REMOVAL_REASONS=[
  {reason:'Uneven Wear',pct:30},
  {reason:'Cut',pct:20},
  {reason:'Normal Wear',pct:25},
  {reason:'Burst',pct:10},
  {reason:'Impact Damage',pct:15},
]
const STATUSES=['Running','Running','Running','Spare']

function pickBrand(){
  const pool=[]
  for(const b of BRANDS) for(let i=0;i<b.weight;i++) pool.push(b)
  return pool[Math.floor(Math.random()*pool.length)]
}
function rand(n,m){return Math.random()*(m-n)+n}
function randInt(n,m){return Math.floor(rand(n,m+1))}
function isoDate(d){return d.toISOString().slice(0,10)}
function addDays(date,days){const d=new Date(date); d.setDate(d.getDate()+days); return d}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]} return a}

async function main(){
  console.log('Seeding visual-perfect data for site',SITE_ID)
  const {data:vehicles}=await supa.from('vehicles').select('id,vehicle_no').eq('site_id',SITE_ID)
  console.log('vehicles',vehicles.length)
  if(vehicles.length<5) throw new Error('Not enough vehicles')
  
  const prefix='VIS2509'
  console.log('Cleaning previous VIS2509 tyres...')
  const {data:oldTyres}=await supa.from('tyres').select('id,tyre_no').ilike('tyre_no',`${prefix}%`)
  console.log('old VIS tyres',oldTyres?.length||0)
  if(oldTyres?.length){
    const ids=oldTyres.map(t=>t.id)
    await supa.from('tyre_activity_log').delete().in('tyre_id',ids)
    await supa.from('tyres').delete().in('id',ids)
    console.log('cleaned',ids.length)
  }

  const now=new Date()
  const fleet=[]
  const allLogs=[]
  const allTyres=[]

  for(let i=0;i<40;i++){
    const b=pickBrand()
    const otd=+(b.otd+rand(-0.4,0.4)).toFixed(1)
    const tyre_no=`${prefix}${String(3001+i).padStart(4,'0')}`
    const size=SIZES[randInt(0,SIZES.length-1)]
    const vid=vehicles[randInt(0,vehicles.length-1)]
    const pos=POSITIONS[randInt(0,POSITIONS.length-1)]
    const fitDate=addDays(now, -randInt(150,220))
    const fitOdo=randInt(35000,65000)
    const isScrap = i<18
    
    const tyreId=crypto.randomUUID()
    const status=isScrap ? (Math.random()<0.7?'Scrap':'Retread') : 'Running'
    const tyre={
      id:tyreId,
      tyre_no,
      make:b.make,
      size,
      otd,
      current_vehicle_id: status==='Running'? vid.id : null,
      current_position: status==='Running'? pos : null,
      status,
      total_life_run:0,
      created_at: isoDate(fitDate)+'T08:00:00Z'
    }
    allTyres.push(tyre)

    let curOdo=fitOdo
    let curRtd=otd-0.3
    const logs=[]

    logs.push({
      id:crypto.randomUUID(),
      tyre_id:tyreId,
      vehicle_id:vid.id,
      activity_type:'FITMENT',
      activity_date:isoDate(fitDate),
      position:pos,
      meter_reading:curOdo,
      rtd1:+curRtd.toFixed(1),
      rtd2:+(curRtd-0.3).toFixed(1),
      psi_found:null,
      psi_corrected:null,
      life_achieved_in_this_run:0,
      removal_reason:null,
      remarks:'New fitment - VISUAL SEED',
      created_at: isoDate(fitDate)+'T08:10:00Z'
    })

    const inspections= isScrap? randInt(3,4): randInt(4,5)
    for(let k=0;k<inspections;k++){
      curOdo+=randInt(6800,8200)
      curRtd=Math.max(1.2, curRtd - rand(2.4,3.2))
      const d=addDays(fitDate, 30*(k+1)+randInt(-3,3))
      if(d>now) continue
      const isUnder = Math.random()<0.32
      const psi_found = isUnder? randInt(96,107) : randInt(112,124)
      const psi_corr = psi_found<110? 120 : psi_found
      logs.push({
        id:crypto.randomUUID(),
        tyre_id:tyreId,
        vehicle_id:vid.id,
        activity_type:'INSPECTION',
        activity_date:isoDate(d),
        position:pos,
        meter_reading:curOdo,
        rtd1:+curRtd.toFixed(1),
        rtd2:+(Math.max(1.0,curRtd-0.8)).toFixed(1),
        psi_found,
        psi_corrected:psi_corr,
        life_achieved_in_this_run:0,
        removal_reason:null,
        remarks: isUnder?'Under-inflated observed':'Normal inspection',
        created_at: isoDate(d)+'T10:00:00Z'
      })
      if(Math.random()<0.7){
        const pDate=addDays(d, randInt(10,18))
        if(pDate<=now){
          const pPsi=isUnder? randInt(94,106): randInt(110,122)
          logs.push({
            id:crypto.randomUUID(),
            tyre_id:tyreId,
            vehicle_id:vid.id,
            activity_type:'PRESSURE_CHECK',
            activity_date:isoDate(pDate),
            position:pos,
            meter_reading:curOdo+randInt(800,1800),
            rtd1:null,
            rtd2:null,
            psi_found:pPsi,
            psi_corrected: pPsi<110?120:pPsi,
            life_achieved_in_this_run:0,
            removal_reason:null,
            remarks:'Pressure check',
            created_at: isoDate(pDate)+'T09:00:00Z'
          })
        }
      }
    }

    if(isScrap){
      curOdo+=randInt(4000,7000)
      const remDate=addDays(fitDate, randInt(145,195))
      const finalRtd=+(rand(1.2,4.8)).toFixed(1)
      const life=curOdo-fitOdo
      const rr=REMOVAL_REASONS[randInt(0,REMOVAL_REASONS.length-1)].reason
      const disp = finalRtd>3 && Math.random()<0.5? 'Retread':'Scrap'
      logs.push({
        id:crypto.randomUUID(),
        tyre_id:tyreId,
        vehicle_id:vid.id,
        activity_type:'REMOVAL',
        activity_date: isoDate(remDate>now? addDays(now,-randInt(5,20)): remDate),
        position:pos,
        meter_reading:curOdo,
        rtd1:finalRtd,
        rtd2:+(Math.max(0.8,finalRtd-0.6)).toFixed(1),
        psi_found:null,
        psi_corrected:null,
        life_achieved_in_this_run:life,
        removal_reason:rr,
        remarks:disp,
        created_at: isoDate(remDate)+'T15:00:00Z'
      })
      tyre.total_life_run=life
      tyre.status=disp==='Retread'?'Retread':'Scrap'
      tyre.current_vehicle_id=null
      tyre.current_position=null
    } else {
      tyre.total_life_run=curOdo-fitOdo
    }

    for(const lg of logs) allLogs.push(lg)
  }

  console.log('Inserting',allTyres.length,'tyres...')
  const {error:eTyre}=await supa.from('tyres').insert(allTyres)
  if(eTyre) throw eTyre
  console.log('tyres inserted')

  console.log('Inserting',allLogs.length,'activity logs...')
  for(let i=0;i<allLogs.length;i+=500){
    const chunk=allLogs.slice(i,i+500).map(l=>({
      id:l.id,
      tyre_id:l.tyre_id,
      vehicle_id:l.vehicle_id,
      activity_type:l.activity_type,
      activity_date:l.activity_date,
      position:l.position,
      meter_reading:l.meter_reading,
      rtd1:l.rtd1,
      rtd2:l.rtd2,
      psi_found:l.psi_found,
      psi_corrected:l.psi_corrected,
      life_achieved_in_this_run:l.life_achieved_in_this_run,
      removal_reason:l.removal_reason,
      remarks:l.remarks,
      created_at:l.created_at
    }))
    const {error}=await supa.from('tyre_activity_log').insert(chunk)
    if(error) throw error
    console.log('chunk',i,'ok')
  }

  console.log('Seeding fuel for last 6 months...')
  const fuelRows=[]
  const months=[]
  for(let m=0;m<6;m++){ const d=addDays(now, -m*30); months.push(isoDate(d).slice(0,7)) }
  months.reverse()
  const trucks=vehicles.slice(0,8).map(v=>v.vehicle_no)
  for(const month of months){
    for(const truck of trucks){
      const v=vehicles.find(x=>x.vehicle_no===truck)
      const trips=randInt(22,38)
      const kms=randInt(6200,8800)
      const fuel=+(kms/ rand(2.6,3.2)).toFixed(1)
      const prod=randInt(8000,14000)
      const entry_date=month+'-'+String(randInt(2,26)).padStart(2,'0')
      fuelRows.push({
        id:crypto.randomUUID(),
        site_id:SITE_ID,
        vehicle_id:v.id,
        truck_no:truck,
        entry_date,
        total_trips:trips,
        total_kms:kms,
        total_fuel_consumed:fuel,
        total_production:prod
      })
    }
  }
  const {error:delF}=await supa.from('fuel_trip_entries').delete().in('truck_no',trucks).gte('entry_date', months[0]+'-01')
  console.log('old fuel delete',delF?.message||'ok')
  for(let i=0;i<fuelRows.length;i+=200){
    const chunk=fuelRows.slice(i,i+200)
    const {error}=await supa.from('fuel_trip_entries').insert(chunk)
    if(error) throw error
  }
  console.log('fuel seeded',fuelRows.length,'rows months',months.join(','))

  console.log('DONE visual-perfect seed')
  console.log('Tyres:',allTyres.length,'Logs:',allLogs.length,'Fuel:',fuelRows.length)
  console.log('Brand mix:',allTyres.reduce((a,t)=>{a[t.make]=(a[t.make]||0)+1;return a},{}) )
}

main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)})
