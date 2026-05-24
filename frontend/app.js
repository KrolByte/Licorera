 /**
 * LICORERA — SISTEMA DE INVENTARIO
 * app.js  |  SPA con CRUD completo
 *
 * Arquitectura:
 *  - Toda la comunicación es async/await hacia la API REST (backend/api.js)
 *  - Cada sección tiene sus propias funciones: cargar, renderizar, abrir modal, guardar, eliminar
 *  - movimientos_inventario es de solo lectura (lo genera el backend)
 *
 * Endpoints esperados en el backend:
 *   GET    /api/productos
 *   GET    /api/productos/:id
 *   POST   /api/productos
 *   PUT    /api/productos/:id
 *   DELETE /api/productos/:id
 *
 *   GET    /api/categorias
 *   POST   /api/categorias
 *   PUT    /api/categorias/:id
 *   DELETE /api/categorias/:id
 *
 *   GET    /api/proveedores
 *   POST   /api/proveedores
 *   PUT    /api/proveedores/:id
 *   DELETE /api/proveedores/:id
 *
 *   GET    /api/movimientos
 */

//  CONFIGURACIÓN
const API_BASE = 'https://licorera-backend-j97k.onrender.com/api';

//  ESTADO GLOBAL  (caché local para búsqueda y conteos)
const state = {
  seccionActiva: 'productos',
  productos:     [],
  categorias:    [],
  proveedores:   [],
  movimientos:   [],
};

//  UTILIDADES — API
/**
 * Envuelve fetch con manejo de errores centralizado.
 * @param {string} url
 * @param {RequestInit} [opciones]
 * @returns {Promise<any>}
 */
async function apiFetch(url, opciones = {}) {
  const respuesta = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...opciones.headers },
    ...opciones,
  });

  if (!respuesta.ok) {
    const error = await respuesta.json().catch(() => ({ mensaje: 'Error desconocido' }));
    throw new Error(error.mensaje || `HTTP ${respuesta.status}`);
  }

  // DELETE puede responder sin cuerpo (204)
  if (respuesta.status === 204) return null;
  return respuesta.json();
}

//  UTILIDADES — UI
/** Muestra un toast de notificación por 3 segundos. */
function mostrarToast(mensaje, tipo = 'success') {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-msg');

  toastMsg.textContent = mensaje;
  toast.className = `toast ${tipo}`;
  toast.classList.remove('hidden');

  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.add('hidden'), 3000);
}

/** Abre el modal con título y contenido HTML dados. */
function abrirModal(titulo, htmlCuerpo) {
  document.getElementById('modal-title').textContent = titulo;
  document.getElementById('modal-body').innerHTML = htmlCuerpo;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

/** Cierra el modal. */
function cerrarModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('modal-body').innerHTML = '';
}

/** Formatea un número como moneda colombiana. */
function formatCOP(valor) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(valor);
}

/** Formatea una fecha ISO a formato legible. */
function formatFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** Actualiza los contadores del sidebar. */
function actualizarStats() {
  document.getElementById('stat-productos').textContent  = state.productos.length;
  const stockBajo = state.productos.filter(p => p.stock_actual <= p.stock_minimo).length;
  document.getElementById('stat-stock-bajo').textContent = stockBajo;

  // Alerta visible si hay productos con stock bajo
  const alertEl = document.getElementById('alert-stock');
  if (stockBajo > 0) {
    alertEl.classList.remove('hidden');
    alertEl.textContent = `⚠️ ${stockBajo} producto(s) con stock por debajo del mínimo`;
  } else {
    alertEl.classList.add('hidden');
  }
}

//  NAVEGACIÓN
function navegarA(seccion) {
  state.seccionActiva = seccion;

  // Nav activo
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.section === seccion);
  });

  // Secciones visibles
  document.querySelectorAll('.section').forEach(sec => {
    sec.classList.toggle('active', sec.id === `section-${seccion}`);
  });

  // Título y badge
  const titulos = {
    productos:   ['Productos',   'inventario'],
    categorias:  ['Categorías',  'catálogo'],
    proveedores: ['Proveedores', 'directorio'],
    movimientos: ['Movimientos', 'trazabilidad'],
  };
  const [titulo, badge] = titulos[seccion] || ['', ''];
  document.getElementById('page-title').textContent = titulo;
  document.getElementById('page-badge').textContent = badge;

  // Ocultar botón "Nuevo" en movimientos (son automáticos)
  document.getElementById('btn-nuevo').style.display =
    seccion === 'movimientos' ? 'none' : '';

  // Limpiar búsqueda
  document.getElementById('search-input').value = '';

  // Cargar datos de la sección
  cargarSeccion(seccion);
}

