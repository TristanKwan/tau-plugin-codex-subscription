import test from "node:test";
import assert from "node:assert/strict";
import {bridge} from "./src/bridge.js";

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
