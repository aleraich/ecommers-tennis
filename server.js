const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const https = require('https');
const http = require('follow-redirects').http;
const httpsFollow = require('follow-redirects').https;

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'x7k9m2p8q3z5w1r4t6y';

// Configuración de OAuth 2.0 con tus credenciales
const oauth2Client = new OAuth2Client(
    '706462521119-0ur4vghsdphcg3bcutksoj5lc4vhn0gu.apps.googleusercontent.com', // client_id
    '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', // client_secret
    'http://localhost:3000/auth/callback' // redirect_uri
);

let drive;
async function initializeDrive() {
    try {
        console.log('Inicializando Google Drive API con OAuth...');
        const clientSecretPath = path.join(__dirname, 'client_secret_706462521119-0ur4vghsdphcg3bcutksoj5lc4vhn0gu.apps.googleusercontent.com.json');
        const credentialsPath = path.join(__dirname, 'credentials.json');
        let tokens = fs.existsSync(credentialsPath) ? JSON.parse(fs.readFileSync(credentialsPath)) : {};

        if (!tokens.refresh_token && !tokens.access_token) {
            console.log('No se encontraron tokens válidos. Completa el flujo OAuth en http://localhost:3000/auth/google.');
            return null;
        }

        oauth2Client.setCredentials(tokens);
        console.log('Credenciales cargadas desde credentials.json:', tokens.access_token ? 'con access_token' : 'sin access_token');

        // Configurar el evento "tokens" antes de cualquier operación
        oauth2Client.on('tokens', (newTokens) => {
            if (newTokens && (newTokens.access_token || newTokens.refresh_token)) {
                const updatedTokens = {
                    access_token: newTokens.access_token || tokens.access_token,
                    refresh_token: newTokens.refresh_token || tokens.refresh_token,
                    expiry_date: newTokens.expiry_date,
                };
                if (updatedTokens.access_token) {
                    tokens.access_token = updatedTokens.access_token;
                    console.log('Nuevo access token guardado:', updatedTokens.access_token);
                }
                if (updatedTokens.refresh_token) {
                    tokens.refresh_token = updatedTokens.refresh_token;
                    console.log('Nuevo refresh token guardado:', updatedTokens.refresh_token);
                }
                if (updatedTokens.expiry_date) {
                    tokens.expiry_date = updatedTokens.expiry_date;
                }
                if (Object.keys(tokens).length > 0) {
                    try {
                        fs.writeFileSync(credentialsPath, JSON.stringify(tokens, null, 2));
                        oauth2Client.setCredentials(tokens);
                        console.log('Tokens actualizados y guardados en credentials.json');
                    } catch (err) {
                        console.error('Error al guardar tokens en credentials.json:', err.message);
                    }
                }
            } else {
                console.warn('Tokens no recibidos correctamente en el evento "tokens". Verifica la autenticación.');
            }
        });

        // Forzar renovación si el token está expirado
        if (tokens.expiry_date && Date.now() >= tokens.expiry_date) {
            console.log('Token expirado, intentando renovar...');
            const { credentials } = await oauth2Client.refreshAccessToken();
            oauth2Client.setCredentials(credentials);
            fs.writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2));
            console.log('Token renovado exitosamente:', credentials.access_token);
        }

        drive = google.drive({ version: 'v3', auth: oauth2Client });
        console.log('Google Drive API inicializada correctamente:', drive ? 'éxito' : 'fallo');
        return drive;
    } catch (err) {
        console.error('Error al inicializar Google Drive API:', err.message);
        drive = null; // Evitar que el servidor se caiga si falla la inicialización
        return null;
    }
}

// Inicializar Drive al arrancar el servidor
initializeDrive().catch(err => console.error('Error en inicialización de Drive:', err));

const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '1CY3Nla2eVN5XN9VcsEI4m6v991yK-iOx';

