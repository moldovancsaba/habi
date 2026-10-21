// Descriptive observations from the same canonical daily records as the charts.
function trendDays(){const end=new Date();end.setHours(12,0,0,0);return Array.from({length:period},(_,i)=>{const d=new Date(end);d.setDate(d.getDate()-period+1+i);return {date:d.toLocaleDateString('hu-HU'),entry:dailyEntry(d.toLocaleDateString('hu-HU'))}})}
function metricTrend(k,days=trendDays()){
 const half=Math.floor(days.length/2),field=fields[k],points=days.map((d,i)=>({i,entry:d.entry,value:d.entry?actual(d.entry,field):null})).filter(p=>Number.isFinite(p.value));
 const before=points.filter(p=>p.i<half),after=points.filter(p=>p.i>=half),mean=arr=>arr.reduce((sum,p)=>sum+p.value,0)/arr.length;
 const enough=before.length>=habiData('runtime_defaults').trendMinimumDays&&after.length>=habiData('runtime_defaults').trendMinimumDays,delta=enough?mean(after)-mean(before):null,direction=delta===null?'unknown':delta>=habiData('runtime_defaults').trendDirectionDelta?'up':delta<=-habiData('runtime_defaults').trendDirectionDelta?'down':'similar';
 const recent=after.length>=3?after:points,repeated=recent.length>=3,low=recent.filter(p=>p.value<=2).length,high=recent.filter(p=>p.value>=3).length,attention=repeated&&(k===4?high:low)/recent.length>=.5;
 const titles=habiData("trends_titles");
 let title=direction==='unknown'?habiText("ca8274be89d16fe1b"):titles[k][direction==='up'?0:direction==='down'?1:2];
 const supportive=habiData("trends_supportive");
 let observation=points.length<3?habiText("c0531b59ac33377cc"):supportive[k][attention?1:0];
 const next=habiData("trends_next");
 const sustained=habiData("trends_sustained");
 const maintain=habiData("trends_maintain");
 const longTerm=points.length<3?habiText("cc47689cd10dcf512"):attention||direction==='down'&&k!==4||direction==='up'&&k===4?sustained[k]:maintain[k];
 const evidence={first:before.length,last:after.length,total:points.length,from:days[0].date,to:days.at(-1).date};
 return {k,title,observation,next:next[k],longTerm,direction,attention,enough,evidence,rank:attention?3:direction==='down'&&k!==4?2:direction!=='similar'&&direction!=='unknown'?1:0};
}
function trendOverview(){const days=trendDays(),trends=fields.map((_,k)=>metricTrend(k,days)),selected=[...trends].sort((a,b)=>b.rank-a.rank||a.k-b.k).slice(0,3);return '<section class="card trend-overview"><div class="habi-speaker">'+habiRobot()+habiText("c4cbd714589e7a80d")+selected.map(t=>'<div class="trend-summary"><h3>'+names[t.k]+'</h3><p>'+escapeHTML(t.title)+'</p><p>'+escapeHTML(t.observation)+'</p></div>').join('')+'</section>'}
function trendDetail(k){const t=metricTrend(k),e=t.evidence;return habiText("ceed0ef53acb916b3")+names[k]+'"><div class="habi-speaker">'+habiRobot()+habiText("c0dd632e0da53dc77")+escapeHTML(t.title)+'</h3><p>'+escapeHTML(t.observation)+habiText("c5cfbf24e864d7ed1")+escapeHTML(t.next)+habiText("c49de7484d317301a")+escapeHTML(t.longTerm)+'</p><button class="btn habi-choice" onclick="openPractice(\''+['pause','sleep','focus','pressure','pause'][k]+habiText("c272c0b724d743a6c")}
