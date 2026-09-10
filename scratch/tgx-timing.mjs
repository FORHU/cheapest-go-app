/** How long does each city's dest-code search actually take? */
import fs from 'fs';
const env=fs.readFileSync('.env','utf8');
const pick=k=>(env.match(new RegExp('^'+k+'=(.*)$','m'))||[])[1]?.trim().replace(/^"|"$/g,'');
const cfg={apiKey:pick('TRAVELGATEX_API_KEY'),accessCode:pick('TRAVELGATEX_CODE')||'38327',
  endpoint:pick('TRAVELGATEX_ENDPOINT_URL')||'https://api.travelgate.com',
  client:pick('TRAVELGATEX_CLIENT')||'forhuinc',context:pick('TRAVELGATEX_CONTEXT')||'OTV'};
const settings=t=>({context:cfg.context,client:cfg.client,timeout:t,auditTransactions:false,plugins:[
  {pluginsType:[{name:'search_by_destination',parameters:[{key:'accessID',value:cfg.accessCode}]}]},
  {pluginsType:[{name:'cheapest_price',parameters:[{key:'primaryKey',value:'hotel'},{key:'optionsPerKey',value:'1'}]}]}]});
const Q=`query S($criteria:HotelCriteriaSearchInput!,$settings:HotelSettingsInput){hotelX{search(criteria:$criteria,settings:$settings){options{hotelCode}errors{code description}}}}`;
async function run(code,timeout){
  const t0=Date.now();
  const res=await fetch(cfg.endpoint,{method:'POST',
    headers:{'Content-Type':'application/json',Authorization:`Apikey ${cfg.apiKey}`},
    body:JSON.stringify({query:Q,variables:{criteria:{checkIn:'2026-10-10',checkOut:'2026-10-12',
      occupancies:[{paxes:[{age:30},{age:30}]}],nationality:'US',currency:'USD',destinations:[code]},settings:settings(timeout)}})});
  const j=await res.json();
  const s=j?.data?.hotelX?.search;
  return {ms:Date.now()-t0, options:s?.options?.length??0,
    err:j?.data?.error ?? (s?.errors??[]).map(e=>e.code).join(',')};
}
const rows=[];
for (const [city,code] of [['Rome','3023'],['Paris','2734'],['Tokyo','3593']]) {
  for (const t of [18000, 25000]) {
    const r=await run(code,t);
    rows.push({city,code,'app timeout':t+'ms','elapsed':r.ms+'ms',options:r.options,error:String(r.err).slice(0,40)});
  }
}
console.table(rows);
