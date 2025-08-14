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
const httpsFollow = require('follow-redirects').https;

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'x7k9m2p8q3z5w1r4t6y';

// Configuración de OAuth 2.0 para Google Drive
const oauth2Client = new OAuth2Client(
    '706462521119-0ur4vghsdphcg3bcutksoj5lc4vhn0gu.apps.googleusercontent.com',
    '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',
    'http://localhost:3000/auth/callback'
);

let drive = null;

async function initializeDrive() {
    try {
        const credentialsPath = path.join(__dirname, 'credentials.json');
        const tokens = fs.existsSync(credentialsPath) ? JSON.parse(fs.readFileSync(credentialsPath)) : {};
        if (!tokens.refresh_token && !tokens.access_token) {
            console.log('Sin tokens válidos. Usa http://localhost:3000/auth/google para autenticar.');
            return null;
        }
        oauth2Client.setCredentials(tokens);
        oauth2Client.on('tokens', (newTokens) => {
            if (newTokens.refresh_token || newTokens.access_token) {
                fs.writeFileSync(credentialsPath, JSON.stringify({ ...tokens, ...newTokens }, null, 2));
                oauth2Client.setCredentials(tokens);
            }
        });
        if (tokens.expiry_date && Date.now() >= tokens.expiry_date) {
            const { credentials } = await oauth2Client.refreshAccessToken();
            oauth2Client.setCredentials(credentials);
            fs.writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2));
        }
        drive = google.drive({ version: 'v3', auth: oauth2Client });
        console.log('Google Drive inicializado correctamente a las', new Date().toLocaleString());
        return drive;
    } catch (err) {
        console.error('Error al inicializar Drive:', err.message, 'a las', new Date().toLocaleString());
        return null;
    }
}

initializeDrive().catch(err => console.error('Error en inicialización de Drive:', err.message, 'a las', new Date().toLocaleString()));

const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '1CY3Nla2eVN5XN9VcsEI4m6v991yK-iOx';

// Configuración de Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const tempPath = path.join(__dirname, 'temp/uploads');
        if (!fs.existsSync(tempPath)) fs.mkdirSync(tempPath, { recursive: true });
        cb(null, tempPath);
    },
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const fileTypes = /jpeg|jpg|png|mp4|webm/;
        const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = fileTypes.test(file.mimetype);
        if (extname && mimetype) {
            cb(null, true);
        } else {
            cb(new Error('Solo se aceptan imágenes (JPEG/PNG) o videos (MP4/WEBM)'));
        }
    },
    limits: { fileSize: 10 * 1024 * 1024 }
}).fields([{ name: 'media', maxCount: 1 }, { name: 'image', maxCount: 1 }]);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Middleware para verificar token JWT
const verifyToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Token requerido' });
    jwt.verify(token, JWT_SECRET, (err, decoded) => err ? res.status(403).json({ message: 'Token inválido' }) : (req.user = decoded, next()));
};

// Middleware para verificar rol de administrador
const verifyAdmin = (req, res, next) => req.user.role !== 'admin' ? res.status(403).json({ message: 'Acceso denegado' }) : next();

// Rutas de autenticación con Google
app.get('/auth/google', (req, res) => res.redirect(oauth2Client.generateAuthUrl({ scope: ['https://www.googleapis.com/auth/drive.file'], access_type: 'offline', prompt: 'consent' })));
app.get('/auth/callback', async (req, res) => {
    try {
        const { tokens } = await oauth2Client.getToken(req.query.code);
        oauth2Client.setCredentials(tokens);
        fs.writeFileSync(path.join(__dirname, 'credentials.json'), JSON.stringify(tokens, null, 2));
        res.send('Autenticación exitosa. Vuelve a /admin.html.');
    } catch (err) {
        res.status(500).send('Error: ' + err.message);
    }
});

// Rutas estáticas
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin.html', verifyToken, verifyAdmin, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/cliente.html', verifyToken, (req, res) => req.user.role !== 'cliente' ? res.status(403).json({ message: 'Acceso denegado' }) : res.sendFile(path.join(__dirname, 'public', 'cliente.html')));
app.get('/vendedor.html', verifyToken, (req, res) => req.user.role !== 'vendedor' ? res.status(403).json({ message: 'Acceso denegado' }) : res.sendFile(path.join(__dirname, 'public', 'vendedor.html')));

