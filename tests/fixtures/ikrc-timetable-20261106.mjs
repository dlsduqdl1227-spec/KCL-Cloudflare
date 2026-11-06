// Read from both pages of the supplied final timetable. Page 1's 2025 year is a
// typo: the title, Wednesday weekday and event year all identify 2026-11-11.
const roasting=[
 [['채협정','김영덕','이준영'],'13:40~','13:55~14:00','14:00~14:25','14:25~14:30'],
 [['양진호','정진영','김기출'],'14:15~','14:30~14:35','14:35~15:00','15:00~15:05'],
 [['이종현','배준기','김태민'],'14:50~','15:05~15:10','15:10~15:35','15:35~15:40'],
 [['유현석','양성현','김동현'],'15:25~','15:40~15:45','15:45~16:10','16:10~16:15']
];
const seed=[
 [['김기출','유현석'],['A','B'],'13:30~','13:45~13:50','13:50~14:15','14:15~14:20','14:20~14:35','10:00~10:25'],
 [['채협정','김영덕'],['C','D'],'13:55~','14:10~14:15','14:15~14:40','14:40~14:45','14:45~15:00','10:00~10:25'],
 [['김동현','김태민'],['A','B'],'14:20~','14:35~14:40','14:40~15:05','15:05~15:10','15:10~15:25','10:30~10:55'],
 [['이종현','배준기'],['C','D'],'14:45~','15:00~15:05','15:05~15:30','15:30~15:35','15:35~15:50','10:30~10:55'],
 [['정진영','이준영'],['A','B'],'15:10~','15:25~15:30','15:30~15:55','15:55~16:00','16:00~16:15','11:00~11:25'],
 [['양진호','양성현'],['C','D'],'15:35~','15:50~15:55','15:55~16:20','16:20~16:25','16:25~16:40','11:00~11:25']
];
const seeds=new Map(seed.flatMap(([names,stations,waitingTime,preparationTime,performanceTime,cleanupTime,judgingTime,rehearsalTime],group)=>names.map((name,i)=>[name,{date:'2026-11-12',order:group*2+i+1,group:String(group+1),station:stations[i],waitingTime,preparationTime,performanceTime,cleanupTime,judgingTime,rehearsalTime,location:'서울 코엑스 C홀 C-1 대회부스 (IKRC 대회장)'}])));
export const ikrcFinalTimetable=roasting.flatMap(([names,waitingTime,preparationTime,performanceTime,cleanupTime],group)=>names.map((name,i)=>({name,schedule:{date:'2026-11-11',order:group*3+i+1,group:String(group+1),station:['A','B','C'][i],waitingTime,preparationTime,performanceTime,cleanupTime,location:'서울 코엑스 C홀 C-2 대회부스 (KBC 심사 백스테이지)',seedToCup:seeds.get(name)}})));
