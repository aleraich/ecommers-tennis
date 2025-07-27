const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Sirve index.html al acceder a la raíz /
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Evitar error "Cannot GET /api/login"
app.get('/api/login', (req, res) => {
    res.status(405).json({ message: 'Método GET no permitido. Usa POST para /api/login.' });
});

// Conexión a BD MySQL
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '', // Asegúrate de que esta es tu contraseña
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
        console.log('Verificando login - Email:', email, 'Contraseña ingresada:', password, 'Hash almacenado:', user.password);
        bcrypt.compare(password, user.password, (err, isValid) => {
            if (err) {
                console.error('Error al verificar contraseña:', err);
                return res.status(500).json({ message: 'Error en el servidor' });
            }

            if (!isValid) {
                return res.status(401).json({ message: 'Contraseña incorrecta' });
            }

            res.json({ role: user.role, message: 'Inicio de sesión exitoso' });
        });
    });
});

// Endpoint para registro
app.post('/api/register', (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ message: 'Nombre, correo y contraseña son requeridos' });
    }

    // Verificar si el correo ya existe
    db.query('SELECT * FROM usuarios WHERE email = ?', [email], (err, results) => {
        if (err) {
            console.error('Error en la base de datos:', err);
            return res.status(500).json({ message: 'Error en el servidor' });
        }

        if (results.length > 0) {
            return res.status(400).json({ message: 'El correo ya está registrado' });
        }

        // Hashear la contraseña
        bcrypt.hash(password, 10, (err, hash) => {
            if (err) {
                console.error('Error al hashear contraseña:', err);
                return res.status(500).json({ message: 'Error en el servidor' });
            }

            // Insertar el nuevo usuario como cliente
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

// Obtener todos los productos para index.html
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
            console.error(err);
            return res.status(500).json({ error: 'Error en la base de datos' });
        }
        res.json(results);
    });
});

// Añadir producto desde admin.html
app.post('/admin/products', (req, res) => {
    const { name, price, image } = req.body;
    if (!name || !price) {
        return res.status(400).json({ error: 'Faltan datos requeridos' });
    }

    const query = 'INSERT INTO products (name, price, image) VALUES (?, ?, ?)';
    db.query(query, [name, price, image || null], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error al añadir el producto' });
        }
        res.json({ message: 'Producto añadido', id: result.insertId });
    });
});

// Eliminar producto
app.delete('/admin/products/:id', (req, res) => {
    const { id } = req.params;
    db.query('DELETE FROM products WHERE id = ?', [id], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error al eliminar el producto' });
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

const PORT = 3000;
app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));