// Conexión a MySQL
const dbConfig = process.env.DB_ENV === 'local'
    ? { host: 'localhost', port: 3306, user: 'root', password: '', database: 'ecommers_tennis' }
    : { host: 'mysql-ecommers-ecommers-tennis.c.aivencloud.com', port: 16216, user: 'avnadmin', password: process.env.DB_PASSWORD || 'AVNS_ak0Z_HS_F61WMTuVIfZ', database: 'ecommers_tennis', ssl: { ca: fs.readFileSync(path.join(__dirname, 'ca.pem')) } };

const db = mysql.createConnection(dbConfig);
db.connect(err => err ? console.error('Error conectando a MySQL:', err) : console.log('Conectado a MySQL a las', new Date().toLocaleString()));

// Endpoints de autenticación
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Correo y contraseña requeridos' });
    db.query('SELECT * FROM usuarios WHERE email = ?', [email], (err, results) => {
        if (err) return res.status(500).json({ message: 'Error en servidor', error: err.message });
        if (!results.length) return res.status(401).json({ message: 'Correo no registrado' });
        bcrypt.compare(password, results[0].password, (err, isMatch) => {
            if (err) return res.status(500).json({ message: 'Error en comparación', error: err.message });
            if (!isMatch) return res.status(401).json({ message: 'Contraseña incorrecta' });
            const token = jwt.sign({ id: results[0].id, email, role: results[0].role, nombre: results[0].nombre || 'Administrador' }, JWT_SECRET, { expiresIn: '1h' });
            const userName = results[0].nombre || 'Administrador';
            const redirectUrl = results[0].role === 'admin' ? '/admin.html' : results[0].role === 'cliente' ? '/cliente.html' : results[0].role === 'vendedor' ? '/vendedor.html' : '/';
            res.json({ token, nombre: userName, role: results[0].role, redirectUrl, message: 'Login exitoso' });
        });
    });
});

app.post('/api/register', (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'Todos los campos son requeridos' });
    db.query('SELECT * FROM usuarios WHERE email = ?', [email], (err, results) => {
        if (err) return res.status(500).json({ message: 'Error en servidor', error: err.message });
        if (results.length) return res.status(400).json({ message: 'Correo ya registrado' });
        bcrypt.hash(password, 10, (err, hash) => {
            if (err) return res.status(500).json({ message: 'Error al hashear', error: err.message });
            db.query('INSERT INTO usuarios (nombre, email, password, role) VALUES (?, ?, ?, ?)', [name, email, hash, 'cliente'], (err) =>
                err ? res.status(500).json({ message: 'Error al registrar', error: err.message }) : res.json({ message: 'Registro exitoso' })
            );
        });
    });
});

app.get('/api/check-auth', verifyToken, (req, res) => {
    res.json({
        authenticated: true,
        nombre: req.user.nombre || 'Usuario',
        role: req.user.role,
        id: req.user.id // Añadimos el ID del usuario
    });
});

app.post('/api/register-vendedor', verifyToken, verifyAdmin, (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'Todos los campos son requeridos' });
    db.query('SELECT * FROM usuarios WHERE email = ?', [email], (err, results) => {
        if (err) return res.status(500).json({ message: 'Error en servidor', error: err.message });
        if (results.length) return res.status(400).json({ message: 'Correo ya registrado' });
        bcrypt.hash(password, 10, (err, hash) => {
            if (err) return res.status(500).json({ message: 'Error al hashear', error: err.message });
            db.query('INSERT INTO usuarios (nombre, email, password, role) VALUES (?, ?, ?, ?)', [name, email, hash, 'vendedor'], (err) =>
                err ? res.status(500).json({ message: 'Error al registrar', error: err.message }) : res.json({ message: 'Vendedor registrado exitosamente' })
            );
        });
    });
});

