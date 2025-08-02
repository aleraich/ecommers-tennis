const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');

const app = express();
const JWT_SECRET = 'tu_secreto_super_seguro';

// Configuración de Multer para subir archivos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const fileTypes = /jpeg|jpg|png|mp4|webm/;
        const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = fileTypes.test(file.mimetype);
        if (extname && mimetype) {
            return cb(null, true);
        } else {
            cb(new Error('Solo se permiten imágenes (JPEG, PNG) y videos (MP4, WEBM)'));
        }
    },
    limits: { fileSize: 50 * 1024 * 1024 }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

// Conexión a BD MySQL
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'mi_stockx_db'
});

db.connect((err) => {
    if (err) {
        console.error('Error al conectar a la base de datos:', err.message);
        process.exit(1);
    }
    console.log('Conectado a la base de datos MySQL');
    // Verificar tabla products
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
    let params = ['http://localhost:3000'];
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
    const params = ['http://localhost:3000', productId];

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
app.post('/admin/products', verifyToken, verifyAdmin, upload.single('media'), (req, res) => {
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
        res.json({ message: 'Producto añadido', id: result.insertId });
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
                const fs = require('fs');
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));