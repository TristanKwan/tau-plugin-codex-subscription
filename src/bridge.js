import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const base = "https://chatgpt.com/backend-api/codex";
function invalid(message,status=400) { return Object.assign(Error(message),{status}); }
function json(res,status,data) {
  res.writeHead(status,{"Content-Type":"application/json","Cache-Control":"no-store"});
  res.end(JSON.stringify(data));
}
function catalogModel(model) {
  const id=model.slug.trim();
  const label=[model.display_name,model.name].find(value=>typeof value==="string" && value.trim())?.trim();
  // Tau drops name when it equals id, but its model rows currently render
  // only name. Give otherwise unnamed models a distinct display label.
  const name=label && label!==id?label:"Codex · "+id;
  const positive=value=>Number.isSafeInteger(value) && value>0;
  const contextWindow=[model.context_window,model.max_context_window].find(positive)??32768;
  const maxTokens=Math.min(positive(model.max_output_tokens)?model.max_output_tokens:8192,contextWindow);
  const modalities=model.input_modalities?.filter(type=>type==="text" || type==="image");
  const input=modalities?.length?modalities:["text"];
  const reasoning=Array.isArray(model.supported_reasoning_levels) && model.supported_reasoning_levels.length>0;
  return {id,object:"model",owned_by:"openai",name,display_name:name,
    // Tau's service-model importer reads these OpenRouter/OpenAI extensions.
    context_window:contextWindow,max_output_tokens:maxTokens,
    architecture:{input_modalities:input},supported_parameters:reasoning?["reasoning"]:[],
    contextWindow,maxTokens,input,reasoning};
}
function convert(body) {
  if(!body || typeof body.model!=="string" || !Array.isArray(body.messages)) throw invalid("需要 model 和 messages");
  const input=[], instructions=[];
  for(const m of body.messages) {
    if(["system","developer"].includes(m.role)) {
      instructions.push(typeof m.content==="string"?m.content:m.content.map(p=>p.text).join("\n"));
    } else if(m.role==="tool") {
      input.push({type:"function_call_output",call_id:m.tool_call_id,output:typeof m.content==="string"?m.content:JSON.stringify(m.content)});
    } else if(["user","assistant"].includes(m.role)) {
      if(m.content) {
        const parts=typeof m.content==="string"?[{type:"text",text:m.content}]:m.content;
        input.push({role:m.role,content:parts.map(p=>{
          if(p.type==="image_url" && m.role==="user") return {type:"input_image",image_url:p.image_url.url};
          if(p.type!=="text") throw invalid("不支持的消息内容 "+p.type);
          return {type:m.role==="assistant"?"output_text":"input_text",text:p.text};
        })});
      }
      for(const call of m.tool_calls??[]) input.push({type:"function_call",call_id:call.id,name:call.function.name,arguments:call.function.arguments});
    } else throw invalid("不支持的角色");
  }
  return {model:body.model,input,instructions:instructions.join("\n\n")||"You are a helpful assistant.",stream:true,store:false,
    // Chat Completions defaults to non-strict tools. Responses may normalize
    // an omitted strict flag and require optional arguments such as cursor.
    tools:(body.tools??[]).map(t=>{if(t.type!=="function") throw invalid("不支持的工具"); return {type:"function",...t.function,strict:t.function.strict??false}}),
    tool_choice:typeof body.tool_choice==="object"?{type:"function",name:body.tool_choice.function.name}:body.tool_choice??"auto",
    ...(body.reasoning_effort?{reasoning:{effort:body.reasoning_effort}}:{})};
}
async function* events(body) {
  const reader=body.getReader(), decoder=new TextDecoder();
  let pending="", lines=[];
  try {
    while(true) {
      const {value,done}=await reader.read();
      pending+=done?decoder.decode():decoder.decode(value,{stream:true});
      let end;
      while((end=pending.indexOf("\n"))!==-1) {
        const line=pending.slice(0,end).replace(/\r$/,"");
        pending=pending.slice(end+1);
        if(line.startsWith("data:")) lines.push(line.slice(5).trimStart());
        if(!line && lines.length){const data=lines.join("\n");lines=[];if(data!=="[DONE]") yield JSON.parse(data);}
      }
      if(done) break;
    }
  } finally {
    // A completed response or client disconnect can abort the upstream before
    // it closes. Keep cancellation inside the reader's promise lifecycle;
    // readline otherwise emits an unhandled error after its iterator exits.
    await reader.cancel().catch(()=>{});
    reader.releaseLock();
  }
}
async function chat(req,res,headers,signal,request) {
  let size=0; const chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>32*1024*1024) throw invalid("请求超过 32 MiB",413);chunks.push(chunk);}
  let body;
  try{body=JSON.parse(Buffer.concat(chunks))}catch{throw invalid("JSON 无效")}
  const payload=convert(body);
  const upstream=await request(base+"/responses",{method:"POST",headers:{...headers,"Content-Type":"application/json",Accept:"text/event-stream"},body:JSON.stringify(payload),signal});
  if(!upstream.ok) throw invalid("Codex 请求失败 HTTP "+upstream.status,upstream.status);
  const meta={id:"chatcmpl-"+randomUUID(),model:body.model,created:Math.floor(Date.now()/1000)};
  const calls=[],indexes=new Map();
  let content="";
  function delta(value,finish=null,extra={}) {
    if(body.stream) res.write("data: "+JSON.stringify({...meta,object:"chat.completion.chunk",choices:[{index:0,delta:value,finish_reason:finish}],...extra})+"\n\n");
  }
  if(body.stream){res.writeHead(200,{"Content-Type":"text/event-stream","Cache-Control":"no-cache"});delta({role:"assistant"});}
  for await(const e of events(upstream.body)){
    if(e.type==="response.output_text.delta"){content+=e.delta;delta({content:e.delta});}
    if(e.type==="response.output_item.added" && e.item.type==="function_call"){
      const index=calls.length;
      indexes.set(e.output_index,index);
      const call={id:e.item.call_id,type:"function",function:{name:e.item.name,arguments:""}};
      calls.push(call);delta({tool_calls:[{index,...call}]});
    }
    if(e.type==="response.function_call_arguments.delta"){
      const index=indexes.get(e.output_index);
      calls[index].function.arguments+=e.delta;
      delta({tool_calls:[{index,function:{arguments:e.delta}}]});
    }
    if(e.type==="response.completed" || e.type==="response.incomplete"){
      const finish=e.type==="response.incomplete"?"length":calls.length?"tool_calls":"stop";
      const u=e.response?.usage;
      const usage=u?{prompt_tokens:u.input_tokens,completion_tokens:u.output_tokens,total_tokens:u.total_tokens}:undefined;
      if(body.stream){
        delta({},finish);
        if(body.stream_options?.include_usage && usage) res.write("data: "+JSON.stringify({...meta,object:"chat.completion.chunk",choices:[],usage})+"\n\n");
        res.end("data: [DONE]\n\n");
      }else json(res,200,{...meta,object:"chat.completion",choices:[{index:0,message:{role:"assistant",content:content||null,...(calls.length?{tool_calls:calls}:{})},finish_reason:finish}],usage});
      return;
    }
    if(["response.failed","error"].includes(e.type)) throw Error(e.response?.error?.message??e.message??"Codex 返回错误");
  }
  throw Error("Codex 流提前结束");
}
export function bridge(account,request=fetch) {
  return createServer(async(req,res)=>{
    const stop=new AbortController();
    res.once("close",()=>stop.abort());
    try{
      if(req.headers.authorization!=="Bearer "+account.key) throw invalid("本机 API Key 无效",401);
      if(req.url==="/v1/models" && req.method==="GET"){
        const r=await request(base+"/models?client_version=0.171.0",{headers:await account.headers(),signal:stop.signal});
        if(!r.ok) throw invalid("读取模型失败 HTTP "+r.status,r.status);
        const data=await r.json();
        json(res,200,{object:"list",data:data.models.filter(m=>typeof m.slug==="string" && m.slug.trim() && m.visibility!=="hide").map(catalogModel)});
      }else if(req.url==="/v1/chat/completions" && req.method==="POST"){
        await chat(req,res,await account.headers(),stop.signal,request);
      }else throw invalid("接口不存在",404);
    }catch(e){
      if(res.destroyed) return;
      const error={message:e.message,type:"codex_bridge_error"};
      if(res.headersSent) res.end("data: "+JSON.stringify({error})+"\n\n");
      else json(res,e.status??502,{error});
    }
  });
}
