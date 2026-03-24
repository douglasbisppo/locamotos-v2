'use strict';
/**
 * Edge Function equivalents - converts Supabase Edge Functions to Express routes.
 * All routes under POST /api/functions/:name
 */
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { authenticate, requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// ─── Helper functions ─────────────────────────────────────────────────────────

function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendResendEmail(to, subject, html) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY não configurado');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: '021 Loca Motos <nao_responda@021locamotos.com>',
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error: ${body}`);
  }
  return res.json();
}

// ─── POST /api/functions/create-admin ────────────────────────────────────────
router.post('/create-admin', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { email, password, display_name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email já cadastrado' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = crypto.randomUUID();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO users (id, email, password_hash, created_at) VALUES ($1, $2, $3, NOW())',
        [userId, email.toLowerCase(), passwordHash]
      );
      await client.query(
        'INSERT INTO profiles (user_id, display_name, admin_approved, created_at) VALUES ($1, $2, true, NOW())',
        [userId, display_name || email]
      );
      await client.query(
        'INSERT INTO user_roles (user_id, role) VALUES ($1, $2)',
        [userId, 'admin']
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return res.json({ success: true, user_id: userId });
  } catch (err) {
    console.error('create-admin error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/functions/create-checkout ─────────────────────────────────────
router.post('/create-checkout', requireAuth, async (req, res) => {
  try {
    const MERCADO_PAGO_ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!MERCADO_PAGO_ACCESS_TOKEN) {
      return res.status(500).json({ error: 'MERCADO_PAGO_ACCESS_TOKEN não configurado' });
    }

    const userId = req.user.id;
    const {
      motoId,
      planoMeses,
      valorCartao = 0,
      valorPix = 0,
      parcelamentoAssinatura = 0,
      parcelasAssinatura = 0,
    } = req.body;

    if (!motoId || !planoMeses) {
      return res.status(400).json({ error: 'motoId e planoMeses são obrigatórios' });
    }

    const planos = { 36: 450, 30: 500, 24: 550 };
    const valorSemanal = planos[planoMeses];
    if (!valorSemanal) {
      return res.status(400).json({ error: 'Plano inválido. Use 24, 30 ou 36 meses.' });
    }

    const caucao = 500;
    const totalInicial = caucao + valorSemanal;
    const maxParcelamento = totalInicial * 0.6;

    if (parcelamentoAssinatura > maxParcelamento + 0.01) {
      return res.status(400).json({ error: `Parcelamento na assinatura não pode exceder 60% do total (R$ ${maxParcelamento.toFixed(2)})` });
    }
    if (parcelasAssinatura > 10) {
      return res.status(400).json({ error: 'Máximo de 10 parcelas na assinatura' });
    }

    const pagoDireto = valorCartao + valorPix;
    if (Math.abs(pagoDireto + parcelamentoAssinatura - totalInicial) > 0.02) {
      return res.status(400).json({ error: 'A soma dos pagamentos deve ser igual ao total' });
    }

    if (pagoDireto <= 0) {
      return res.status(400).json({ error: 'É necessário pagar ao menos uma parte via cartão ou PIX' });
    }

    const profileResult = await pool.query(
      'SELECT display_name, cpf, phone FROM profiles WHERE user_id = $1',
      [userId]
    );
    const profile = profileResult.rows[0] || {};

    const motoResult = await pool.query('SELECT modelo, placa FROM motos WHERE id = $1', [motoId]);
    if (motoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Moto não encontrada' });
    }
    const moto = motoResult.rows[0];

    const items = [{
      id: `inicial-${motoId}`,
      title: `Pagamento Inicial - ${moto.modelo} (${moto.placa})`,
      description: `Caução + 1ª semana - Plano ${planoMeses} meses${parcelamentoAssinatura > 0 ? ` (R$ ${parcelamentoAssinatura.toFixed(2)} parcelado em ${parcelasAssinatura}x na assinatura)` : ''}`,
      quantity: 1,
      unit_price: pagoDireto,
      currency_id: 'BRL',
    }];

    const webhookUrl = `${process.env.API_BASE_URL || 'http://localhost:3002'}/api/functions/mercadopago-webhook`;

    const preference = {
      items,
      payer: {
        name: profile.display_name || '',
        identification: profile.cpf ? { type: 'CPF', number: profile.cpf.replace(/\D/g, '') } : undefined,
      },
      payment_methods: { installments: 3 },
      back_urls: {
        success: `https://021locamotos.com/dashboard?payment=success`,
        failure: `https://021locamotos.com/dashboard?payment=failure`,
        pending: `https://021locamotos.com/dashboard?payment=pending`,
      },
      auto_return: 'approved',
      external_reference: JSON.stringify({
        userId,
        motoId,
        planoMeses,
        valorSemanal,
        caucao,
        parcelamentoAssinatura,
        parcelasAssinatura,
      }),
      notification_url: webhookUrl,
    };

    const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(preference),
    });

    const mpData = await mpResponse.json();

    if (!mpResponse.ok) {
      throw new Error(`Erro Mercado Pago [${mpResponse.status}]: ${JSON.stringify(mpData)}`);
    }

    return res.json({
      init_point: mpData.init_point,
      sandbox_init_point: mpData.sandbox_init_point,
      preference_id: mpData.id,
      total: totalInicial,
      pagoDireto,
      parcelamentoAssinatura,
      parcelasAssinatura,
    });
  } catch (err) {
    console.error('create-checkout error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/functions/mercadopago-webhook ──────────────────────────────────
router.post('/mercadopago-webhook', async (req, res) => {
  try {
    const MERCADO_PAGO_ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!MERCADO_PAGO_ACCESS_TOKEN) {
      return res.status(500).send('MERCADO_PAGO_ACCESS_TOKEN não configurado');
    }

    const WEBHOOK_SECRET = process.env.MERCADO_PAGO_WEBHOOK_SECRET;

        const body = req.body;

    // Validate webhook signature if secret configured
    const xSignature = req.headers['x-signature'];
    const xRequestId = req.headers['x-request-id'];

    if (WEBHOOK_SECRET && xSignature && xRequestId) {
      const parts = xSignature.split(',');
      const tsValue = parts.find(p => p.trim().startsWith('ts='))?.split('=')[1];
      const v1Value = parts.find(p => p.trim().startsWith('v1='))?.split('=')[1];

      if (tsValue && v1Value) {
        const dataId = body.data?.id;
        const manifest = `id:${dataId};request-id:${xRequestId};ts:${tsValue};`;
        const computedHash = crypto.createHmac('sha256', WEBHOOK_SECRET).update(manifest).digest('hex');

        if (computedHash !== v1Value) {
          console.error('Invalid webhook signature');
          return res.status(401).send('Unauthorized');
        }
      }
    }

    if (body.type === 'payment' || body.action === 'payment.created' || body.action === 'payment.updated') {
      const paymentId = body.data?.id;
      if (!paymentId) return res.send('OK');

      const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { 'Authorization': `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}` },
      });
      const payment = await paymentResponse.json();

      if (payment.status === 'approved' && payment.external_reference) {
        let refData;
        try {
          refData = JSON.parse(payment.external_reference);
        } catch {
          return res.send('OK');
        }

        const existing = await pool.query(
          'SELECT id FROM contracts WHERE user_id = $1 AND moto_id = $2 AND mp_payment_id = $3',
          [refData.userId, refData.motoId, paymentId.toString()]
        );
        if (existing.rows.length > 0) return res.send('OK');

        const contractResult = await pool.query(
          `INSERT INTO contracts (user_id, moto_id, plano_meses, valor_semanal, caucao, status, mp_payment_id, created_at)
           VALUES ($1, $2, $3, $4, $5, 'ativo', $6, NOW()) RETURNING id`,
          [refData.userId, refData.motoId, refData.planoMeses, refData.valorSemanal, refData.caucao, paymentId.toString()]
        );
        const contract = contractResult.rows[0];

        const today = new Date();
        const vencimento = new Date(today);
        vencimento.setDate(vencimento.getDate() + 7);

        await pool.query(
          `INSERT INTO pagamentos_semanais (contract_id, numero_semana, valor_base, valor_total, data_vencimento, data_pagamento, status, created_at)
           VALUES ($1, 1, $2, $2, $3, $4, 'pago', NOW())`,
          [contract.id, refData.valorSemanal, vencimento.toISOString().split('T')[0], today.toISOString().split('T')[0]]
        );

        // Trigger clicksign envelope creation (non-blocking)
        const apiBase = process.env.API_BASE_URL || 'http://localhost:3002';
        fetch(`${apiBase}/api/functions/clicksign-create-envelope`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contractId: contract.id }),
        }).catch(err => console.error('Clicksign trigger error:', err));
      }
    }

    return res.send('OK');
  } catch (err) {
    console.error('mercadopago-webhook error:', err);
    return res.status(500).send('Internal Server Error');
  }
});