/** Despacha la carga de datos según la sección activa. */
async function cargarSeccion(seccion) {
  switch (seccion) {
    case 'productos':   await cargarProductos();   break;
    case 'categorias':  await cargarCategorias();  break;
    case 'proveedores': await cargarProveedores();  break;
    case 'movimientos': await cargarMovimientos(); break;
  }
}

//  BÚSQUEDA  (filtra la tabla activa)
function filtrarTabla(termino) {
  const t = termino.toLowerCase();
  switch (state.seccionActiva) {
    case 'productos':
      renderProductos(
        state.productos.filter(p =>
          p.nombre.toLowerCase().includes(t) ||
          (p.categoria_nombre || '').toLowerCase().includes(t)
        )
      );
      break;
    case 'categorias':
      renderCategorias(
        state.categorias.filter(c => c.nombre.toLowerCase().includes(t))
      );
      break;
    case 'proveedores':
      renderProveedores(
        state.proveedores.filter(p =>
          p.nombre.toLowerCase().includes(t) ||
          (p.nombre_encargado || '').toLowerCase().includes(t)
        )
      );
      break;
    case 'movimientos':
      renderMovimientos(
        state.movimientos.filter(m =>
          (m.producto_nombre || '').toLowerCase().includes(t) ||
          m.tipo_movimiento.toLowerCase().includes(t)
        )
      );
      break;
  }
}

//  PRODUCTOS
/** Obtiene todos los productos del backend. */
async function cargarProductos() {
  try {
    const datos = await apiFetch(`${API_BASE}/productos`);
    state.productos = datos;
    renderProductos(datos);
    actualizarStats();
  } catch (err) {
    mostrarToast(`Error al cargar productos: ${err.message}`, 'error');
  }
}

