const HABI_KEY='habi-chat-v1';
const HABI_STARTERS=habiData("habi_HABI_STARTERS");
let habiSession;
try{habiSession=JSON.parse(localStorage.getItem(HABI_KEY))}catch{}
if(habiSession?.engine==='guided-v1'){if(typeof habiSession.opening!=='string'||!Array.isArray(habiSession.turns))habiSession=null}
else if(!habiSession||!Number.isInteger(habiSession.start)||habiSession.start<0||habiSession.start>2||!Array.isArray(habiSession.choices)||habiSession.choices.length>6||habiSession.choices.some((n,i)=>!Number.isInteger(n)||n<0||n>=(i===0?6:3))){habiSession=null}
function habiStore(){localStorage.setItem(HABI_KEY,JSON.stringify(habiSession));cloudSchedule()}
function habiBegin(){habiSession={start:Math.floor(Math.random()*HABI_STARTERS.length),choices:[]};habiStore()}
function habiRobot(){return '<svg class="habi-robot" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path class="habi-robot-line" d="M32 8V16M12 31H6V43H12M52 31H58V43H52"/><circle class="habi-robot-dot" cx="32" cy="7" r="4"/><rect class="habi-robot-face" x="12" y="16" width="40" height="38" rx="12"/><circle class="habi-robot-dot" cx="24" cy="32" r="4"/><circle class="habi-robot-dot" cx="40" cy="32" r="4"/><path class="habi-robot-line" d="M25 43Q32 48 39 43"/></svg>'}
function habiNode(choices){const theme=choices[0]??0;const themes=habiData("habi_themes");
if(choices.length===0)return {response:habiData("cdb6cf5443d29b327")[habiSession.start],question:habiText("cf6c8f68b36caa248"),options:habiData("c4cca2937317259c7")};
if(choices.length===1){const responses=habiData("habi_responses");return {response:responses[theme],question:habiText("c151cb9c15fd5691e"),options:theme===3?habiData("ce1384f8b62d5137d"):habiData("c384f5319f6a1ff72")}}
if(choices.length===2)return {response:habiData("c2777eab3e6d1fbed")[choices[1]],question:habiText("c6fb64ea90a4e8c8f"),options:habiData("c5cf4489993443e03")};
if(choices.length===3)return {response:habiData("c6f024fbbaa94d11f")[choices[2]],question:habiText("cc0c5b547221279a6"),options:habiData("c096e4c085f59e36a")};
if(choices.length===4)return {response:habiData("c9269b568dc604f33")[choices[3]],question:habiText("c1c79743fa452c9b3"),options:habiData("c19bb97a704998719")};
if(choices.length===5)return {response:habiData("c8931934f9e9f7863")[choices[4]],question:habiText("c9b63068ffe391f61"),options:habiData("ca5d2a4990324c525")};
return null}
function habiConclusion(){const c=habiSession.choices;const issue=habiData("cd9aff5d661c5d33d")[c[0]];const recipient=habiData("c665accba3d43f921")[c[4]];const request=habiData("c758e12fee00537d0")[c[5]];const action=habiData("c52e91ca2ad1cd69c")[c[3]];return {recipient,action,message:habiText("ca14d74a6c65584a9")+issue+'. '+request}}
function habiChoose(index){if(!habiSession)habiBegin();const node=habiNode(habiSession.choices);if(!node||!Number.isInteger(index)||index<0||index>=node.options.length)return;habiSession.choices.push(index);habiStore();draw()}
function habiRestart(){guidedReset()}
function habiLegacyView(){if(!habiSession)habiBegin();let html='<section class="card habi-header"><div class="habi-avatar">'+habiRobot()+habiText("cbd9c53f0918d33d3")+escapeHTML(HABI_STARTERS[habiSession.start])+'</p></div>';
for(let step=0;step<=habiSession.choices.length&&step<6;step++){const node=habiNode(habiSession.choices.slice(0,step));const current=step===habiSession.choices.length;html+='<div class="habi-message habi-assistant"><span class="habi-speaker">'+habiRobot()+habiText("c4c2439c159be9518")+escapeHTML(node.response)+'</p><p class="habi-question"'+(current?' id="habi-next" tabindex="-1"':'')+'>'+escapeHTML(node.question)+'</p></div>';if(!current)html+='<div class="habi-message habi-athlete"><span class="habi-speaker">Te</span><p>'+escapeHTML(node.options[habiSession.choices[step]])+'</p></div>';else html+=habiText("cf7ce6765b66572a0")+node.options.map((label,i)=>'<button class="btn habi-choice" onclick="habiChoose('+i+')">'+escapeHTML(label)+'</button>').join('')+'</div>'}
if(habiSession.choices.length===6){const end=habiConclusion();html+='<div class="habi-message habi-assistant" id="habi-next" tabindex="-1"><span class="habi-speaker">'+habiRobot()+habiText("c9e21aeb9a0523904")+escapeHTML(end.action)+'</p><p>Javaslom, hogy jelezd '+escapeHTML(end.recipient)+habiText("cf59d08d0d8179e58")+escapeHTML(end.message)+habiText("cebfe31f6a32cba83")}return html+'</section>'}

let habiScrollFrame;
function habiScrollToReplies(){cancelAnimationFrame(habiScrollFrame);habiScrollFrame=requestAnimationFrame(()=>{habiScrollFrame=requestAnimationFrame(()=>{if(page!=='habi')return;const question=document.getElementById('habi-next');const target=document.getElementById('habi-replies')||question;if(!target)return;question?.focus({preventScroll:true});const available=(window.visualViewport?.height||window.innerHeight)-parseFloat(getComputedStyle(target).scrollMarginBlockEnd||0);const block=target.getBoundingClientRect().height>available?'start':'end';target.scrollIntoView({block,inline:'nearest',behavior:'auto'})})})}

function habiView(){return !habiSession||habiSession.engine==='guided-v1'?guidedView():'<button class="back-link" onclick="guidedReset()">'+escapeHTML(gcLabel('new'))+'</button>'+habiLegacyView()}
