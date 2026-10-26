const fs=require('fs'),path=require('path');
const server=require('./api/game');
server.removeAllListeners('request');
server.on('request',(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const file=path.resolve(__dirname,'public','.'+(url.pathname==='/'?'/index.html':url.pathname));
 const root=path.resolve(__dirname,'public');
 if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 fs.readFile(file,(err,buf)=>{
  if(err)return res.writeHead(404).end('Não encontrado');
  const mime=file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':'text/css';
  res.writeHead(200,{'Content-Type':mime+'; charset=utf-8','Cache-Control':'no-store'}).end(buf);
 });
});
const port=Number(process.env.PORT||3000);
server.listen(port,'0.0.0.0',()=>console.log(`Dominó: http://localhost:${port}`));
