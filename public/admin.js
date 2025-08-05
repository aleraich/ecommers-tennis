const API_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://rahel-app.onrender.com';

document.addEventListener('DOMContentLoaded', () => {
    // Saludo personalizado y cerrar sesión
    document.getElementById('userGreeting').textContent = `Hola, ${localStorage.getItem('userName') || 'Administrador'}`;
    document.getElementById('logoutLink').addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem('userName');
        localStorage.removeItem('token');
        localStorage.removeItem('userRole');
        window.location.href = '/';
    });

    // Manejar el formulario de añadir productos
    document.getElementById('productForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const token = localStorage.getItem('token');

        if (!token) {
            alert('Error: No estás autenticado. Por favor, inicia sesión nuevamente.');
            window.location.href = '/';
            return;
        }

        // Depuración: Mostrar todos los campos del formulario
        for (let [key, value] of formData.entries()) {
            console.log(`Campo ${key}:`, value instanceof File ? `Archivo: ${value.name}, Tipo: ${value.type}, Tamaño: ${value.size}` : value);
        }

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

            alert('Producto añadido con éxito');
            e.target.reset();
            loadProducts();
        } catch (err) {
            alert('Error de red o servidor: ' + err.message);
            console.error('Error al añadir producto:', err);
        }
    });

    // Cargar productos
    let isLoading = false;
    async function loadProducts() {
        if (isLoading) return;
        isLoading = true;

        const loadingMessage = document.getElementById('loadingMessage');
        const errorMessage = document.getElementById('errorMessage');
        const emptyMessage = document.getElementById('emptyMessage');
        const productList = document.getElementById('productList');
        const token = localStorage.getItem('token');

        if (!token) {
            alert('Error: No estás autenticado. Por favor, inicia sesión nuevamente.');
            window.location.href = '/';
            isLoading = false;
            return;
        }

        try {
            loadingMessage.style.display = 'block';
            errorMessage.style.display = 'none';
            emptyMessage.style.display = 'none';
            productList.innerHTML = '';

            const response = await fetch(`${API_URL}/products`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Error ${response.status}: ${errorData.message || 'No se pudieron cargar los productos'}`);
            }

            const products = await response.json();
            console.log('Productos cargados:', products);
            loadingMessage.style.display = 'none';

            if (!products || products.length === 0) {
                emptyMessage.style.display = 'block';
                isLoading = false;
                return;
            }

            products.forEach(product => {
                const row = document.createElement('tr');
                const createdAt = product.created_at ? new Date(product.created_at).toLocaleString('es-ES', {
                    year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit'
                }) : 'Sin fecha';
                const mediaPreview = product.media ? 
                    (product.media.endsWith('.mp4') || product.media.endsWith('.webm') ? 
                        `<video src="${product.media}" width="50" controls></video>` : 
                        `<img src="${product.media}" alt="${product.name}" width="50" onerror="this.src='https://via.placeholder.com/50'; this.alt='Error al cargar imagen'; console.log('Error cargando imagen: ${product.media}');">`) : 
                    'Sin media';
                row.innerHTML = `
                    <td>${product.id}</td>
                    <td>${product.name}</td>
                    <td>$${product.price}</td>
                    <td>${mediaPreview}</td>
                    <td>${product.description || 'Sin descripción'}</td>
                    <td>${product.category || 'Sin categoría'}</td>
                    <td>${createdAt}</td>
                    <td><button onclick="deleteProduct(${product.id})">Eliminar</button></td>
                `;
                productList.appendChild(row);
            });
        } catch (err) {
            console.error('Error al cargar productos:', err);
            loadingMessage.style.display = 'none';
            errorMessage.style.display = 'block';
            errorMessage.textContent = err.message;
        } finally {
            isLoading = false;
        }
    }

    // Eliminar producto
    window.deleteProduct = async function(id) {
        if (confirm('¿Seguro que quieres eliminar este producto?')) {
            const token = localStorage.getItem('token');

            if (!token) {
                alert('Error: No estás autenticado. Por favor, inicia sesión nuevamente.');
                window.location.href = '/';
                return;
            }

            try {
                const response = await fetch(`${API_URL}/admin/products/${id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(`Error (${response.status}): ${data.message || 'No se pudo eliminar el producto'}`);
                }

                alert('Producto eliminado');
                loadProducts();
            } catch (error) {
                alert('Error de red o servidor: ' + error.message);
                console.error('Error al eliminar producto:', error);
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

    // Mostrar solo el dashboard por defecto
    document.getElementById('dashboard').style.display = 'block';
});