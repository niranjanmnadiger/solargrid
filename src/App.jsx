import { useState } from "react";
import { ComposedChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS   = [31,28,31,30,31,30,31,31,30,31,30,31];
const GHI    = [5.5,6.0,6.5,6.3,5.8,4.5,3.8,3.7,4.4,5.3,5.6,5.3];   // Bengaluru monthly sun hours/day
const PANEL_COUNTS = Array.from({length:15},(_,i)=>i+12);           // array sizes offered: 12 to 26 panels


// extra export-rate choices (not the default); costed as non-DCR in the 'your pick' table
const PRESETS = [
  {key:'p389', rate:3.89, label:'₹3.89 — domestic, up to 10 kW only'},
  {key:'p356', rate:3.56, label:'₹3.56'},
];

const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

function monthlyGen(kw, pr){ return GHI.map((g,i)=>Math.round(g*kw*pr*DAYS[i])); }

// rate = export rate, imp = import rate, fixed = fixed charge per kW per month, pr = performance ratio
function calcAnnual(kw, load, rate, imp, fixed, pr){
  const gen = monthlyGen(kw, pr);
  const fixedAnn = fixed * kw * 12; // sanctioned load = array size
  let expKwh=0, impKwh=0;
  const monthly = gen.map((g,i)=>{
    const L_=Array.isArray(load)?load[i]:load, d=g-L_;
    if(d>=0){expKwh+=d;return{month:MONTHS[i],gen:g,load:L_,export:d,import:0};}
    else{impKwh+=Math.abs(d);return{month:MONTHS[i],gen:g,load:L_,export:0,import:Math.abs(d)};}
  });
  const expCredit=Math.round(expKwh*rate);
  const impCost  =Math.round(impKwh*imp);
  const netBill  =impCost-expCredit+fixedAnn;
  return{ monthly, expKwh:Math.round(expKwh), impKwh:Math.round(impKwh),
          expCredit, impCost, netBill, annGen:gen.reduce((a,b)=>a+b,0), fixedAnn };
}

const card = (label, val, sub, bg, tc) => (
  <div style={{background:bg,borderRadius:10,padding:'0.9rem',border:`1.5px solid ${tc}33`}}>
    <p style={{fontSize:10,fontWeight:700,color:tc,margin:'0 0 4px',textTransform:'uppercase',letterSpacing:.5}}>{label}</p>
    <p style={{fontSize:22,fontWeight:500,color:'#1a1a1a',margin:0}}>{val}</p>
    <p style={{fontSize:10,color:tc,margin:'3px 0 0'}}>{sub}</p>
  </div>
);

const CustomTooltip = ({active,payload,label})=>{
  if(!active||!payload?.length) return null;
  return(
    <div style={{background:'white',border:'1px solid #ddd',borderRadius:8,padding:'0.6rem',fontSize:11}}>
      <p style={{fontWeight:600,margin:'0 0 4px'}}>{label}</p>
      {payload.map((p,i)=><p key={i} style={{color:p.fill||p.stroke,margin:'2px 0'}}>{p.name}: {p.value} kWh</p>)}
    </div>
  );
};

const inputStyle = {padding:'4px 8px',borderRadius:6,border:'1px solid #ccc',fontSize:12};
const labelStyle = {display:'flex',flexDirection:'column',gap:3,fontSize:11,color:'#555',fontWeight:600};

const billCell = (b,tol=0) => (
  <td style={{padding:'8px 10px',textAlign:'center',color:b<=tol?'#1B5E20':'#B71C1C',fontWeight:500}}>
    {b<=0?`−₹${Math.abs(b).toLocaleString()} credit`:`₹${b.toLocaleString()} bill`}
  </td>
);

const INR = v => `${v<0?'−':''}₹${Math.abs(Math.round(v)).toLocaleString('en-IN')}`;
const th = {padding:'7px 9px',fontWeight:500,textAlign:'center'};
const td = {padding:'7px 9px',fontSize:12};
const h3 = {fontSize:13,fontWeight:600,margin:'0 0 4px'};
const sm = {fontSize:11,color:'#666',margin:'0 0 0.5rem'};

// smallest array (in whole panels) whose annual net bill is <= tol; capex = kW*1000*₹/W - subsidy
function minSize(load, o, p){
  for(let n=1;n<=80;n++){
    const kw = Math.round(n*p.panelKw*100)/100;
    if(calcAnnual(kw,load,o.rate,p.imp,p.fixed,p.pr).netBill <= p.tol)
      return {n, kw, cap: Math.round(kw*1000*o.perW - o.sub)};
  }
  return null;
}

// Upgrade X vs base b at the SAME kW: extra capex vs extra export earning from the higher tariff (25 yrs, with degradation)
function cmp(b, X, kw, load, p, degr, kx=kw){
  const extra = Math.round(kx*1000*X.perW - X.sub - (kw*1000*b.perW - b.sub));
  let cum=0, pay=null, g1=0;
  for(let t=0;t<25;t++){
    const pr = p.pr*Math.pow(1-degr,t);
    const g = calcAnnual(kw,load,b.rate,p.imp,p.fixed,pr).netBill - calcAnnual(kx,load,X.rate,p.imp,p.fixed,pr).netBill;
    if(t===0) g1=g;
    if(pay===null && cum+g>=extra) pay = Math.max(0, t + (g>0 ? (extra-cum)/g : 0));
    cum+=g;
  }
  return {extra, g1:Math.round(g1), pay, net:Math.round(cum-extra)};
}
const payTxt = r => r.pay===null ? 'Not within 25 yrs' : r.pay===0 ? 'From day 1' : `${r.pay.toFixed(1)} yrs`;

const AC_LOW  = [0,60,605,805,825,125,0,0,60,200,0,0];
const AC_HIGH = [0,105,735,975,995,180,0,0,105,265,20,0];
const avg = L => Array.isArray(L) ? Math.round(L.reduce((a,b)=>a+b,0)/12) : L;

function OptionCompare({imp,fixed,pr,panelKw,loadList,ld,setLd,O,tol,degr,mine}){
  const [pk,setPk] = useState(0), [pk2,setPk2] = useState(0);
  const p = {imp,fixed,pr,panelKw,tol};
  const named = loadList;
  const ladder = [600,700,800,900,1000,1100,1200].map(l=>[`${l} kWh/mo`,l]);
  const tbl = (head,rows)=>(
    <div style={{overflowX:'auto',marginBottom:'1.25rem'}}>
      <table style={{width:'100%',borderCollapse:'collapse'}}>
        <thead><tr style={{background:'#1F3864',color:'white'}}>{head.map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r,i)=>(
          <tr key={i} style={{background:i%2?'white':'#f9f9f9',borderBottom:'1px solid #eee'}}>
            {r.map((v,j)=><td key={j} style={{...td,fontWeight:j===0?600:400,textAlign:j===0?'left':'center'}}>{v}</td>)}
          </tr>))}</tbody>
      </table>
    </div>);

  // 1. min size for zero bill, per option, with capex; cheapest starred
  const rows1 = [...named,...ladder].map(([lab,L],i)=>{
    const m = O.map(o=>minSize(L,o,p));
    const best = Math.min(...m.map(x=>x?x.cap:Infinity));
    return [i<named.length?`${lab} (${avg(L)})`:lab, ...m.map(x=>x
      ? <span style={{color:x.cap===best?'#1B5E20':'inherit',fontWeight:x.cap===best?700:400}}>{x.kw} kW · {x.n} panels<br/>{INR(x.cap)}{x.cap===best?' ⭐':''}</span>
      : '>80 panels')];
  });

  // 2. upgrade from the cheapest net-zero option to a higher-tariff option (same kW)
  const rows2 = [];
  named.forEach(([lab,L])=>{
    const m = O.map(o=>minSize(L,o,p));
    let bi=-1; m.forEach((x,i)=>{ if(x && (bi<0 || x.cap<m[bi].cap)) bi=i; });
    if(bi<0) return;
    const b=O[bi], kw=m[bi].kw, base=`${b.name} · ${kw} kW · ${INR(m[bi].cap)}`;
    const up = O.filter(o=>o.rate>b.rate);
    if(!up.length) rows2.push([`${lab} (${avg(L)})`,base,'Already the best tariff','—','—','—','—']);
    up.forEach(X=>{ const r=cmp(b,X,kw,L,p,degr);
      rows2.push([`${lab} (${avg(L)})`,base,X.name,INR(r.extra),INR(r.g1),payTxt(r),INR(r.net)]); });
  });

  // 3. subsidy trade-off: DCR with subsidy (lower tariff) vs DCR without, same kW
  const rows3 = named.map(([lab,L])=>{
    const m = minSize(L,O[2],p);
    if(!m) return [`${lab} (${avg(L)})`,'—','—','—','—','—'];
    const r = cmp(O[2],O[1],m.kw,L,p,degr);
    return [`${lab} (${avg(L)})`,`${m.kw} kW`,INR(r.extra),INR(r.g1),payTxt(r),
      r.net>=0?`Skipping subsidy wins by ${INR(r.net)}`:`Taking subsidy wins by ${INR(-r.net)}`];
  });

  // ---- Fixed setups (12 / 15 kW) ----
  const ALL = [
    {name:'12 kW Non-DCR',kw:12,o:O[0]}, {name:'15 kW Non-DCR',kw:15,o:O[0]},
    {name:'12 kW DCR + subsidy',kw:12,o:O[2]}, {name:'15 kW DCR + subsidy',kw:15,o:O[2]},
    {name:'12 kW DCR, no subsidy',kw:12,o:O[1]},
  ].map(f=>({...f, cap:Math.round(f.kw*1000*f.o.perW-f.o.sub)}));
  const LD = named[ld][1];
  const sgn = v => (v>=0?'+':'−')+INR(Math.abs(v));
  const pb = r => r.extra<=0 ? (r.g1>=0?'From day 1':'Cheaper upfront') : r.g1>0 ? payTxt(r) : 'Never pays back';
  const roi = r => r.extra>0 && r.net>0 ? `${Math.round(r.net/r.extra*100)}%` : '—';
  const green='#1B5E20', red='#B71C1C';
  // one pair of tables (compare vs cheapest / 2nd cheapest, then pick-one-vs-rest) for any list of setups
  const fixedBlock = (F, t1, t2, pk, setPk) => {
    const A = F.map(f=>calcAnnual(f.kw,LD,f.o.rate,imp,fixed,pr));
    const order = F.map((f,i)=>i).sort((a,b)=>F[a].cap-F[b].cap);
    const vs = (a,b)=>{
      if(a===b) return <span style={{color:'#999'}}>—</span>;
      const r=cmp(F[a].o,F[b].o,F[a].kw,LD,p,degr,F[b].kw), ok=r.net>=0;
      return <span><b>{sgn(r.extra)}</b> capex<br/>
        <span style={{color:ok?green:red,fontWeight:600}}>{ok?'Gain':'Lose'} {INR(Math.abs(r.net))} in 25 yrs</span><br/>
        <span style={{color:'#666'}}>{pb(r)}{r.extra>0&&r.net>0?` · ROI ${roi(r)}`:''}</span></span>;
    };
    const rowsF = F.map((f,i)=>{
      const rk = order.indexOf(i), bill = A[i].netBill;
      return [<span>{f.name}{rk<2&&<span style={{marginLeft:6,fontSize:10,background:rk?'#ECEFF1':'#FFF3C4',borderRadius:8,padding:'1px 6px'}}>{rk?'2nd cheapest':'Cheapest'}</span>}</span>,
        INR(f.cap), `${Math.round(A[i].annGen).toLocaleString('en-IN')} kWh`,
        <b style={{color:bill<=p.tol?green:red}}>{bill<0?`${INR(-bill)} credit`:INR(bill)}</b>,
        vs(order[0],i), vs(order[1],i)];
    });
    const rowsP = F.map((f,i)=>{
      if(i===pk) return null;
      const r=cmp(F[i].o,F[pk].o,F[i].kw,LD,p,degr,F[pk].kw), ok=r.net>=0;
      return [f.name, sgn(r.extra), <span style={{color:r.g1>=0?green:red}}>{sgn(r.g1)}/yr</span>,
        <b style={{color:ok?green:red}}>{ok?'Gain':'Lose'} {INR(Math.abs(r.net))}</b>, pb(r), roi(r)];
    }).filter(Boolean);
    return (<div>
      <p style={{fontSize:14,fontWeight:600,margin:'0 0 4px'}}>{t1}</p>
      {tbl(['Setup','Capex','Generates','Net bill / yr','vs cheapest','vs 2nd cheapest'],rowsF)}
      <p style={{fontSize:13,fontWeight:600,margin:'0 0 4px'}}>{t2}</p>
      <div style={{display:'flex',gap:8,alignItems:'center',margin:'0 0 0.5rem',fontSize:12}}>
        I pick: <select value={pk} onChange={e=>setPk(+e.target.value)} style={inputStyle}>{F.map((f,i)=><option key={i} value={i}>{f.name}</option>)}</select>
        <span style={{color:'#666'}}>(load: {named[ld][0]})</span>
      </div>
      <p style={sm}>"Gain / Lose" = your pick instead of that setup, over 25 years, after the extra capex.</p>
      {tbl(['Instead of','Extra capex','Yearly earning vs it','25-yr result','Payback','ROI'],rowsP)}
    </div>);
  };

  // 4. cheapest net-zero vs the panels + export rate picked at the top of the page (costed at the non-DCR ₹/W, no subsidy)
  const Ym = mine.opt!=null ? O[mine.opt] : null;
  const Y = {name:'Your pick', rate:mine.rate, perW:Ym?Ym.perW:O[0].perW, sub:Ym?Ym.sub:0, tag:Ym?Ym.name:'Non-DCR'};
  const rows4 = named.map(([lab,L])=>{
    const m = O.map(o=>minSize(L,o,p));
    let bi=-1; m.forEach((x,i)=>{ if(x && (bi<0 || x.cap<m[bi].cap)) bi=i; });
    if(bi<0) return [`${lab} (${avg(L)})`,'—','—','—','—','—','—','—'];
    const b=O[bi], r=cmp(b,Y,m[bi].kw,L,p,degr,mine.kw);
    const yb = calcAnnual(mine.kw,L,mine.rate,p.imp,p.fixed,p.pr).netBill;
    return [`${lab} (${avg(L)})`, `${b.name} · ${m[bi].kw} kW · ${INR(m[bi].cap)}`,
      `${mine.panels} panels · ${mine.kw} kW · ${INR(mine.kw*1000*Y.perW-Y.sub)}`,
      yb<0?`${INR(-yb)} credit`:INR(yb), INR(r.extra), INR(r.g1),
      r.extra<=0&&r.g1<0?'—':payTxt(r),
      r.net>=0?`Your pick wins by ${INR(r.net)}`:`Cheapest net-zero wins by ${INR(-r.net)}`];
  });

  return(
    <div style={{marginTop:'1.75rem',borderTop:'3px solid #1F3864',paddingTop:'1rem'}}>
      <h2 style={{fontSize:14,fontWeight:600,margin:'0 0 0.5rem'}}>DCR vs Non-DCR — Net-Zero Size, Capex & Payback</h2>
      <p style={sm}>All inputs for this section are in the settings panel at the top, so the whole page uses the same values.</p>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center',margin:'0 0 0.5rem'}}>
        <span style={{fontSize:12}}>Show bill for:</span>
        {named.map(([lab,L],i)=><button key={lab} onClick={()=>setLd(i)} style={{padding:'5px 12px',borderRadius:20,border:'1px solid #1F3864',cursor:'pointer',fontSize:12,background:ld===i?'#1F3864':'white',color:ld===i?'white':'#1F3864'}}>{lab} · {avg(L)} kWh/mo</button>)}
      </div>
      <p style={sm}>Net bill/yr (green = zero or credit). Each "vs" cell compares that setup with the cheapest / 2nd cheapest: extra capex, 25-year gain or loss, payback. ROI = 25-yr net gain ÷ extra capex. Degradation included.</p>
      {fixedBlock(ALL,'A. Fixed setups — all five','B. Pick one and compare with the other four',pk,setPk)}
      <div style={{borderTop:'2px dashed #bbb',margin:'0.5rem 0 1rem'}}/>
      {fixedBlock(ALL.filter(f=>!f.o.sub),'C. Same tables without the subsidy options','D. Pick one and compare (no subsidy options)',pk2,setPk2)}
      <div style={{borderTop:'2px dashed #bbb',margin:'0.5rem 0 1rem'}}/>
      <p style={h3}>1. Smallest array for a zero annual bill</p>
      <p style={sm}>Net bill = import − export credit + fixed charge (sanction = array kW). ⭐ = lowest capital for that load, after subsidy.</p>
      {tbl(['Monthly load',...O.map(o=>`${o.name} (₹${o.rate}/unit)`)],rows1)}
      <p style={h3}>2. Paying more than the cheapest net-zero — payback from the higher export tariff</p>
      <p style={sm}>Same kW as the cheapest option. Extra earning = export units × tariff gap, summed over 25 years with degradation.</p>
      {tbl(['Load','Cheapest net-zero','Upgrade to','Extra capex','Extra export/yr (yr 1)','Payback','25-yr net gain'],rows2)}
      <p style={h3}>3. Subsidy trade-off — DCR with subsidy vs without</p>
      <p style={sm}>Taking the subsidy gives {INR(O[2].sub)} now but a lower export rate for 25 years.</p>
      {tbl(['Load','DCR size','Subsidy forgone','Extra export/yr (no subsidy)','Years to recoup','25-yr result'],rows3)}
      <p style={h3}>4. Cheapest net-zero vs your pick (panels + export rate chosen at the top)</p>
      <p style={sm}>Your pick = {mine.panels} panels at ₹{mine.rate}/unit export, costed as {Y.tag} (from the export-rate choice at the top; a custom rate or the ₹3.89 / ₹3.56 choices are costed as non-DCR). Extra = your pick minus the cheapest net-zero option; yr-1 bill is for your pick.</p>
      {tbl(['Load','Cheapest net-zero','Your pick','Your yr-1 bill','Extra capex','Extra earning/yr (yr 1)','Payback','25-yr result'],rows4)}
    </div>
  );
}

