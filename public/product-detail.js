(function () {
    const BASE_URL = window.location.origin; // Cambiado de 'http://localhost:3000' a dinámico

    // Obtener el ID del producto de la URL
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');
    const errorMessage = document.getElementById('errorMessage');
    const loadingMessage = document.getElementById('loadingMessage');
    const addToCartButton = document.getElementById('addToCartButton');
    const cartPanel = document.getElementById('cartPanel');
    const closeCart = document.getElementById('closeCart');
    const cartItemsContainer = document.getElementById('cartItems');
    const cartTotal = document.getElementById('cartTotal').querySelector('span');
    const checkoutButton = document.getElementById('checkoutButton');

    // Función para mostrar errores
    function showError(message) {
        console.error('[Client] Error:', message);
        loadingMessage.style.display = 'none';
        errorMessage.style.display = 'block';
        errorMessage.textContent = message;
        setTimeout(() => window.location.href = '/index.html', 5000);
    }

    // Verificar productId
    if (!productId || isNaN(productId)) {
        showError('Error: No se especificó un ID de producto válido');
        return;
    }

    let currentProduct = null;

    // Cargar los detalles del producto
    async function loadProductDetails() {
        try {
            console.log(`[Client] Intentando cargar producto con ID: ${productId}`);
            console.log(`[Client] URL de la solicitud: ${BASE_URL}/api/product/${productId}`);
            loadingMessage.style.display = 'block';
            errorMessage.style.display = 'none';

            const response = await fetch(`${BASE_URL}/api/product/${productId}`);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `Error HTTP: ${response.status}`);
            }
            const product = await response.json();
            console.log('[Client] Producto recibido:', product);
            currentProduct = product;

            // Ocultar mensaje de carga
            loadingMessage.style.display = 'none';

            // Rellenar los campos
            document.getElementById('product-title').textContent = product.name || 'Sin nombre';
            document.getElementById('product-price').textContent = product.price ? `$${product.price}` : 'Sin precio';
            document.getElementById('product-description').textContent = product.description || 'Sin descripción disponible';
            document.getElementById('product-category').textContent = `Categoría: ${product.category || 'Sin categoría'}`;
            document.getElementById('product-date').textContent = `Creado: ${product.created_at ? new Date(product.created_at).toLocaleDateString() : 'Sin fecha'}`;

            // Mostrar imagen o video usando el proxy
            const mediaContainer = document.getElementById('product-media');
            const fileId = product.media ? product.media.split('id=')[1] || product.media.match(/\/d\/(.+?)\//)?.[1] : null;
            const mediaUrl = fileId ? `${BASE_URL}/proxy/image?id=${fileId}` : 'https://via.placeholder.com/400';
            if (product.media && (product.media.endsWith('.mp4') || product.media.endsWith('.webm'))) {
                mediaContainer.innerHTML = `<video src="${mediaUrl}" class="product-media" controls onerror="console.error('Error al cargar video:', '${mediaUrl}'); this.src='https://via.placeholder.com/400';"></video>`;
            } else {
                mediaContainer.innerHTML = `<img src="${mediaUrl}" class="product-media" alt="${product.name || 'Producto'}" onerror="console.error('Error al cargar imagen:', '${mediaUrl}'); this.src='https://via.placeholder.com/400';">`;
            }
        } catch (error) {
            showError(`Error al cargar el producto: ${error.message}`);
        }
    }

    // Gestión del carrito
    function getCart() {
        const cart = localStorage.getItem('cart');
        return cart ? JSON.parse(cart) : [];
    }

    function saveCart(cart) {
        localStorage.setItem('cart', JSON.stringify(cart));
    }

    function addToCart(product) {
        const cart = getCart();
        const existingItem = cart.find(item => item.id === product.id);
        if (existingItem) {
            existingItem.quantity += 1;
        } else {
            cart.push({ ...product, quantity: 1 });
        }
        saveCart(cart);
        renderCart();
        openCartPanel();
    }

    function updateCartItemQuantity(productId, quantity) {
        const cart = getCart();
        const item = cart.find(item => item.id === productId);
        if (item) {
            item.quantity = Math.max(1, parseInt(quantity));
            saveCart(cart);
            renderCart();
        }
    }

    function renderCart() {
        const cart = getCart();
        cartItemsContainer.innerHTML = '';
        let total = 0;

        cart.forEach(item => {
            const itemElement = document.createElement('div');
            itemElement.className = 'cart-item';
            // Usar el proxy para las imágenes en el carrito
            const fileId = item.media ? item.media.split('id=')[1] || item.media.match(/\/d\/(.+?)\//)?.[1] : null;
            const mediaUrl = fileId ? `${BASE_URL}/proxy/image?id=${fileId}` : 'https://via.placeholder.com/80';
            itemElement.innerHTML = `
                <img src="${mediaUrl}" alt="${item.name}">
                <div class="cart-item-details">
                    <h3>${item.name}</h3>
                    <p class="price">$${item.price}</p>
                    <input type="number" value="${item.quantity}" min="1" data-id="${item.id}">
                    <button class="remove-item" data-id="${item.id}">Eliminar</button>
                </div>
            `;
            cartItemsContainer.appendChild(itemElement);
            total += item.price * item.quantity;
        });

        cartTotal.textContent = `$${total.toFixed(2)}`;

        // Añadir eventos a los inputs de cantidad y botones de eliminar
        cartItemsContainer.querySelectorAll('input[type="number"]').forEach(input => {
            input.addEventListener('change', (e) => {
                updateCartItemQuantity(parseInt(e.target.dataset.id), e.target.value);
            });
        });

        cartItemsContainer.querySelectorAll('.remove-item').forEach(button => {
            button.addEventListener('click', (e) => {
                removeFromCart(parseInt(e.target.dataset.id));
            });
        });
    }

    function removeFromCart(productId) {
        const cart = getCart();
        const updatedCart = cart.filter(item => item.id !== productId);
        saveCart(updatedCart);
        renderCart();
    }

    function openCartPanel() {
        cartPanel.classList.add('open');
    }

    function closeCartPanel() {
        cartPanel.classList.remove('open');
    }

    // Eventos
    addToCartButton.addEventListener('click', () => {
        if (currentProduct) {
            console.log('[Client] Añadiendo al carrito:', currentProduct);
            addToCart(currentProduct);
        } else {
            showError('No se puede añadir al carrito: producto no cargado');
        }
    });

    closeCart.addEventListener('click', closeCartPanel);

    checkoutButton.addEventListener('click', (e) => {
        e.preventDefault();
        const cart = getCart();
        if (cart.length === 0) {
            alert('El carrito está vacío');
        } else {
            alert('Compra finalizada. Total: ' + cartTotal.textContent);
            localStorage.removeItem('cart');
            renderCart();
            closeCartPanel();
        }
    });

    // Cargar los detalles al iniciar
    loadProductDetails();
})();