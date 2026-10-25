"""
SEED economy profiles (NOT observed data).

Approximate 2023 goods-trade totals (USD bn) and commodity mixes for 50 economies,
typed in from public summary statistics as a stand-in until build_trade_baci.py is
run on a real CEPII BACI download. Every output derived from this file is badged
SEED in the UI. Commodity share vectors are normalised in code.

Commodity order: crude, gas, refined, food, manuf, metals, chem, vehicles
  crude    HS 2709            crude petroleum
  gas      HS 2711            LNG / natural gas (incl. LPG)
  refined  HS 2710            refined fuels
  food     HS 01-24           grain, oilseeds & food
  manuf    HS 39-40,42-71,84-86,88-97  containers / manufactured goods (residual)
  metals   HS 2601-2704,72-81 metals, ores & coal
  chem     HS 28-38           chemicals & fertilisers
  vehicles HS 87              vehicles & parts

ports:  share of the economy's seaborne trade handled at each network port node.
eports: override for energy (crude, gas, refined); bports: override for bulk (food, metals).
bypass: capacity-limited alternative outlets usable only when the main path is disrupted
        (e.g. Saudi East-West pipeline to Yanbu, UAE Habshan-Fujairah pipeline).
"""
C = {
 'CHN': dict(n='China', x=3380, m=2560, xs=[0,0,1.5,2.5,79,5.5,7,5], ms=[13,3.5,1.5,9,43,18,8,1],
             ports={'P_SHANGHAI':.55,'P_SHENZHEN':.45}),
 'USA': dict(n='United States', x=2020, m=3170, xs=[6,2.5,6,8,58,5,12,4.5], ms=[6,.3,2.5,6,62,4,10,9.2],
             ports={'P_NEWYORK':.42,'P_HOUSTON':.23,'P_LOSANGELES':.35},
             eports={'P_HOUSTON':.85,'P_NEWYORK':.1,'P_LOSANGELES':.05},
             bports={'P_HOUSTON':.55,'P_LOSANGELES':.3,'P_NEWYORK':.15}),
 'DEU': dict(n='Germany', x=1690, m=1460, xs=[0,.3,1.5,5,62,4,14,13], ms=[4,3,3,7,60,7,11,5], ports={'P_HAMBURG':1}),
 'JPN': dict(n='Japan', x=717, m=786, xs=[0,0,2,1.5,62,8,10,16.5], ms=[10.5,7.5,4,9,49,11,7,2], ports={'P_YOKOHAMA':1}),
 'KOR': dict(n='South Korea', x=632, m=642, xs=[0,0,8,2,64,7,11,8], ms=[13,8,4,6,45,13,8,3], ports={'P_BUSAN':1}),
 'NLD': dict(n='Netherlands', x=935, m=840, xs=[1,3,10,11,52,5,14,4], ms=[7,4,7,8,54,5,11,4], ports={'P_ROTTERDAM':1}),
 'FRA': dict(n='France', x=648, m=787, xs=[0,.5,2,12,55,4,17,9.5], ms=[5,3,4,8,57,5,12,6],
             ports={'P_LEHAVRE':.55,'P_MARSEILLE':.45}, eports={'P_MARSEILLE':.55,'P_LEHAVRE':.45}),
 'ITA': dict(n='Italy', x=677, m=639, xs=[0,0,3,8,64,6,13,6], ms=[7,5,3,8,55,8,11,3], ports={'P_GENOA':1}),
 'GBR': dict(n='United Kingdom', x=521, m=791, xs=[5,1,3,5,62,8,12,4], ms=[4,3,4,8,61,6,10,4], ports={'P_FELIXSTOWE':1}),
 'BEL': dict(n='Belgium', x=560, m=530, xs=[0,2,6,9,40,6,30,7], ms=[3,3,6,8,45,7,22,6], ports={'P_ANTWERP':1}),
 'IND': dict(n='India', x=432, m=672, xs=[0,0,19,10,46,8,14,3], ms=[21,3,4,5,40,12,9,1],
             ports={'P_MUMBAI':.6,'P_CHENNAI':.4}, eports={'P_MUMBAI':.7,'P_CHENNAI':.3}),
 'CAN': dict(n='Canada', x=569, m=570, xs=[20,3,5,10,30,13,7,12], ms=[2,.5,3,8,65,5,8,8.5],
             ports={'P_VANCOUVER':.5,'P_HALIFAX':.5}, eports={'P_VANCOUVER':.6,'P_HALIFAX':.4}),
 'MEX': dict(n='Mexico', x=593, m=599, xs=[5,0,1,6,66,4,3,15], ms=[1,3,8,5,66,4,8,5], ports={'P_VERACRUZ':.5,'P_MANZANILLO':.5}),
 'SGP': dict(n='Singapore', x=476, m=423, xs=[0,0,15,2,62,2,13,1], ms=[12,2,12,2,58,3,9,2], ports={'P_SINGAPORE':1}),
 'TWN': dict(n='Taiwan', x=432, m=352, xs=[0,0,3,1,86,4,5,1], ms=[9,5,2,4,62,7,8,3], ports={'P_KAOHSIUNG':1}),
 'ESP': dict(n='Spain', x=423, m=474, xs=[0,0,6,17,47,5,13,12], ms=[9,4,4,8,53,5,11,6], ports={'P_ALGECIRAS':1}),
 'RUS': dict(n='Russia', x=425, m=290, xs=[34,9,22,9,6,13,6,1], ms=[0,0,1,9,68,4,10,8],
             ports={'P_USTLUGA':.35,'P_NOVOROSSIYSK':.35,'P_VLADIVOSTOK':.3},
             eports={'P_USTLUGA':.38,'P_NOVOROSSIYSK':.37,'P_VLADIVOSTOK':.25}),
 'SAU': dict(n='Saudi Arabia', x=322, m=215, xs=[64,0,13,1,4,3,14,.5], ms=[0,0,4,12,62,7,7,8],
             ports={'P_RASTANURA':.4,'P_REDSEA_SA':.6}, eports={'P_RASTANURA':.88,'P_REDSEA_SA':.12},
             bypass=[dict(frm='P_RASTANURA', to='P_REDSEA_SA', cap={'crude':.45,'refined':.3,'*':.2},
                          note='East-West pipeline to Yanbu + overland to Jeddah')]),
 'ARE': dict(n='United Arab Emirates', x=488, m=400, xs=[26,1,8,3,45,13,4,0], ms=[0,0,6,6,70,10,5,3],
             ports={'P_JEBELALI':.75,'P_FUJAIRAH':.25}, eports={'P_JEBELALI':.55,'P_FUJAIRAH':.45},
             bypass=[dict(frm='P_JEBELALI', to='P_FUJAIRAH', cap={'crude':.45,'refined':.4,'*':.35},
                          note='Habshan-Fujairah pipeline + Khor Fakkan transshipment')]),
 'IRQ': dict(n='Iraq', x=100, m=70, xs=[96,0,2,0,1,1,0,0], ms=[0,0,15,15,55,5,5,5], ports={'P_BASRA':1}),
 'KWT': dict(n='Kuwait', x=85, m=35, xs=[80,0,15,0,2,0,3,0], ms=[0,0,2,15,65,5,5,8], ports={'P_KUWAIT':1}),
 'QAT': dict(n='Qatar', x=98, m=32, xs=[18,57,12,0,2,1,10,0], ms=[0,0,2,15,63,8,6,6], ports={'P_RASLAFFAN':1}),
 'IRN': dict(n='Iran', x=90, m=70, xs=[55,3,10,4,6,7,15,0], ms=[0,0,3,20,55,7,10,5], ports={'P_KHARG':1},
             bypass=[dict(frm='P_KHARG', to='P_JASK', cap={'crude':.05,'*':.1}, note='Goreh-Jask pipeline (limited)')]),
 'OMN': dict(n='Oman', x=55, m=32, xs=[55,15,10,3,8,5,4,0], ms=[0,0,8,15,57,8,6,6], ports={'P_SOHAR':1}),
 'ISR': dict(n='Israel', x=70, m=92, xs=[0,1,1,3,75,3,17,0], ms=[4,0,3,8,65,5,8,7], ports={'P_HAIFA':1}),
 'EGY': dict(n='Egypt', x=40, m=80, xs=[5,8,10,25,30,7,15,0], ms=[5,2,10,22,45,6,8,2], ports={'P_PORTSAID':.65,'P_SOKHNA':.35}),
 'TUR': dict(n='Türkiye', x=256, m=362, xs=[0,0,4,12,58,10,8,8], ms=[6,7,5,5,48,18,9,2], ports={'P_AMBARLI':.6,'P_MERSIN':.4}),
 'POL': dict(n='Poland', x=380, m=362, xs=[0,0,3,15,62,5,8,7], ms=[6,2,4,7,60,5,11,5], ports={'P_GDANSK':1}),
 'NOR': dict(n='Norway', x=175, m=95, xs=[30,10,5,8,10,6,3,0], ms=[2,0,4,8,62,8,8,8], ports={'P_MONGSTAD':1}),
 'GRC': dict(n='Greece', x=55, m=88, xs=[0,0,35,15,30,8,10,0], ms=[20,4,5,10,48,6,6,1], ports={'P_PIRAEUS':1}),
 'VNM': dict(n='Vietnam', x=355, m=327, xs=[0,0,1,8,86,2,2,1], ms=[3,1,3,7,68,8,8,2], ports={'P_CAIMEP':1}),
 'MYS': dict(n='Malaysia', x=312, m=266, xs=[3,5,10,7,62,4,8,1], ms=[5,1,13,6,58,6,8,3], ports={'P_KLANG':1}),
 'THA': dict(n='Thailand', x=285, m=290, xs=[0,0,3,15,62,3,8,9], ms=[12,3,3,5,58,8,8,3], ports={'P_LAEMCHABANG':1}),
 'IDN': dict(n='Indonesia', x=259, m=222, xs=[2,4,1,15,25,40,8,5], ms=[10,1,9,9,52,6,10,3], ports={'P_JAKARTA':1}),
 'PHL': dict(n='Philippines', x=74, m=126, xs=[0,0,1,8,82,6,2,1], ms=[7,1,9,10,55,8,7,3], ports={'P_MANILA':1}),
 'AUS': dict(n='Australia', x=371, m=288, xs=[3,13,1,13,6,60,2,.5], ms=[2,.5,11,6,62,3,8,8],
             ports={'P_NEWCASTLE':.65,'P_HEDLAND':.35}, eports={'P_HEDLAND':.6,'P_NEWCASTLE':.4},
             bports={'P_HEDLAND':.6,'P_NEWCASTLE':.4}),
 'NZL': dict(n='New Zealand', x=40, m=48, xs=[1,0,0,62,15,5,5,0], ms=[4,0,10,8,58,4,8,8], ports={'P_AUCKLAND':1}),
 'BRA': dict(n='Brazil', x=340, m=253, xs=[13,0,3,42,12,18,5,2], ms=[3,2,9,5,52,5,20,4], ports={'P_SANTOS':1}),
 'ARG': dict(n='Argentina', x=67, m=74, xs=[5,1,2,58,12,5,5,12], ms=[2,4,6,5,58,4,13,8], ports={'P_RIOPLATA':1}),
 'CHL': dict(n='Chile', x=95, m=80, xs=[0,0,0,30,5,60,5,0], ms=[8,3,9,8,52,3,8,9], ports={'P_SANANTONIO':1}),
 'PER': dict(n='Peru', x=67, m=50, xs=[1,5,2,28,6,55,3,0], ms=[8,1,6,10,55,4,9,7], ports={'P_CALLAO':1}),
 'COL': dict(n='Colombia', x=50, m=62, xs=[30,0,4,25,10,20,5,0], ms=[2,1,10,12,55,4,10,6], ports={'P_CARTAGENA':1}),
 'NGA': dict(n='Nigeria', x=60, m=52, xs=[80,8,2,4,2,1,3,0], ms=[0,0,20,15,50,4,8,3], ports={'P_LAGOS':1}),
 'AGO': dict(n='Angola', x=37, m=17, xs=[90,6,2,0,1,1,0,0], ms=[0,0,20,25,45,3,5,2], ports={'P_LUANDA':1}),
 'ZAF': dict(n='South Africa', x=110, m=108, xs=[0,0,3,12,20,48,6,11], ms=[13,1,10,7,52,4,10,4], ports={'P_DURBAN':1}),
 'MAR': dict(n='Morocco', x=43, m=58, xs=[0,0,0,20,35,8,25,12], ms=[8,4,12,12,50,5,6,3], ports={'P_TANGERMED':1}),
 'DZA': dict(n='Algeria', x=55, m=40, xs=[30,35,15,1,1,1,2,0], ms=[0,0,5,28,52,5,7,3], ports={'P_ARZEW':1}),
 'PAK': dict(n='Pakistan', x=28, m=55, xs=[0,0,1,25,65,2,6,1], ms=[12,7,15,12,38,6,8,2], ports={'P_KARACHI':1}),
 'BGD': dict(n='Bangladesh', x=55, m=70, xs=[0,0,0,3,96,0,1,0], ms=[5,3,8,15,55,6,6,2], ports={'P_CHITTAGONG':1}),
}

