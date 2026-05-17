const express = require('express');
const pool = require('./db'); // Importa la conexión a la base de datos
const app = express();
const PORT = 3000;

app.use(express.json());

// 1. Ruta de inicio (Texto plano)
app.get('/', (req, res) => {
    res.send('¡Servidor de la Licorera funcionando!');
});

// 2. NUEVA RUTA: Trae los productos reales desde Supabase
app.get('/api/productos', async (req, res) => {
    try {
        // Hacemos la consulta SQL a la tabla de productos
        const resultado = await pool.query('SELECT * FROM productos');
        
        // Respondemos al navegador con las filas encontradas en formato JSON
        res.json(resultado.rows);
    } catch (error) {
        console.error('Error al obtener productos:', error);
        res.status(500).send('Error en el servidor al consultar la base de datos');
    }
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});