// ─── Clicksign helpers ────────────────────────────────────────────────────────

const CLICKSIGN_BASE_URL = 'https://app.clicksign.com/api/v3';

async function clicksignRequest(path, method, body) {
  const apiKey = process.env.CLICKSIGN_API_KEY;
  if (!apiKey) throw new Error('CLICKSIGN_API_KEY não configurado');

  const options = {
    method,
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/vnd.api+json',
      'Accept': 'application/vnd.api+json',
    },
  };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(`${CLICKSIGN_BASE_URL}${path}`, options);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Clicksign API error: ${response.status} - ${text}`);
  }
  return JSON.parse(text);
}

function textToBase64(text) {
  return Buffer.from(text, 'utf-8').toString('base64');
}

function formatDateBR(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function numberToWords(value) {
  const units = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
  const teens = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const tens = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const hundreds = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

  if (value === 0) return 'zero';
  if (value === 100) return 'cem';

  const parts = [];
  const h = Math.floor(value / 100);
  const remainder = value % 100;
  const t = Math.floor(remainder / 10);
  const u = remainder % 10;

  if (h > 0) parts.push(hundreds[h]);
  if (remainder >= 10 && remainder < 20) {
    parts.push(teens[remainder - 10]);
  } else {
    if (t > 0) parts.push(tens[t]);
    if (u > 0) parts.push(units[u]);
  }
  return parts.join(' e ');
}

function generateContractHTML(data) {
  const formattedDate = formatDateBR(data.dataInicio);
  const totalSemanas = data.planoMeses * 4;
  const valorPorExtenso = numberToWords(Math.floor(data.valorSemanal)) + ' reais';
  const caucaoPorExtenso = numberToWords(Math.floor(data.caucao)) + ' reais';
  const [y, m, d] = data.dataInicio.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  start.setDate(start.getDate() + totalSemanas * 7);
  const terminoPrevisto = `${String(start.getDate()).padStart(2, '0')}/${String(start.getMonth() + 1).padStart(2, '0')}/${start.getFullYear()}`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
body { font-family: Arial, sans-serif; font-size: 12px; line-height: 1.6; margin: 40px; color: #333; }
h1 { text-align: center; font-size: 18px; margin-bottom: 30px; }
h2 { font-size: 14px; margin-top: 20px; border-bottom: 1px solid #ccc; padding-bottom: 5px; }
.clause { margin: 15px 0; text-align: justify; }
.clause ul { margin: 6px 0 6px 20px; }
.info-table { width: 100%; border-collapse: collapse; margin: 10px 0; border: 1px solid #ddd; }
.info-table td { padding: 6px 12px; border-bottom: 1px solid #eee; }
.info-table .label { font-weight: bold; width: 40%; }
.signature-area { margin-top: 60px; text-align: center; }
.signature-line { border-top: 1px solid #333; width: 300px; margin: 40px auto 5px; }
</style>
</head>
<body>
<h1>CONTRATO DE LOCAÇÃO DE MOTOCICLETA<br>COM OPÇÃO DE TRANSFERÊNCIA</h1>
<p style="text-align:center">Contrato nº ${data.motoPlaca.toUpperCase()}</p>

<h2>1. PARTES</h2>
<p><strong>LOCADORA:</strong> Zero Vinte Um Loca Motos LTDA — CNPJ: 31.831.358/0001-90</p>
<p><strong>LOCATÁRIO:</strong> ${data.clientName} — CPF: ${data.clientCpf} — CNH: ${data.clientCnh || 'N/A'}</p>
<p><strong>Endereço:</strong> ${data.clientAddress}</p>

<h2>2. OBJETO</h2>
<table class="info-table">
<tr><td class="label">Modelo</td><td>${data.motoModelo}</td></tr>
<tr><td class="label">Placa</td><td>${data.motoPlaca}</td></tr>
<tr><td class="label">Chassi</td><td>${data.motoChassi || 'N/A'}</td></tr>
<tr><td class="label">Cor</td><td>${data.motoCor || 'N/A'}</td></tr>
</table>

<h2>3. PRAZO E VALORES</h2>
<table class="info-table">
<tr><td class="label">Data de início</td><td>${formattedDate}</td></tr>
<tr><td class="label">Previsão de término</td><td>${terminoPrevisto}</td></tr>
<tr><td class="label">Prazo</td><td>${data.planoMeses} meses (${totalSemanas} semanas)</td></tr>
<tr><td class="label">Valor semanal</td><td>R$ ${data.valorSemanal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${valorPorExtenso})</td></tr>
<tr><td class="label">Caução</td><td>R$ ${data.caucao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${caucaoPorExtenso})</td></tr>
</table>

<h2>4. MANUTENÇÃO E RESPONSABILIDADES</h2>
<div class="clause">
<p>4.1. Revisões até 30.000 KM pagas pela LOCADORA. 4.2. Itens de desgaste (pneus, freios, corrente, etc.) por conta do LOCATÁRIO.</p>
</div>

<h2>5. PROTEÇÃO VEICULAR</h2>
<div class="clause"><p>Franquia de 10% da Tabela FIPE. 1º sinistro: 50%/50%. Do 2º em diante: 100% LOCATÁRIO.</p></div>

<h2>6. RESCISÃO</h2>
<div class="clause"><p>Rescisão antecipada implica perda integral da caução.</p></div>

<h2>7. FORO</h2>
<div class="clause"><p>Comarca do Rio de Janeiro - RJ.</p></div>

<p style="text-align:center; margin-top:30px">Rio de Janeiro, ${formattedDate}</p>
<div class="signature-area">
<div class="signature-line"></div>
<p><strong>Zero Vinte Um Loca Motos LTDA</strong><br>CNPJ: 31.831.358/0001-90</p>
<div class="signature-line"></div>
<p><strong>${data.clientName}</strong><br>CPF: ${data.clientCpf}</p>
</div>
</body></html>`;
}

