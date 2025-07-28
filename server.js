const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const JWT_SECRET = 'tu_secreto_super_seguro'; // Cambia esto por una clave segura en producción

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Middleware para verificar JWT
const verifyToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1]; // Expect 'Bearer <token>'
    if (!token) return res.status(401).json({ message: 'Token requerido' });

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ message: 'Token inválido' });
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

// Evitar error "Cannot GET /api/login"
app.get('/api/login', (req, res) => {
    res.status(405).json({ message: 'Método GET no permitido. Usa POST para /api/login.' });
});

// Conexión a BD MySQL
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'mi_stockx_db'
});

// Endpoint para login
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Correo y contraseña son requeridos' });
    }

    db.query('SELECT * FROM usuarios WHERE email = ?', [email], (err, results) => {
        if (err) {
            console.error('Error en la base de datos:', err);
            return res.status(500).json({ message: 'Error en el servidor' });
        }

        if (results.length === 0) {
            return res.status(401).json({ message: 'Correo no registrado' });
        }

        const user = results[0];
        bcrypt.compare(password, user.password, (err, isValid) => {
            if (err) {
                console.error('Error al verificar contraseña:', err);
                return res.status(500).json({ message: 'Error en el servidor' });
            }

            if (!isValid) {
                return res.status(401).json({ message: 'Contraseña incorrecta' });
            }

            // Generar token JWT
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
            console.error('Error en la base de datos:', err);
            return res.status(500).json({ message: 'Error en el servidor' });
        }

        if (results.length > 0) {
            return res.status(400).json({ message: 'El correo ya está registrado' });
        }

        bcrypt.hash(password, 10, (err, hash) => {
            if (err) {
                console.error('Error al hashear contraseña:', err);
                return res.status(500).json({ message: 'Error en el servidor' });
            }

            db.query('INSERT INTO usuarios (nombre, email, password, role) VALUES (?, ?, ?, ?)', 
                    [name, email, hash, 'cliente'], (err, result) => {
                if (err) {
                    console.error('Error al registrar usuario:', err);
                    return res.status(500).json({ message: 'Error al registrar el usuario' });
                }
                res.json({ message: 'Usuario registrado exitosamente' });
            });
        });
    });
});

// Obtener todos los productos (sin protección por ahora, opcional: verifyToken)
app.get('/products', (req, res) => {
    const { search } = req.query;
    let query = 'SELECT * FROM products';
    let params = [];
    if (search) {
        query += ' WHERE name LIKE ?';
        params = [`%${search}%`];
    }
    db.query(query, params, (err, results) => {
        if (err) {
            console.error('Error en la base de datos:', err);
            return res.status(500).json({ message: 'Error en la base de datos' });
        }
        res.json(results);
    });
});

// Añadir producto (protegido)
app.post('/admin/products', verifyToken, verifyAdmin, (req, res) => {
    const { name, price, image, description } = req.body;
    if (!name || !price) {
        return res.status(400).json({ message: 'Nombre y precio son requeridos' });
    }

    const query = 'INSERT INTO products (name, price, image, description) VALUES (?, ?, ?, ?)';
    db.query(query, [name, price, image || null, description || null], (err, result) => {
        if (err) {
            console.error('Error al añadir el producto:', err);
            return res.status(500).json({ message: 'Error al añadir el producto en la base de datos' });
        }
        res.json({ message: 'Producto añadido', id: result.insertId });
    });
});

// Eliminar producto (protegido)
app.delete('/admin/products/:id', verifyToken, verifyAdmin, (req, res) => {
    const { id } = req.params;
    db.query('DELETE FROM products WHERE id = ?', [id], (err, result) => {
        if (err) {
            console.error('Error al eliminar el producto:', err);
            return res.status(500).json({ message: 'Error al eliminar el producto' });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Producto no encontrado' });
        }
        res.json({ message: 'Producto eliminado' });
    });
});

// Endpoint temporal para depurar contraseñas
app.post('/api/debug-password', (req, res) => {
    const { email, password } = req.body;
    db.query('SELECT password FROM usuarios WHERE email = ?', [email], (err, results) => {
        if (err) {
            console.error('Error en la base de datos:', err);
            return res.status(500).json({ message: 'Error en el servidor' });
        }
        if (results.length === 0) {
            return res.status(404).json({ message: 'Correo no encontrado' });
        }
        const storedHash = results[0].password;
        bcrypt.compare(password, storedHash, (err, isValid) => {
            if (err) {
                console.error('Error al verificar contraseña:', err);
                return res.status(500).json({ message: 'Error en el servidor' });
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

// Sirve cliente.html
app.get('/cliente.html', verifyToken, (req, res) => {
    if (req.user.role !== 'cliente') {
        return res.status(403).json({ message: 'Acceso denegado: se requiere rol de cliente' });
    }
    res.sendFile(path.join(__dirname, 'public', 'cliente.html'));
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));