process.env.TZ = 'America/Bogota';

const express = require('express');
const cors = require('cors');
const path = require('path');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

//  MIDDLEWARES
app.use(cors()); // Habilita CORS si se accede desde otro origen
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

//  RUTA PRINCIPAL
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

//  ENDPOINTS: PRODUCTOS

/** GET /api/productos - Obtiene todos los productos */
app.get('/api/productos', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.id, 
        p.nombre, 
        p.descripcion, 
        p.precio_compra, 
        p.precio_venta, 
        p.stock_actual, 
        p.stock_minimo, 
        p.creado_en,
        c.nombre AS categoria_nombre, 
        prov.nombre AS proveedor_nombre
      FROM productos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      LEFT JOIN proveedores prov ON p.proveedor_id = prov.id
      ORDER BY p.id;
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error en GET /api/productos:', error);
    res.status(500).json({ error: error.message });
  }
});

/** GET /api/productos/:id - Obtiene un producto por ID */
app.get('/api/productos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT 
        p.id,
        p.nombre,
        p.categoria_id,
        c.nombre AS categoria_nombre,
        p.proveedor_id,
        prov.nombre AS proveedor_nombre,
        p.precio_compra,
        p.precio_venta,
        p.stock_actual,
        p.stock_minimo,
        p.fecha_creacion,
        p.fecha_actualizacion
      FROM productos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      LEFT JOIN proveedores prov ON p.proveedor_id = prov.id
      WHERE p.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error en GET /api/productos/:id:', error);
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/productos - Crea un nuevo producto */
app.post('/api/productos', async (req, res) => {
  try {
    const { nombre, descripcion, categoria_id, proveedor_id, precio_compra, precio_venta, stock_actual, stock_minimo } = req.body;
    const categoriaId = categoria_id !== undefined && categoria_id !== null ? parseInt(categoria_id, 10) : null;
    const proveedorId = proveedor_id !== undefined && proveedor_id !== null ? parseInt(proveedor_id, 10) : null;

    if (!nombre || !categoriaId || !precio_compra || !precio_venta || stock_actual === undefined) {
      return res.status(400).json({ error: 'Campos requeridos: nombre, categoria_id, precio_compra, precio_venta, stock_actual' });
    }

    const result = await pool.query(`
      INSERT INTO productos (nombre, descripcion, categoria_id, proveedor_id, precio_compra, precio_venta, stock_actual, stock_minimo)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [nombre, descripcion || null, categoriaId, proveedorId, precio_compra, precio_venta, stock_actual, stock_minimo || 5]);

    const productoCreado = result.rows[0];
    
    // Crear automáticamente un movimiento de inventario de ENTRADA
    await pool.query(`
      INSERT INTO movimientos_inventario (producto_id, tipo_movimiento, cantidad, motivo)
      VALUES ($1, $2, $3, $4)
    `, [productoCreado.id, 'ENTRADA', stock_actual, 'Carga inicial de inventario']);

    res.status(201).json(productoCreado);
  } catch (error) {
    console.error('Error en POST /api/productos:', error);
    res.status(500).json({ error: error.message });
  }
});

/** PUT /api/productos/:id - Actualiza un producto con movimientos inteligentes */
app.put('/api/productos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, categoria_id, proveedor_id, precio_compra, precio_venta, stock_actual, stock_minimo } = req.body;
    const categoriaId = categoria_id !== undefined && categoria_id !== null && categoria_id !== '' ? parseInt(categoria_id, 10) : null;
    const proveedorId = proveedor_id !== undefined && proveedor_id !== null && proveedor_id !== '' ? parseInt(proveedor_id, 10) : null;

    // 1. Obtener el stock actual (viejo) del producto
    const stockOldResult = await pool.query(
      'SELECT stock_actual FROM productos WHERE id = $1',
      [id]
    );

    if (stockOldResult.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const stockViejo = stockOldResult.rows[0].stock_actual;
    const stockNuevo = stock_actual !== undefined ? parseInt(stock_actual, 10) : stockViejo;

    // 2. Comparar stocks y registrar movimiento si hay diferencia
    if (stockNuevo < stockViejo) {
      // SALIDA: Stock redujo
      const diferencia = stockViejo - stockNuevo;
      await pool.query(`
        INSERT INTO movimientos_inventario (producto_id, tipo_movimiento, cantidad, motivo)
        VALUES ($1, $2, $3, $4)
      `, [id, 'SALIDA', diferencia, 'Ajuste de inventario (Reducción por edición)']);
    } else if (stockNuevo > stockViejo) {
      // ENTRADA: Stock aumentó
      const diferencia = stockNuevo - stockViejo;
      await pool.query(`
        INSERT INTO movimientos_inventario (producto_id, tipo_movimiento, cantidad, motivo)
        VALUES ($1, $2, $3, $4)
      `, [id, 'ENTRADA', diferencia, 'Ajuste de inventario (Aumento por edición)']);
    }
    // Si son iguales, no registramos movimiento

    // 3. Realizar el UPDATE del producto
    const result = await pool.query(`
      UPDATE productos 
      SET 
        nombre = COALESCE($1, nombre),
        descripcion = COALESCE($2, descripcion),
        precio_compra = COALESCE($3, precio_compra),
        precio_venta = COALESCE($4, precio_venta),
        stock_actual = COALESCE($5, stock_actual),
        stock_minimo = COALESCE($6, stock_minimo),
        categoria_id = COALESCE($7, categoria_id),
        proveedor_id = COALESCE($8, proveedor_id)
      WHERE id = $9
      RETURNING *
    `, [nombre, descripcion, precio_compra, precio_venta, stockNuevo, stock_minimo, categoriaId, proveedorId, id]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error en PUT /api/productos/:id:', error);
    res.status(500).json({ error: error.message });
  }
});

/** DELETE /api/productos/:id - Elimina un producto */
app.delete('/api/productos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM productos WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    res.status(204).send();
  } catch (err) {
    console.error('Error en DELETE /api/productos/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

//  ENDPOINTS: CATEGORÍAS

/** GET /api/categorias - Obtiene todas las categorías con contador de productos */
app.get('/api/categorias', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        c.id, 
        c.nombre, 
        c.descripcion, 
        COUNT(p.id)::int AS cantidad_productos
      FROM categorias c
      LEFT JOIN productos p ON c.id = p.categoria_id
      GROUP BY c.id, c.nombre, c.descripcion
      ORDER BY c.id;
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error en GET /api/categorias:', error);
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/categorias - Crea una nueva categoría */
app.post('/api/categorias', async (req, res) => {
  try {
    const { nombre, descripcion } = req.body;
    
    if (!nombre) {
      return res.status(400).json({ error: 'El nombre de la categoría es requerido' });
    }

    const result = await pool.query(`
      INSERT INTO categorias (nombre, descripcion)
      VALUES ($1, $2)
      RETURNING *
    `, [nombre, descripcion || null]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error en POST /api/categorias:', err);
    res.status(500).json({ error: err.message });
  }
});

/** PUT /api/categorias/:id - Actualiza una categoría */
app.put('/api/categorias/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion } = req.body;
    
    const result = await pool.query(`
      UPDATE categorias 
      SET 
        nombre = COALESCE($1, nombre),
        descripcion = COALESCE($2, descripcion)
      WHERE id = $3
      RETURNING *
    `, [nombre, descripcion, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error en PUT /api/categorias/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /api/categorias/:id - Elimina una categoría */
app.delete('/api/categorias/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM categorias WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }
    res.status(204).send();
  } catch (err) {
    console.error('Error en DELETE /api/categorias/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

//  ENDPOINTS: PROVEEDORES

/** GET /api/proveedores - Obtiene todos los proveedores con contador de productos */
app.get('/api/proveedores', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        prov.id, 
        prov.nombre, 
        prov.nombre_encargado, 
        prov.telefono, 
        prov.email, 
        prov.creado_en,
        COUNT(p.id)::int AS cantidad_productos
      FROM proveedores prov
      LEFT JOIN productos p ON prov.id = p.proveedor_id
      GROUP BY prov.id, prov.nombre, prov.nombre_encargado, prov.telefono, prov.email, prov.creado_en
      ORDER BY prov.id;
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error en GET /api/proveedores:', error);
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/proveedores - Crea un nuevo proveedor */
app.post('/api/proveedores', async (req, res) => {
  try {
    const { nombre, nombre_encargado, email, telefono } = req.body;
    
    if (!nombre) {
      return res.status(400).json({ error: 'El nombre del proveedor es requerido' });
    }

    const result = await pool.query(`
      INSERT INTO proveedores (nombre, nombre_encargado, email, telefono)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [nombre, nombre_encargado || null, email || null, telefono || null]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error en POST /api/proveedores:', error);
    res.status(500).json({ error: error.message });
  }
});

/** PUT /api/proveedores/:id - Actualiza un proveedor */
app.put('/api/proveedores/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, nombre_encargado, email, telefono } = req.body;
    
    const result = await pool.query(`
      UPDATE proveedores 
      SET 
        nombre = COALESCE($1, nombre),
        nombre_encargado = COALESCE($2, nombre_encargado),
        email = COALESCE($3, email),
        telefono = COALESCE($4, telefono)
      WHERE id = $5
      RETURNING *
    `, [nombre, nombre_encargado, email, telefono, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error en PUT /api/proveedores/:id:', error);
    res.status(500).json({ error: error.message });
  }
});

/** DELETE /api/proveedores/:id - Elimina un proveedor */
app.delete('/api/proveedores/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM proveedores WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }
    res.status(204).send();
  } catch (err) {
    console.error('Error en DELETE /api/proveedores/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

//  ENDPOINTS: MOVIMIENTOS (solo lectura)

/** GET /api/movimientos - Obtiene todos los movimientos de inventario */
app.get('/api/movimientos', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        m.id,
        m.producto_id,
        p.nombre AS producto_nombre,
        m.tipo_movimiento,
        m.cantidad,
        m.motivo,
        m.fecha
      FROM movimientos_inventario m
      LEFT JOIN productos p ON m.producto_id = p.id
      ORDER BY m.fecha DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error en GET /api/movimientos:', err);
    res.status(500).json({ error: err.message });
  }
});

//  INICIO DEL SERVIDOR

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
  console.log(`📚 API disponible en el puerto ${PORT}/api`);
});
