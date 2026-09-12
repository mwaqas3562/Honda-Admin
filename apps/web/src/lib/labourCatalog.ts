/**
 * Default labour catalog — predefined service items with rates.
 * User ticks items on the Issue Job screen; ticked items roll up into laborAmount.
 */
export type LabourItem = { code: string; name: string; rate: number };

export const LABOUR_CATALOG: LabourItem[] = [
  { code: "BWLC",       name: "BATTERY WATER LEVEL + CHARGING", rate: 100 },
  { code: "BWLC-CB150F",name: "BATTERY WATER LEVEL + CHARGING CB150F", rate: 100 },
  { code: "BODY",       name: "BODY LABOR", rate: 2000 },
  { code: "BRAKE-OIL",  name: "BRAKE OIL", rate: 150 },
  { code: "BRAKE-SHOE", name: "BRAKE SHOE FITTING", rate: 100 },
  { code: "CARB",       name: "CARBURATOR LABOR", rate: 100 },
  { code: "CHAIN-LOCK", name: "CHAIN LOCK LABOR", rate: 50 },
  { code: "CLUTCH-125", name: "CLUTCH OVERHALLING 125", rate: 500 },
  { code: "CLUTCH-150", name: "CLUTCH OVERHALLING 150", rate: 800 },
  { code: "CLUTCH-70",  name: "CLUTCH OVERHALLING 70", rate: 500 },
  { code: "CLUTCH-CB150F", name: "CLUTCH OVERHALLING CB150F", rate: 800 },
  { code: "CMP-MUD",    name: "COMPOUND MUDGUARD", rate: 250 },
  { code: "CMP-RIM",    name: "COMPOUND RIM", rate: 150 },
  { code: "DISK",       name: "DISK LABOR", rate: 500 },
  { code: "DCF",        name: "DRIVE CHAIN FITTING", rate: 200 },
  { code: "DCF-CB150F", name: "DRIVE CHAIN FITTING CB150F", rate: 350 },
  { code: "DCF-DLX",    name: "DRIVE CHAIN FITTING DLX / CB125F", rate: 250 },
  { code: "ELEC",       name: "ELECTRICIAN LABOR", rate: 30 },
  { code: "ELEC-A",     name: "ELECTRICIAN LABOR A", rate: 50 },
  { code: "ELEC-B",     name: "ELECTRICIAN LABOR B", rate: 100 },
  { code: "ELEC-C",     name: "ELECTRICIAN LABOR C", rate: 150 },
  { code: "ELEC-D",     name: "ELECTRICIAN LABOR D", rate: 200 },
  { code: "ELEC-E",     name: "ELECTRICIAN LABOR E", rate: 350 },
  { code: "ENG-125",    name: "ENGINE OVERHALLING 125", rate: 2000 },
  { code: "ENG-150",    name: "ENGINE OVERHALLING 150", rate: 4000 },
  { code: "ENG-70",     name: "ENGINE OVERHALLING 70", rate: 2000 },
  { code: "TUNE-UP",    name: "TUNE UP", rate: 300 },
  { code: "OIL-CHANGE", name: "OIL CHANGE", rate: 100 },
  { code: "WHEEL-ALN",  name: "WHEEL ALIGNMENT", rate: 200 },
];
