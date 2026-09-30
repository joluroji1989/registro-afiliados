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

<<<<<<< HEAD
// Parseo de cuenta de servicio Google
=======
// Parseo seguro de la cuenta de servicio
>>>>>>> b7ba2883e0b22d547d49f6d714dce35bf982a7f3
let serviceAccount = {};
if (process.env.GOOGLE_SERVICE_ACCOUNT) {
  try {
    serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  } catch (e) {
    console.error('Error parseando GOOGLE_SERVICE_ACCOUNT:', e);
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

<<<<<<< HEAD
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
=======
// Endpoint de registro
app.post('/api/registrar', upload.fields([
  { name: 'foto_perfil', maxCount: 1 },
  { name: 'foto_ine', maxCount: 1 }
]), async (req, res) => {
>>>>>>> b7ba2883e0b22d547d49f6d714dce35bf982a7f3
  try {
    const { nombre_completo, curp, telefono, direccion, seccion_electoral } = req.body;

    if (!curp || !nombre_completo) {
      return res.status(400).json({ error: 'Nombre y CURP son obligatorios' });
    }

<<<<<<< HEAD
    const archivoFrente = req.files && req.files['ine_frente'] ? req.files['ine_frente'][0] : null;
    const archivoReverso = req.files && req.files['ine_reverso'] ? req.files['ine_reverso'][0] : null;
=======
    // 1. Subida opcional de imagen de perfil
    let fotoPerfilUrl = '';
    if (req.files && req.files['foto_perfil'] && req.files['foto_perfil'][0]) {
      const file = req.files['foto_perfil'][0];
      const filePath = `perfiles/${curp}_${Date.now()}${path.extname(file.originalname)}`;
      const { error: uploadError } = await supabase.storage
        .from('documentos')
        .upload(filePath, file.buffer, { contentType: file.mimetype });
>>>>>>> b7ba2883e0b22d547d49f6d714dce35bf982a7f3

<<<<<<< HEAD
    if (!archivoFrente || !archivoReverso) {
      return res.status(400).json({ error: 'Ambas fotos de la INE (frente y reverso) son requeridas' });
=======
      if (!uploadError) {
        const { data: publicUrlData } = supabase.storage.from('documentos').getPublicUrl(filePath);
        fotoPerfilUrl = publicUrlData ? publicUrlData.publicUrl : '';
      }
>>>>>>> b7ba2883e0b22d547d49f6d714dce35bf982a7f3
    }

<<<<<<< HEAD
    // 1. Guardar ambos lados en Supabase Storage
    const ineFrenteUrl = await subirArchivoStorage(archivoFrente, 'frente', curp);
    const ineReversoUrl = await subirArchivoStorage(archivoReverso, 'reverso', curp);
=======
    // 2. Subida opcional de INE
    let fotoIneUrl = '';
    if (req.files && req.files['foto_ine'] && req.files['foto_ine'][0]) {
      const file = req.files['foto_ine'][0];
      const filePath = `ine/${curp}_${Date.now()}${path.extname(file.originalname)}`;
      const { error: ineUploadError } = await supabase.storage
        .from('documentos')
        .upload(filePath, file.buffer, { contentType: file.mimetype });
>>>>>>> b7ba2883e0b22d547d49f6d714dce35bf982a7f3

<<<<<<< HEAD
    const objectId = `${ISSUER_ID}.usr_${Date.now()}`;
=======
      if (!ineUploadError) {
        const { data: ineUrlData } = supabase.storage.from('documentos').getPublicUrl(filePath);
        fotoIneUrl = ineUrlData ? ineUrlData.publicUrl : '';
      }
    }
>>>>>>> b7ba2883e0b22d547d49f6d714dce35bf982a7f3

<<<<<<< HEAD
    // 2. Guardar en tabla afiliados
=======
    // Identificador único
    const objectId = `${ISSUER_ID}.usr_${Date.now()}`;

    // 3. Inserción en base de datos Supabase
>>>>>>> b7ba2883e0b22d547d49f6d714dce35bf982a7f3
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

<<<<<<< HEAD
    // 3. Crear Objeto de Google Wallet
    const genericObject = {
      id: objectId,
      classId: CLASS_ID,
      state: 'ACTIVE',
      cardTitle: {
        defaultValue: {
          language: 'es-419',
          value: 'CREDENCIAL DE AFILIADO'
=======
    // 4. Objeto de Google Wallet con estructura compatible
    // 4. Objeto de Google Wallet con cardTitle y header requeridos
    const genericObject = {
      id: objectId,
      classId: CLASS_ID,
      state: 'ACTIVE',
      cardTitle: {
        defaultValue: {
          language: 'es-419',
          value: 'CREDENCIAL DE AFILIADO'
>>>>>>> b7ba2883e0b22d547d49f6d714dce35bf982a7f3
        }
      },
      header: {
        defaultValue: {
          language: 'es-419',
          value: nombre_completo || 'Afiliado'
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

<<<<<<< HEAD
    // 5. Firma JWT sin restricciones de origins
=======
    // 5. Firma del JWT
>>>>>>> b7ba2883e0b22d547d49f6d714dce35bf982a7f3
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

<<<<<<< HEAD
module.exports = app;
=======
module.exports = app;

>>>>>>> b7ba2883e0b22d547d49f6d714dce35bf982a7f3