/** Genera las filas HTML de la tabla de productos. */
function renderProductos(lista) {
  const tbody = document.getElementById('tbody-productos');
  const empty = document.getElementById('empty-productos');

  if (!lista.length) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  tbody.innerHTML = lista.map((p, i) => {
    // Badge de estado de stock
    let badge;
    if (p.stock_actual === 0) {
      badge = `<span class="badge badge-danger">Sin stock</span>`;
    } else if (p.stock_actual <= p.stock_minimo) {
      badge = `<span class="badge badge-warn">Stock bajo</span>`;
    } else {
      badge = `<span class="badge badge-ok">OK</span>`;
    }

    return `
      <tr>
        <td class="mono">${i + 1}</td>
        <td class="td-name">${escapeHtml(p.nombre)}</td>
        <td><span class="badge badge-cat">${escapeHtml(p.categoria_nombre || '—')}</span></td>
        <td>${escapeHtml(p.proveedor_nombre || '—')}</td>
        <td>${escapeHtml(p.descripcion || '—')}</td>
        <td class="mono">${p.creado_en ? formatFecha(p.creado_en) : '—'}</td>
        <td class="mono">${formatCOP(p.precio_compra)}</td>
        <td class="mono">${formatCOP(p.precio_venta)}</td>
        <td class="mono" style="color:${p.stock_actual <= p.stock_minimo ? 'var(--red)' : 'var(--text)'}">
          ${p.stock_actual}
        </td>
        <td class="mono">${p.stock_minimo}</td>
        <td>${badge}</td>
        <td>
          <div class="actions">
            <button class="btn-icon" onclick="abrirEditarProducto(${p.id})" title="Editar">✏️</button>
            <button class="btn-icon danger" onclick="eliminarProducto(${p.id})" title="Eliminar">🗑</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

/** Abre el modal para crear un nuevo producto. */
async function abrirNuevoProducto() {
  // Necesitamos categorías y proveedores para los selects
  if (!state.categorias.length) await cargarCategorias();
  if (!state.proveedores.length) await cargarProveedores();

  abrirModal('Nuevo Producto', htmlFormProducto());
  document.getElementById('form-producto').addEventListener('submit', guardarProducto);
}

/** Abre el modal para editar un producto existente. */
async function abrirEditarProducto(id) {
  if (!state.categorias.length) await cargarCategorias();
  if (!state.proveedores.length) await cargarProveedores();

  const producto = state.productos.find(p => p.id === id);
  if (!producto) return;

  abrirModal('Editar Producto', htmlFormProducto(producto));
  document.getElementById('form-producto').addEventListener('submit', guardarProducto);
}

/** Genera el HTML del formulario de producto, relleno si se pasa un objeto. */
function htmlFormProducto(p = {}) {
  const opsCategorias = state.categorias.map(c =>
    `<option value="${c.id}" ${p.categoria_id === c.id ? 'selected' : ''}>${escapeHtml(c.nombre)}</option>`
  ).join('');

  const opsProveedores = state.proveedores.map(v =>
    `<option value="${v.id}" ${p.proveedor_id === v.id ? 'selected' : ''}>${escapeHtml(v.nombre)}</option>`
  ).join('');

  return `
    <form id="form-producto" novalidate>
      <input type="hidden" id="producto-id" value="${p.id || ''}">

      <div class="form-group">
        <label for="prod-nombre">Nombre *</label>
        <input type="text" id="prod-nombre" value="${escapeHtml(p.nombre || '')}" required placeholder="Ej: Ron Medellín Añejo 750ml">
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="prod-categoria">Categoría *</label>
          <select id="prod-categoria" required>
            <option value="">— Seleccionar —</option>
            ${opsCategorias}
          </select>
        </div>
        <div class="form-group">
          <label for="prod-proveedor">Proveedor</label>
          <select id="prod-proveedor">
            <option value="">— Sin proveedor —</option>
            ${opsProveedores}
          </select>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="prod-precio-compra">Precio compra *</label>
          <input type="number" id="prod-precio-compra" value="${p.precio_compra || ''}" min="0" step="100" required placeholder="0">
        </div>
        <div class="form-group">
          <label for="prod-precio-venta">Precio venta *</label>
          <input type="number" id="prod-precio-venta" value="${p.precio_venta || ''}" min="0" step="100" required placeholder="0">
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="prod-stock">Stock actual *</label>
          <input type="number" id="prod-stock" value="${p.stock_actual ?? ''}" min="0" required placeholder="0">
        </div>
        <div class="form-group">
          <label for="prod-stock-min">Stock mínimo *</label>
          <input type="number" id="prod-stock-min" value="${p.stock_minimo ?? 5}" min="0" required placeholder="5">
        </div>
      </div>

      <div class="form-group">
        <label for="prod-descripcion">Descripción</label>
        <textarea id="prod-descripcion" rows="3" placeholder="Descripción del producto...">${escapeHtml(p.descripcion || '')}</textarea>
      </div>

      <div class="form-footer">
        <button type="button" class="btn-secondary" onclick="cerrarModal()">Cancelar</button>
        <button type="submit" class="btn-primary">Guardar</button>
      </div>
    </form>
  `;
}

/** Envía la creación o actualización de un producto al backend. */
async function guardarProducto(e) {
  e.preventDefault();

  const id     = document.getElementById('producto-id').value;
  const nombre = document.getElementById('prod-nombre').value.trim();
  const catId  = document.getElementById('prod-categoria').value;

  if (!nombre || !catId) {
    mostrarToast('Nombre y categoría son obligatorios.', 'error');
    return;
  }

  const payload = {
    nombre,
    descripcion:    document.getElementById('prod-descripcion').value.trim() || null,
    categoria_id:   parseInt(catId),
    proveedor_id:   parseInt(document.getElementById('prod-proveedor').value) || null,
    precio_compra:  parseFloat(document.getElementById('prod-precio-compra').value) || 0,
    precio_venta:   parseFloat(document.getElementById('prod-precio-venta').value) || 0,
    stock_actual:   parseInt(document.getElementById('prod-stock').value) || 0,
    stock_minimo:   parseInt(document.getElementById('prod-stock-min').value) || 5,
  };

  try {
    if (id) {
      await apiFetch(`${API_BASE}/productos/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      mostrarToast('Producto actualizado correctamente.');
    } else {
      await apiFetch(`${API_BASE}/productos`, { method: 'POST', body: JSON.stringify(payload) });
      mostrarToast('Producto creado correctamente.');
    }
    cerrarModal();
    await cargarProductos();
  } catch (err) {
    mostrarToast(`Error al guardar: ${err.message}`, 'error');
  }
}

