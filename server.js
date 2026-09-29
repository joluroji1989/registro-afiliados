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

// Parsear cuenta de servicio
let serviceAccount = {};
if (process.env.GOOGLE_SERVICE_ACCOUNT) {
  try {
    serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  } catch (e) {
    console.error('Error parseando GOOGLE_SERVICE_ACCOUNT:', e);
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Endpoint de registro
app.post('/api/registrar', upload.fields([
  { name: 'foto_perfil', maxCount: 1 },
  { name: 'foto_ine', maxCount: 1 }
]), async (req, res) => {
  try {
    const { nombre_completo, curp, telefono, direccion, seccion_electoral } = req.body;

    if (!curp || !nombre_completo) {
      return res.status(400).json({ error: 'Nombre y CURP son obligatorios' });
    }

    // 1. Subir fotografía de perfil si existe
    let fotoPerfilUrl = '';
    if (req.files && req.files['foto_perfil'] && req.files['foto_perfil'][0]) {
      const file = req.files['foto_perfil'][0];
      const filePath = `perfiles/${curp}_${Date.now()}${path.extname(file.originalname)}`;
      const { error: uploadError } = await supabase.storage
        .from('documentos')
        .upload(filePath, file.buffer, { contentType: file.mimetype });

      if (!uploadError) {
        const { data: publicUrlData } = supabase.storage.from('documentos').getPublicUrl(filePath);
        fotoPerfilUrl = publicUrlData ? publicUrlData.publicUrl : '';
      }
    }

    // 2. Subir fotografía de INE si existe
    let fotoIneUrl = '';
    if (req.files && req.files['foto_ine'] && req.files['foto_ine'][0]) {
      const file = req.files['foto_ine'][0];
      const filePath = `ine/${curp}_${Date.now()}${path.extname(file.originalname)}`;
      const { error: ineUploadError } = await supabase.storage
        .from('documentos')
        .upload(filePath, file.buffer, { contentType: file.mimetype });

      if (!ineUploadError) {
        const { data: ineUrlData } = supabase.storage.from('documentos').getPublicUrl(filePath);
        fotoIneUrl = ineUrlData ? ineUrlData.publicUrl : '';
      }
    }

    // Generar ID único para el objeto de Google Wallet
    const objectId = `${ISSUER_ID}.usr_${Date.now()}`;

    // 3. Guardar registro en Supabase
    const { error: dbError } = await supabase.from('afiliados').insert([{
      nombre_completo,
      curp,
      telefono,
      direccion,
      seccion_electoral,
      foto_perfil_url: fotoPerfilUrl,
      foto_ine_url: fotoIneUrl,
      google_wallet_object_id: objectId
    }]);

    if (dbError) {
      return res.status(400).json({ error: `Error en BD: ${dbError.message}` });
    }

    // 4. Objeto de Google Wallet simplificado
    const genericObject = {
      id: objectId,
      classId: CLASS_ID,
      state: 'ACTIVE',
      cardTitle: {
        defaultValue: {
          language: 'es-419',
          value: 'Credencial Afiliado'
        }
      },
      header: {
        defaultValue: {
          language: 'es-419',
          value: nombre_completo
        }
      }
    };

    // 5. Generar firma JWT
    const claims = {
      iss: serviceAccount.client_email,
      aud: 'google',
      typ: 'savetowallet',
      payload: {
        genericObjects: [genericObject]
      }
    };

    const privateKey = serviceAccount.private_key.replace(/\\n/g, '\n');
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

module.exports = app;
