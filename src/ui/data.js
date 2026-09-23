const devices = [
  {id:'KW-001',name:'Kitchen Waste Unit 001',client:'GreenCity Solutions Ltd',lat:22.3193,lng:114.1694,status:'online',lastUpdate:'2026-08-30 14:20:00',network:'5G',signal:85,ghgReduced:1247.5,wasteCollected:832.4,fertilizer:83.2,dailyWaste:45.2,dailyEnergy:12.4,avgTemp:28.5,containerTemp:42.1,humidity:67},
  {id:'KW-002',name:'Kitchen Waste Unit 002',client:'GreenCity Solutions Ltd',lat:22.3027,lng:114.1772,status:'running',lastUpdate:'2026-08-30 14:18:00',network:'NB-IoT',signal:62,ghgReduced:892.3,wasteCollected:594.9,fertilizer:59.5,dailyWaste:32.1,dailyEnergy:9.8,avgTemp:29.1,containerTemp:44.5,humidity:71},
  {id:'KW-003',name:'Kitchen Waste Unit 003',client:'Harbour View Hotel',lat:22.2856,lng:114.1577,status:'offline',lastUpdate:'2026-08-30 12:45:00',network:'4G',signal:0,ghgReduced:567.8,wasteCollected:378.5,fertilizer:37.9,dailyWaste:0,dailyEnergy:0,avgTemp:0,containerTemp:0,humidity:0},
  {id:'KW-004',name:'Kitchen Waste Unit 004',client:'Metro Mall Food Court',lat:22.3364,lng:114.1980,status:'standby',lastUpdate:'2026-08-30 14:15:00',network:'5G',signal:92,ghgReduced:2103.7,wasteCollected:1402.5,fertilizer:140.3,dailyWaste:78.5,dailyEnergy:18.2,avgTemp:27.8,containerTemp:39.6,humidity:64}
];

const rawDataRows = Array.from({length:15},(_,i)=>({
  recordedAt:'2026-08-30 ' + String(14-i).padStart(2,'0') + ':00:00',
  device:'KW-001',
  deviceState:i%3===0?'Running':i%3===1?'Standby':'Fermenting',
  operatingStatus:'Active',
  fermentState:'Phase ' + (i%4+1),
  feed:i%2===0?'Open':'Closed',
  shredder:'Running',
  mixingMotor:'Running',
  fan:'Auto',
  zipper:'Closed',
  weight:(42 + Math.random()*5).toFixed(1),
  temperature:(40 + Math.random()*8).toFixed(1),
  humidity:(60 + Math.random()*15).toFixed(1),
  energy:(12 + Math.random()*3).toFixed(2),
  solarPower:(3 + Math.random()*2).toFixed(2),
  co2:(400 + Math.random()*200).toFixed(0),
  no2:(0.05 + Math.random()*0.1).toFixed(3),
  h2s:(0.02 + Math.random()*0.08).toFixed(3),
  gps:'22.3193, 114.1694',
  network:'5G',
  signal:Math.floor(70 + Math.random()*25)
}));

const alerts = [
  {id:1,time:'2026-08-30 14:15:00',device:'KW-002',type:'CO₂ High',value:'942 ppm',threshold:'900 ppm',level:'Warning',status:'Pending',location:'Kwun Tong'},
  {id:2,time:'2026-08-30 13:40:00',device:'KW-003',type:'Device Offline',value:'>120 min',threshold:'30 min',level:'Critical',status:'Acknowledged',location:'Central'},
  {id:3,time:'2026-08-30 11:20:00',device:'KW-001',type:'H₂S High',value:'0.31 ppm',threshold:'0.25 ppm',level:'Warning',status:'Resolved',location:'Mong Kok'},
  {id:4,time:'2026-08-30 09:05:00',device:'KW-004',type:'Data Anomaly',value:'Temp 65.2°C',threshold:'55°C',level:'Info',status:'Pending',location:'Kowloon Bay'}
];
