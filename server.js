require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json({limit:'1mb'}));
app.use(express.static(__dirname));

const capasDir = path.join(__dirname, 'capas');
fs.mkdirSync(capasDir, { recursive: true });

const API_KEY = process.env.ASAAS_API_KEY;
const BASE_URL = process.env.ASAAS_BASE_URL || 'https://api.asaas.com/v3';
const PORT = Number(process.env.PORT || 3000);

function authHeaders(){
  return {'Content-Type':'application/json','access_token':API_KEY};
}
function brl(v){return Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}

app.get('/api/health',(req,res)=>res.json({ok:true, asaasConfigured:Boolean(API_KEY && !API_KEY.includes('COLE_SUA_CHAVE'))}));
app.get('/api/catalog',(req,res)=>{
  try{
    const saved=fs.existsSync(path.join(__dirname,'catalogo.json'))
      ? JSON.parse(fs.readFileSync(path.join(__dirname,'catalogo.json'),'utf8'))
      : [];
    res.json({games:saved});
  }catch(e){
    console.error(e);
    res.status(500).json({error:'Não foi possível carregar o catálogo.'});
  }
});
app.post('/api/upload-image',(req,res)=>{
  try{
    const data=String(req.body?.data||'');
    if(!data.startsWith('data:image/')) return res.status(400).json({error:'Imagem inválida.'});
    const m=data.match(/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/);
    if(!m) return res.status(400).json({error:'Formato de imagem não suportado.'});
    const buf=Buffer.from(m[2],'base64');
    if(!buf.length || buf.length>900000) return res.status(413).json({error:'A imagem ficou grande demais. Tente outra capa.'});
    const name='capa_'+Date.now()+'_'+Math.random().toString(36).slice(2,8)+'.jpg';
    fs.writeFileSync(path.join(capasDir,name),buf);
    res.json({ok:true,url:'/capas/'+name});
  }catch(e){ console.error(e); res.status(500).json({error:'Não foi possível salvar a capa.'}); }
});

app.post('/api/create-pix', async (req,res)=>{
  try{
    if(!API_KEY || API_KEY.includes('COLE_SUA_CHAVE')) return res.status(500).json({error:'A chave do Asaas ainda não foi configurada no arquivo .env.'});
    const {name,email,cpfCnpj,items}=req.body||{};
    if(!name || !email || !cpfCnpj || !Array.isArray(items) || !items.length) return res.status(400).json({error:'Preencha nome, e-mail e CPF ou CNPJ.'});
    const document=String(cpfCnpj).replace(/\D/g,'');
    if(!/^(\d{11}|\d{14})$/.test(document)) return res.status(400).json({error:'CPF ou CNPJ inválido. Digite somente os números.'});
    const total=items.reduce((s,i)=>s+Number(i.price||0),0);
    if(!(total>0)) return res.status(400).json({error:'Valor do pedido inválido.'});

    const customerResponse=await fetch(`${BASE_URL}/customers`,{method:'POST',headers:authHeaders(),body:JSON.stringify({name,email,cpfCnpj:document})});
    const customer=await customerResponse.json();
    if(!customerResponse.ok) return res.status(customerResponse.status).json({error:customer.errors?.[0]?.description || 'Não foi possível criar o cliente no Asaas.'});

    const orderId=String(Date.now()).slice(-8);
    const dueDate=new Date();
    dueDate.setDate(dueDate.getDate()+1);
    const paymentResponse=await fetch(`${BASE_URL}/payments`,{method:'POST',headers:authHeaders(),body:JSON.stringify({customer:customer.id,billingType:'PIX',value:Number(total.toFixed(2)),dueDate:dueDate.toISOString().slice(0,10),description:`Pedido Jhon Games #${orderId}`,externalReference:`JHON-${orderId}`})});
    const payment=await paymentResponse.json();
    if(!paymentResponse.ok) return res.status(paymentResponse.status).json({error:payment.errors?.[0]?.description || 'Não foi possível criar a cobrança Pix.'});

    const qrResponse=await fetch(`${BASE_URL}/payments/${payment.id}/pixQrCode`,{headers:{'access_token':API_KEY}});
    const qr=await qrResponse.json();
    if(!qrResponse.ok) return res.status(qrResponse.status).json({error:qr.errors?.[0]?.description || 'A cobrança foi criada, mas o QR Code não pôde ser obtido.'});

    res.json({ok:true,orderId,paymentId:payment.id,total:brl(total),encodedImage:qr.encodedImage,payload:qr.payload,expirationDate:qr.expirationDate});
  }catch(e){
    console.error(e);
    res.status(500).json({error:'Erro de comunicação com o Asaas.'});
  }
});

app.get('/api/payment/:id', async (req,res)=>{
  try{
    if(!API_KEY || API_KEY.includes('COLE_SUA_CHAVE')) return res.status(500).json({error:'Asaas não configurado.'});
    const r=await fetch(`${BASE_URL}/payments/${encodeURIComponent(req.params.id)}`,{headers:{'access_token':API_KEY}});
    const d=await r.json();
    if(!r.ok) return res.status(r.status).json({error:d.errors?.[0]?.description || 'Não foi possível consultar a cobrança.'});
    res.json({id:d.id,status:d.status,value:d.value});
  }catch(e){res.status(500).json({error:'Erro ao consultar pagamento.'});}
});

app.post('/api/webhook/asaas',(req,res)=>{
  console.log('Webhook Asaas recebido:',req.body?.event,req.body?.payment?.id);
  res.sendStatus(200);
});

app.listen(PORT,()=>console.log(`Jhon Games rodando em http://localhost:${PORT}`));