// Nuevo endpoint para registrar ventas
app.post('/api/register-sale', verifyToken, (req, res) => {
    const { variantId, quantity, price, total, paymentMethod, vendedorId } = req.body;
    if (!variantId || !quantity || !price || !total || !paymentMethod || !vendedorId) {
        return res.status(400).json({ message: 'Todos los campos son requeridos' });
    }

    db.beginTransaction(async (err) => {
        if (err) {
            console.error('Error iniciando transacción:', err.message);
            return res.status(500).json({ message: 'Error en transacción', error: err.message });
        }

        try {
            // Verificar stock actual
            const [variant] = await db.promise().query('SELECT stock, product_id FROM product_variants WHERE id = ?', [variantId]);
            if (!variant.length) return res.status(404).json({ message: 'Variante no encontrada' });
            const currentStock = variant[0].stock;
            if (currentStock < quantity) return res.status(400).json({ message: 'Stock insuficiente' });

            // Obtener nombre del producto
            const [product] = await db.promise().query('SELECT name FROM products WHERE id = ?', [variant[0].product_id]);
            const productName = product[0].name;

            // Registrar venta
            await db.promise().query(
                'INSERT INTO ventas (producto, color, talla, cantidad, precio_unitario, monto_total, metodo_pago, vendedor_id) VALUES (?, (SELECT color FROM product_variants WHERE id = ?), (SELECT size FROM product_variants WHERE id = ?), ?, ?, ?, ?, ?)',
                [productName, variantId, variantId, quantity, price, total, paymentMethod, vendedorId]
            );

            // Actualizar stock
            await db.promise().query(
                'UPDATE product_variants SET stock = stock - ? WHERE id = ?',
                [quantity, variantId]
            );

            await db.promise().commit();
            res.json({ message: 'Venta registrada con éxito' });
        } catch (err) {
            await db.promise().rollback();
            console.error('Error al registrar venta:', err.message);
            res.status(500).json({ message: 'Error al registrar venta', error: err.message });
        }
    });
});

// Endpoints de productos
app.get('/products', (req, res) => {
    const { search, category, sort } = req.query;
    let query = `
        SELECT p.id, p.name, p.price, p.media, p.description, p.category, p.created_at,
               v.id AS variant_id, v.color, v.size, v.stock, v.imagen_color
        FROM products p
        LEFT JOIN product_variants v ON p.id = v.product_id
    `;
    const params = [];

    if (search) {
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        query += ' WHERE (p.name LIKE ? OR p.id LIKE ? OR v.color LIKE ? OR v.size LIKE ?)';
    }
    if (category) {
        params.push(category);
        query += params.length ? ' AND p.category = ?' : ' WHERE p.category = ?';
    }
    if (sort === 'newest') query += ' ORDER BY p.created_at DESC';

    console.log('Ejecutando consulta SQL:', query, 'con parámetros:', params);
    db.query(query, params, (err, results) => {
        if (err) {
            console.error('Error en la consulta SQL:', err.message, 'Stack:', err.stack, 'a las', new Date().toLocaleString());
            return res.status(500).json({ message: 'Error al consultar productos', error: err.message });
        }
        console.log('Resultados de la consulta:', results);
        const mappedResults = results.reduce((acc, row) => {
            if (!acc[row.id]) {
                acc[row.id] = {
                    id: row.id,
                    name: row.name,
                    price: row.price,
                    media: row.media,
                    description: row.description,
                    category: row.category,
                    created_at: row.created_at,
                    variants: []
                };
            }
            if (row.variant_id) {
                acc[row.id].variants.push({
                    id: row.variant_id,
                    color: row.color,
                    size: row.size,
                    stock: row.stock,
                    imagen_color: row.imagen_color
                });
            }
            return acc;
        }, {});
        res.json(Object.values(mappedResults));
    });
});

