const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Variables de entorno
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const ISSUER_ID = process.env.ISSUER_ID || '3388000000023211563';
const CLASS_ID = `${ISSUER_ID}.credencial_afiliado`;

// Parseo seguro de la cuenta de servicio Google
let serviceAccount = {};
if (process.env.GOOGLE_SERVICE_ACCOUNT) {
  try {
    serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  } catch (e) {
    console.error('Error parseando GOOGLE_SERVICE_ACCOUNT:', e);
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Función auxiliar para subir archivos al Storage de Supabase
async function subirArchivoStorage(file, subcarpeta, curp) {
  if (!file) return '';
  const fileExt = path.extname(file.originalname) || '.jpg';
  const filePath = `ine/${subcarpeta}/${curp}_${Date.now()}${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from('documentos')
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
      upsert: true
    });

  if (uploadError) {
    console.error(`Error subiendo ${subcarpeta}:`, uploadError.message);
    return '';
  }

  const { data } = supabase.storage.from('documentos').getPublicUrl(filePath);
  return data ? data.publicUrl : '';
}

// Endpoint de registro
app.post('/api/registrar', upload.fields([
  { name: 'ine_frente', maxCount: 1 },
  { name: 'ine_reverso', maxCount: 1 }
]), async (req, res) => {
  try {
    const { nombre_completo, curp, telefono, direccion, seccion_electoral } = req.body;

    if (!curp || !nombre_completo) {
      return res.status(400).json({ error: 'Nombre y CURP son obligatorios' });
    }

    const archivoFrente = req.files && req.files['ine_frente'] ? req.files['ine_frente'][0] : null;
    const archivoReverso = req.files && req.files['ine_reverso'] ? req.files['ine_reverso'][0] : null;

    if (!archivoFrente || !archivoReverso) {
      return res.status(400).json({ error: 'Ambas fotos de la INE (frente y reverso) son requeridas' });
    }

    // 1. Guardar ambos lados en Supabase Storage
    const ineFrenteUrl = await subirArchivoStorage(archivoFrente, 'frente', curp);
    const ineReversoUrl = await subirArchivoStorage(archivoReverso, 'reverso', curp);

    const objectId = `${ISSUER_ID}.usr_${Date.now()}`;

    // 2. Guardar en tabla afiliados
    const { error: dbError } = await supabase.from('afiliados').insert([{
      nombre_completo,
      curp,
      telefono,
      direccion,
      seccion_electoral,
      foto_ine_frente_url: ineFrenteUrl,
      foto_ine_reverso_url: ineReversoUrl,
      estatus: 'ACTIVO',
      saldo: 0,
      google_wallet_object_id: objectId
    }]);

    if (dbError) {
      return res.status(400).json({ error: `Error en BD: ${dbError.message}` });
    }

    // 3. Crear Objeto de Google Wallet
    const genericObject = {
      id: objectId,
      classId: CLASS_ID,
      state: 'ACTIVE',
      cardTitle: {
        defaultValue: {
          language: 'es-419',
          value: 'CREDENCIAL DE AFILIADO'
        }
      },
      header: {
        defaultValue: {
          language: 'es-419',
          value: nombre_completo
        }
      },
      subheader: {
        defaultValue: {
          language: 'es-419',
          value: 'CURP'
        }
      },
      textModulesData: [
        {
          id: 'curp_val',
          header: 'CURP',
          body: curp
        },
        {
          id: 'seccion_val',
          header: 'SECCIÓN ELECTORAL',
          body: seccion_electoral || 'N/A'
        }
      ],
      barcode: {
        type: 'qrCode',
        value: curp
      }
    };

    // 4. Mostrar foto del frente del INE en la credencial digital
    if (ineFrenteUrl) {
      genericObject.imageModulesData = [
        {
          mainImage: {
            sourceUri: {
              uri: ineFrenteUrl
            },
            contentDescription: {
              defaultValue: {
                language: 'es-419',
                value: 'Identificación Oficial'
              }
            }
          },
          id: 'foto_ine'
        }
      ];
    }

    // 5. Firma JWT sin restricciones de origins
    const claims = {
      iss: serviceAccount.client_email,
      aud: 'google',
      typ: 'savetowallet',
      payload: {
        genericObjects: [genericObject]
      }
    };

    const privateKey = (serviceAccount.private_key || '').replace(/\\n/g, '\n');
    const token = jwt.sign(claims, privateKey, { algorithm: 'RS256' });
    const saveUrl = `https://pay.google.com/gp/v/save/${token}`;

    return res.json({ success: true, walletUrl: saveUrl });
  } catch (error) {
    console.error('Error en /api/registrar:', error);
    return res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Servidor activo en el puerto ${PORT}`);
  });
}

const { google } = require('googleapis');

// Endpoint para enviar notificaciones Push a un afiliado
app.post('/api/notificar', async (req, res) => {
  try {
    const { curp, titulo, mensaje } = req.body;

    if (!curp || !titulo || !mensaje) {
      return res.status(400).json({ error: 'Faltan campos: curp, titulo o mensaje' });
    }

    // 1. Obtener el google_wallet_object_id del afiliado desde Supabase
    const { data: afiliado, error: dbError } = await supabase
      .from('afiliados')
      .select('google_wallet_object_id')
      .eq('curp', curp)
      .single();

    if (dbError || !afiliado || !afiliado.google_wallet_object_id) {
      return res.status(404).json({ error: 'Afiliado o credencial no encontrada para esa CURP' });
    }

    // 2. Autenticar cliente con la cuenta de servicio de Google
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/wallet_object.issuer']
    });

    const wallet = google.walletobjects({ version: 'v1', auth });
    const objectId = afiliado.google_wallet_object_id;

    // 3. Ejecutar PATCH agregando un mensaje (dispara la alerta push)
    const response = await wallet.genericobject.patch({
      resourceId: objectId,
      requestBody: {
        messages: [
          {
            header: titulo,
            body: mensaje,
            id: `msg_${Date.now()}`
          }
        ]
      }
    });

    return res.json({ 
      success: true, 
      message: 'Notificación push enviada con éxito',
      objectId 
    });

  } catch (error) {
    console.error('Error enviando push:', error);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = app;
