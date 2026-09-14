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
const KEYS_FILE = path.join(__dirname, 'estoque-keys.json');

function loadKeysStock(){
  try{
    if(!fs.existsSync(KEYS_FILE)) return {};
    return JSON.parse(fs.readFileSync(KEYS_FILE,'utf8'));
  }catch(e){
    return {};
  }
}

function saveKeysStock(stock){
  fs.writeFileSync(KEYS_FILE, JSON.stringify(stock,null,2));
}
function authHeaders(){
  return {'Content-Type':'application/json','access_token':API_KEY};
}
function brl(v){return Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}

app.get('/api/health',(req,res)=>res.json({ok:true, asaasConfigured:Boolean(API_KEY && !API_KEY.includes('COLE_SUA_CHAVE'))}));
app.get('/api/keys-stock', (req,res)=>{
  const stock=loadKeysStock();
  const result={};

  for(const gameIndex of Object.keys(stock)){
    result[gameIndex]=Array.isArray(stock[gameIndex]) ? stock[gameIndex].length : 0;
  }

  res.json(result);
});
app.post('/api/keys-stock', (req,res)=>{
  try{
    const {gameIndex, keys}=req.body||{};

    if(gameIndex===undefined || !Array.isArray(keys)){
      return res.status(400).json({error:'Jogo ou keys inválidos.'});
    }

    const cleanKeys=keys
      .map(k=>String(k).trim())
      .filter(Boolean);

    if(!cleanKeys.length){
      return res.status(400).json({error:'Nenhuma key foi informada.'});
    }

    const stock=loadKeysStock();
    const index=String(gameIndex);

    if(!Array.isArray(stock[index])){
      stock[index]=[];
    }

    stock[index].push(...cleanKeys);
    saveKeysStock(stock);

    res.json({
      ok:true,
      added:cleanKeys.length,
      total:stock[index].length
    });
  }catch(e){
    console.error('Erro ao salvar keys:',e);
    res.status(500).json({error:'Não foi possível salvar o estoque.'});
  }
});
app.get('/api/catalog', async (req,res)=>{
  try{
   
    const token = process.env.GITHUB_TOKEN;
    const owner = 'djhonatas021-oss';
    const repo = 'Jhon-Games';
    const branch = 'main';
    const file = 'catalogo.json';

    if(!token){
      return res.json({games:[]});
    }

    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${file}?ref=${branch}`;

    const response = await fetch(url,{
      headers:{
        'Authorization':`Bearer ${token}`,
        'Accept':'application/vnd.github+json'
      }
    });

    if(response.status === 404){
      return res.json({games:[]});
    }

    if(!response.ok){
      throw new Error(`GitHub respondeu ${response.status}`);
    }

    const data = await response.json();
    const content = Buffer.from(data.content.replace(/\n/g,''),'base64').toString('utf8');
    const games = JSON.parse(content);

    res.json({games});
  }catch(e){
    console.error(e);
    res.status(500).json({error:'Não foi possível carregar o catálogo.'});
  }
});
app.post('/api/asaas-webhook', async (req,res)=>{
  try{
    const token = process.env.ASAAS_WEBHOOK_TOKEN;
    const receivedToken = req.headers['asaas-access-token'];

    if(token && receivedToken !== token){
      return res.status(401).json({error:'Token inválido.'});
    }

    const event = req.body || {};

    console.log('Webhook Asaas recebido:', event.event);

    if(event.event === 'PAYMENT_RECEIVED' || event.event === 'PAYMENT_CONFIRMED'){
      console.log('Pagamento confirmado/recebido:', event.payment?.id);
    }

    res.status(200).json({ok:true});
  }catch(e){
    console.error('Erro no webhook Asaas:', e);
    res.status(500).json({error:'Erro no webhook.'});
  }
});


app.post('/api/upload-image', async (req,res)=>{
  try{
    const token = process.env.GITHUB_TOKEN;

    if(!token){
      return res.status(500).json({error:'GitHub não está configurado.'});
    }

    const data = String(req.body?.data || '');

    if(!data.startsWith('data:image/')){
      return res.status(400).json({error:'Imagem inválida.'});
    }

    const match = data.match(/^data:image\/(?:jpeg|jpg|png|webp);base64,(.+)$/);

    if(!match){
      return res.status(400).json({error:'Formato de imagem não suportado.'});
    }

    const base64 = match[1];

    if(Buffer.from(base64,'base64').length > 900000){
      return res.status(413).json({error:'A imagem ficou grande demais.'});
    }

    const name = `capa_${Date.now()}_${Math.random().toString(36).slice(2,8)}.jpg`;
    const file = `capas/${name}`;

    const url = `https://api.github.com/repos/djhonatas021-oss/Jhon-Games/contents/${file}`;

    const response = await fetch(url,{
      method:'PUT',
      headers:{
        'Authorization':`Bearer ${token}`,
        'Accept':'application/vnd.github+json',
        'X-GitHub-Api-Version':'2022-11-28',
        'Content-Type':'application/json'
      },
      body:JSON.stringify({
        message:`Adiciona capa ${name}`,
        content:base64,
        branch:'main'
      })
    });

    if(!response.ok){
      const errorText = await response.text();
      throw new Error(`GitHub respondeu ${response.status}: ${errorText}`);
    }

    res.json({
      ok:true,
      url:`https://raw.githubusercontent.com/djhonatas021-oss/Jhon-Games/main/${file}`
    });

  }catch(e){
    console.error(e);
    res.status(500).json({
      error:'Não foi possível salvar a capa no GitHub.'
    });
  }
});
app.post('/api/catalog', async (req,res)=>{
  try{
    const token = process.env.GITHUB_TOKEN;
    const owner = 'djhonatas021-oss';
    const repo = 'Jhon-Games';
    const branch = 'main';
    const file = 'catalogo.json';

    if(!token){
      return res.status(500).json({
        error:'GitHub não está configurado no servidor.'
      });
    }

    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${file}`;

    const headers = {
      'Authorization':`Bearer ${token}`,
      'Accept':'application/vnd.github+json',
      'X-GitHub-Api-Version':'2022-11-28'
    };

    let sha;

    const current = await fetch(`${url}?ref=${branch}`,{headers});

    if(current.ok){
      const data = await current.json();
      sha = data.sha;
    }else if(current.status !== 404){
      throw new Error(`GitHub respondeu ${current.status}`);
    }

    const games = Array.isArray(req.body?.games) ? req.body.games : [];

    const body = {
      message:'Atualiza catálogo Jhon Games',
      content:Buffer
        .from(JSON.stringify(games,null,2),'utf8')
        .toString('base64'),
      branch
    };

    if(sha) body.sha = sha;

    const response = await fetch(url,{
      method:'PUT',
      headers:{
        ...headers,
        'Content-Type':'application/json'
      },
      body:JSON.stringify(body)
    });

    if(!response.ok){
      const errorText = await response.text();
      throw new Error(`GitHub respondeu ${response.status}: ${errorText}`);
    }

    res.json({ok:true});

  }catch(e){
    console.error(e);
    res.status(500).json({
      error:'Não foi possível salvar o catálogo no GitHub.'
    });
  }
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
const orderItems=items.map(i=>({
  name:i.name||i.title||'Jogo',
  price:Number(i.price||0)
}));
const dueDate=new Date();
    dueDate.setDate(dueDate.getDate()+1);
    const paymentResponse=await fetch(`${BASE_URL}/payments`,{method:'POST',headers:authHeaders(),body:JSON.stringify({customer:customer.id,billingType:'PIX',value:Number(total.toFixed(2)),dueDate:dueDate.toISOString().slice(0,10),description:`Pedido Jhon Games #${orderId}`,externalReference:`JHON-${orderId}`})});
    const payment=await paymentResponse.json();
    if(!paymentResponse.ok) return res.status(paymentResponse.status).json({error:payment.errors?.[0]?.description || 'Não foi possível criar a cobrança Pix.'});

    const qrResponse=await fetch(`${BASE_URL}/payments/${payment.id}/pixQrCode`,{headers:{'access_token':API_KEY}});
    const qr=await qrResponse.json();
    if(!qrResponse.ok) return res.status(qrResponse.status).json({error:qr.errors?.[0]?.description || 'A cobrança foi criada, mas o QR Code não pôde ser obtido.'});

    res.json({
  ok:true,
  orderId,
  paymentId:payment.id,
  total:brl(total),
  items:orderItems,
  encodedImage:qr.encodedImage,
  payload:qr.payload,
  expirationDate:qr.expirationDate
});
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
    res.json({
  id:d.id,
  status:d.status,
  value:d.value
});
  }catch(e){res.status(500).json({error:'Erro ao consultar pagamento.'});}
});

app.post('/api/asaas-webhook',(req,res)=>{
  console.log('Webhook Asaas recebido:',req.body?.event,req.body?.payment?.id);
  res.sendStatus(200);
});

app.listen(PORT,()=>console.log(`Jhon Games rodando em http://localhost:${PORT}`));