// Configuración de Multer para subir archivos temporalmente
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const tempPath = path.join(__dirname, 'temp/uploads');
        try {
            fs.mkdirSync(tempPath, { recursive: true });
            console.log(`Carpeta temporal creada o existente: ${tempPath}`);
            cb(null, tempPath);
        } catch (err) {
            console.error('Error al crear carpeta temporal:', err.message);
            cb(err);
        }
    },
    filename: (req, file, cb) => {
        if (!file || !file.originalname) {
            console.log('No se proporcionó archivo válido en filename');
            return cb(null, 'no-file-' + Date.now());
        }
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        if (!file) {
            console.log('No se proporcionó archivo en fileFilter');
            return cb(null, true);
        }
        if (!file.originalname) {
            console.log('file.originalname es undefined');
            return cb(null, true);
        }
        const fileTypes = /jpeg|jpg|png|mp4|webm/;
        const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = fileTypes.test(file.mimetype);
        if (extname && mimetype) {
            console.log(`Archivo válido: ${file.originalname}, mimetype: ${file.mimetype}`);
            return cb(null, true);
        } else {
            console.log(`Archivo inválido: ${file.originalname}, mimetype: ${file.mimetype}`);
            cb(new Error('Solo se permiten imágenes (JPEG, PNG) y videos (MP4, WEBM)'));
        }
    },
    limits: { fileSize: 50 * 1024 * 1024 }
}).single('media');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Middleware para verificar JWT
const verifyToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Token requerido' });

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ message: 'Token inválido o expirado' });
        req.user = decoded;
        next();
    });
};

// Middleware para verificar rol de admin
const verifyAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Acceso denegado: se requiere rol de administrador' });
    next();
};

// Ruta para iniciar el flujo de OAuth
app.get('/auth/google', (req, res) => {
    const url = oauth2Client.generateAuthUrl({
        scope: ['https://www.googleapis.com/auth/drive.file'],
        access_type: 'offline', // Asegura que se genere un refresh token
        prompt: 'consent' // Fuerza el consentimiento para obtener refresh token
    });
    res.redirect(url);
});

app.get('/auth/callback', async (req, res) => {
    const code = req.query.code;
    try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        fs.writeFileSync(path.join(__dirname, 'credentials.json'), JSON.stringify(tokens, null, 2));
        console.log('Tokens guardados en credentials.json:', tokens);
        res.send('Autenticación exitosa. Puedes cerrar esta ventana y volver a /admin.html.');
    } catch (err) {
        console.error('Error en el callback de OAuth:', err.message);
        res.status(500).send('Error en la autenticación: ' + err.message);
    }
});

