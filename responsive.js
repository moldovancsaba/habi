// One state machine, two renderers. Resizing never reloads or reinitialises the app.
const responsiveDesktopDraw=h2OriginalDraw,responsiveMobileDraw=draw;
const responsiveDesktopTitle=document.title;
let responsiveStarted=false,responsiveMode=null,responsiveFrame;
function responsiveWorkspace(){return {page,supportPage:supportPage?JSON.parse(JSON.stringify(supportPage)):null,monthlyPage:monthlyPage?JSON.parse(JSON.stringify(monthlyPage)):null,progressSection,progressChart,period,metric}}
function responsiveRemember(){const workspace=responsiveWorkspace();if(JSON.stringify(db.uiWorkspace)!==JSON.stringify(workspace)){db.uiWorkspace=workspace;save()}}
function responsiveRestore(){
 const old=h2State();
 if(!db.uiLayoutVersion){if(db.chatInput===undefined&&old.input)db.chatInput=old.input;db.uiLayoutVersion=1;save()}
 const workspace=db.uiWorkspace||old.workspace;
 if(workspace){h2Restore(workspace);if(['all','detail'].includes(workspace.progressChart))progressChart=workspace.progressChart;if([14,28,42].includes(workspace.period))period=workspace.period;if(Number.isInteger(workspace.metric)&&workspace.metric>=0&&workspace.metric<fields.length)metric=workspace.metric}
 h2Booted=true;
}
function responsiveResize(){cancelAnimationFrame(responsiveFrame);responsiveFrame=requestAnimationFrame(()=>{if(responsiveMode!==habiMobileLayout())draw()})}
draw=function(){
 if(!responsiveStarted){responsiveStarted=true;responsiveRestore();window.addEventListener('resize',responsiveResize)}
 const mobile=habiMobileLayout(),changed=responsiveMode!==null&&responsiveMode!==mobile;
 responsiveMode=mobile;habiApplyShell(mobile);
 habiScrollToReplies=mobile?function(){}:h2OriginalScroll;
 if(mobile){if(changed)h2LastKey='';responsiveMobileDraw()}
 else{cancelAnimationFrame(h2Frame);responsiveDesktopDraw();document.title=responsiveDesktopTitle;const overlay=h2InterruptionView();if(overlay)document.getElementById('app').innerHTML='<section class="habi-thread">'+overlay+'</section>';else if(['home','habi'].includes(page))document.getElementById('app').innerHTML+=h2ParkedView()}
 responsiveRemember();
};
