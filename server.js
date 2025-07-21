const express = require('express');
const mysql = require('mysql2');
const app = express();
app.use(express.json());

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '', // Ajusta si cambiaste la contraseña
    database: 'mi_stockx_db'
});

// Listar productos (nueva ruta GET)
app.get('/admin/products', (req, res) => {
    db.query('SELECT * FROM products', (err, results) => {
        if (err) throw err;
        res.json(results);
    });
});

// Añadir producto (ruta POST existente)
app.post('/admin/products', (req, res) => {
    const { name, price, image } = req.body;
    const query = 'INSERT INTO products (name, price, image) VALUES (?, ?, ?)';
    db.query(query, [name, price, image], (err, result) => {
        if (err) throw err;
        res.send('Producto añadido');
    });
});

// Eliminar producto (ruta DELETE existente)
app.delete('/admin/products/:id', (req, res) => {
    const { id } = req.params;
    const query = 'DELETE FROM products WHERE id = ?';
    db.query(query, [id], (err, result) => {
        if (err) throw err;
        res.send('Producto eliminado');
    });
});

app.listen(3000, () => console.log('Servidor en http://localhost:3000'));
