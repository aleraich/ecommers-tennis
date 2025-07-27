const bcrypt = require('bcrypt');
const saltRounds = 10;
const password = 'contraseña123';

bcrypt.hash(password, saltRounds, (err, hash) => {
    if (err) {
        console.error('Error al generar hash:', err);
        return;
    }
    console.log(hash);
});