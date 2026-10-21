// One-time compatibility for saved assessments and conversations on existing origins.
for(const [previous,current] of [['ttm-mindset-ux-v2','habi-app-v1'],['ttm-habi-v1','habi-chat-v1']]){
  try{if(localStorage.getItem(current)===null){const saved=localStorage.getItem(previous);if(saved!==null){JSON.parse(saved);localStorage.setItem(current,saved)}}}catch{}
}
