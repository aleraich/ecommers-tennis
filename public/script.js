// URL base para las solicitudes al servidor
const BASE_URL = window.location.origin;

// Elementos DOM
const modal = document.getElementById('modal');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const loginError = document.getElementById('loginError');
const registerError = document.getElementById('registerError');
const loginIcon = document.getElementById('loginIcon'); // Reemplaza btnLogin
const btnLogout = document.getElementById('btnLogout');
const userGreeting = document.getElementById('userGreeting');
const adminLink = document.getElementById('adminLink');
const brandLink = document.getElementById('brandLink');
const sectionTitle = document.getElementById('sectionTitle');
const cartIcon = document.getElementById('cartIcon');
const cartPanel = document.getElementById('cartPanel');
const closeCart = document.getElementById('closeCart');
const cartItemsContainer = document.getElementById('cartItems');
const cartTotal = document.getElementById('cartTotal').querySelector('span');
const checkoutButton = document.getElementById('checkoutButton');
const menuToggle = document.getElementById('menuToggle');
const mainNav = document.getElementById('mainNav');
let currentCategory = '';
let currentSort = 'newest';

// Toggle del menú hamburguesa
menuToggle.addEventListener('click', () => {
    mainNav.classList.toggle('open');
});

// Gestión del carrito
function getCart() {
    const cart = localStorage.getItem('cart');
    return cart ? JSON.parse(cart) : [];
}

function saveCart(cart) {
    localStorage.setItem('cart', JSON.stringify(cart));
}

function removeFromCart(productId) {
    const cart = getCart();
    const updatedCart = cart.filter(item => item.id !== productId);
    saveCart(updatedCart);
    renderCart();
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
        const fileId = item.media ? item.media.split('id=')[1] || item.media.match(/\/d\/(.+?)\//)?.[1] : null;
        const mediaUrl = fileId ? `${BASE_URL}/proxy/image?id=${fileId}` : 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';
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

function openCartPanel() {
    cartPanel.classList.add('open');
}

function closeCartPanel() {
    cartPanel.classList.remove('open');
}

cartIcon.addEventListener('click', () => {
    renderCart();
    openCartPanel();
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

function checkAuth() {
    const token = localStorage.getItem('token');
    const userName = localStorage.getItem('userName');

    if (token) {
        // Verificar autenticación con el servidor
        fetch(`${BASE_URL}/api/check-auth`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(res => res.json())
        .then(data => {
            if (data.authenticated) {
                loginIcon.style.display = 'none';
                userGreeting.style.display = 'inline';
                userGreeting.textContent = `Hola, ${data.nombre || 'Usuario'}`;
                btnLogout.style.display = 'inline';
                if (data.role === 'admin') {
                    adminLink.style.display = 'inline';
                } else {
                    adminLink.style.display = 'none';
                }
            } else {
                logout();
            }
        })
        .catch(err => {
            console.error('Error verificando autenticación:', err);
            logout();
        });
    } else {
        logout();
    }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('userName');
    localStorage.removeItem('userRole');
    loginIcon.style.display = 'inline';
    userGreeting.style.display = 'none';
    btnLogout.style.display = 'none';
    adminLink.style.display = 'none';
}

loginIcon.addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
    loginError.style.display = 'none';
    registerError.style.display = 'none';
    modal.style.display = 'block';
});

document.getElementById('registerLink').addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
    loginError.style.display = 'none';
    registerError.style.display = 'none';
});

btnLogout.addEventListener('click', (e) => {
    e.preventDefault();
    logout();
    currentCategory = '';
    currentSort = 'newest';
    sectionTitle.textContent = 'Productos recientes';
    loadProducts();
});

document.getElementById('modalClose').addEventListener('click', () => {
    modal.style.display = 'none';
});

window.addEventListener('click', (event) => {
    if (event.target === modal) {
        modal.style.display = 'none';
    }
});

document.getElementById('loginSubmit').addEventListener('click', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
        loginError.style.display = 'block';
        loginError.textContent = 'Por favor, completa todos los campos';
        return;
    }

    try {
        const response = await fetch(`${BASE_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        if (response.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('userName', data.nombre || 'Cliente');
            localStorage.setItem('userRole', data.role);
            modal.style.display = 'none';
            checkAuth();
            if (data.role === 'admin') {
                window.location.href = '/admin.html';
            } else if (data.role === 'cliente') {
                window.location.href = '/cliente.html';
            } else {
                loginError.style.display = 'block';
                loginError.textContent = 'Rol no reconocido';
            }
        } else {
            loginError.style.display = 'block';
            loginError.textContent = data.message || 'Error al iniciar sesión';
        }
    } catch (error) {
        loginError.style.display = 'block';
        loginError.textContent = 'Error de conexión con el servidor';
        console.error('Error en login:', error);
    }
});

document.getElementById('registerSubmit').addEventListener('click', async (e) => {
    e.preventDefault();
    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;

    if (!name || !email || !password) {
        registerError.style.display = 'block';
        registerError.textContent = 'Por favor, completa todos los campos';
        return;
    }

    try {
        const response = await fetch(`${BASE_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password })
        });
        const data = await response.json();
        if (response.ok) {
            modal.style.display = 'none';
            alert('Registro exitoso. Por favor, inicia sesión.');
            loginForm.style.display = 'block';
            registerForm.style.display = 'none';
            registerError.style.display = 'none';
        } else {
            registerError.style.display = 'block';
            registerError.textContent = data.message || 'Error al registrarse';
        }
    } catch (error) {
        registerError.style.display = 'block';
        registerError.textContent = 'Error de conexión con el servidor';
        console.error('Error en registro:', error);
    }
});

