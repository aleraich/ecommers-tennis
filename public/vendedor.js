const BASE_URL = 'http://localhost:3000'; // Ajusta según tu entorno

// Cargar productos al iniciar
document.addEventListener('DOMContentLoaded', () => {
    loadProducts();
    setupEventListeners();
});

function setupEventListeners() {
    document.getElementById('searchInput').addEventListener('input', (e) => {
        loadProducts(e.target.value);
    });

    document.getElementById('btnLogout').addEventListener('click', () => {
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
            console.error('Error:', err);
            alert('Error de conexión');
        }
    });
}

function loadProducts(query = '') {
    const productList = document.getElementById('productList');
    productList.innerHTML = '<p>Cargando modelos...</p>';

    fetch(`${BASE_URL}/products?search=${query}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
    .then(res => res.json())
    .then(products => {
        productList.innerHTML = '';
        products.forEach(product => {
            const item = document.createElement('div');
            item.className = 'product-item';
            item.dataset.id = product.id;
            const fileId = product.media ? product.media.split('id=')[1] : null;
            const mediaUrl = fileId ? `${BASE_URL}/proxy/image?id=${fileId}` : 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';
            item.innerHTML = `
                <img src="${mediaUrl}" alt="${product.name}">
                <span>${product.name}</span>
            `;
            productList.appendChild(item);
        });
    })
    .catch(err => {
        productList.innerHTML = '<p>Error al cargar modelos.</p>';
        console.error(err);
    });
}

function loadVariants(productId) {
    const variantPanel = document.getElementById('variantPanel');
    const variantList = document.getElementById('variantList');
    const variantModelName = document.getElementById('variantModelName');

    variantList.innerHTML = '<p>Cargando variantes...</p>';
    variantPanel.style.display = 'block';

    fetch(`${BASE_URL}/api/product/${productId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
    .then(res => res.json())
    .then(data => {
        variantModelName.textContent = data.name;
        variantList.innerHTML = '';
        data.variants.forEach(variant => {
            const row = document.createElement('div');
            row.className = 'variant-row';
            const fileId = variant.imagen_color ? variant.imagen_color.split('id=')[1] : data.media.split('id=')[1];
            const mediaUrl = fileId ? `${BASE_URL}/proxy/image?id=${fileId}` : 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';
            row.innerHTML = `
                <img src="${mediaUrl}" alt="${data.name} - ${variant.color}">
                <div class="variant-details">
                    <p><strong>Color:</strong> ${variant.color || 'Sin color'}</p>
                    <p><strong>Talla:</strong> ${variant.size || 'Sin talla'}</p>
                    <p><strong>Stock:</strong> ${variant.stock || 0}</p>
                </div>
                <button class="sellBtn" data-id="${variant.id}" data-product="${data.name}" data-color="${variant.color || ''}" data-size="${variant.size || ''}" data-stock="${variant.stock || 0}">Vender</button>
                <button class="deleteBtn" data-id="${variant.id}">Borrar</button>
            `;
            variantList.appendChild(row);
        });
    })
    .catch(err => {
        variantList.innerHTML = '<p>Error al cargar variantes.</p>';
        console.error(err);
    });
}

function deleteVariant(variantId) {
    const token = localStorage.getItem('token');
    fetch(`${BASE_URL}/admin/variants/${variantId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })
    .then(res => {
        if (res.ok) {
            alert('Variante borrada con éxito');
            const variantPanel = document.getElementById('variantPanel');
            const productId = document.querySelector('.product-item[data-id]:hover')?.dataset.id || document.querySelector('.product-item[data-id]')?.dataset.id;
            if (productId) loadVariants(productId);
            else document.getElementById('variantPanel').style.display = 'none';
        } else {
            alert('Error al borrar la variante');
        }
    })
    .catch(err => {
        console.error('Error:', err);
        alert('Error de conexión');
    });
}

function updateTotal() {
    const quantity = parseInt(document.getElementById('saleQuantity').value) || 0;
    const price = parseFloat(document.getElementById('salePrice').value) || 0;
    const total = quantity * price;
    document.getElementById('saleTotal').textContent = total.toFixed(2);
}

// Verificar autenticación al cargar
function checkAuth() {
    const token = localStorage.getItem('token');
    if (token) {
        fetch(`${BASE_URL}/api/check-auth`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(res => res.json())
        .then(data => {
            if (data.authenticated) {
                document.getElementById('userGreeting').textContent = `Hola, ${data.nombre || 'Usuario'}`;
                if (data.role !== 'vendedor') {
                    alert('Acceso no autorizado para este rol');
                    localStorage.removeItem('token');
                    window.location.href = '/';
                }
            } else {
                localStorage.removeItem('token');
                window.location.href = '/';
            }
        })
        .catch(err => {
            console.error('Error verificando autenticación:', err);
            localStorage.removeItem('token');
            window.location.href = '/';
        });
    } else {
        window.location.href = '/';
    }
}

checkAuth();