app.get('/api/product/:id', (req, res) => {
    const { id } = req.params;
    if (!id || isNaN(id)) return res.status(400).json({ message: 'ID inválido' });
    db.query(
        'SELECT p.id, p.name, p.price, p.media, p.description, p.category, p.created_at, ' +
        'GROUP_CONCAT(v.id SEPARATOR \',\') as variant_ids, GROUP_CONCAT(v.color SEPARATOR \',\') as colors, ' +
        'GROUP_CONCAT(v.size SEPARATOR \',\') as sizes, GROUP_CONCAT(v.stock SEPARATOR \',\') as stocks, ' +
        'GROUP_CONCAT(v.imagen_color SEPARATOR \',\') as variant_images ' +
        'FROM products p LEFT JOIN product_variants v ON p.id = v.product_id WHERE p.id = ? GROUP BY p.id',
        [id],
        (err, results) => {
            if (err) return res.status(500).json({ message: 'Error al consultar producto', error: err.message });
            if (!results.length) return res.status(404).json({ message: 'Producto no encontrado' });
            const product = results[0];
            const variantIds = product.variant_ids ? product.variant_ids.split(',') : [];
            const colors = product.colors ? product.colors.split(',') : [];
            const sizes = product.sizes ? product.sizes.split(',') : [];
            const stocks = product.stocks ? product.stocks.split(',').map(Number) : [];
            const variantImages = product.variant_images ? product.variant_images.split(',') : [];
            const variants = variantIds.map((vid, i) => ({
                id: vid || null,
                color: colors[i] || null,
                size: sizes[i] || null,
                stock: stocks[i] || null,
                imagen_color: variantImages[i] || null
            })).filter(v => v.id !== null);
            res.json({
                id: product.id,
                name: product.name || null,
                price: product.price || null,
                media: product.media || null,
                description: product.description || null,
                category: product.category || null,
                created_at: product.created_at || null,
                variants: variants
            });
        }
    );
});

app.post('/admin/products', verifyToken, verifyAdmin, (req, res, next) => {
    upload(req, res, async (err) => {
        if (err) {
            console.error('Error en Multer:', err.message, 'Stack:', err.stack, 'Campos recibidos:', req.body, 'Archivos:', req.files);
            return res.status(400).json({ message: 'Error al procesar archivo', error: err.message });
        }

        const { name, price, description, category } = req.body;
        if (!name || !price || !category) {
            return res.status(400).json({ message: 'Nombre, precio y categoría son requeridos' });
        }

        const parsedPrice = parseFloat(price);
        if (isNaN(parsedPrice) || parsedPrice <= 0 || parsedPrice > 9999999999.99) {
            return res.status(400).json({ message: 'Precio inválido' });
        }

        let media = null;
        if (req.files && req.files['media'] && req.files['media'][0]) {
            if (!drive) {
                console.error('Google Drive no está inicializado a pesar de la autenticación previa.');
                return res.status(500).json({ message: 'Google Drive no está inicializado. Intenta autenticarte nuevamente en /auth/google' });
            }
            try {
                const response = await drive.files.create({
                    resource: { name: req.files['media'][0].originalname, parents: [GOOGLE_DRIVE_FOLDER_ID] },
                    media: { mimeType: req.files['media'][0].mimetype, body: fs.createReadStream(req.files['media'][0].path) },
                    fields: 'id'
                });
                const fileId = response.data.id;
                await drive.permissions.create({ fileId, requestBody: { role: 'reader', type: 'anyone' } });
                media = `https://drive.google.com/uc?export=media&id=${fileId}`;
                fs.unlinkSync(req.files['media'][0].path);
            } catch (err) {
                console.error('Error subiendo a Drive:', err.message, 'Detalles:', err.stack);
                return res.status(500).json({ message: 'Error al subir imagen a Drive', error: err.message });
            }
        }

        db.query(
            'INSERT INTO products (name, price, media, description, category, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
            [name, parsedPrice, media, description || null, category],
            (err, result) => {
                if (err) {
                    console.error('Error en la base de datos (products):', err.message, 'Stack:', err.stack);
                    return res.status(500).json({ message: 'Error al guardar producto', error: err.message });
                }
                res.status(201).json({ id: result.insertId, message: 'Producto añadido con éxito' });
            }
        );
    });
});

