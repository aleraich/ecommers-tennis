const API_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://rahel-app.onrender.com';

document.addEventListener('DOMContentLoaded', () => {
    // Verificar token y rol al cargar
    const token = localStorage.getItem('token');
    const userRole = localStorage.getItem('userRole');
    const userName = localStorage.getItem('userName');

    if (!token || userRole !== 'admin') {
        console.error('No autenticado o no es admin. Token:', token ? token.substring(0, 10) + '...' : 'No token', 'Rol:', userRole);
        alert('No estás autenticado o no tienes permisos de administrador. Redirigiendo al inicio de sesión.');
        window.location.href = '/';
        return;
    }

    // Actualizar saludo solo después de verificar autenticación
    document.getElementById('userGreeting').textContent = `Hola, ${userName || 'Administrador'}`;

    // Cerrar sesión
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
        const mediaInput = productForm.querySelector('input[name="media"]');
        mediaInput.addEventListener('change', (e) => {
            console.log('Archivo seleccionado en "media":', e.target.files[0]?.name, 'tamaño:', e.target.files[0]?.size, 'tipo:', e.target.files[0]?.type);
        });

        productForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(productForm);
            console.log('Contenido del formulario antes de enviar:', {
                name: formData.get('name'),
                price: formData.get('price'),
                description: formData.get('description'),
                category: formData.get('category')
            });
            const mediaFile = formData.get('media');
            if (!mediaFile || !(mediaFile instanceof File)) {
                console.error('No se detectó archivo "media" válido en el formulario. Valor recibido:', mediaFile);
                alert('Por favor, selecciona una imagen válida para el producto.');
                return;
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

                console.log('Producto añadido:', responseData);
                alert('Producto añadido con éxito. ID: ' + responseData.id + '. Recargando productos...');
                productForm.reset();
                await loadProducts();
                await loadInventory();
                await loadStockHistory();
            } catch (err) {
                console.error('Error al añadir producto:', err.message, 'Detalles:', err);
                alert('Error al añadir producto: ' + err.message);
            }
        });
    }

    // Manejar el formulario de añadir variantes
    const variantForm = document.getElementById('variantForm');
    if (variantForm) {
        const imageInput = variantForm.querySelector('input[name="image"]');
        imageInput.addEventListener('change', (e) => {
            console.log('Archivo seleccionado en "image":', e.target.files[0]?.name, 'tamaño:', e.target.files[0]?.size, 'tipo:', e.target.files[0]?.type);
        });

        variantForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(variantForm);
            const productId = document.getElementById('variantProductId').value;
            formData.set('productId', productId);
            const imageFile = formData.get('image');
            if (!imageFile || !(imageFile instanceof File)) {
                console.error('No se detectó archivo "image" válido en el formulario. Valor recibido:', imageFile);
                alert('Por favor, selecciona una imagen válida para la variante.');
                return;
            }
            const stock = parseInt(formData.get('stock'));
            if (isNaN(stock) || stock < 0) {
                alert('El stock debe ser un número entero positivo.');
                return;
            }

            try {
                const res = await fetch(`${API_URL}/admin/variants`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    },
                    body: formData
                });

                const responseData = await res.json();
                if (!res.ok) {
                    throw new Error(`Error (${res.status}): ${responseData.message || 'No se pudo añadir la variante'}`);
                }

                console.log('Variante añadida:', responseData);
                alert('Variante añadida con éxito. Recargando productos...');
                variantForm.reset();
                document.getElementById('variantMessage').textContent = 'Variante añadida con ID: ' + responseData.id;
                await loadProducts();
                await loadInventory();
                await loadStockHistory();
            } catch (err) {
                console.error('Error al añadir variante:', err.message, 'Detalles:', err);
                alert('Error al añadir variante: ' + err.message);
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
        const variantForm = document.querySelector('.variant-form');

        try {
            loadingMessage.style.display = 'block';
            errorMessage.style.display = 'none';
            emptyMessage.style.display = 'none';
            productList.innerHTML = '';

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
                const fileId = product.media ? (product.media.split('id=')[1] || product.media.match(/\/d\/(.+?)\//)?.[1] || '') : '';
                const mediaPreview = product.media ? 
                    `<img src="${API_URL}/proxy/image?id=${fileId}" alt="${product.name || 'Imagen no disponible'}" width="50" 
                          onerror="console.log('Error al cargar imagen para ID ${product.id}:', this.src, 'FileID:', '${fileId}'); this.onerror=null; this.src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg=='; this.alt='Imagen no disponible';">` : 
                    'Sin media';
                row.innerHTML = `
                    <td>${product.id}</td>
                    <td>${product.name || 'Sin nombre'}</td>
                    <td>$${product.price || '0.00'}</td>
                    <td>${mediaPreview}</td>
                    <td>${product.description || 'Sin descripción'}</td>
                    <td>${product.category || 'Sin categoría'}</td>
                    <td>${createdAt}</td>
                    <td>
                        <button onclick="viewVariants(${product.id})">Ver Variantes</button>
                        <button onclick="showVariantForm(${product.id})">Añadir Variante</button>
                        <button onclick="deleteProduct(${product.id})">Eliminar</button>
                    </td>
                `;
                productList.appendChild(row);
            });
            variantForm.style.display = 'none';
        } catch (err) {
            console.error('Error al cargar productos:', err.message, 'Detalles:', err);
            loadingMessage.style.display = 'none';
            errorMessage.style.display = 'block';
            errorMessage.textContent = `Error al cargar productos: ${err.message}`;
            if (err.message.includes('403')) {
                localStorage.removeItem('token');
                localStorage.removeItem('userName');
                localStorage.removeItem('userRole');
                window.location.href = '/';
            }
        } finally {
            isLoading = false;
        }
    }

    // Mostrar formulario de variantes para un producto
    window.showVariantForm = function(productId) {
        const variantForm = document.querySelector('.variant-form');
        document.getElementById('variantProductId').value = productId;
        variantForm.style.display = 'block';
    };

    // Mostrar detalles de variantes
    window.viewVariants = async function(id) {
        const variantDetails = document.getElementById('variantDetails');
        const variantList = document.getElementById('variantList');
        try {
            const response = await fetch(`${API_URL}/api/product/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error(`Error ${response.status}: ${await response.text()}`);
            const product = await response.json();
            const variants = product.variants || [];
            console.log(`Variantes para producto ID ${id}:`, variants);
            variantList.innerHTML = variants.map(v => {
                const fileId = v.imagen_color ? (v.imagen_color.split('id=')[1] || v.imagen_color.match(/\/d\/(.+?)\//)?.[1] || '') : '';
                const imagePreview = v.imagen_color ? 
                    `<img src="${API_URL}/proxy/image?id=${fileId}" alt="${v.color || 'Imagen no disponible'}" width="50" 
                          onerror="console.log('Error al cargar imagen de variante para ID ${v.id}:', this.src, 'FileID:', '${fileId}'); this.onerror=null; this.src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg=='; this.alt='Imagen no disponible';">` : 
                    'Sin imagen';
                return `
                    <tr>
                        <td>${v.id || 'N/A'}</td>
                        <td>${v.color || 'Sin color'}</td>
                        <td>${v.size || 'Sin talla'}</td>
                        <td>${v.stock || 'Sin stock'}</td>
                        <td>${imagePreview}</td>
                    </tr>
                `;
            }).join('');
            variantDetails.style.display = 'block';
        } catch (err) {
            console.error('Error al cargar variantes:', err.message);
            alert('Error al cargar variantes: ' + err.message);
        }
    };

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
                await loadProducts();
                await loadInventory();
                await loadStockHistory();
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

    // Cargar inventario
    let isInventoryLoading = false;
    async function loadInventory(searchQuery = '') {
        if (isInventoryLoading) return;
        isInventoryLoading = true;

        const loadingMessage = document.getElementById('inventoryLoadingMessage');
        const errorMessage = document.getElementById('inventoryErrorMessage');
        const emptyMessage = document.getElementById('inventoryEmptyMessage');
        const inventoryList = document.getElementById('inventoryList');

        try {
            loadingMessage.style.display = 'block';
            errorMessage.style.display = 'none';
            emptyMessage.style.display = 'none';
            inventoryList.innerHTML = '';

            console.log(`Solicitando inventario a ${API_URL}/products con token: ${token.substring(0, 10)}...`);

            const response = await fetch(`${API_URL}/products?search=${encodeURIComponent(searchQuery)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`Error ${response.status}: ${errorData.message || 'No se pudo cargar el inventario'}`);
            }

            const products = await response.json();
            console.log('Productos cargados (detalle):', products.map(p => ({ id: p.id, name: p.name })));

            if (!products || products.length === 0) {
                emptyMessage.style.display = 'block';
                isInventoryLoading = false;
                return;
            }

            // Obtener variantes para cada producto
            for (const product of products) {
                const variantResponse = await fetch(`${API_URL}/api/product/${product.id}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!variantResponse.ok) throw new Error(`Error al cargar variantes para producto ${product.id}: ${await variantResponse.text()}`);
                const productWithVariants = await variantResponse.json();
                const totalStock = productWithVariants.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
                const status = totalStock > 0 ? 'Disponible' : 'Agotado';
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${product.id}</td>
                    <td>${product.name || 'Sin nombre'}</td>
                    <td>${totalStock}</td>
                    <td>${status}</td>
                    <td><button onclick="showUpdateForm(${product.id})">Actualizar Stock</button></td>
                `;
                inventoryList.appendChild(row);
            }
        } catch (err) {
            console.error('Error al cargar inventario:', err.message, 'Detalles:', err);
            loadingMessage.style.display = 'none';
            errorMessage.style.display = 'block';
            errorMessage.textContent = `Error al cargar inventario: ${err.message}`;
            if (err.message.includes('403')) {
                localStorage.removeItem('token');
                localStorage.removeItem('userName');
                localStorage.removeItem('userRole');
                window.location.href = '/';
            }
        } finally {
            isInventoryLoading = false;
        }
    }

    // Cargar historial de stock
    let isStockHistoryLoading = false;
    async function loadStockHistory() {
        if (isStockHistoryLoading) return;
        isStockHistoryLoading = true;

        const loadingMessage = document.getElementById('stockHistoryLoadingMessage');
        const errorMessage = document.getElementById('stockHistoryErrorMessage');
        const emptyMessage = document.getElementById('stockHistoryEmptyMessage');
        const stockHistoryList = document.getElementById('stockHistoryList');

        try {
            loadingMessage.style.display = 'block';
            errorMessage.style.display = 'none';
            emptyMessage.style.display = 'none';
            stockHistoryList.innerHTML = '';

            console.log(`Solicitando historial a ${API_URL}/stock-history con token: ${token.substring(0, 10)}...`);

            const response = await fetch(`${API_URL}/stock-history`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`Error ${response.status}: ${errorData.message || 'No se pudo cargar el historial'}`);
            }

            const history = await response.json();
            console.log('Historial cargado:', history);

            if (!history || history.length === 0) {
                emptyMessage.style.display = 'block';
                isStockHistoryLoading = false;
                return;
            }

            history.forEach(entry => {
                const row = document.createElement('tr');
                const date = new Date(entry.date).toLocaleString('es-ES', {
                    year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit'
                });
                row.innerHTML = `
                    <td>${entry.id}</td>
                    <td>${entry.variant_id}</td>
                    <td>${date}</td>
                    <td>${entry.motivo || 'Sin motivo'}</td>
                    <td>${entry.usuario || 'Desconocido'}</td>
                    <td>${entry.cambio > 0 ? `+${entry.cambio}` : entry.cambio}</td>
                    <td>${entry.stock_anterior || 'N/A'}</td>
                    <td>${entry.stock_nuevo || 'N/A'}</td>
                `;
                stockHistoryList.appendChild(row);
            });
        } catch (err) {
            console.error('Error al cargar historial:', err.message, 'Detalles:', err);
            loadingMessage.style.display = 'none';
            errorMessage.style.display = 'block';
            errorMessage.textContent = `Error al cargar historial: ${err.message}`;
            if (err.message.includes('403')) {
                localStorage.removeItem('token');
                localStorage.removeItem('userName');
                localStorage.removeItem('userRole');
                window.location.href = '/';
            }
        } finally {
            isStockHistoryLoading = false;
        }
    }

    // Manejar búsqueda de inventario
    const searchInput = document.getElementById('inventorySearch');
    if (searchInput) {
        searchInput.addEventListener('input', debounce((e) => {
            loadInventory(e.target.value);
        }, 300));
    }

    // Manejar recarga de inventario
    const refreshButton = document.getElementById('inventoryRefresh');
    if (refreshButton) {
        refreshButton.addEventListener('click', () => {
            loadInventory(searchInput ? searchInput.value : '');
        });
    }

    // Manejar actualización de stock
    const updateForm = document.getElementById('updateInventoryForm');
    if (updateForm) {
        updateForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const variantId = document.getElementById('updateVariantId').value;
            const quantity = parseInt(document.getElementById('updateQuantity').value);
            const motivo = prompt('Motivo del cambio de stock (opcional):') || 'Actualización manual';

            if (!variantId || isNaN(quantity) || quantity < 0) {
                alert('Por favor, ingresa un ID de variante y una cantidad válida.');
                return;
            }

            try {
                const res = await fetch(`${API_URL}/admin/variants/${variantId}/stock`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ stock: quantity, motivo })
                });

                const responseData = await res.json();
                if (!res.ok) {
                    throw new Error(`Error (${res.status}): ${responseData.message || 'No se pudo actualizar el stock'}`);
                }

                console.log('Stock actualizado:', responseData);
                document.getElementById('updateMessage').textContent = 'Stock actualizado con éxito.';
                updateForm.reset();
                await loadInventory();
                await loadProducts();
                await loadStockHistory();
            } catch (err) {
                console.error('Error al actualizar stock:', err.message, 'Detalles:', err);
                alert('Error al actualizar stock: ' + err.message);
            }
        });
    }

    // Función para mostrar formulario de actualización
    window.showUpdateForm = async function(productId) {
        const variantResponse = await fetch(`${API_URL}/api/product/${productId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!variantResponse.ok) throw new Error(`Error al cargar variantes para producto ${productId}`);
        const product = await variantResponse.json();
        const variants = product.variants || [];
        if (variants.length === 0) {
            alert('No hay variantes para este producto.');
            return;
        }

        const variantId = prompt(`Selecciona el ID de la variante a actualizar:\n${variants.map(v => `${v.id} - ${v.color} (${v.size}, Stock: ${v.stock})`).join('\n')}`);
        if (!variantId || isNaN(variantId)) {
            alert('ID de variante inválido.');
            return;
        }

        document.getElementById('updateVariantId').value = variantId;
        updateForm.style.display = 'block';
    };

    // Función debounce para evitar solicitudes excesivas
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Mostrar solo el dashboard por defecto y cargar productos/inventario/historial si es la sección activa
    document.getElementById('dashboard').style.display = 'block';
    if (document.getElementById('products')) loadProducts();
    if (document.getElementById('inventory')) loadInventory();
    if (document.getElementById('stock-history')) loadStockHistory();

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
            } else if (targetSection === 'inventory') {
                loadInventory();
            } else if (targetSection === 'stock-history') {
                loadStockHistory();
            }
        });
    });

    // Añadir botón para recargar productos
    const reloadButton = document.createElement('button');
    reloadButton.textContent = 'Recargar Productos';
    reloadButton.style.margin = '10px';
    reloadButton.style.color = '#fff';
    reloadButton.style.backgroundColor = '#555';
    reloadButton.addEventListener('click', () => {
        console.log('Botón Recargar Productos presionado. Iniciando recarga...');
        loadProducts();
    });
    document.querySelector('.section#products').prepend(reloadButton);
});