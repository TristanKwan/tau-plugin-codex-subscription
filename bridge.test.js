import test from "node:test";
import assert from "node:assert/strict";
import {bridge} from "./src/bridge.js";
import {spawnSync} from "node:child_process";

test("tool conversion preserves Chat Completions' optional-argument semantics",async(t)=>{
  const parameters={type:"object",properties:{kind:{type:"string"},cursor:{type:"string"}},required:["kind"],additionalProperties:false};
  const tools=[undefined,false,true,null].map((strict,index)=>({type:"function",function:{name:"query_"+index,description:"query",parameters,...(strict===undefined?{}:{strict})}}));
  const server=bridge({key:"test",headers:async()=>({})},async(url,options)=>{
    const payload=JSON.parse(options.body);
    assert.deepEqual(payload.tools.map(tool=>tool.strict),[false,false,true,false]);
    for(const tool of payload.tools) assert.deepEqual(tool.parameters,parameters);
    return new Response('data: '+JSON.stringify({type:"response.completed",response:{}})+'\n\n');
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  t.after(()=>{server.close();server.closeAllConnections()});
  const response=await fetch("http://127.0.0.1:"+server.address().port+"/v1/chat/completions",{method:"POST",headers:{Authorization:"Bearer test"},body:JSON.stringify({model:"demo",messages:[],tools})});
  assert.equal(response.status,200);
  assert.equal((await response.json()).choices[0].finish_reason,"stop");
});

test("catalog exposes names and capability fields accepted by Tau's manual importer",async(t)=>{
  const server=bridge({key:"test",headers:async()=>({})},async()=>Response.json({models:[
    {slug:"demo",display_name:"demo",context_window:64000,max_output_tokens:16000,input_modalities:["text","image","audio"],supported_reasoning_levels:[{effort:"low"}]},
    {slug:"minimal"},
    {slug:"named",display_name:"Friendly name",max_context_window:4096,max_output_tokens:8192},
    {slug:"hidden",visibility:"hide"}
  ]}));
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  t.after(()=>{server.close();server.closeAllConnections()});
  const response=await fetch("http://127.0.0.1:"+server.address().port+"/v1/models",{headers:{Authorization:"Bearer test"}});
  const {data}=await response.json();
  assert.deepEqual(data.map(m=>m.id),["demo","minimal","named"]);
  for(const model of data) {
    // Tau prefers display_name/name, then omits name from saved settings if
    // it equals the ID. Its current model row renders only the saved name.
    const importedName=model.display_name??model.name??model.id;
    const savedName=importedName===model.id?undefined:importedName;
    assert.ok(savedName?.trim(),"manual import must retain a visible model name");
    assert.ok(model.context_window>0);
    assert.ok(model.max_output_tokens>0 && model.max_output_tokens<=model.context_window);
    assert.ok(model.architecture.input_modalities.includes("text"));
  }
  assert.equal(data[0].display_name,"Codex · demo");
  assert.equal(data[0].context_window,64000);
  assert.equal(data[0].max_output_tokens,16000);
  assert.deepEqual(data[0].architecture.input_modalities,["text","image"]);
  assert.deepEqual(data[0].supported_parameters,["reasoning"]);
  assert.equal(data[1].context_window,32768);
  assert.equal(data[1].max_output_tokens,8192);
  assert.deepEqual(data[1].supported_parameters,[]);
  assert.equal(data[2].display_name,"Friendly name");
  assert.equal(data[2].max_output_tokens,4096);
});

test("completion and client cancellation do not crash the backend process",()=>{
  const result=spawnSync(process.execPath,["--input-type=module","-e",`
    import assert from 'node:assert/strict';
    import {bridge} from ${JSON.stringify(new URL("./src/bridge.js",import.meta.url).href)};
    let cancelled=0;
    const server=bridge({key:'test',headers:async()=>({})},async(url,{signal})=>{
      return new Response(new ReadableStream({
        start(controller){
          signal.addEventListener('abort',()=>controller.error(signal.reason),{once:true});
          if(url.includes('/responses')) {
            const bytes=new TextEncoder().encode('data: '+JSON.stringify({type:'response.output_text.delta',delta:'完成'})+'\\r\\n\\r\\ndata: '+JSON.stringify({type:'response.completed',response:{}})+'\\n\\n');
            for(const byte of bytes) controller.enqueue(Uint8Array.of(byte));
          }
        },
        cancel(){cancelled++}
      }));
    });
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    try {
      const base='http://127.0.0.1:'+server.address().port;
      for(let i=0;i<3;i++) {
        const r=await fetch(base+'/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify({model:'demo',messages:[],stream:true})});
        assert.match(await r.text(),/完成/);
      }
      // Abort a catalog request while its upstream body remains open.
      const abort=new AbortController();
      const pending=fetch(base+'/v1/models',{headers:{Authorization:'Bearer test'},signal:abort.signal}).catch(()=>{});
      await new Promise(r=>setTimeout(r,50));
      abort.abort();
      await pending;
      await new Promise(r=>setTimeout(r,100));
      assert.ok(cancelled>=3);
    } finally {server.close();server.closeAllConnections()}
  `],{encoding:"utf8",timeout:10000});
  assert.equal(result.status,0,result.stderr || String(result.error));
});

test("Tau chat bridge: catalog, auth, streamed text and tool round trip",async(t)=>{
  const account={key:"test",headers:async()=>({Authorization:"Bearer upstream"})};
  const server=bridge(account,async(url,options)=>{
    assert.equal(options.headers.Authorization,"Bearer upstream");
    if(url.includes("/models?")) return Response.json({models:[{slug:"demo"}]});
    const body=JSON.parse(options.body);
    assert.equal(body.instructions,"system prompt");
    const result=body.input.find(i=>i.type==="function_call_output");
    if(result) assert.equal(result.output,"ok");
    const events=result?[{type:"response.output_text.delta",delta:"完成"}]:[
      {type:"response.output_item.added",output_index:2,item:{type:"function_call",name:"lookup",call_id:"abc"}},
      {type:"response.function_call_arguments.delta",output_index:2,delta:"{}"}];
    events.push({type:"response.completed",response:{usage:{input_tokens:1,output_tokens:2,total_tokens:3}}});
    return new Response(events.map(e=>"data: "+JSON.stringify(e)+"\n\n").join(""));
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  t.after(()=>{server.close();server.closeAllConnections()});
  const base="http://127.0.0.1:"+server.address().port+"/v1";
  const headers={Authorization:"Bearer test"};
  assert.equal((await fetch(base+"/models")).status,401);
  assert.equal((await (await fetch(base+"/models",{headers})).json()).data[0].id,"demo");
  const messages=[{role:"system",content:"system prompt"},{role:"user",content:"查一下"}];
  const post=(stream)=>fetch(base+"/chat/completions",{method:"POST",headers,body:JSON.stringify({model:"demo",messages,stream,tools:[{type:"function",function:{name:"lookup",parameters:{type:"object"}}}]})});
  const first=(await (await post(false)).json()).choices[0];
  assert.equal(first.finish_reason,"tool_calls");
  assert.deepEqual(first.message.tool_calls[0],{id:"abc",type:"function",function:{name:"lookup",arguments:"{}"}});
  messages.push(first.message,{role:"tool",tool_call_id:"abc",content:"ok"});
  const stream=await (await post(true)).text();
  assert.match(stream,/完成/);
  assert.match(stream,/\[DONE\]/);
});
