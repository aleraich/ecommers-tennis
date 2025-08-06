const API_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://rahel-app.onrender.com';

document.addEventListener('DOMContentLoaded', () => {
    // Verificar token y rol al cargar
    const token = localStorage.getItem('token');
    const userRole = localStorage.getItem('userRole');
    if (!token || userRole !== 'admin') {
        console.error('No autenticado o no es admin. Token:', token ? token.substring(0, 10) + '...' : 'No token', 'Rol:', userRole);
        alert('No estás autenticado o no tienes permisos de administrador. Redirigiendo al inicio de sesión.');
        window.location.href = '/';
        return;
    }

    // Saludo personalizado y cerrar sesión
    document.getElementById('userGreeting').textContent = `Hola, ${localStorage.getItem('userName') || 'Administrador'}`;
    document.getElementById('logoutLink').addEventListener('click', (e) => {
        e.preventDefault();
        console.log('Cerrando sesión...');
        localStorage.removeItem('userName');
        localStorage.removeItem('token');
        localStorage.removeItem('userRole');
        window.location.href = '/';
    });

    // Manejar el formulario de añadir productos
    const productForm = document.getElementById('productForm');
    if (productForm) {
        productForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            console.log('Enviando FormData:', Object.fromEntries(formData.entries()), 'Archivo:', formData.get('media')?.name || 'Sin archivo');
            alert('Formulario enviado. Preparando datos para subir...');

            try {
                const res = await fetch(`${API_URL}/admin/products`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    },
                    body: formData
                });

                const responseData = await res.json();
                if (!res.ok) {
                    throw new Error(`Error (${res.status}): ${responseData.message || 'No se pudo añadir el producto'}`);
                }

                console.log('Producto añadido:', responseData);
                alert('Producto añadido con éxito. ID: ' + responseData.id + '. Recargando productos...');
                e.target.reset();
                await loadProducts(); // Forzar recarga inmediata y esperar
            } catch (err) {
                console.error('Error al añadir producto:', err.message, 'Detalles:', err);
                alert('Error al añadir producto: ' + err.message);
            }
        });
    }

    // Cargar productos
    let isLoading = false;
    async function loadProducts() {
        if (isLoading) return;
        isLoading = true;

        const loadingMessage = document.getElementById('loadingMessage');
        const errorMessage = document.getElementById('errorMessage');
        const emptyMessage = document.getElementById('emptyMessage');
        const productList = document.getElementById('productList');

        try {
            loadingMessage.style.display = 'block';
            errorMessage.style.display = 'none';
            emptyMessage.style.display = 'none';
            productList.innerHTML = ''; // Limpiar la tabla antes de renderizar
            alert('Iniciando carga de productos desde el servidor...');

            console.log(`Solicitando productos a ${API_URL}/products con token: ${token.substring(0, 10)}...`);

            const response = await fetch(`${API_URL}/products`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`Error ${response.status}: ${errorData.message || 'No se pudieron cargar los productos'}`);
            }

            const products = await response.json();
            console.log('Productos cargados (detalle):', products.map(p => ({ id: p.id, media: p.media, name: p.name })));
            alert('Productos recibidos del servidor. Total: ' + products.length);

            if (!products || products.length === 0) {
                emptyMessage.style.display = 'block';
                isLoading = false;
                alert('No hay productos para mostrar.');
                return;
            }

            products.forEach(product => {
                const row = document.createElement('tr');
                const createdAt = product.created_at ? new Date(product.created_at).toLocaleString('es-ES', {
                    year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit'
                }) : 'Sin fecha';
                const fileId = product.media.split('id=')[1] || product.media.match(/\/d\/(.+?)\//)?.[1] || '';
                const mediaPreview = product.media ? 
                    `<img src="${API_URL}/proxy/image?id=${fileId}" alt="${product.name || 'Imagen no disponible'}" width="50" 
                          onerror="console.log('Error al cargar imagen para ID ${product.id}:', this.src); this.onerror=null; alert('Error al cargar imagen para ID ${product.id}: ' + this.src); this.src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg=='; this.alt='Imagen no disponible';">` : 
                    'Sin media';
                row.innerHTML = `
                    <td>${product.id}</td>
                    <td>${product.name || 'Sin nombre'}</td>
                    <td>$${product.price || '0.00'}</td>
                    <td>${mediaPreview}</td>
                    <td>${product.description || 'Sin descripción'}</td>
                    <td>${product.category || 'Sin categoría'}</td>
                    <td>${createdAt}</td>
                    <td><button onclick="deleteProduct(${product.id})">Eliminar</button></td>
                `;
                productList.appendChild(row);
            });
            alert('Tabla de productos renderizada con éxito.');
        } catch (err) {
            console.error('Error al cargar productos:', err.message, 'Detalles:', err);
            loadingMessage.style.display = 'none';
            errorMessage.style.display = 'block';
            errorMessage.textContent = `Error al cargar productos: ${err.message}`;
            alert('Error al cargar productos: ' + err.message);
            if (err.message.includes('403')) {
                alert('Sesión expirada. Por favor, inicia sesión nuevamente.');
                localStorage.removeItem('token');
                localStorage.removeItem('userName');
                localStorage.removeItem('userRole');
                window.location.href = '/';
            }
        } finally {
            isLoading = false;
        }
    }

    // Eliminar producto
    window.deleteProduct = async function(id) {
        if (confirm('¿Seguro que quieres eliminar este producto?')) {
            try {
                const response = await fetch(`${API_URL}/admin/products/${id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(`Error (${response.status}): ${data.message || 'No se pudo eliminar el producto'}`);
                }

                console.log('Producto eliminado:', id);
                alert('Producto eliminado con ID: ' + id + '. Recargando productos...');
                await loadProducts(); // Forzar recarga inmediata y esperar
            } catch (error) {
                console.error('Error al eliminar producto:', error.message, 'Detalles:', error);
                alert('Error al eliminar producto: ' + error.message);
                if (error.message.includes('403')) {
                    alert('Sesión expirada. Por favor, inicia sesión nuevamente.');
                    localStorage.removeItem('token');
                    localStorage.removeItem('userName');
                    localStorage.removeItem('userRole');
                    window.location.href = '/';
                }
            }
        }
    };

    // Manejar el menú lateral
    const menuItems = document.querySelectorAll('.sidebar a');
    const sections = document.querySelectorAll('.section');
    let currentSection = 'dashboard';

    menuItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetSection = item.getAttribute('href').substring(1);

            if (targetSection === currentSection) return;

            sections.forEach(section => {
                section.style.display = 'none';
            });

            document.getElementById(targetSection).style.display = 'block';
            menuItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            currentSection = targetSection;

            if (targetSection === 'products') {
                loadProducts();
            }
        });
    });

    // Añadir botón para recargar productos
    const reloadButton = document.createElement('button');
    reloadButton.textContent = 'Recargar Productos';
    reloadButton.style.margin = '10px';
    reloadButton.addEventListener('click', () => {
        alert('Botón Recargar Productos presionado. Iniciando recarga...');
        loadProducts();
    });
    document.querySelector('.section#products').prepend(reloadButton);

    // Mostrar solo el dashboard por defecto y cargar productos si es la sección activa
    document.getElementById('dashboard').style.display = 'block';
    if (document.getElementById('products')) loadProducts(); // Cargar productos al iniciar si está en la sección products
});