// Sirve index.html al acceder a la raíz /
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Proteger la ruta de admin.html
app.get('/admin.html', verifyToken, verifyAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Sirve cliente.html
app.get('/cliente.html', verifyToken, (req, res) => {
    if (req.user.role !== 'cliente') {
        return res.status(403).json({ message: 'Acceso denegado: se requiere rol de cliente' });
    }
    res.sendFile(path.join(__dirname, 'public', 'cliente.html'));
});

// Conexión a BD MySQL (Aiven o local)
const isLocal = process.env.DB_ENV === 'local';
const dbConfig = isLocal
    ? {
          host: process.env.DB_HOST || 'localhost',
          port: process.env.DB_PORT || 3306,
          user: process.env.DB_USER || 'root',
          password: process.env.DB_PASSWORD || '',
          database: process.env.DB_NAME || 'ecommers_tennis'
      }
    : {
          host: process.env.DB_HOST || 'mysql-ecommers-ecommers-tennis.c.aivencloud.com',
          port: process.env.DB_PORT || 16216,
          user: process.env.DB_USER || 'avnadmin',
          password: process.env.DB_PASSWORD,
          database: process.env.DB_NAME || 'ecommers_tennis',
          ssl: {
              ca: fs.existsSync(path.join(__dirname, 'ca.pem')) ? fs.readFileSync(path.join(__dirname, 'ca.pem')) : undefined
          }
      };

console.log('Configuración de la base de datos:', {
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    database: dbConfig.database,
    ssl: !!dbConfig.ssl
});

const db = mysql.createConnection(dbConfig);

db.connect((err) => {
    if (err) {
        console.error('Error al conectar a la base de datos:', err.message);
        console.error('Detalles del error:', err);
        return;
    }
    console.log(`Conectado a la base de datos ${isLocal ? 'local (XAMPP)' : 'Aiven MySQL'}`);
    db.query('SELECT COUNT(*) AS count FROM products', (err, results) => {
        if (err) {
            console.error('Error al verificar tabla products:', err.message);
            return;
        }
        console.log(`Tabla products tiene ${results[0].count} registros`);
    });
});

// Endpoint para login
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Correo y contraseña son requeridos' });
    }

    db.query('SELECT * FROM usuarios WHERE email = ?', [email], (err, results) => {
        if (err) {
            console.error('Error en la base de datos (login):', err.message);
            return res.status(500).json({ message: 'Error en el servidor', error: err.message });
        }

        if (results.length === 0) {
            return res.status(401).json({ message: 'Correo no registrado' });
        }

        const user = results[0];
        bcrypt.compare(password, user.password, (err, isValid) => {
            if (err) {
                console.error('Error al verificar contraseña:', err.message);
                return res.status(500).json({ message: 'Error en el servidor', error: err.message });
            }

            if (!isValid) {
                return res.status(401).json({ message: 'Contraseña incorrecta' });
            }

            const token = jwt.sign({ id: user.id, email: user.email, role: user.role, nombre: user.nombre }, JWT_SECRET, {
                expiresIn: '1h'
            });

            res.json({ role: user.role, nombre: user.nombre, token, message: 'Inicio de sesión exitoso' });
        });
    });
});

// Endpoint para registro
app.post('/api/register', (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ message: 'Nombre, correo y contraseña son requeridos' });
    }

    db.query('SELECT * FROM usuarios WHERE email = ?', [email], (err, results) => {
        if (err) {
            console.error('Error en la base de datos (register):', err.message);
            return res.status(500).json({ message: 'Error en el servidor', error: err.message });
        }

        if (results.length > 0) {
            return res.status(400).json({ message: 'El correo ya está registrado' });
        }

        bcrypt.hash(password, 10, (err, hash) => {
            if (err) {
                console.error('Error al hashear contraseña:', err.message);
                return res.status(500).json({ message: 'Error en el servidor', error: err.message });
            }

            db.query('INSERT INTO usuarios (nombre, email, password, role) VALUES (?, ?, ?, ?)', 
                    [name, email, hash, 'cliente'], (err, result) => {
                if (err) {
                    console.error('Error al registrar usuario:', err.message);
                    return res.status(500).json({ message: 'Error al registrar el usuario', error: err.message });
                }
                res.json({ message: 'Usuario registrado exitosamente' });
            });
        });
    });
});

// Obtener todos los productos
app.get('/products', (req, res) => {
    const { search, category, sort } = req.query;
    let query = 'SELECT id, name, price, media, description, category, created_at FROM products';
    let params = [];
    let conditions = [];

    if (search) {
        conditions.push('name LIKE ?');
        params.push(`%${search}%`);
    }
    if (category) {
        conditions.push('category = ?');
        params.push(category);
    }
    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }
    if (sort === 'newest') {
        query += ' ORDER BY created_at DESC';
    }

    console.log('Ejecutando consulta de productos:', query, 'Parámetros:', params);

    db.query(query, params, (err, results) => {
        if (err) {
            console.error('Error en la base de datos (products):', err.message);
            return res.status(500).json({ message: 'Error en la base de datos', error: err.message });
        }
        console.log(`Productos devueltos: ${results.length}`);
        res.json(results);
    });
});

