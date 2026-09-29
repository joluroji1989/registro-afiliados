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

// Credenciales de la cuenta de servicio de Google
let serviceAccount = {};
if (process.env.GOOGLE_SERVICE_ACCOUNT) {
  try {
    serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  } catch (e) {
    console.error('Error parseando GOOGLE_SERVICE_ACCOUNT:', e);
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Endpoint de registro y generacion de credencial
app.post('/api/registrar', upload.fields([{ name: 'foto_perfil', maxCount: 1 }, { name: 'foto_ine', maxCount: 1 }]), async (req, res) => {
  try {
    const { nombre_completo, curp, telefono, direccion, seccion_electoral } = req.body;

    if (!curp || !nombre_completo) {
      return res.status(400).json({ error: 'Nombre y CURP son obligatorios' });
    }

    // 1. Subir fotografia de perfil a Supabase Storage
    let fotoPerfilUrl = '';
    if (req.files && req.files['foto_perfil']) {
      const file = req.files['foto_perfil'][0];
      const filePath = `perfiles/${curp}_${Date.now()}${path.extname(file.originalname)}`;
      const { error: uploadError } = await supabase.storage
        .from('documentos')
        .upload(filePath, file.buffer, { contentType: file.mimetype });

      if (!uploadError) {
        const { data: publicUrlData } = supabase.storage.from('documentos').getPublicUrl(filePath);
        fotoPerfilUrl = publicUrlData.publicUrl;
      }
    }

    // 2. Subir INE si fue proporcionada
    let fotoIneUrl = '';
    if (req.files && req.files['foto_ine']) {
      const file = req.files['foto_ine'][0];
      const filePath = `ine/${curp}_${Date.now()}${path.extname(file.originalname)}`;
      const { error: ineUploadError } = await supabase.storage
        .from('documentos')
        .upload(filePath, file.buffer, { contentType: file.mimetype });

      if (!ineUploadError) {
        const { data: ineUrlData } = supabase.storage.from('documentos').getPublicUrl(filePath);
        fotoIneUrl = ineUrlData.publicUrl;
      }
    }

    // Identificador unico para el objeto en Google Wallet
    //const objectId = `${ISSUER_ID}.${curp.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const objectId = `3388000000023211563.prueba_${Date.now()}`;
    // 3. Guardar en la base de datos Supabase
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

    // 4. Construir objeto generico de Google Wallet
    // Usamos Date.now() para garantizar un ID 100% único en cada prueba
const genericObject = {
  id: objectId,
  classId: '3388000000023211563.credencial_afiliado',
  state: 'ACTIVE',
  cardTitle: {
    defaultValue: {
      language: 'es-419',
      value: 'CREDENCIAL DE PRUEBA'
    }
  },
  header: {
    defaultValue: {
      language: 'es-419',
      value: 'Afiliado Test'
    }
  }
};

    if (fotoPerfilUrl) {
      if (fotoPerfilUrl && fotoPerfilUrl.startsWith('http')) {
  genericObject.imageModulesData = [
    {
      mainImage: {
        sourceUri: {
          uri: fotoPerfilUrl
        },
        contentDescription: {
          defaultValue: {
            language: 'es-419',
            value: 'Foto del Afiliado'
          }
        }
      },
      id: 'foto_afiliado'
    }
  ];
}
    }

    // 5. Firmar el JWT con la llave privada de Google Cloud
    const claims = {
      iss: serviceAccount.client_email,
      aud: 'google',
      typ: 'savetowallet',
      payload: {
        genericObjects: [genericObject]
      }
    };

    // 1. Limpiamos la clave privada para corregir los saltos de línea de Vercel
const privateKey = serviceAccount.private_key.replace(/\\n/g, '\n');

// 2. Firmamos el token con la clave ya limpia
console.log(">>> ALARMA: EL SERVIDOR SÍ ESTÁ USANDO ESTE CÓDIGO <<<");
console.log("OBJETO A ENVIAR:", JSON.stringify(genericObject, null, 2));
const token = jwt.sign(claims, privateKey, { algorithm: 'RS256' });
const saveUrl = `https://pay.google.com/gp/v/save/${token}`;

    return res.json({ success: true, walletUrl: saveUrl });
  } catch (error) {
    console.error('Error procesando registro:', error);
    return res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor activo en el puerto ${PORT}`);
});