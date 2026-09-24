let currentRole = 'admin';
let currentPage = 'machines';
let machineFilters = { client: '', device: '' };
let rawDataFilters = { client: '', device: '', start: '', end: '' };
let rawDataPage = 1;
const RAW_DATA_PAGE_SIZE = 30;
let alertFilters = { client: '', machine: '' };
let apiFilters = { client: '', machine: '' };
let machineThresholds = {};
let alertNotifications = [];
const GOOGLE_MAPS_API_KEY = '';
let locationsMap = null;
let googleMapsLoading = null;

const navItems = {
  admin: [
    {id:'machines',label:'Machines',icon:'⚙️'},
    {id:'locations',label:'Locations',icon:'📍'},
    {id:'graphs',label:'Graphs',icon:'📊'},
    {id:'raw-data',label:'Raw Data',icon:'📋'},
    {id:'reports',label:'Report Generation',icon:'📄'},
    {id:'clients',label:'Clients',icon:'🏢'},
    {id:'users',label:'Users',icon:'👥'},
    {id:'alerts',label:'Alerts',icon:'🚨'},
    {id:'system',label:'System Settings',icon:'🔧'},
    {id:'logs',label:'Logs',icon:'📝'},
    {id:'api',label:'API / Data Sources',icon:'🔌'}
  ],
  'client-admin': [
    {id:'machines',label:'Machines',icon:'⚙️'},
    {id:'locations',label:'Locations',icon:'📍'},
    {id:'graphs',label:'Graphs',icon:'📊'},
    {id:'raw-data',label:'Raw Data',icon:'📋'},
    {id:'reports',label:'Report Generation',icon:'📄'},
    {id:'users',label:'Users',icon:'👥'},
    {id:'alerts',label:'Alerts',icon:'🚨'},
    {id:'account',label:'Account / Settings',icon:'👤'}
  ],
  user: [
    {id:'machines',label:'Machines',icon:'⚙️'},
    {id:'locations',label:'Locations',icon:'📍'},
    {id:'graphs',label:'Graphs',icon:'📊'},
    {id:'raw-data',label:'Raw Data',icon:'📋'},
    {id:'reports',label:'Report Generation',icon:'📄'},
    {id:'alerts',label:'Alerts',icon:'🚨'},
    {id:'account',label:'Account / Settings',icon:'👤'}
  ]
};