// Obtener detalles de un producto
app.get('/api/product/:id', (req, res) => {
    const productId = req.params.id;
    console.log(`[API] Solicitud para producto con ID: ${productId}`);
    if (!productId || isNaN(productId)) {
        console.log(`[API] ID inválido: ${productId}`);
        return res.status(400).json({ message: 'ID de producto inválido' });
    }
    const query = 'SELECT id, name, price, media, description, category, created_at FROM products WHERE id = ?';
    const params = [productId];

    db.query(query, params, (err, results) => {
        if (err) {
            console.error(`[API] Error al ejecutar la consulta SQL para ID ${productId}:`, err.message);
            return res.status(500).json({ message: 'Error en la base de datos', error: err.message });
        }
        if (results.length === 0) {
            console.log(`[API] Producto con ID ${productId} no encontrado`);
            return res.status(404).json({ message: 'Producto no encontrado' });
        }
        console.log(`[API] Producto encontrado:`, results[0]);
        res.json(results[0]);
    });
});

// Añadir producto (protegido)
app.post('/admin/products', verifyToken, verifyAdmin, (req, res, next) => {
    upload(req, res, async (err) => {
        if (err instanceof multer.MulterError) {
            console.error('Error de Multer:', err.message);
            return res.status(400).json({ message: 'Error al procesar el archivo', error: err.message });
        } else if (err) {
            console.error('Error en fileFilter:', err.message);
            return res.status(400).json({ message: err.message });
        }

        console.log('Datos recibidos:', req.body, 'Archivo:', req.file ? req.file.originalname : 'Sin archivo');
        const { name, price, description, category } = req.body;
        if (!name || !price) {
            return res.status(400).json({ message: 'Nombre y precio son requeridos' });
        }

        // Validar que price sea un número y no exceda el rango
        const parsedPrice = parseFloat(price);
        if (isNaN(parsedPrice) || parsedPrice <= 0 || parsedPrice > 9999999999.99) {
            return res.status(400).json({ message: 'El precio debe ser un número positivo menor a 9,999,999,999.99' });
        }

        let media = null;
        if (req.file && drive) {
            try {
                console.log('Iniciando subida a Google Drive para archivo:', req.file.originalname);
                const fileMetadata = {
                    name: req.file.filename,
                    parents: [GOOGLE_DRIVE_FOLDER_ID]
                };
                const mediaUpload = {
                    mimeType: req.file.mimetype,
                    body: fs.createReadStream(req.file.path)
                };
                const response = await drive.files.create({
                    resource: fileMetadata,
                    media: mediaUpload,
                    fields: 'id'
                });
                console.log('Archivo subido a Google Drive con ID:', response.data.id);

                // Hacer el archivo público
                await drive.permissions.create({
                    fileId: response.data.id,
                    requestBody: {
                        role: 'reader',
                        type: 'anyone'
                    }
                });
                console.log('Permisos públicos asignados para ID:', response.data.id);

                await drive.files.update({
                    fileId: response.data.id,
                    addParents: GOOGLE_DRIVE_FOLDER_ID
                });

                // Generar URL pública con uc?export=media
                media = `https://drive.google.com/uc?export=media&id=${response.data.id}`;
                console.log('URL de vista generada:', media);

                fs.unlinkSync(req.file.path); // Eliminar archivo temporal
            } catch (err) {
                console.error('Error al subir a Google Drive (detalle):', err.message, 'Stack:', err.stack);
                return res.status(500).json({ message: 'Error al subir el archivo a Google Drive', error: err.message });
            }
        } else {
            console.warn('No se subió archivo o drive no está inicializado:', { reqFile: req.file, driveInitialized: !!drive });
        }

        const query = 'INSERT INTO products (name, price, media, description, category) VALUES (?, ?, ?, ?, ?)';
        db.query(query, [name, parsedPrice, media, description || null, category || null], (err, result) => {
            if (err) {
                console.error('Error al añadir el producto:', err.message);
                return res.status(500).json({ message: 'Error al añadir el producto en la base de datos', error: err.message });
            }
            console.log(`Producto añadido con ID: ${result.insertId}`);
            res.json({ message: 'Producto añadido', id: result.insertId });
        });
    });
});