/** Elimina un producto tras confirmación. */
async function eliminarProducto(id) {
  const producto = state.productos.find(p => p.id === id);
  if (!confirm(`¿Eliminar "${producto?.nombre}"? Esta acción no se puede deshacer.`)) return;

  try {
    await apiFetch(`${API_BASE}/productos/${id}`, { method: 'DELETE' });
    mostrarToast('Producto eliminado.');
    await cargarProductos();
  } catch (err) {
    mostrarToast(`Error al eliminar: ${err.message}`, 'error');
  }
}

//  CATEGORÍAS
async function cargarCategorias() {
  try {
    const datos = await apiFetch(`${API_BASE}/categorias`);
    state.categorias = datos;
    if (state.seccionActiva === 'categorias') renderCategorias(datos);
  } catch (err) {
    mostrarToast(`Error al cargar categorías: ${err.message}`, 'error');
  }
}

function renderCategorias(lista) {
  const tbody = document.getElementById('tbody-categorias');
  const empty = document.getElementById('empty-categorias');

  if (!lista.length) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  tbody.innerHTML = lista.map((c, i) => {
    // Cuenta cuántos productos usan esta categoría
    const total = state.productos.filter(p => p.categoria_id === c.id).length;
    return `
      <tr>
        <td class="mono">${i + 1}</td>
        <td class="td-name">${escapeHtml(c.nombre)}</td>
        <td>${escapeHtml(c.descripcion || '—')}</td>
        <td class="mono">${c.cantidad_productos ?? 0}</td>
        <td>
          <div class="actions">
            <button class="btn-icon" onclick="abrirEditarCategoria(${c.id})" title="Editar">✏️</button>
            <button class="btn-icon danger" onclick="eliminarCategoria(${c.id})" title="Eliminar">🗑</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function abrirNuevaCategoria() {
  abrirModal('Nueva Categoría', htmlFormCategoria());
  document.getElementById('form-categoria').addEventListener('submit', guardarCategoria);
}

function abrirEditarCategoria(id) {
  const cat = state.categorias.find(c => c.id === id);
  if (!cat) return;
  abrirModal('Editar Categoría', htmlFormCategoria(cat));
  document.getElementById('form-categoria').addEventListener('submit', guardarCategoria);
}

function htmlFormCategoria(c = {}) {
  return `
    <form id="form-categoria" novalidate>
      <input type="hidden" id="categoria-id" value="${c.id || ''}">
      <div class="form-group">
        <label for="cat-nombre">Nombre *</label>
        <input type="text" id="cat-nombre" value="${escapeHtml(c.nombre || '')}" required placeholder="Ej: Whisky">
      </div>
      <div class="form-group">
        <label for="cat-descripcion">Descripción</label>
        <textarea id="cat-descripcion" placeholder="Descripción opcional...">${escapeHtml(c.descripcion || '')}</textarea>
      </div>
      <div class="form-footer">
        <button type="button" class="btn-secondary" onclick="cerrarModal()">Cancelar</button>
        <button type="submit" class="btn-primary">Guardar</button>
      </div>
    </form>
  `;
}

async function guardarCategoria(e) {
  e.preventDefault();
  const id     = document.getElementById('categoria-id').value;
  const nombre = document.getElementById('cat-nombre').value.trim();

  if (!nombre) { mostrarToast('El nombre es obligatorio.', 'error'); return; }

  const payload = {
    nombre,
    descripcion: document.getElementById('cat-descripcion').value.trim() || null,
  };

  try {
    if (id) {
      await apiFetch(`${API_BASE}/categorias/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      mostrarToast('Categoría actualizada.');
    } else {
      await apiFetch(`${API_BASE}/categorias`, { method: 'POST', body: JSON.stringify(payload) });
      mostrarToast('Categoría creada.');
    }
    cerrarModal();
    await cargarCategorias();
    renderCategorias(state.categorias);
  } catch (err) {
    mostrarToast(`Error: ${err.message}`, 'error');
  }
}

