const BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://rahel-app.onrender.com';

// Cargar productos y verificar autenticación al iniciar
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    loadProducts();
    setupEventListeners();
});

function setupEventListeners() {
    document.getElementById('searchInput').addEventListener('input', (e) => {
        loadProducts(e.target.value);
    });

    document.getElementById('btnLogout').addEventListener('click', () => {
        console.log('Cerrando sesión a las', new Date().toLocaleString());
        localStorage.removeItem('token');
        window.location.href = '/';
    });

    document.getElementById('closePanel').addEventListener('click', () => {
        document.getElementById('variantPanel').style.display = 'none';
    });

    document.getElementById('closeModal').addEventListener('click', () => {
        document.getElementById('saleModal').style.display = 'none';
    });

    document.getElementById('saleQuantity').addEventListener('input', updateTotal);
    document.getElementById('salePrice').addEventListener('input', updateTotal);

    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('product-item')) {
            const productId = e.target.dataset.id;
            console.log('Cargando variantes para producto ID:', productId, 'a las', new Date().toLocaleString());
            loadVariants(productId);
        }
        if (e.target.classList.contains('sellBtn')) {
            const modal = document.getElementById('saleModal');
            document.getElementById('modalProductName').textContent = e.target.dataset.product;
            document.getElementById('modalColor').textContent = e.target.dataset.color;
            document.getElementById('modalSize').textContent = e.target.dataset.size;
            document.getElementById('modalStock').textContent = e.target.dataset.stock;
            document.getElementById('saleQuantity').max = e.target.dataset.stock;
            document.getElementById('saleQuantity').value = 1;
            document.getElementById('salePrice').value = 0;
            document.getElementById('confirmSaleBtn').dataset.id = e.target.dataset.id;
            modal.style.display = 'block';
            updateTotal();
        }
        if (e.target.classList.contains('deleteBtn')) {
            if (confirm('¿Estás seguro de borrar esta variante?')) {
                deleteVariant(e.target.dataset.id);
            }
        }
    });

    document.getElementById('confirmSaleBtn').addEventListener('click', async () => {
        const variantId = document.getElementById('confirmSaleBtn').dataset.id;
        const quantity = parseInt(document.getElementById('saleQuantity').value);
        const price = parseFloat(document.getElementById('salePrice').value);
        const paymentMethod = document.getElementById('paymentMethod').value;
        const stock = parseInt(document.getElementById('modalStock').textContent);
        const total = quantity * price;

        if (quantity <= 0 || quantity > stock) {
            alert('Cantidad inválida');
            return;
        }
        if (price <= 0) {
            alert('Ingresa un precio unitario válido');
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const authResponse = await fetch(`${BASE_URL}/api/check-auth`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const authData = await authResponse.json();
            const vendedorId = authData.id;

            const saleResponse = await fetch(`${BASE_URL}/api/register-sale`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    variantId,
                    quantity,
                    price,
                    total,
                    paymentMethod,
                    vendedorId
                })
            });

            if (saleResponse.ok) {
                alert('Venta registrada con éxito');
                document.getElementById('saleModal').style.display = 'none';
                document.getElementById('variantPanel').style.display = 'none';
                loadProducts(document.getElementById('searchInput').value);
            } else {
                const data = await saleResponse.json();
                alert(data.message || 'Error al registrar venta');
            }
        } catch (err) {
            console.error('Error al registrar venta:', err.message, 'a las', new Date().toLocaleString());
            alert('Error de conexión');
        }
    });
}