// Eliminar producto (protegido)
app.delete('/admin/products/:id', verifyToken, verifyAdmin, (req, res) => {
    const { id } = req.params;
    db.query('SELECT media FROM products WHERE id = ?', [id], async (err, results) => {
        if (err) {
            console.error('Error al obtener el producto:', err.message);
            return res.status(500).json({ message: 'Error al obtener el producto', error: err.message });
        }
        const media = results[0]?.media;
        db.query('DELETE FROM products WHERE id = ?', [id], async (err, result) => {
            if (err) {
                console.error('Error al eliminar el producto:', err.message);
                return res.status(500).json({ message: 'Error al eliminar el producto', error: err.message });
            }
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: 'Producto no encontrado' });
            }
            if (media && media.includes('drive.google.com') && drive) {
                try {
                    const fileId = media.split('id=')[1] || media.match(/\/d\/(.+?)\//)?.[1];
                    if (fileId) {
                        await drive.files.delete({ fileId });
                        console.log(`Archivo eliminado de Google Drive: ${fileId}`);
                    }
                } catch (err) {
                    console.error('Error al eliminar archivo de Google Drive:', err.message);
                }
            }
            res.json({ message: 'Producto eliminado' });
        });
    });
});

// Endpoint temporal para depurar contraseñas
app.post('/api/debug-password', (req, res) => {
    const { email, password } = req.body;
    db.query('SELECT password FROM usuarios WHERE email = ?', [email], (err, results) => {
        if (err) {
            console.error('Error en la base de datos:', err.message);
            return res.status(500).json({ message: 'Error en el servidor', error: err.message });
        }
        if (results.length === 0) {
            return res.status(404).json({ message: 'Correo no encontrado' });
        }
        const storedHash = results[0].password;
        bcrypt.compare(password, storedHash, (err, isValid) => {
            if (err) {
                console.error('Error al verificar contraseña:', err.message);
                return res.status(500).json({ message: 'Error en el servidor', error: err.message });
            }
            res.json({ 
                email,
                storedHash,
                isValid,
                message: isValid ? 'Contraseña correcta' : 'Contraseña incorrecta'
            });
        });
    });
});

// Proxy para imágenes de Google Drive
app.get('/proxy/image', (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).json({ message: 'ID de archivo requerido' });

    const url = `https://drive.google.com/uc?export=media&id=${id}`;
    console.log(`Proxying image from ${url} with OAuth credentials`);

    oauth2Client.getAccessToken().then((token) => {
        const options = {
            hostname: 'drive.google.com',
            path: `/uc?export=media&id=${id}`,
            headers: {
                'Authorization': `Bearer ${token.token}`
            },
            maxRedirects: 5 // Permitir hasta 5 redirecciones
        };

        httpsFollow.get(options, (response) => {
            console.log(`Respuesta del proxy para ${url}: Status ${response.statusCode}, Headers ${JSON.stringify(response.headers)}`);
            if (response.statusCode !== 200) {
                console.error(`Error HTTP desde Google Drive: ${response.statusCode} - ${response.statusMessage}`);
                return res.status(response.statusCode).json({ message: `Error al cargar la imagen: ${response.statusMessage}` });
            }

            res.setHeader('Content-Type', response.headers['content-type']);
            response.pipe(res);
        }).on('error', (err) => {
            console.error('Error en proxy de imagen:', err.message);
            res.status(500).json({ message: 'Error al cargar la imagen', error: err.message });
        });
    }).catch((err) => {
        console.error('Error obteniendo token de acceso:', err.message);
        res.status(500).json({ message: 'Error de autenticación', error: err.message });
    });
});

// Verificar que el servidor inicie
app.listen(process.env.PORT || 3000, () => {
    console.log(`Servidor iniciado en puerto ${process.env.PORT || 3000}`);
}).on('error', (err) => {
    console.error('Error al iniciar el servidor:', err.message);
});