async function eliminarCategoria(id) {
  const cat = state.categorias.find(c => c.id === id);
  const enUso = state.productos.some(p => p.categoria_id === id);
  if (enUso) {
    mostrarToast('No se puede eliminar: hay productos con esta categoría.', 'error');
    return;
  }
  if (!confirm(`¿Eliminar la categoría "${cat?.nombre}"?`)) return;

  try {
    await apiFetch(`${API_BASE}/categorias/${id}`, { method: 'DELETE' });
    mostrarToast('Categoría eliminada.');
    await cargarCategorias();
    renderCategorias(state.categorias);
  } catch (err) {
    mostrarToast(`Error: ${err.message}`, 'error');
  }
}

//  PROVEEDORES
async function cargarProveedores() {
  try {
    const datos = await apiFetch(`${API_BASE}/proveedores`);
    state.proveedores = datos;
    if (state.seccionActiva === 'proveedores') renderProveedores(datos);
  } catch (err) {
    mostrarToast(`Error al cargar proveedores: ${err.message}`, 'error');
  }
}

function renderProveedores(lista) {
  const tbody = document.getElementById('tbody-proveedores');
  const empty = document.getElementById('empty-proveedores');

  if (!lista.length) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  tbody.innerHTML = lista.map((v, i) => {
    const total = state.productos.filter(p => p.proveedor_id === v.id).length;
    return `
      <tr>
        <td class="mono">${i + 1}</td>
        <td class="td-name">${escapeHtml(v.nombre)}</td>
        <td>${escapeHtml(v.nombre_encargado || '—')}</td>
        <td class="mono">${escapeHtml(v.telefono || '—')}</td>
        <td>${escapeHtml(v.email || '—')}</td>
        <td class="mono">${v.cantidad_productos ?? 0}</td>
        <td class="mono">${v.creado_en ? formatFecha(v.creado_en) : '—'}</td>
        <td>
          <div class="actions">
            <button class="btn-icon" onclick="abrirEditarProveedor(${v.id})" title="Editar">✏️</button>
            <button class="btn-icon danger" onclick="eliminarProveedor(${v.id})" title="Eliminar">🗑</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function abrirNuevoProveedor() {
  abrirModal('Nuevo Proveedor', htmlFormProveedor());
  document.getElementById('form-proveedor').addEventListener('submit', guardarProveedor);
}

function abrirEditarProveedor(id) {
  const prov = state.proveedores.find(v => v.id === id);
  if (!prov) return;
  abrirModal('Editar Proveedor', htmlFormProveedor(prov));
  document.getElementById('form-proveedor').addEventListener('submit', guardarProveedor);
}

function htmlFormProveedor(v = {}) {
  return `
    <form id="form-proveedor" novalidate>
      <input type="hidden" id="proveedor-id" value="${v.id || ''}">
      <div class="form-group">
        <label for="prov-nombre">Empresa / Nombre *</label>
        <input type="text" id="prov-nombre" value="${escapeHtml(v.nombre || '')}" required placeholder="Ej: Distribuidora El Barril">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="prov-encargado">Nombre encargado</label>
          <input type="text" id="prov-encargado" value="${escapeHtml(v.nombre_encargado || '')}" placeholder="Ej: Carlos Ríos">
        </div>
        <div class="form-group">
          <label for="prov-telefono">Teléfono</label>
          <input type="tel" id="prov-telefono" value="${escapeHtml(v.telefono || '')}" placeholder="Ej: 3001234567">
        </div>
      </div>
      <div class="form-group">
        <label for="prov-email">Email</label>
        <input type="email" id="prov-email" value="${escapeHtml(v.email || '')}" placeholder="correo@empresa.com">
      </div>
      <div class="form-footer">
        <button type="button" class="btn-secondary" onclick="cerrarModal()">Cancelar</button>
        <button type="submit" class="btn-primary">Guardar</button>
      </div>
    </form>
  `;
}

async function guardarProveedor(e) {
  e.preventDefault();
  const id     = document.getElementById('proveedor-id').value;
  const nombre = document.getElementById('prov-nombre').value.trim();

  if (!nombre) { mostrarToast('El nombre es obligatorio.', 'error'); return; }

  const payload = {
    nombre,
    nombre_encargado: document.getElementById('prov-encargado').value.trim() || null,
    telefono:         document.getElementById('prov-telefono').value.trim()   || null,
    email:            document.getElementById('prov-email').value.trim()      || null,
  };

  try {
    if (id) {
      await apiFetch(`${API_BASE}/proveedores/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      mostrarToast('Proveedor actualizado.');
    } else {
      await apiFetch(`${API_BASE}/proveedores`, { method: 'POST', body: JSON.stringify(payload) });
      mostrarToast('Proveedor creado.');
    }
    cerrarModal();
    await cargarProveedores();
    renderProveedores(state.proveedores);
  } catch (err) {
    mostrarToast(`Error: ${err.message}`, 'error');
  }
}