function loadProducts(query = '') {
    const productList = document.getElementById('productList');
    productList.innerHTML = '<p>Cargando modelos...</p>';

    fetch(`${BASE_URL}/products?search=${encodeURIComponent(query)}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
    .then(res => {
        if (!res.ok) throw new Error(`Error ${res.status}: ${res.statusText}`);
        return res.json();
    })
    .then(products => {
        productList.innerHTML = '';
        if (!products || products.length === 0) {
            productList.innerHTML = '<p>No se encontraron productos.</p>';
            return;
        }
        products.forEach(product => {
            if (product.variants && product.variants.length > 0) {
                product.variants.forEach(variant => {
                    const item = document.createElement('div');
                    item.className = 'product-item';
                    item.dataset.id = product.id;
                    const fileId = variant.imagen_color ? variant.imagen_color.split('id=')[1] : product.media ? product.media.split('id=')[1] : null;
                    const mediaUrl = fileId ? `${BASE_URL}/proxy/image?id=${fileId}` : 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';
                    item.innerHTML = `
                        <img src="${mediaUrl}" alt="${product.name || 'Producto'} - ${variant.color || 'Sin color'}">
                        <span>${product.name || 'Sin nombre'}</span>
                    `;
                    productList.appendChild(item);
                });
            } else {
                const item = document.createElement('div');
                item.className = 'product-item';
                item.dataset.id = product.id;
                const fileId = product.media ? product.media.split('id=')[1] : null;
                const mediaUrl = fileId ? `${BASE_URL}/proxy/image?id=${fileId}` : 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';
                item.innerHTML = `
                    <img src="${mediaUrl}" alt="${product.name || 'Producto'}">
                    <span>${product.name || 'Sin nombre'}</span>
                `;
                productList.appendChild(item);
            }
        });
    })
    .catch(err => {
        console.error('Error al cargar productos:', err.message, 'a las', new Date().toLocaleString());
        productList.innerHTML = '<p>Error al cargar modelos.</p>';
    });
}

function loadVariants(productId) {
    const variantPanel = document.getElementById('variantPanel');
    const variantList = document.getElementById('variantList');
    const variantModelName = document.getElementById('variantModelName');

    // Mostrar spinner de carga
    variantList.innerHTML = '<div class="spinner">Cargando variantes...</div>';
    variantPanel.style.display = 'block';

    // Timeout para evitar bloqueos largos
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 segundos de timeout

    fetch(`${BASE_URL}/api/product/${productId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        signal: controller.signal
    })
    .then(res => {
        clearTimeout(timeoutId); // Cancelar timeout si la respuesta llega
        if (!res.ok) throw new Error(`Error ${res.status}: ${res.statusText}`);
        return res.json();
    })
    .then(data => {
        variantModelName.textContent = data.name || 'Producto sin nombre';
        variantList.innerHTML = '';
        if (!data.variants || data.variants.length === 0) {
            variantList.innerHTML = '<p>No hay variantes disponibles.</p>';
            return;
        }
        data.variants.forEach(variant => {
            const fileId = variant.imagen_color ? variant.imagen_color.split('id=')[1] : data.media ? data.media.split('id=')[1] : null;
            const mediaUrl = fileId ? `${BASE_URL}/proxy/image?id=${fileId}` : 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';
            const row = document.createElement('div');
            row.className = 'variant-row';
            row.innerHTML = `
                <img src="${mediaUrl}" alt="${data.name} - ${variant.color || 'Sin color'}">
                <div class="variant-details">
                    <p><strong>Color:</strong> ${variant.color || 'Sin color'}</p>
                    <p><strong>Talla:</strong> ${variant.size || 'Sin talla'}</p>
                    <p><strong>Stock:</strong> ${variant.stock !== null ? variant.stock : 0}</p>
                </div>
                <button class="sellBtn" data-id="${variant.id}" data-product="${data.name}" data-color="${variant.color || ''}" data-size="${variant.size || ''}" data-stock="${variant.stock !== null ? variant.stock : 0}">Vender</button>
                <button class="deleteBtn" data-id="${variant.id}">Borrar</button>
            `;
            variantList.appendChild(row);
        });
    })
    .catch(err => {
        console.error('Error al cargar variantes para producto ID', productId, ':', err.message, 'a las', new Date().toLocaleString());
        if (err.name === 'AbortError') {
            variantList.innerHTML = '<p>La carga tardó demasiado. Intenta de nuevo.</p>';
        } else {
            variantList.innerHTML = '<p>Error al cargar variantes. Verifica tu conexión.</p>';
        }
    });
}

function deleteVariant(variantId) {
    const token = localStorage.getItem('token');
    fetch(`${BASE_URL}/admin/variants/${variantId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => {
        if (res.ok) {
            alert('Variante borrada con éxito');
            const productId = document.querySelector('.product-item[data-id]:hover')?.dataset.id || document.querySelector('.product-item[data-id]')?.dataset.id;
            if (productId) loadVariants(productId);
            else document.getElementById('variantPanel').style.display = 'none';
        } else {
            alert('Error al borrar la variante');
        }
    })
    .catch(err => {
        console.error('Error al borrar variante:', err.message, 'a las', new Date().toLocaleString());
        alert('Error de conexión');
    });
}

function updateTotal() {
    const quantity = parseInt(document.getElementById('saleQuantity').value) || 0;
    const price = parseFloat(document.getElementById('salePrice').value) || 0;
    const total = quantity * price;
    document.getElementById('saleTotal').textContent = total.toFixed(2);
}

function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        console.log('No token encontrado, redirigiendo a login a las', new Date().toLocaleString());
        window.location.href = '/';
        return;
    }
    fetch(`${BASE_URL}/api/check-auth`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => {
        if (!res.ok) throw new Error(`Error ${res.status}: ${res.statusText}`);
        return res.json();
    })
    .then(data => {
        if (data.authenticated) {
            if (data.role !== 'vendedor') {
                console.log('Rol no autorizado:', data.role, 'redirigiendo a login a las', new Date().toLocaleString());
                alert('Acceso no autorizado para este rol');
                localStorage.removeItem('token');
                window.location.href = '/';
            } else {
                document.getElementById('userGreeting').textContent = `Hola, ${data.nombre || 'Vendedor'}`;
            }
        } else {
            console.log('Autenticación fallida, redirigiendo a login a las', new Date().toLocaleString());
            localStorage.removeItem('token');
            window.location.href = '/';
        }
    })
    .catch(err => {
        console.error('Error verificando autenticación:', err.message, 'a las', new Date().toLocaleString());
        localStorage.removeItem('token');
        window.location.href = '/';
    });
}