export default function App(){
  const [panels, setPanels]         = useState(17);
  const [loadSel, setLoadSel]       = useState(0);   // index into loadList (chart)
  const [acR, setAcR] = useState(1);            // AC usage level: 0 Low, 1 Mid, 2 High
  const [extraStr, setExtraStr] = useState('60'); // extra kWh/month added in 'Total load'
  const [rateSel, setRateSel]       = useState('2');   // export-rate choice: '0' Non-DCR, '1' DCR no subsidy, '2' DCR + subsidy, 'custom' = use the box
  const [customRate, setCustomRate] = useState('3.00');
  const [s, setS] = useState({price:'22.7',prem:'22',sub:'78000',rN:'2.34',rD:'3.11',rS:'2.58',tol:'300',degr:'0.5'});
  const [impStr, setImpStr]         = useState('6.40');   // import rate, ₹/unit
  const [fixedStr, setFixedStr]     = useState('150');    // fixed charge, ₹/kW/month
  const [panelWStr, setPanelWStr]   = useState('700');    // panel wattage, W
  const [prStr, setPrStr]           = useState('0.78');   // performance ratio
  const [realStr, setRealStr]       = useState('854');    // realistic monthly load, kWh
  const [worstStr, setWorstStr]     = useState('994');    // worst-case monthly load, kWh
  const [customLoadStr, setCustomLoadStr] = useState('900'); // your own monthly load, kWh

  // the three options (cost per W, subsidy, export rate) — one set of inputs for the whole page
  const c0 = num(s.price), pm = num(s.prem)/100;
  const O = [
    {name:'Non-DCR',         rate:num(s.rN), perW:c0,        sub:0},
    {name:'DCR, no subsidy', rate:num(s.rD), perW:c0*(1+pm), sub:0},
    {name:'DCR + subsidy',   rate:num(s.rS), perW:c0*(1+pm), sub:num(s.sub)},
  ];
  const tol  = num(s.tol);            // annual bill at or below this counts as zero (everywhere)
  const degr = num(s.degr)/100;       // panel degradation per year
  const preset   = PRESETS.find(x=>x.key===rateSel);
  const rate     = rateSel === 'custom' ? num(customRate) : preset ? preset.rate : O[+rateSel].rate; // export rate
  const imp      = num(impStr);
  const fixed    = num(fixedStr);
  const pr       = num(prStr);
  const panelKw  = num(panelWStr) / 1000;
  const realLoad = num(realStr), worstLoad = num(worstStr), customLoad = num(customLoadStr);
  // monthly AC usage (all 4 ACs) at the chosen level, Jan..Dec
  const ac = AC_LOW.map((lo,i)=> acR===0 ? lo : acR===2 ? AC_HIGH[i] : (lo+AC_HIGH[i])/2);
  const loadList = [['Realistic',realLoad],['Worst case',worstLoad],['Custom',customLoad],
    ['Realistic + AC (2+2)', ac.map(v=>realLoad+v)],
    ['Realistic + light AC (1+1)', ac.map(v=>realLoad+v/2)],
    ['Total load', ac.map(v=>worstLoad+v+num(extraStr))]];
  const load     = loadList[loadSel][1];   // number (flat) or 12-month array

  const kwOf  = n => Math.round(n * panelKw * 100) / 100;   // panels -> array kW
  const kw    = kwOf(panels);
  const ratio = rate > 0 ? imp / rate : 0;
  const maxKw = kwOf(PANEL_COUNTS[PANEL_COUNTS.length-1]);
  // BESCOM rule: solar array capacity cannot exceed sanctioned/contracted load.
  // So sanctioned load = solar kW (the minimum sanction needed to install this array).
  const sanc = kw;

  const data   = calcAnnual(kw, load, rate, imp, fixed, pr);
  const isZero = data.netBill <= tol;
  const annPerKw = GHI.reduce((a,g,i)=>a+g*DAYS[i],0) * pr;   // kWh per kW per year

  const pRows = [
    {label:'99% of days (P99)',days:361,ghi:1.5,bg:'#FFEBEE',tc:'#B71C1C'},
    {label:'90% of days (P90)',days:328,ghi:3.0,bg:'#FFF3E0',tc:'#E65100'},
    {label:'80% of days (P80)',days:292,ghi:4.1,bg:'#FFFDE7',tc:'#F57F17'},
    {label:'70% of days',      days:255,ghi:5.0,bg:'#F3F8FF',tc:'#1565C0'},
    {label:'50% of days (median)',days:182,ghi:5.3,bg:'#E8F5E9',tc:'#1B5E20'},
    {label:'Top 20% of days',  days:73, ghi:5.9,bg:'#E8F5E9',tc:'#1B5E20'},
  ];

  const sizeRows = PANEL_COUNTS.map(n=>{
    const s = kwOf(n);
    const r = calcAnnual(s,realLoad,rate,imp,fixed,pr);
    const w = calcAnnual(s,worstLoad,rate,imp,fixed,pr);
    const c = calcAnnual(s,customLoad,rate,imp,fixed,pr);
    return{s,panels:n,annGen:r.annGen,rBill:r.netBill,wBill:w.netBill,cBill:c.netBill,fixedAnn:r.fixedAnn};
  });

  return(
    <div style={{padding:'1rem 1.2rem',fontFamily:'Arial,sans-serif',fontSize:13,maxWidth:900,margin:'0 auto'}}>

      {/* Title */}
      <div style={{background:'#1F3864',borderRadius:12,padding:'1rem 1.4rem',marginBottom:'1.25rem',color:'white'}}>
        <h1 style={{fontSize:16,fontWeight:700,margin:'0 0 4px'}}>🌞 Net Metering & Zero Bill Analysis — Bengaluru (1 Meter)</h1>
        <p style={{fontSize:11,margin:0,opacity:.8}}>BESCOM net metering · Export ₹{rate.toFixed(2)}/unit · Import ₹{imp.toFixed(2)}/unit · Fixed ₹{fixed}/kW/month · {panelWStr} W panels · Single meter for entire building</p>
      </div>

      {/* Settings — everything below updates from these */}
      <div style={{background:'#f9f9f9',borderRadius:12,padding:'0.8rem 1rem',marginBottom:'0.9rem',display:'flex',flexDirection:'column',gap:12}}>
        <div style={{display:'flex',flexWrap:'wrap',gap:14,alignItems:'flex-end'}}>
          <label style={labelStyle}>Export rate (option)
            <select value={rateSel} onChange={e=>setRateSel(e.target.value)} style={inputStyle}>
              {O.map((o,i)=><option key={i} value={i}>{o.name} — ₹{o.rate}/unit</option>)}
              {PRESETS.map(x=><option key={x.key} value={x.key}>{x.label}</option>)}
              <option value="custom">Custom…</option>
            </select>
          </label>
          {rateSel === 'custom' && (
            <label style={labelStyle}>Custom export rate
              <input type="number" step="0.01" min="0" value={customRate} onChange={e=>setCustomRate(e.target.value)} style={{...inputStyle,width:90}}/>
            </label>
          )}
          {rateSel==='p389' && panelKw>0 && <span style={{fontSize:11,color:'#8a5300',maxWidth:330}}>⚠️ ₹3.89 applies only to systems up to 10 kW ({Math.floor(10/panelKw+1e-9)} panels at {panelWStr} W). Larger arrays get the ₹3.11 / ₹2.34 rates, so rows above that are optimistic.</span>}
          <label style={labelStyle}>Import rate (₹/unit)
            <input type="number" step="0.01" min="0" value={impStr} onChange={e=>setImpStr(e.target.value)} style={{...inputStyle,width:90}}/>
          </label>
          <label style={labelStyle}>Fixed charge (₹/kW/month)
            <input type="number" step="1" min="0" value={fixedStr} onChange={e=>setFixedStr(e.target.value)} style={{...inputStyle,width:90}}/>
          </label>
          <label style={labelStyle}>Panel size (W)
            <input type="number" step="10" min="0" value={panelWStr} onChange={e=>setPanelWStr(e.target.value)} style={{...inputStyle,width:80}}/>
          </label>
          <label style={labelStyle}>Performance ratio
            <input type="number" step="0.01" min="0" max="1" value={prStr} onChange={e=>setPrStr(e.target.value)} style={{...inputStyle,width:80}}/>
          </label>
        </div>
        <div style={{display:'flex',flexWrap:'wrap',gap:14,alignItems:'flex-end'}}>
          <label style={labelStyle}>Realistic load (kWh/month)
            <input type="number" step="1" min="0" value={realStr} onChange={e=>setRealStr(e.target.value)} style={{...inputStyle,width:110}}/>
          </label>
          <label style={labelStyle}>Worst-case load (kWh/month)
            <input type="number" step="1" min="0" value={worstStr} onChange={e=>setWorstStr(e.target.value)} style={{...inputStyle,width:110}}/>
          </label>
          <label style={labelStyle}>Custom load (kWh/month)
            <input type="number" step="1" min="0" value={customLoadStr} onChange={e=>setCustomLoadStr(e.target.value)} style={{...inputStyle,width:110}}/>
          </label>
        </div>
        <div style={{display:'flex',flexWrap:'wrap',gap:14,alignItems:'flex-end'}}>
          {[['price','Non-DCR cost (₹/W)',90],['prem','DCR premium (%)',80],['sub','Subsidy (₹)',90],['rN','Export: Non-DCR',100],['rD','Export: DCR no subsidy',120],['rS','Export: DCR + subsidy',120],['tol','"Zero" bill if ≤ ₹',90],['degr','Degradation %/yr',90]].map(([k,lab,w])=>(
            <label key={k} style={labelStyle}>{lab}
              <input type="number" step="any" min="0" value={s[k]} onChange={e=>setS({...s,[k]:e.target.value})} style={{...inputStyle,width:w}}/>
            </label>))}
          <label style={labelStyle}>Total load: extra kWh/mo
            <input type="number" step="1" min="0" value={extraStr} onChange={e=>setExtraStr(e.target.value)} style={{...inputStyle,width:90}}/>
          </label>
          <label style={labelStyle}>AC usage level
            <select value={acR} onChange={e=>setAcR(+e.target.value)} style={inputStyle}>{['Low','Mid','High'].map((t,i)=><option key={t} value={i}>{t}</option>)}</select>
          </label>
        </div>
      </div>

      {/* Ratio + Fixed charges */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:10,marginBottom:'0.6rem'}}>
        {card('Import rate',`₹${imp.toFixed(2)} / unit`,'cost of 1 unit from grid','#FFEBEE','#B71C1C')}
        {card('Export rate',`₹${rate.toFixed(2)} / unit`,'earned per unit sent to grid','#E8F5E9','#1B5E20')}
        {card('Export to offset 1 import',rate>0?`${ratio.toFixed(2)} units`:'—',rate>0?`≈ ${ratio.toFixed(1)} units exported = 1 unit imported`:'set an export rate','#E3F2FD','#0D47A1')}
        {card('Fixed charge basis',`₹${fixed} / kW / mo`,`sanctioned load × ₹${fixed} × 12`,'#FFF8E1','#F57F17')}
      </div>

      <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:'1.25rem',fontSize:11.5,color:'#5d4400',background:'#FFF8E1',borderRadius:8,padding:'0.6rem 0.8rem'}}>
        <span><strong>Note:</strong> BESCOM caps solar capacity at your sanctioned/contracted load — so sanctioned load = solar array size here. A {kw} kW array ({panels} panels) needs {kw} kW sanctioned load → fixed charge ₹{(fixed*kw*12).toLocaleString()}/year. Bigger array = bigger sanction = bigger fixed charge, baked into every row below.</span>
      </div>

      {/* Monthly chart */}
      <div style={{background:'#f9f9f9',borderRadius:12,padding:'1rem',marginBottom:'1.25rem'}}>
        <div style={{display:'flex',flexWrap:'wrap',gap:8,alignItems:'center',marginBottom:'0.75rem'}}>
          <h2 style={{fontSize:14,fontWeight:600,margin:0,flex:1}}>Monthly Generation vs Consumption</h2>
          <select value={panels} onChange={e=>setPanels(+e.target.value)} style={inputStyle}>
            {PANEL_COUNTS.map(n=><option key={n} value={n}>{n} panels ({kwOf(n)} kW)</option>)}
          </select>
          <select value={loadSel} onChange={e=>setLoadSel(+e.target.value)} style={inputStyle}>
            {loadList.map(([lab,L],i)=><option key={i} value={i}>{lab} — {avg(L)} kWh/mo{Array.isArray(L)?' avg':''}</option>)}
          </select>
          <select value={acR} onChange={e=>setAcR(+e.target.value)} style={inputStyle} title="Applies to the AC loads">
            {['Low','Mid','High'].map((t,i)=><option key={t} value={i}>AC usage: {t}</option>)}
          </select>
        </div>

        <ResponsiveContainer width="100%" height={250}>
          <ComposedChart data={data.monthly} margin={{top:8,right:10,left:0,bottom:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee"/>
            <XAxis dataKey="month" tick={{fontSize:11}}/>
            <YAxis tick={{fontSize:11}} unit=" kWh"/>
            <Tooltip content={<CustomTooltip/>}/>
            <Bar dataKey="gen"    name="Generation"    fill="#2a78d6" radius={[3,3,0,0]}/>
            <Bar dataKey="export" name="Export surplus" fill="#1baf7a" radius={[3,3,0,0]}/>
            <Bar dataKey="import" name="Import deficit" fill="#e34948" radius={[3,3,0,0]}/>
            <Line dataKey="load" name="Consumption" stroke="#333" strokeWidth={2} strokeDasharray="6 3" dot={{r:3}} type="monotone"/>
          </ComposedChart>
        </ResponsiveContainer>

        <div style={{display:'flex',gap:14,marginTop:8,flexWrap:'wrap',fontSize:11,color:'#666'}}>
          {[['#2a78d6','Monthly generation'],['#1baf7a','Export surplus (credit)'],['#e34948','Import deficit (cost)'],['#333','Monthly consumption (line)']].map(([c,l])=>(
            <span key={l} style={{display:'flex',alignItems:'center',gap:4}}>
              <span style={{width:10,height:10,borderRadius:2,background:c,display:'inline-block'}}/>
              {l}
            </span>
          ))}
        </div>

        {/* Financial cards */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:10,marginTop:'0.75rem'}}>
          {card('Annual export',`${data.expKwh.toLocaleString()} kWh`,`₹${data.expCredit.toLocaleString()} credit @ ₹${rate.toFixed(2)}`,'#E8F5E9','#1B5E20')}
          {card('Annual import',`${data.impKwh.toLocaleString()} kWh`,`₹${data.impCost.toLocaleString()} cost @ ₹${imp.toFixed(2)}`,data.impKwh>0?'#FFEBEE':'#E8F5E9',data.impKwh>0?'#B71C1C':'#1B5E20')}
          {card('Fixed charges',`₹${data.fixedAnn.toLocaleString()}`,`${sanc} kW × ₹${fixed} × 12 months`,'#FFF8E1','#F57F17')}
          {card('Net annual bill',
            data.netBill<=0?`−₹${Math.abs(data.netBill).toLocaleString()} credit`:`₹${data.netBill.toLocaleString()} bill`,
            isZero?'✅ Zero bill achieved':'❌ Increase system size',
            isZero?'#E8F5E9':'#FFEBEE',
            isZero?'#1B5E20':'#B71C1C')}
        </div>
      </div>

      {/* Sizing table */}
      <div style={{marginBottom:'1.25rem'}}>
        <h2 style={{fontSize:14,fontWeight:600,marginBottom:'0.25rem'}}>System Sizing for Zero Annual Bill (export ₹{rate.toFixed(2)}/unit)</h2>
        <p style={{fontSize:11,color:'#666',margin:'0 0 0.5rem'}}>Verdict and ⭐ use the realistic and worst-case loads. The custom-load column is for your own scenario.</p>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead>
              <tr style={{background:'#1F3864',color:'white'}}>
                {['Array = Sanctioned Load','Fixed Charge/yr','Annual Gen (kWh)',`Realistic Bill (${realLoad})`,`Worst Case Bill (${worstLoad})`,`Custom Bill (${customLoad})`,'Verdict'].map(h=>(
                  <th key={h} style={{padding:'8px 10px',textAlign:h==='Array = Sanctioned Load'||h==='Verdict'?'left':'center',fontWeight:500}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sizeRows.map((r,i)=>{
                const rOk=r.rBill<=tol, wOk=r.wBill<=tol;
                const recIdx = sizeRows.findIndex(x=>x.wBill<=tol);
                const isRec = i===recIdx;
                return(
                  <tr key={i} style={{background:isRec?'#E8F5E9':i%2===0?'#f9f9f9':'white',borderBottom:'1px solid #eee'}}>
                    <td style={{padding:'8px 10px',fontWeight:isRec?700:400}}>{r.panels} panels · {r.s} kW {isRec?'⭐':''}</td>
                    <td style={{padding:'8px 10px',textAlign:'center',color:'#854F0B'}}>₹{r.fixedAnn.toLocaleString()}</td>
                    <td style={{padding:'8px 10px',textAlign:'center'}}>{r.annGen.toLocaleString()}</td>
                    {billCell(r.rBill,tol)}
                    {billCell(r.wBill,tol)}
                    {billCell(r.cBill,tol)}
                    <td style={{padding:'8px 10px',fontWeight:500,color:rOk&&wOk?'#1B5E20':rOk?'#E65100':'#B71C1C'}}>
                      {rOk&&wOk?'✅ Covers both':rOk?'⚠️ Realistic only':'❌ Too small'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* P80/P90 table */}
      <div style={{marginBottom:'1.25rem'}}>
        <h2 style={{fontSize:14,fontWeight:600,marginBottom:4}}>Good Days vs Bad Days — P-Value Generation ({kw} kW system)</h2>
        <p style={{fontSize:11,color:'#666',marginBottom:'0.75rem'}}>
          <strong>Reading:</strong> "On X% of all 365 days, the {kw} kW system generates AT LEAST this many units."
          Export credits from excellent days offset imports on monsoon days.
        </p>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead>
              <tr style={{background:'#1F3864',color:'white'}}>
                {['Day type','Days/year ≥ this','Min GHI','Min gen (kWh)',`vs Realistic ${(realLoad/30).toFixed(1)}`,`vs Worst ${(worstLoad/30).toFixed(1)}`,'Typical period'].map(h=>(
                  <th key={h} style={{padding:'8px 10px',textAlign:h==='Day type'||h==='Typical period'?'left':'center',fontWeight:500}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pRows.map((r,i)=>{
                const gen=+(r.ghi*kw*pr).toFixed(1);
                const vsR=+(gen-realLoad/30).toFixed(1), vsW=+(gen-worstLoad/30).toFixed(1);
                return(
                  <tr key={i} style={{background:r.bg,borderBottom:'1px solid #ddd'}}>
                    <td style={{padding:'8px 10px',fontWeight:600,color:r.tc}}>{r.label}</td>
                    <td style={{padding:'8px 10px',textAlign:'center'}}>{r.days}</td>
                    <td style={{padding:'8px 10px',textAlign:'center'}}>{r.ghi}</td>
                    <td style={{padding:'8px 10px',textAlign:'center',fontWeight:700}}>{gen}</td>
                    <td style={{padding:'8px 10px',textAlign:'center',fontWeight:600,color:vsR>=0?'#1B5E20':'#B71C1C'}}>{vsR>=0?`+${vsR}`:vsR}</td>
                    <td style={{padding:'8px 10px',textAlign:'center',fontWeight:600,color:vsW>=0?'#1B5E20':'#B71C1C'}}>{vsW>=0?`+${vsW}`:vsW}</td>
                    <td style={{padding:'8px 10px',color:'#555',fontSize:11}}>{['Absolute worst — heavy monsoon','Monsoon — mostly cloudy','Light monsoon / transition','Oct–Nov shoulder months','Average day — good season','Best season — Jan to May'][i]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recommendation boxes */}
      <h2 style={{fontSize:14,fontWeight:600,marginBottom:'0.25rem'}}>Sizing Recommendation — Array Size = Sanctioned Load</h2>
      <p style={{fontSize:11,color:'#666',marginBottom:'0.75rem'}}>Each row's fixed charge is locked to that row's array size (BESCOM rule: solar ≤ sanctioned load). Bigger array → bigger sanction → bigger fixed charge, but also more generation to offset it.</p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(185px,1fr))',gap:12}}>
        {(()=>{
          const real = sizeRows.find(r=>r.rBill<=tol);
          const worst = sizeRows.find(r=>r.wBill<=tol);
          const cust = sizeRows.find(r=>r.cBill<=tol);
          const detail = (r,bill) => `Fixed charge ₹${r.fixedAnn.toLocaleString()}/yr\nAnnual gen ${r.annGen.toLocaleString()} kWh\n${bill<=0?'Credit':'Bill'}: ₹${Math.abs(bill).toLocaleString()}/yr`;
          const tooSmall = 'Needs larger system than shown';
          return [
            {title:`Min size — Realistic (${realLoad})`,size:real?`${real.s} kW`:`>${maxKw} kW`,panels:real?`${real.panels} panels`:'—',
             desc:real?detail(real,real.rBill):tooSmall,color:'#1baf7a',bg:'#E8F5E9'},
            {title:`Min size — Worst case (${worstLoad})`,size:worst?`${worst.s} kW`:`>${maxKw} kW`,panels:worst?`${worst.panels} panels`:'—',
             desc:worst?detail(worst,worst.wBill):tooSmall,color:'#F57F17',bg:'#FFFDE7'},
            {title:`Min size — Custom (${customLoad})`,size:cust?`${cust.s} kW`:`>${maxKw} kW`,panels:cust?`${cust.panels} panels`:'—',
             desc:cust?detail(cust,cust.cBill):tooSmall,color:'#6A1B9A',bg:'#F3E5F5'},
            {title:'Current selection',size:`${kw} kW`,panels:`${panels} panels`,
             desc:rate>0?`Fixed charge ₹${data.fixedAnn.toLocaleString()}/yr\n= ${Math.round(data.fixedAnn/rate).toLocaleString()} units export\njust to cover fixed charges`:`Fixed charge ₹${data.fixedAnn.toLocaleString()}/yr`,
             color:'#B71C1C',bg:'#FFEBEE'},
            {title:'⭐ Recommended — 1 Meter',size:worst?`${worst.s} kW`:`${maxKw}+ kW`,panels:worst?`${worst.panels} panels × ${panelWStr}W`:'—',
             desc:'Smallest array that zeroes\nbill for BOTH realistic and\nworst-case load — self-consistent\nwith its own sanctioned load',
             color:'#0D47A1',bg:'#E3F2FD'},
          ];
        })().map((r,i)=>(
          <div key={i} style={{background:r.bg,borderRadius:12,padding:'1rem',borderLeft:`3px solid ${r.color}`}}>
            <p style={{fontSize:10,fontWeight:700,color:r.color,margin:'0 0 6px',textTransform:'uppercase',letterSpacing:.5}}>{r.title}</p>
            <p style={{fontSize:22,fontWeight:600,color:'#1a1a1a',margin:'0 0 2px'}}>{r.size}</p>
            <p style={{fontSize:11,color:'#555',margin:'0 0 8px'}}>{r.panels}</p>
            <p style={{fontSize:11,color:'#444',margin:0,whiteSpace:'pre-line',lineHeight:1.65}}>{r.desc}</p>
          </div>
        ))}
      </div>

      <div style={{background:'#FFF8E1',borderRadius:10,padding:'0.9rem 1rem',marginTop:'1.25rem',fontSize:11.5,color:'#5d4400',lineHeight:1.7}}>
        <strong>Why this is self-limiting:</strong> Going bigger doesn't purely help — each extra kW adds ₹{(fixed*12).toLocaleString()}/year in fixed charges ({fixed} × 12) but also adds ~{Math.round(annPerKw)} kWh/year of generation (~₹{Math.round(annPerKw*rate).toLocaleString()} of export credit at the margin at ₹{rate.toFixed(2)}/unit, once base load is covered). The sanctioned load increase itself is a real recurring cost, which is why "just oversize it" isn't free under this BESCOM rule.
      </div>

      <OptionCompare imp={imp} fixed={fixed} pr={pr} panelKw={panelKw} loadList={loadList} ld={loadSel} setLd={setLoadSel} O={O} tol={tol} degr={degr} mine={{panels,kw,rate,opt:(rateSel==='custom'||preset)?null:+rateSel}}/>

    </div>
  );
}
