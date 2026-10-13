import { createServer } from "node:http";
/** Local controlled app; no external account or network service. */
export async function startFixture(port = 0) {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const mode = url.searchParams.get("mode") ?? "normal";
    if (url.pathname === "/download") {
      res.writeHead(200, {
        "Content-Type": "text/plain",
        "Content-Disposition": 'attachment; filename="report.txt"',
      });
      res.end("BrowserAssert verified artifact");
      return;
    }
    res.setHeader("Content-Type", "text/html");
    res.end(
      `<!doctype html><title>BrowserAssert fixture</title><h1>Controlled verification fixture</h1><div id="identity">${mode === "expired" ? "Signed out" : "Signed in"}</div><input id="name"><input id="secret" value="demo-secret"><button id="save">Save</button><p id="toast"></p><form id="form"><button>Submit</button></form><p id="receipt"></p><a href="/download">Download</a><script>const input=document.querySelector('#name');input.value=localStorage.getItem('name')||'';document.querySelector('#save').onclick=()=>{${mode === "save-fails" ? "" : 'localStorage.setItem("name",input.value);'}document.querySelector('#toast').textContent='Saved';};document.querySelector('#form').onsubmit=e=>{e.preventDefault();document.querySelector('#receipt').textContent='Submitted';};</script>`,
    );
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return {
    url: `http://127.0.0.1:${(server.address() as any).port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      ),
  };
}