function generateChecklistHTML(data) {
  const formattedDate = formatDateBR(data.dataInicio);
  const items = ['Tanque de combustível','Pneu dianteiro','Pneu traseiro','Freio dianteiro','Freio traseiro','Farol','Lanterna traseira','Seta dianteira esq.','Seta dianteira dir.','Seta traseira esq.','Seta traseira dir.','Retrovisor esq.','Retrovisor dir.','Buzina','Painel/Velocímetro','Embreagem','Acelerador','Carenagem','Banco','Escapamento','Manual do proprietário','Documento (CRLV)'];
  const rows = items.map(item => `<tr><td>${item}</td><td style="width:80px;text-align:center">☑ OK</td><td style="width:80px;text-align:center">☐ Avaria</td><td style="width:150px">-</td></tr>`).join('\n');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8">
<style>
body { font-family: Arial, sans-serif; font-size: 12px; line-height: 1.5; margin: 40px; }
h1 { text-align: center; font-size: 16px; }
table { width: 100%; border-collapse: collapse; margin: 10px 0; }
td, th { border: 1px solid #ccc; padding: 5px 8px; }
th { background: #f5f5f5; }
.signature-line { border-top: 1px solid #333; width: 250px; margin: 40px auto 5px; }
.signature-area { text-align: center; margin-top: 40px; }
</style></head>
<body>
<h1>CHECKLIST DE RETIRADA DE MOTOCICLETA</h1>
<p><strong>Data:</strong> ${formattedDate} | <strong>Locatário:</strong> ${data.clientName} | <strong>CPF:</strong> ${data.clientCpf}</p>
<p><strong>Modelo:</strong> ${data.motoModelo} | <strong>Placa:</strong> ${data.motoPlaca} | <strong>Cor:</strong> ${data.motoCor || 'N/A'}</p>
<table>
<tr><th>Item</th><th>OK</th><th>Avaria</th><th>Observação</th></tr>
${rows}
</table>
<p><strong>Observações gerais:</strong></p>
<div style="border:1px solid #ccc;min-height:60px;padding:8px;"></div>
<div class="signature-area">
<div class="signature-line"></div><p><strong>${data.clientName}</strong><br>LOCATÁRIO</p>
<div class="signature-line"></div><p><strong>Zero Vinte Um Loca Motos LTDA</strong><br>RESPONSÁVEL</p>
</div>
</body></html>`;
}

async function uploadHtmlDocumentWithFallback(envelopeId, filenameBase, html) {
  const htmlBase64 = textToBase64(html);
  const safeBase = filenameBase.replace(/[^a-zA-Z0-9_-]/g, '_');
  const attempts = [
    { filename: `${safeBase}.doc`, content_base64: `data:text/html;charset=utf-8;base64,${htmlBase64}` },
    { filename: `${safeBase}.doc`, content_base64: `data:application/msword;base64,${htmlBase64}` },
  ];

  let lastError;
  for (const attempt of attempts) {
    try {
      return await clicksignRequest(`/envelopes/${envelopeId}/documents`, 'POST', {
        data: { type: 'documents', attributes: { filename: attempt.filename, content_base64: attempt.content_base64 } },
      });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

// ─── POST /api/functions/clicksign-create-envelope ───────────────────────────
router.post('/clicksign-create-envelope', async (req, res) => {
  try {
    const { contractId } = req.body;
    if (!contractId) return res.status(400).json({ error: 'contractId é obrigatório' });

    const contractResult = await pool.query('SELECT * FROM contracts WHERE id = $1', [contractId]);
    if (contractResult.rows.length === 0) throw new Error('Contrato não encontrado');
    const contract = contractResult.rows[0];

    const motoResult = await pool.query('SELECT * FROM motos WHERE id = $1', [contract.moto_id]);
    if (motoResult.rows.length === 0) throw new Error('Moto não encontrada');
    const moto = motoResult.rows[0];

    const profileResult = await pool.query('SELECT * FROM profiles WHERE user_id = $1', [contract.user_id]);
    if (profileResult.rows.length === 0) throw new Error('Perfil não encontrado');
    const profile = profileResult.rows[0];

    const userResult = await pool.query('SELECT email FROM users WHERE id = $1', [contract.user_id]);
    if (userResult.rows.length === 0) throw new Error('Usuário não encontrado');
    const userEmail = userResult.rows[0].email;

    const clientAddress = [
      profile.address_street, profile.address_number, profile.address_complement,
      profile.address_neighborhood, profile.address_city, profile.address_state, profile.address_zip,
    ].filter(Boolean).join(', ');

    const dataInicio = contract.data_inicio
      ? (contract.data_inicio instanceof Date ? contract.data_inicio.toISOString().split('T')[0] : contract.data_inicio.toString().split('T')[0])
      : new Date().toISOString().split('T')[0];

    const contractData = {
      contractId: contract.id,
      userId: contract.user_id,
      clientName: profile.display_name || userEmail,
      clientCpf: profile.cpf || '',
      clientCnh: profile.cnh_numero || '',
      clientEmail: userEmail,
      clientPhone: profile.phone || '',
      clientAddress,
      motoModelo: moto.modelo,
      motoPlaca: moto.placa,
      motoChassi: moto.chassi || '',
      motoCor: moto.cor || '',
      planoMeses: contract.plano_meses,
      valorSemanal: Number(contract.valor_semanal),
      caucao: Number(contract.caucao),
      dataInicio,
    };

    // 1. Create envelope
    const envelopeRes = await clicksignRequest('/envelopes', 'POST', {
      data: {
        type: 'envelopes',
        attributes: {
          name: `Contrato Locação - ${contractData.clientName} - ${moto.placa}`,
          locale: 'pt-BR',
          auto_close: true,
          remind_interval: 3,
          block_after_refusal: true,
        },
      },
    });
    const envelopeId = envelopeRes.data.id;

    // 2. Upload contract HTML
    const contractHtml = generateContractHTML(contractData);
    const contractDocRes = await uploadHtmlDocumentWithFallback(envelopeId, `contrato-locacao-${moto.placa}`, contractHtml);

    // 3. Upload checklist HTML
    const checklistHtml = generateChecklistHTML(contractData);
    const checklistDocRes = await uploadHtmlDocumentWithFallback(envelopeId, `checklist-retirada-${moto.placa}`, checklistHtml);

    // 4. Add signer
    const signerRes = await clicksignRequest(`/envelopes/${envelopeId}/signers`, 'POST', {
      data: {
        type: 'signers',
        attributes: {
          name: contractData.clientName,
          email: contractData.clientEmail,
          phone_number: contractData.clientPhone ? contractData.clientPhone.replace(/\D/g, '') : undefined,
        },
      },
    });
    const signerId = signerRes.data?.id;
    const contractDocId = contractDocRes.data?.id;
    const checklistDocId = checklistDocRes.data?.id;

    // 5. Create requirements for both docs
    for (const docId of [contractDocId, checklistDocId]) {
      await clicksignRequest(`/envelopes/${envelopeId}/requirements`, 'POST', {
        data: {
          type: 'requirements',
          attributes: { action: 'agree', role: 'sign' },
          relationships: {
            document: { data: { type: 'documents', id: docId } },
            signer: { data: { type: 'signers', id: signerId } },
          },
        },
      });
      await clicksignRequest(`/envelopes/${envelopeId}/requirements`, 'POST', {
        data: {
          type: 'requirements',
          attributes: { action: 'provide_evidence', auth: 'email' },
          relationships: {
            document: { data: { type: 'documents', id: docId } },
            signer: { data: { type: 'signers', id: signerId } },
          },
        },
      });
    }

    // 6. Activate envelope
    await clicksignRequest(`/envelopes/${envelopeId}`, 'PATCH', {
      data: { id: envelopeId, type: 'envelopes', attributes: { status: 'running' } },
    });

    // 7. Send notification
    try {
      await clicksignRequest(`/envelopes/${envelopeId}/notifications`, 'POST', {
        data: { type: 'notifications', attributes: { message: `Olá ${contractData.clientName}, assine os documentos do contrato de locação.` } },
      });
    } catch (e) {
      console.error('Clicksign notification error (non-blocking):', e.message);
    }

    // 8. Update contract with envelope ID
    await pool.query('UPDATE contracts SET clicksign_envelope_id = $1 WHERE id = $2', [envelopeId, contractId]);

    return res.json({ success: true, envelopeId });
  } catch (err) {
    console.error('clicksign-create-envelope error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/functions/clicksign-cancel-envelope ───────────────────────────
router.post('/clicksign-cancel-envelope', requireAuth, async (req, res) => {
  try {
    const { envelopeId } = req.body;
    if (!envelopeId) return res.status(400).json({ error: 'envelopeId é obrigatório' });

    try {
      await clicksignRequest(`/envelopes/${envelopeId}`, 'PATCH', {
        data: { id: envelopeId, type: 'envelopes', attributes: { status: 'canceled' } },
      });
    } catch (e) {
      console.error('Cancel envelope error (non-blocking):', e.message);
    }

    return res.json({ success: true, message: 'Envelope cancelado' });
  } catch (err) {
    console.error('clicksign-cancel-envelope error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/functions/clicksign-webhook ───────────────────────────────────
router.post('/clicksign-webhook', async (req, res) => {
  try {
    const body = req.body;
    const eventName = body?.event?.name || body?.event;
    const relevantEvents = ['auto_close', 'close', 'document_closed'];

    if (!relevantEvents.includes(eventName)) {
      return res.json({ ok: true, message: 'Event ignored' });
    }

    const envelopeId = body?.document?.key || body?.data?.id || body?.envelope?.id || body?.envelope?.key;

    const contractResult = await pool.query(
      'SELECT * FROM contracts WHERE clicksign_envelope_id = $1',
      [envelopeId]
    );

    if (contractResult.rows.length === 0) {
      return res.json({ ok: true, message: 'Contract not found, acknowledged' });
    }

    const contract = contractResult.rows[0];

    const [profileResult, motoResult] = await Promise.all([
      pool.query('SELECT * FROM profiles WHERE user_id = $1', [contract.user_id]),
      pool.query('SELECT * FROM motos WHERE id = $1', [contract.moto_id]),
    ]);

    const profile = profileResult.rows[0];
    const moto = motoResult.rows[0];

    if (!profile?.phone) return res.json({ ok: true, message: 'No phone' });

    const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
    const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;

    if (EVOLUTION_API_URL && EVOLUTION_API_KEY) {
      const baseUrl = EVOLUTION_API_URL.replace(/\/$/, '');
      const evHeaders = { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY };
      const phoneClean = profile.phone.replace(/\D/g, '');
      const phoneNumber = phoneClean.startsWith('55') ? phoneClean : '55' + phoneClean;

      const confirmMsg = `✅ *Documentos Assinados com Sucesso!*\n\nOlá ${profile.display_name || 'Cliente'},\n\nSeus documentos do contrato de locação da motocicleta *${moto?.modelo || ''}* (Placa: *${moto?.placa || ''}*) foram assinados!\n\n_Zero Vinte Um Loca Motos LTDA_`;

      await fetch(`${baseUrl}/message/sendText/motogest`, {
        method: 'POST',
        headers: evHeaders,
        body: JSON.stringify({ number: phoneNumber, text: confirmMsg }),
      }).catch(e => console.error('WhatsApp send error:', e.message));
    }

    await pool.query("UPDATE contracts SET status = 'assinado' WHERE id = $1", [contract.id]);

    return res.json({ ok: true, message: 'Processed' });
  } catch (err) {
    console.error('clicksign-webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/functions/whatsapp ─────────────────────────────────────────────
router.post('/whatsapp', requireAuth, async (req, res) => {
  try {
    const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
    const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;

    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      return res.status(500).json({ error: 'Evolution API não configurada' });
    }

    const baseUrl = EVOLUTION_API_URL.replace(/\/$/, '');
    const headers = { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY };
    const { action, instanceName, number, message, webhookUrl, groupJid } = req.body;
    const inst = instanceName || 'motogest';

    if (action === 'create-instance') {
      const r = await fetch(`${baseUrl}/instance/create`, {
        method: 'POST', headers,
        body: JSON.stringify({ instanceName: inst, qrcode: true, integration: 'WHATSAPP-BAILEYS' }),
      });
      const data = await r.json();
      if (data?.status === 403) {
        const qrR = await fetch(`${baseUrl}/instance/connect/${inst}`, { method: 'GET', headers });
        const qrData = await qrR.json();
        const qr = qrData?.base64 || qrData?.qrcode?.base64;
        if (qr) return res.json({ qrcode: { base64: qr } });
        return res.json(qrData);
      }
      const qr = data?.qrcode?.base64 || data?.base64;
      if (qr) return res.json({ qrcode: { base64: qr } });
      return res.json(data);
    }

    if (action === 'get-qrcode') {
      const r = await fetch(`${baseUrl}/instance/connect/${inst}`, { method: 'GET', headers });
      const data = await r.json();
      const qr = data?.base64 || data?.qrcode?.base64;
      if (qr) return res.json({ base64: qr, qrcode: { base64: qr } });
      return res.json(data);
    }

    if (action === 'connection-state') {
      const r = await fetch(`${baseUrl}/instance/connectionState/${inst}`, { method: 'GET', headers });
      return res.json(await r.json());
    }

    if (action === 'send-message') {
      if (!number || !message) return res.status(400).json({ error: 'Número e mensagem são obrigatórios' });
      const clean = number.replace(/\D/g, '');
      const cleanNumber = clean.startsWith('55') ? clean : '55' + clean;
      const r = await fetch(`${baseUrl}/message/sendText/${inst}`, {
        method: 'POST', headers,
        body: JSON.stringify({ number: cleanNumber, text: message }),
      });
      return res.json(await r.json());
    }

    if (action === 'logout') {
      const r = await fetch(`${baseUrl}/instance/logout/${inst}`, { method: 'DELETE', headers });
      return res.json(await r.json());
    }

    if (action === 'delete-instance') {
      const r = await fetch(`${baseUrl}/instance/delete/${inst}`, { method: 'DELETE', headers });
      return res.json(await r.json());
    }

    if (action === 'set-webhook') {
      const r = await fetch(`${baseUrl}/webhook/set/${inst}`, {
        method: 'POST', headers,
        body: JSON.stringify({
          webhook: { enabled: !!webhookUrl, url: webhookUrl || '', webhookByEvents: false, events: ['MESSAGES_UPSERT'] },
        }),
      });
      return res.json(await r.json());
    }

    if (action === 'get-webhook') {
      const r = await fetch(`${baseUrl}/webhook/find/${inst}`, { method: 'GET', headers });
      return res.json(await r.json());
    }

    if (action === 'fetch-groups') {
      const r = await fetch(`${baseUrl}/group/fetchAllGroups/${inst}?getParticipants=false`, { method: 'GET', headers });
      return res.json(await r.json());
    }

    if (action === 'send-group-message') {
      if (!groupJid || !message) return res.status(400).json({ error: 'groupJid e message são obrigatórios' });
      const r = await fetch(`${baseUrl}/message/sendText/${inst}`, {
        method: 'POST', headers,
        body: JSON.stringify({ number: groupJid, text: message }),
      });
      return res.json(await r.json());
    }

    return res.status(400).json({ error: 'Ação inválida' });
  } catch (err) {
    console.error('whatsapp error:', err);
    return res.status(500).json({ error: err.message });
  }
});


// ─── POST /api/functions/whatsapp-bot ─────────────────────────────────────────
// FULLY DYNAMIC: All menus, sub-menus and responses come from the database
router.post("/whatsapp-bot", async (req, res) => {
  try {
    const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
    const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;

    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      return res.status(500).json({ error: "Evolution API não configurada" });
    }

    const baseUrl = EVOLUTION_API_URL.replace(/\/$/, "");
    const apiHeaders = { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY };

    // ── Helper: send plain text ──
    async function sendText(instanceName, number, text) {
      return fetch(`${baseUrl}/message/sendText/${instanceName}`, {
        method: "POST", headers: apiHeaders, body: JSON.stringify({ number, text }),
      });
    }

    // ── Helper: send interactive list (fully dynamic) ──
    async function sendList(instanceName, number, title, description, buttonText, footerText, sections) {
      const listUrl = `${baseUrl}/message/sendList/${instanceName}`;
      try {
        const resp = await fetch(listUrl, {
          method: "POST",
          headers: apiHeaders,
          body: JSON.stringify({ number, title, description, buttonText, footerText, sections }),
        });
        const respBody = await resp.text();
        console.log("[BOT] sendList:", { status: resp.status, body: respBody.substring(0, 300) });
        return resp;
      } catch (err) {
        console.error("[BOT] sendList ERROR:", err.message);
        throw err;
      }
    }

    // ── Load bot config from database ──
    async function loadConfig() {
      const { rows } = await pool.query("SELECT key, value FROM bot_config");
      const cfg = {};
      for (const r of rows) cfg[r.key] = r.value;
      return cfg;
    }

    // ── Load all menu items ──
    async function loadMenuItems() {
      const { rows } = await pool.query(
        "SELECT * FROM bot_menu_items WHERE is_active = true ORDER BY sort_order"
      );
      return rows;
    }

    // ── Build main menu from top-level items ──
    async function sendMainMenu(instanceName, number) {
      const config = await loadConfig();
      const items = await loadMenuItems();
      const topLevel = items.filter(i => !i.parent_id);

      const rows = topLevel.map(item => ({
        title: item.title,
        description: item.description || '',
        rowId: item.row_id,
      }));

      await sendList(
        instanceName,
        number,
        config.greeting_title || '021 Loca Motos',
        config.greeting_description || 'Bem-vindo! Escolha uma opcao:',
        config.greeting_button || 'Ver Opcoes',
        config.greeting_footer || '.',
        [{ title: "Menu Principal", rows }]
      );
    }

    // ── Build sub-menu from children of a parent item ──
    async function sendSubMenu(instanceName, number, parentItem, allItems) {
      const children = allItems.filter(i => i.parent_id === parentItem.id);

      // Always add navigation rows
      const navRows = [
        { title: "Voltar ao Menu", description: "Retornar ao menu principal", rowId: "voltar_menu" },
        { title: "Falar com Atendente", description: "Atendimento humano", rowId: "5" },
      ];

      if (children.length > 0) {
        // Has children → show them as interactive list
        const childRows = children.map(c => ({
          title: c.title,
          description: c.description || '',
          rowId: c.row_id,
        }));

        const sectionTitle = children[0]?.section_title || 'Opcoes';
        const sections = [
          { title: sectionTitle, rows: childRows },
          { title: "Navegacao", rows: navRows },
        ];

        await sendList(
          instanceName, number,
          parentItem.title,
          parentItem.response_text || parentItem.description || '',
          parentItem.button_text || 'Ver Opcoes',
          '.',
          sections
        );
      } else if (parentItem.response_text) {
        // No children, but has response text → send as list with response + nav
        await sendList(
          instanceName, number,
          parentItem.title,
          parentItem.response_text,
          'Ver Opcoes',
          '.',
          [{ title: "Opcoes", rows: navRows }]
        );
      }
    }

    // ── Handle reply item (send text + navigation sub-list) ──
    async function sendReplyItem(instanceName, number, item, allItems) {
      // Find parent to offer "voltar" to parent
      const parent = item.parent_id ? allItems.find(i => i.id === item.parent_id) : null;
      const navRows = [
        { title: "Voltar ao Menu", description: "Menu principal", rowId: "voltar_menu" },
      ];
      if (parent) {
        navRows.unshift({ title: "Voltar - " + parent.title, description: "Opcoes anteriores", rowId: parent.row_id });
      }
      navRows.push({ title: "Falar com Atendente", description: "Atendimento humano", rowId: "5" });

      if (item.response_text) {
        await sendList(
          instanceName, number,
          item.title,
          item.response_text,
          'Ver Opcoes',
          '.',
          [{ title: "Proximos passos", rows: navRows }]
        );
      }
    }

    // ════════════════════════════════════════════════════════════
    // MESSAGE PROCESSING
    // ════════════════════════════════════════════════════════════

    const body = req.body;
    console.log("[BOT] Webhook:", JSON.stringify({ event: body.event, instance: body.instance, key: body.data?.key, msgType: body.data?.messageType }).substring(0, 500));

    if (body.event !== "messages.upsert") return res.json({ ok: true, ignored: true });

    const messageData = body.data;
    if (!messageData) return res.json({ ok: true, skipped: true });

    const INSTANCE_NUMBER = "5521972803625";
    let isFromMe = !!messageData.key?.fromMe;
    if (isFromMe && messageData.key?.remoteJidAlt) {
      const altNumber = messageData.key.remoteJidAlt.replace(/@.*/, "");
      if (altNumber !== INSTANCE_NUMBER) {
        isFromMe = false;
        console.log("[BOT] LID fix: fromMe corrected to false for", altNumber);
      }
    }
    if (isFromMe) return res.json({ ok: true, skipped: true });

    const incomingText =
      messageData.message?.listResponseMessage?.singleSelectReply?.selectedRowId
      || messageData.message?.listResponseMessage?.selectedRowId
      || messageData.message?.buttonsResponseMessage?.selectedButtonId
      || messageData.message?.templateButtonReplyMessage?.selectedId
      || messageData.message?.conversation
      || messageData.message?.extendedTextMessage?.text
      || "";

    if (!incomingText) return res.json({ ok: true, no_text: true });

    const rawJid = messageData.key?.remoteJidAlt || messageData.key?.remoteJid || "";
    const instanceName = body.instance || "motogest";
    const isGroup = rawJid.includes("@g.us");
    console.log("[BOT] Processing:", { incomingText, rawJid, instanceName, isGroup });

    // ── Group handling ──
    if (isGroup) {
      const groupSettingResult = await pool.query("SELECT value FROM bot_settings WHERE key = 'support_group_jid'");
      const supportGroupJid = groupSettingResult.rows[0]?.value;

      if (supportGroupJid && rawJid.replace(/@.*/, "") === supportGroupJid.replace(/@.*/, "")) {
        const hashMatch = incomingText.match(/^#(\d{10,15})\s+(.+)$/s);
        if (hashMatch) {
          const clientPhone = hashMatch[1];
          const replyText = hashMatch[2].trim();
          if (replyText === "#encerrar") {
            await pool.query(
              "UPDATE atendimentos SET status = 'encerrado', closed_at = NOW() WHERE cliente_phone = $1 AND status = 'em_atendimento'",
              [clientPhone]
            );
            await sendText(instanceName, clientPhone, "Atendimento encerrado. Se precisar de algo mais, digite *menu*.");
          } else {
            await sendText(instanceName, clientPhone, replyText);
            await pool.query(
              "UPDATE atendimentos SET status = 'em_atendimento' WHERE cliente_phone = $1 AND status = 'aguardando'",
              [clientPhone]
            );
          }
        }
      }
      return res.json({ ok: true, group_handled: true });
    }

    const senderNumber = rawJid.endsWith("@lid") ? rawJid : rawJid.replace(/@.*/, "");

    // ── Pending invite check ──
    const pendingInviteResult = await pool.query(
      "SELECT * FROM pending_whatsapp_invites WHERE phone = $1 AND sent = false ORDER BY created_at DESC LIMIT 1",
      [senderNumber]
    );
    if (pendingInviteResult.rows.length > 0) {
      const invite = pendingInviteResult.rows[0];
      const link = `https://021locamotos.com/register?token=${invite.invite_token}`;
      await sendText(instanceName, senderNumber, `*Link de cadastro:*\n\n${link}\n\nEste link expira em 2 horas.`);
      await pool.query("UPDATE pending_whatsapp_invites SET sent = true, sent_at = NOW() WHERE id = $1", [invite.id]);
      return res.json({ ok: true, invite_sent: true });
    }

    // ── Active support session ──
    const activeSessionResult = await pool.query(
      "SELECT * FROM atendimentos WHERE cliente_phone = $1 AND status IN ('aguardando', 'em_atendimento') ORDER BY created_at DESC LIMIT 1",
      [senderNumber]
    );
    if (activeSessionResult.rows.length > 0) {
      const session = activeSessionResult.rows[0];
      const groupSettingResult = await pool.query("SELECT value FROM bot_settings WHERE key = 'support_group_jid'");
      const groupJid = groupSettingResult.rows[0]?.value;

      if (incomingText.trim() === "0" || incomingText.trim().toLowerCase() === "sair") {
        await pool.query("UPDATE atendimentos SET status = 'encerrado', closed_at = NOW() WHERE id = $1", [session.id]);
        await sendText(instanceName, senderNumber, "Atendimento encerrado.");
        await sendMainMenu(instanceName, senderNumber);
        return res.json({ ok: true, session_closed: true });
      } else if (groupJid) {
        const clientName = session.cliente_name || senderNumber;
        const forwardMsg = `*Mensagem de ${clientName}* (${senderNumber}):\n\n${incomingText}\n\n_Responda: #${senderNumber} sua mensagem_\n_Para encerrar: #${senderNumber} #encerrar_`;
        await sendText(instanceName, groupJid, forwardMsg);
        return res.json({ ok: true, forwarded: true });
      }
    }

    // ── Load menu items and config ──
    const allItems = await loadMenuItems();
    const config = await loadConfig();

    // ── Keyword menu triggers ──
    const KEYWORDS_MENU = ["oi", "olá", "ola", "menu", "início", "inicio", "começar", "comecar", "ajuda", "help", "bom dia", "boa tarde", "boa noite"];
    const shouldShowMenu = KEYWORDS_MENU.some(kw => incomingText.trim().toLowerCase().includes(kw));

    if (shouldShowMenu || incomingText.trim() === "voltar_menu") {
      await sendMainMenu(instanceName, senderNumber);
      return res.json({ ok: true, responded: true });
    }

    // ── Find matching menu item by row_id ──
    const key = incomingText.trim();
    const matchedItem = allItems.find(i => i.row_id === key);

    if (matchedItem) {
      if (matchedItem.action_type === 'attendant') {
        // Forward to support group
        const groupSettingResult = await pool.query("SELECT value FROM bot_settings WHERE key = 'support_group_jid'");
        const groupJid = groupSettingResult.rows[0]?.value;
        if (groupJid) {
          const clientName = messageData.pushName || senderNumber;
          await pool.query(
            "INSERT INTO atendimentos (cliente_phone, cliente_name, status, created_at) VALUES ($1, $2, $3, NOW())",
            [senderNumber, clientName, "aguardando"]
          );
          const notifyMsg = `*Novo atendimento*\n\nCliente: *${clientName}*\nTelefone: ${senderNumber}\n\n_Para responder: #${senderNumber} sua mensagem_\n_Para encerrar: #${senderNumber} #encerrar_`;
          await sendText(instanceName, groupJid, notifyMsg);
          await sendText(instanceName, senderNumber, "*Aguarde.*\n\nUm atendente foi notificado e respondera em breve.\n\n_Digite *sair* ou *0* para voltar ao menu._");
        } else if (matchedItem.response_text) {
          await sendText(instanceName, senderNumber, matchedItem.response_text);
        }
      } else if (matchedItem.action_type === 'submenu') {
        // Show sub-menu with children
        await sendSubMenu(instanceName, senderNumber, matchedItem, allItems);
      } else {
        // Reply type - send response text with navigation
        await sendReplyItem(instanceName, senderNumber, matchedItem, allItems);
      }
    } else {
      // No match - send fallback
      const fallback = config.fallback_message || "Opcao nao reconhecida. Digite *menu* para ver as opcoes.";
      await sendText(instanceName, senderNumber, fallback);
    }

    return res.json({ ok: true, responded: true });
  } catch (err) {
    console.error("whatsapp-bot error:", err);
    return res.status(500).json({ error: err.message });
  }
});



