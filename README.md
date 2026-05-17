# Licorera
Proyecto de Herramientas de Programación 3, se basa en un sistema de inventario para una licorera
Esta conlleva las siguientes indicaciones: 
1. Objetivo General
Desarrollar una aplicación web de página única (SPA) funcional que implemente operaciones CRUD (Crear, Leer, Actualizar, Borrar) sobre una entidad de libre elección. 
Implementando un backend sencillo con Node.js, Express y una conexión a base de datos real.
2. Contexto: Tema Abierto
El tema es . Debes elegir una "entidad" para gestionar que sea relevante para ti (ej. Tareas, Libros, Películas, Contactos, Gastos, Inventario, etc.).
3. Tecnologías Requeridas
HTML, CSS, JavaScript 
Backend con Node.js + Express y Base de Datos (MySQL, PostgreSQL, MongoDB, etc.).
4. Ventajas del Enfoque Frontend (localStorage)
Esta opción permite concentrarse al 100% en las "acciones aprendidas" con JavaScript en el cliente:
Manipulación avanzada del DOM (crear, editar y borrar elementos visuales).
Gestión de eventos (formularios, botones).
Lógica de formularios dinámicos (validación, modo creación vs. modo edición).
Manejo de datos en formato JSON.
5. Fases del ProyectoFase 1: Conceptualización y Diseño Frontend Define tu entidad (ej. "Tarea"). Lista sus propiedades (ej. id, texto, completada).
Formulario (<form>) con inputs para los atributos.
Campo oculto <input type="hidden" id="entidad-id"> para gestionar ediciones.
Contenedor (<div id="lista-elementos">) para mostrar los resultados.
Aplica estilos CSS para una interfaz limpia y usable.


Fase 2: Lógica y CRUD (JavaScript)
Esta es la fase principal. Toda la lógica vivirá en tu archivo JavaScript (app.js) o, si eliges la opción opcional, se dividirá entre el cliente y el servidor Node.js.
A. Enfoque Frontend con localStorage
index.html
style.css
app.js
Usa event.preventDefault() en el evento submit del formulario.
Usa una clave única (ej. 'misDatos').
Usa JSON.stringify() para guardar el array y JSON.parse() para leerlo.
Crea funciones helpers: obtenerDatos() y guardarDatos(array).
Genera un objeto con ID único (ej. Date.now()), añádelo al array y guarda.
Crea renderizarLista() que lea los datos y genere el HTML con botones "Editar" y "Eliminar".
El botón "Editar" carga los datos en el formulario. Al guardar con un ID presente, busca y actualiza el objeto en el array.
El botón "Eliminar" filtra el array para quitar el elemento deseado y guarda el nuevo array.
Llama a renderizarLista() al cargar la página y tras cada operación CRUD.
B. Enfoque Full Stack con Node.js (Opcional)
Si eliges esta opción, sustituirás las llamadas a localStorage por peticiones fetch() a tu propia API. Configura un servidor Express con rutas para GET, POST, PUT y DELETE que interactúen con una base de datos real. Modifica app.js para que las funciones CRUD hagan llamadas asíncronas (async/await) a tus endpoints en lugar de usar localStorage.
6. Entregables
Un archivo .zip que contenga la estructura de tu proyecto y video sustentado:
Carpetas separadas para frontend y backend (con su package.json y scripts).
7. Criterios de Evaluación
Criterio

Porcentaje
Descripción
50%
Las 4 operaciones CRUD funcionan correctamente sin errores.

20%
Los datos permanecen tras recargar la página (ya sea vía localStorage o BD).

20%
HTML semántico, CSS ordenado y JavaScript bien estructurado y comentado.

10%

La interfaz se actualiza fluidamente sin recargas completas de página.
