const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Sirve archivos estáticos de /public

// Conexión a BD MySQL
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'mi_stockx_db'
});

// Rutas API
// Obtener todos los productos para index.html
app.get('/products', (req, res) => {
    db.query('SELECT * FROM products', (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error en la base de datos' });
        }
        res.json(results);
    });
});

// Añadir producto desde admin.html
app.post('/admin/products', (req, res) => {
    const { name, price, image_url, description } = req.body;
    if (!name || !price || !image_url) {
        return res.status(400).json({ error: 'Faltan datos requeridos' });
    }

    const query = 'INSERT INTO products (name, price, image_url, description) VALUES (?, ?, ?, ?)';
    db.query(query, [name, price, image_url, description || ''], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error al añadir el producto' });
        }
        res.json({ message: 'Producto añadido', id: result.insertId });
    });
});

// Eliminar producto (opcional)
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

const PORT = 3000;
app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));
