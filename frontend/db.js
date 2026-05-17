const { Pool } = require('pg');
require('dotenv').config(); // Carga la URL secreta del archivo .env

// Configuramos el "Pool" de conexiones
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Requerido por Supabase para conexiones seguras
  }
});

// Probamos la conexión inmediatamente al encender el backend
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Error conectando a Supabase:', err.stack);
  } else {
    console.log('🚀 ¡Conexión exitosa a la base de datos de Supabase!');
  }
});

module.exports = pool;