app.post('/admin/variants', verifyToken, verifyAdmin, (req, res, next) => {
    upload(req, res, async (err) => {
        if (err) {
            console.error('Error en Multer:', err.message, 'Stack:', err.stack, 'Campos recibidos:', req.body, 'Archivos:', req.files);
            return res.status(400).json({ message: 'Error al procesar archivo', error: err.message });
        }

        const { productId, color, size, stock } = req.body;
        if (!productId || !color || !size || !stock) {
            return res.status(400).json({ message: 'Product ID, color, talla y stock son requeridos' });
        }
        if (isNaN(productId) || isNaN(parseInt(stock))) {
            return res.status(400).json({ message: 'Product ID y stock deben ser números válidos' });
        }
        const sizeNum = parseInt(size);
        if (sizeNum < 27 || sizeNum > 45) {
            return res.status(400).json({ message: 'La talla debe estar entre 27 y 45' });
        }

        let imagen_color = null;
        if (req.files && req.files['image'] && req.files['image'][0]) {
            if (!drive) {
                console.error('Google Drive no está inicializado a pesar de la autenticación previa.');
                return res.status(500).json({ message: 'Google Drive no está inicializado. Intenta autenticarte nuevamente en /auth/google' });
            }
            try {
                const response = await drive.files.create({
                    resource: { name: `${color}-${req.files['image'][0].originalname}`, parents: [GOOGLE_DRIVE_FOLDER_ID] },
                    media: { mimeType: req.files['image'][0].mimetype, body: fs.createReadStream(req.files['image'][0].path) },
                    fields: 'id'
                });
                const fileId = response.data.id;
                await drive.permissions.create({ fileId, requestBody: { role: 'reader', type: 'anyone' } });
                imagen_color = `https://drive.google.com/uc?export=media&id=${fileId}`;
                fs.unlinkSync(req.files['image'][0].path);
            } catch (err) {
                console.error('Error subiendo a Drive:', err.message, 'Detalles:', err.stack);
                return res.status(500).json({ message: 'Error al subir imagen a Drive', error: err.message });
            }
        }

        db.query(
            'INSERT INTO product_variants (product_id, color, size, stock, imagen_color) VALUES (?, ?, ?, ?, ?)',
            [productId, color, sizeNum, parseInt(stock), imagen_color],
            (err, result) => {
                if (err) {
                    console.error('Error en la base de datos (product_variants):', err.message, 'Stack:', err.stack);
                    return res.status(500).json({ message: 'Error al guardar variante', error: err.message });
                }
                res.status(201).json({ id: result.insertId, message: 'Variante añadida con éxito' });
            }
        );
    });
});

app.put('/admin/variants/:id/stock', verifyToken, verifyAdmin, (req, res) => {
    const { id } = req.params;
    const { stock, motivo } = req.body;
    if (!id || isNaN(id) || !stock || isNaN(parseInt(stock)) || parseInt(stock) < 0) {
        return res.status(400).json({ message: 'ID y stock válidos son requeridos' });
    }

    db.beginTransaction(async (err) => {
        if (err) {
            console.error('Error iniciando transacción:', err.message);
            return res.status(500).json({ message: 'Error en transacción', error: err.message });
        }

        try {
            const [rows] = await db.promise().query('SELECT stock FROM product_variants WHERE id = ?', [id]);
            if (!rows.length) return res.status(404).json({ message: 'Variante no encontrada' });
            const stockAnterior = rows[0].stock;

            await db.promise().query(
                'UPDATE product_variants SET stock = ? WHERE id = ?',
                [parseInt(stock), id]
            );

            const usuario = req.user.nombre || 'Admin';
            const cambio = parseInt(stock) - stockAnterior;
            await db.promise().query(
                'INSERT INTO stock_history (variant_id, date, motivo, usuario, cambio, stock_anterior, stock_nuevo) VALUES (?, NOW(), ?, ?, ?, ?, ?)',
                [id, motivo || 'Actualización manual', usuario, cambio, stockAnterior, parseInt(stock)]
            );

            await db.promise().commit();
            res.json({ message: 'Stock actualizado con éxito', id });
        } catch (err) {
            await db.promise().rollback();
            console.error('Error al actualizar stock:', err.message, 'Stack:', err.stack);
            return res.status(500).json({ message: 'Error al actualizar stock', error: err.message });
        }
    });
});

app.get('/stock-history', verifyToken, verifyAdmin, (req, res) => {
    db.query('SELECT * FROM stock_history ORDER BY date DESC', (err, results) => {
        if (err) {
            console.error('Error al consultar historial:', err.message, 'Stack:', err.stack);
            return res.status(500).json({ message: 'Error al cargar historial', error: err.message });
        }
        res.json(results);
    });
});

