const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'x7k9m2p8q3z5w1r4t6y';

// Configuración de Multer para subir archivos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, 'public/uploads');
        try {
            fs.mkdirSync(uploadPath, { recursive: true });
            console.log(`Carpeta de uploads creada o existente: ${uploadPath}`);
            cb(null, uploadPath);
        } catch (err) {
            console.error('Error al crear carpeta de uploads:', err.message);
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
        return; // No usar process.exit(1) para permitir que el servidor siga corriendo
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
    let query = 'SELECT id, name, price, CASE WHEN media IS NOT NULL THEN CONCAT(?, media) ELSE NULL END AS media, description, category, created_at FROM products';
    let params = [process.env.APP_URL || 'https://rahel-app.onrender.com'];
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
    const query = 'SELECT id, name, price, CASE WHEN media IS NOT NULL THEN CONCAT(?, media) ELSE NULL END AS media, description, category, created_at FROM products WHERE id = ?';
    const params = [process.env.APP_URL || 'https://rahel-app.onrender.com', productId];

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
    upload(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            console.error('Error de Multer:', err.message);
            return res.status(400).json({ message: 'Error al procesar el archivo', error: err.message });
        } else if (err) {
            console.error('Error en fileFilter:', err.message);
            return res.status(400).json({ message: err.message });
        }

        console.log('Datos recibidos:', req.body, 'Archivo:', req.file);
        const { name, price, description, category } = req.body;
        if (!name || !price) {
            return res.status(400).json({ message: 'Nombre y precio son requeridos' });
        }

        const media = req.file ? `/uploads/${req.file.filename}` : null;
        const query = 'INSERT INTO products (name, price, media, description, category) VALUES (?, ?, ?, ?, ?)';
        db.query(query, [name, price, media, description || null, category || null], (err, result) => {
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
    db.query('SELECT media FROM products WHERE id = ?', [id], (err, results) => {
        if (err) {
            console.error('Error al obtener el producto:', err.message);
            return res.status(500).json({ message: 'Error al obtener el producto', error: err.message });
        }
        const media = results[0]?.media;
        db.query('DELETE FROM products WHERE id = ?', [id], (err, result) => {
            if (err) {
                console.error('Error al eliminar el producto:', err.message);
                return res.status(500).json({ message: 'Error al eliminar el producto', error: err.message });
            }
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: 'Producto no encontrado' });
            }
            if (media && media.startsWith('/uploads/')) {
                const filePath = path.join(__dirname, 'public', media);
                fs.unlink(filePath, (err) => {
                    if (err && err.code !== 'ENOENT') {
                        console.error('Error al eliminar el archivo:', err.message);
                    }
                });
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

// Verificar que el servidor inicie
app.listen(process.env.PORT || 3000, () => {
    console.log(`Servidor iniciado en puerto ${process.env.PORT || 3000}`);
}).on('error', (err) => {
    console.error('Error al iniciar el servidor:', err.message);
});