async function loadProducts(query = '', category = currentCategory, sort = currentSort) {
    const loadingMessage = document.getElementById('loadingMessage');
    const errorMessage = document.getElementById('errorMessage');
    const emptyMessage = document.getElementById('emptyMessage');
    const productGrid = document.getElementById('productGrid');
    const token = localStorage.getItem('token');

    try {
        loadingMessage.style.display = 'block';
        errorMessage.style.display = 'none';
        emptyMessage.style.display = 'none';
        productGrid.innerHTML = '';

        let url = new URL(`${BASE_URL}/products`);
        const params = new URLSearchParams();
        if (query) params.append('search', query);
        if (category) params.append('category', category);
        if (sort) params.append('sort', sort);
        url.search = params.toString();

        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const response = await fetch(url, { method: 'GET', headers });
        if (!response.ok) throw new Error(`Error ${response.status}: ${response.statusText}`);

        const products = await response.json();
        loadingMessage.style.display = 'none';

        if (!products || products.length === 0) {
            emptyMessage.style.display = 'block';
            return;
        }
        renderProducts(products);
    } catch (err) {
        console.error('Error al cargar productos:', err);
        loadingMessage.style.display = 'none';
        errorMessage.style.display = 'block';
        errorMessage.textContent = `Error al cargar productos: ${err.message}`;
    }
}

function renderProducts(products) {
    const productGrid = document.getElementById('productGrid');
    productGrid.innerHTML = '';
    products.forEach(({ id, name, price, media }) => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.style.cursor = 'pointer';
        const fileId = media ? media.split('id=')[1] || media.match(/\/d\/(.+?)\//)?.[1] : null;
        const mediaUrl = fileId ? `${BASE_URL}/proxy/image?id=${fileId}` : 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';
        const mediaElement = media && (media.endsWith('.mp4') || media.endsWith('.webm')) ?
            `<video src="${mediaUrl}" alt="${name}" width="250" controls></video>` :
            `<img src="${mediaUrl}" alt="${name}" onerror="this.onerror=null; this.src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg=='; this.alt='Imagen no disponible';">`;
        card.innerHTML = `
            ${mediaElement}
            <h3>${name}</h3>
            <p class="price">$${price}</p>
        `;
        card.addEventListener('click', () => {
            window.location.href = `/product-detail.html?id=${id}`;
        });
        productGrid.appendChild(card);
    });
}

brandLink.addEventListener('click', (e) => {
    e.preventDefault();
    currentCategory = '';
    currentSort = 'newest';
    sectionTitle.textContent = 'Productos recientes';
    const navLinks = document.querySelectorAll('.main-nav a:not(#adminLink)');
    navLinks.forEach(l => l.classList.remove('active'));
    loadProducts();
});

const navLinks = document.querySelectorAll('.main-nav a:not(#adminLink)');
navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        currentCategory = link.dataset.category || '';
        currentSort = '';
        sectionTitle.textContent = currentCategory || 'Productos';
        loadProducts(document.getElementById('searchInput').value, currentCategory);
    });
});

document.getElementById('searchInput').addEventListener('input', (e) => {
    const query = e.target.value.trim();
    loadProducts(query, currentCategory, currentSort);
});

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    loadProducts();
});