async function eliminarProveedor(id) {
  const prov = state.proveedores.find(v => v.id === id);
  if (!confirm(`¿Eliminar al proveedor "${prov?.nombre}"?`)) return;

  try {
    await apiFetch(`${API_BASE}/proveedores/${id}`, { method: 'DELETE' });
    mostrarToast('Proveedor eliminado.');
    await cargarProveedores();
    renderProveedores(state.proveedores);
  } catch (err) {
    mostrarToast(`Error: ${err.message}`, 'error');
  }
}

//  MOVIMIENTOS  (solo lectura, generados por el backend)
async function cargarMovimientos() {
  try {
    const datos = await apiFetch(`${API_BASE}/movimientos`);
    state.movimientos = datos;
    renderMovimientos(datos);
  } catch (err) {
    mostrarToast(`Error al cargar movimientos: ${err.message}`, 'error');
  }
}

function renderMovimientos(lista) {
  const tbody = document.getElementById('tbody-movimientos');
  const empty = document.getElementById('empty-movimientos');

  if (!lista.length) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  tbody.innerHTML = lista.map((m, i) => {
    const badgeClass = { entrada: 'badge-in', salida: 'badge-out', ajuste: 'badge-adj' }[m.tipo_movimiento] || 'badge-adj';
    
    // Determinar signo y color según tipo de movimiento
    let signo = '';
    let colorMov = 'var(--text)';
    
    if (m.tipo_movimiento.toUpperCase() === 'SALIDA') {
      signo = '-';
      colorMov = 'var(--red)';
    } else if (m.tipo_movimiento.toUpperCase() === 'ENTRADA') {
      signo = '+';
      colorMov = 'var(--green)';
    }
    
    return `
      <tr>
        <td class="mono">${i + 1}</td>
        <td class="td-name">${escapeHtml(m.producto_nombre || '—')}</td>
        <td><span class="badge ${badgeClass}">${m.tipo_movimiento}</span></td>
        <td class="mono" style="color:${colorMov}">
          ${signo}${m.cantidad}
        </td>
        <td>${escapeHtml(m.motivo || '—')}</td>
        <td class="mono">${formatFecha(m.fecha)}</td>
      </tr>
    `;
  }).join('');
}

//  SEGURIDAD — escape XSS
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

//  INICIALIZACIÓN
document.addEventListener('DOMContentLoaded', () => {

  // Navegación lateral
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => navegarA(btn.dataset.section));
  });

  // Botón "Nuevo" (despacha según sección activa)
  document.getElementById('btn-nuevo').addEventListener('click', () => {
    switch (state.seccionActiva) {
      case 'productos':   abrirNuevoProducto();  break;
      case 'categorias':  abrirNuevaCategoria(); break;
      case 'proveedores': abrirNuevoProveedor(); break;
    }
  });

  // Cerrar modal
  document.getElementById('modal-close').addEventListener('click', cerrarModal);
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-overlay')) cerrarModal();
  });

  // Búsqueda en tiempo real
  document.getElementById('search-input').addEventListener('input', (e) => {
    filtrarTabla(e.target.value);
  });

  // Teclado: Escape cierra el modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cerrarModal();
  });

  // Carga inicial
  navegarA('productos');
});