app.delete('/admin/products/:id', verifyToken, verifyAdmin, (req, res) => {
    const { id } = req.params;
    db.query('SELECT media FROM products WHERE id = ?', [id], async (err, results) => {
        if (err) return res.status(500).json({ message: 'Error al obtener producto', error: err.message });
        if (!results.length) return res.status(404).json({ message: 'Producto no encontrado' });

        const media = results[0].media;
        db.query('DELETE FROM products WHERE id = ?', [id], async (err) => {
            if (err) return res.status(500).json({ message: 'Error al eliminar producto', error: err.message });
            if (media && drive) {
                try {
                    const fileId = media.split('id=')[1];
                    await drive.files.delete({ fileId });
                } catch (err) {
                    console.warn('Error eliminando imagen de Drive:', err.message);
                }
            }
            db.query('DELETE FROM product_variants WHERE product_id = ?', [id], (err) => {
                if (err) {
                    console.error('Error al eliminar variantes:', err.message);
                    return res.status(500).json({ message: 'Error al eliminar variantes', error: err.message });
                }
                res.json({ message: 'Producto y variantes eliminados' });
            });
        });
    });
});

// Nuevo endpoint para borrar variante
app.delete('/admin/variants/:id', verifyToken, verifyAdmin, (req, res) => {
    const { id } = req.params;
    db.query('SELECT imagen_color FROM product_variants WHERE id = ?', [id], async (err, results) => {
        if (err) return res.status(500).json({ message: 'Error al obtener variante', error: err.message });
        if (!results.length) return res.status(404).json({ message: 'Variante no encontrada' });

        const imagen_color = results[0].imagen_color;
        db.query('DELETE FROM product_variants WHERE id = ?', [id], async (err) => {
            if (err) return res.status(500).json({ message: 'Error al eliminar variante', error: err.message });
            if (imagen_color && drive) {
                try {
                    const fileId = imagen_color.split('id=')[1];
                    await drive.files.delete({ fileId });
                } catch (err) {
                    console.warn('Error eliminando imagen de variante de Drive:', err.message);
                }
            }
            res.json({ message: 'Variante eliminada con éxito' });
        });
    });
});

// Proxy para imágenes
app.get('/proxy/image', (req, res) => {
    const { id } = req.query;
    if (!id) {
        console.error('ID de imagen no proporcionado en la solicitud del proxy');
        return res.status(400).json({ message: 'ID requerido' });
    }
    console.log(`Solicitando imagen con ID: ${id} a las ${new Date().toLocaleString()}`);
    oauth2Client.getAccessToken().then(token => {
        console.log('Token obtenido para proxy:', token.token.substring(0, 10) + '...');
        httpsFollow.get({
            hostname: 'drive.google.com',
            path: `/uc?export=media&id=${id}`,
            headers: { Authorization: `Bearer ${token.token}` },
            rejectUnauthorized: false // Para pruebas locales, quitar en producción
        }, response => {
            if (response.statusCode !== 200) {
                console.error(`Error en proxy para ID ${id}: ${response.statusCode} - ${response.statusMessage} a las ${new Date().toLocaleString()}`);
                return res.status(response.statusCode).json({ message: `Error: ${response.statusMessage}` });
            }
            res.setHeader('Content-Type', response.headers['content-type']);
            response.pipe(res);
        }).on('error', err => {
            console.error('Error en proxy para ID', id, ':', err.message, 'Stack:', err.stack, 'a las', new Date().toLocaleString());
            res.status(500).json({ message: 'Error en proxy', error: err.message });
        });
    }).catch(err => {
        console.error('Error de autenticación en proxy para ID', id, ':', err.message, 'Stack:', err.stack, 'a las', new Date().toLocaleString());
        res.status(500).json({ message: 'Error de autenticación', error: err.message });
    });
});

app.listen(process.env.PORT || 3000, () => console.log(`Servidor corriendo en puerto ${process.env.PORT || 3000} a las`, new Date().toLocaleString())).on('error', err => console.error('Error al iniciar:', err.message, 'a las', new Date().toLocaleString()));