# Pairs whose trade moves overwhelmingly by land / pipeline / short-sea road links; removed
# AFTER bilateral allocation so they don't distort other partners.
EU_CONT = ['DEU','NLD','BEL','FRA','ITA','ESP','POL']
LAND_BLOCS = [EU_CONT, ['USA','CAN','MEX'], ['ARG','BRA','CHL'], ['SAU','ARE','KWT','QAT','IRQ','OMN'],
              ['IRN','IRQ','TUR'], ['MYS','SGP','THA'], ['IND','BGD','PAK'], ['ISR','EGY']]
EXTRA_LAND = [('CHN','VNM')]

# Affinity multipliers on the gravity seed (sanctions / strong bilateral ties).
WEST = ['USA','CAN','GBR','DEU','NLD','BEL','FRA','ITA','ESP','POL','GRC','NOR','JPN','KOR','AUS','NZL']
AFFINITY = {}
for w in WEST: AFFINITY[('IRN', w)] = AFFINITY[(w, 'IRN')] = 0.0
for w in WEST: AFFINITY[('RUS', w)] = AFFINITY[(w, 'RUS')] = 0.2
for p, f in [(('IRN','CHN'),3), (('RUS','CHN'),2), (('RUS','IND'),2.5), (('RUS','TUR'),2), (('IRN','IND'),0.05)]:
    AFFINITY[p] = AFFINITY[(p[1], p[0])] = f

# Energy-only affinities (crude, gas, refined): Gulf producers sell mostly to Asia; the US imports little
# Gulf oil since the shale boom.
GULF = ['SAU','ARE','KWT','QAT','IRQ','OMN','IRN']
EAST_ASIA = ['JPN','KOR','CHN','IND','TWN','SGP','THA','PAK','BGD','PHL','MYS','VNM','IDN']
ENERGY_AFFINITY = {}
for g in GULF:
    for a in EAST_ASIA: ENERGY_AFFINITY[(g, a)] = 2.5
    ENERGY_AFFINITY[(g, 'USA')] = 0.35

# Taiwan is not in the World Bank GDP file; IMF WEO 2023 estimate (SEED).
GDP_FALLBACK = {'TWN': (756.6e9, 2023, 'IMF WEO (seed)')}