// ─── POST /api/functions/send-email-otp ──────────────────────────────────────
router.post('/send-email-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'E-mail inválido' });

    const code = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await pool.query(
      `INSERT INTO otp_codes (identifier, code, expires_at, verified, created_at)
       VALUES ($1, $2, $3, false, NOW())
       ON CONFLICT (identifier) DO UPDATE SET code = $2, expires_at = $3, verified = false, created_at = NOW()`,
      [`email:${email.toLowerCase()}`, code, expiresAt]
    );

    await sendResendEmail(email, '🔐 Código de Verificação - 021 Loca Motos', `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;">
        <h1 style="color:#1a1f36;text-align:center;">🏍️ 021 Loca Motos</h1>
        <div style="background:#f8f9fa;border-radius:12px;padding:32px;text-align:center;">
          <p style="color:#555;font-size:16px;">Seu código de verificação é:</p>
          <div style="background:#1a1f36;color:#f5a623;font-size:32px;font-weight:bold;letter-spacing:8px;padding:16px 24px;border-radius:8px;display:inline-block;">
            ${code}
          </div>
          <p style="color:#888;font-size:13px;margin-top:20px;">Não compartilhe. Expira em 10 minutos.</p>
        </div>
      </div>
    `);

    return res.json({ success: true });
  } catch (err) {
    console.error('send-email-otp error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/functions/generate-whatsapp-otp ───────────────────────────────
router.post('/generate-whatsapp-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone || phone.replace(/\D/g, '').length < 10) {
      return res.status(400).json({ error: 'Número de telefone inválido' });
    }

    const phoneDigits = phone.replace(/\D/g, '');
    const code = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await pool.query(
      `INSERT INTO otp_codes (identifier, code, expires_at, verified, created_at)
       VALUES ($1, $2, $3, false, NOW())
       ON CONFLICT (identifier) DO UPDATE SET code = $2, expires_at = $3, verified = false, created_at = NOW()`,
      [`whatsapp:${phoneDigits}`, code, expiresAt]
    );

    const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
    const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) throw new Error('Evolution API não configurada');

    const baseUrl = EVOLUTION_API_URL.replace(/\/$/, '');
    const cleanNumber = phoneDigits.startsWith('55') ? phoneDigits : '55' + phoneDigits;

    const r = await fetch(`${baseUrl}/message/sendText/motogest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY },
      body: JSON.stringify({
        number: cleanNumber,
        text: `🔐 021 Loca Motos - Seu código de verificação é: *${code}*\n\nNão compartilhe este código. Ele expira em 10 minutos.`,
      }),
    });

    if (!r.ok) throw new Error('Falha ao enviar mensagem WhatsApp');

    return res.json({ success: true });
  } catch (err) {
    console.error('generate-whatsapp-otp error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/functions/verify-otp ──────────────────────────────────────────
router.post('/verify-otp', async (req, res) => {
  try {
    const { identifier, code } = req.body;
    if (!identifier || !code) return res.status(400).json({ error: 'identifier e code são obrigatórios' });

    const result = await pool.query(
      'SELECT * FROM otp_codes WHERE identifier = $1 ORDER BY created_at DESC LIMIT 1',
      [identifier]
    );

    if (result.rows.length === 0) return res.status(400).json({ error: 'Código não encontrado' });

    const otp = result.rows[0];

    if (otp.verified) return res.status(400).json({ error: 'Código já utilizado' });
    if (new Date() > new Date(otp.expires_at)) return res.status(400).json({ error: 'Código expirado' });
    if (otp.code !== code) return res.status(400).json({ error: 'Código inválido' });

    await pool.query('UPDATE otp_codes SET verified = true WHERE identifier = $1', [identifier]);

    return res.json({ success: true, verified: true });
  } catch (err) {
    console.error('verify-otp error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/functions/notify-admin-new-user ───────────────────────────────
router.post('/notify-admin-new-user', async (req, res) => {
  try {
    const { userName, userEmail } = req.body;

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_API_KEY) return res.status(500).json({ error: 'RESEND_API_KEY not configured' });

    // Get all admin user_ids
    const adminRolesResult = await pool.query("SELECT user_id FROM user_roles WHERE role = 'admin'");
    if (adminRolesResult.rows.length === 0) return res.json({ message: 'No admins found' });

    const adminIds = adminRolesResult.rows.map(r => r.user_id);
    const placeholders = adminIds.map((_, i) => `$${i + 1}`).join(',');
    const adminEmailsResult = await pool.query(`SELECT email FROM users WHERE id IN (${placeholders})`, adminIds);
    const adminEmails = adminEmailsResult.rows.map(r => r.email).filter(Boolean);

    if (adminEmails.length === 0) return res.json({ message: 'No admin emails found' });

    await sendResendEmail(adminEmails, `🏍️ Novo Cadastro Pendente — ${userName || userEmail}`, `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <h2 style="color:#1a1a1a;">Novo Cadastro Pendente</h2>
        <p style="color:#555;">Um novo cliente se cadastrou e está aguardando aprovação:</p>
        <div style="background:#f5f5f5;border-radius:8px;padding:16px;margin:16px 0;">
          <p style="margin:4px 0;"><strong>Nome:</strong> ${userName || '—'}</p>
          <p style="margin:4px 0;"><strong>Email:</strong> ${userEmail || '—'}</p>
        </div>
        <p style="color:#555;">Acesse o painel administrativo para revisar e aprovar o cadastro.</p>
        <p style="color:#999;font-size:12px;margin-top:24px;">021 Loca Motos — Sistema de Gestão</p>
      </div>
    `);

    return res.json({ success: true });
  } catch (err) {
    console.error('notify-admin-new-user error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/functions/send-welcome-email ───────────────────────────────────
router.post('/send-welcome-email', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId é obrigatório' });

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_API_KEY) return res.status(500).json({ error: 'RESEND_API_KEY not configured' });

    const userResult = await pool.query(
      'SELECT u.email, p.display_name FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado' });

    const { email, display_name } = userResult.rows[0];
    if (!email) return res.status(400).json({ error: 'Usuário sem email' });

    await sendResendEmail(email, '✅ Cadastro Aprovado - 021 Loca Motos', `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;">
        <h1 style="color:#1a1f36;text-align:center;">🏍️ 021 Loca Motos</h1>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:32px;text-align:center;">
          <div style="font-size:48px;margin-bottom:16px;">🎉</div>
          <h2 style="color:#166534;">Bem-vindo(a), ${display_name || 'Cliente'}!</h2>
          <p style="color:#555;font-size:16px;line-height:1.5;">
            Seu cadastro foi <strong>aprovado</strong> pelo nosso time! Agora você pode acessar a plataforma.
          </p>
          <a href="https://021locamotos.com/auth" style="display:inline-block;background:#1a1f36;color:#f5a623;font-weight:bold;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;margin-top:16px;">
            Acessar Minha Conta
          </a>
        </div>
        <p style="color:#aaa;font-size:12px;text-align:center;margin-top:24px;">Em caso de dúvidas, entre em contato pelo WhatsApp.</p>
      </div>
    `);

    return res.json({ success: true });
  } catch (err) {
    console.error('send-welcome-email error:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
