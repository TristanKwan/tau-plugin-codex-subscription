import {useEffect,useState} from "react";

const resetFormat = new Intl.DateTimeFormat("zh-CN", {
  month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hour12:false
});
function windowLabel(seconds) {
  if (seconds === 604800) return "每周额度";
  return seconds > 0 ? (seconds / 3600) + " 小时额度" : "订阅额度";
}

export function Quota({context}) {
  const [snapshot,setSnapshot] = useState(null);
  const [error,setError] = useState("");
  const [loading,setLoading] = useState(true);
  const [revision,setRevision] = useState(0);
  useEffect(()=>{
    const controller = new AbortController();
    setLoading(true);
    setError("");
    context.backend.call("settings.action","quota",{signal:controller.signal})
      .then(raw=>{if (!controller.signal.aborted) setSnapshot(JSON.parse(raw))})
      .catch(e=>{if (!controller.signal.aborted) setError(e.message)})
      .finally(()=>{if (!controller.signal.aborted) setLoading(false)});
    return ()=>controller.abort();
  },[context,revision]);
  return <section className="codex-quota" aria-label="订阅额度">
    <header><div><h3>订阅额度</h3>{snapshot&&<small>更新于 {new Date(snapshot.updatedAt).toLocaleString("zh-CN",{hour12:false})}</small>}</div>
      <button disabled={loading} onClick={()=>setRevision(n=>n+1)}>{loading?"刷新中…":"刷新"}</button></header>
    {error&&<p role="alert">{error}</p>}
    {snapshot?.windows.length===0&&<p>账号暂未返回额度窗口。</p>}
    <div className="codex-quota-grid">{snapshot?.windows.map((w,i)=>{
      const label=windowLabel(w.seconds);
      const percent=Math.round(w.remaining);
      return <div className="codex-quota-window" key={i}>
        <div><span>Codex</span><strong title="剩余额度">{percent}%</strong></div>
        <progress value={w.remaining} max={100} aria-label={label+"剩余"}/>
        <div><small>{label}</small><small>{w.resetAt?"重置于 "+resetFormat.format(w.resetAt):"未提供重置时间"}</small></div>
      </div>;
    })}</div>
  </section>;
}
