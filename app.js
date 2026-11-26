import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB_ob4H4sPagwhRR39WfdrCqWI-iklx4Hu4",
  authDomain: "aquatrack-98c27.firebaseapp.com",
  projectId: "aquatrack-98c27",
  storageBucket: "aquatrack-98c27.firebasestorage.app",
  messagingSenderId: "12171925372",
  appId: "1:12171925372:web:814a9d3786f03f90dbf6f9"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const ADMIN_EMAIL = "abaoriccijane@gmail.com";

const DEFAULT_PRODUCTS = [
  { id: "p1", name: "Purified Water (5 Gallons)", price: 35 },
  { id: "p2", name: "Alkaline Water (5 Gallons)", price: 45 },
  { id: "p3", name: "Mineral Water (5 Gallons)", price: 40 }
];

const $ = selector => document.querySelector(selector);

let currentUser = null;
let products = DEFAULT_PRODUCTS;
let orders = [];
let customers = [];
let listeners = [];

function showView(view) {
  $("#auth-view").classList.add("hidden");
  $("#customer-view").classList.add("hidden");
  $("#admin-view").classList.add("hidden");

  $(view).classList.remove("hidden");
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.remove("hidden");

  setTimeout(() => el.classList.add("hidden"), 3500);
}

function cleanupListeners() {
  listeners.forEach(unsubscribe => unsubscribe());
  listeners = [];
}

function resetTabs() {
  $("#login-form").classList.remove("hidden");
  $("#register-form").classList.add("hidden");

  document.querySelectorAll(".tab").forEach(tab => {
    tab.classList.remove("active");
  });

  document.querySelector('[data-tab="login"]')
    ?.classList.add("active");
}

/* LOGIN AND REGISTER TABS */

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    const selected = tab.dataset.tab;

    $("#login-form").classList.toggle("hidden", selected !== "login");
    $("#register-form").classList.toggle("hidden", selected !== "register");

    document.querySelectorAll(".tab").forEach(t => {
      t.classList.remove("active");
    });

    tab.classList.add("active");
  });
});

/* REGISTER */

$("#register-form").addEventListener("submit", async event => {
  event.preventDefault();

  const form = event.target;
  const name = form.name.value.trim();
  const email = form.email.value.trim();
  const phone = form.phone.value.trim();
  const address = form.address.value.trim();
  const password = form.password.value;

  try {
    const result = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

    await setDoc(doc(db, "users", result.user.uid), {
      name,
      email,
      phone,
      address,
      role: "customer",
      createdAt: serverTimestamp()
    });

    toast("Account created successfully!");
    form.reset();

  } catch (error) {
    toast(error.message);
  }
});

/* LOGIN */

$("#login-form").addEventListener("submit", async event => {
  event.preventDefault();

  const form = event.target;
  const email = form.email.value.trim();
  const password = form.password.value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    toast("Login successful!");

  } catch (error) {
    toast("Login failed: " + error.message);
  }
});

/* LOGOUT */

$("#logout-btn").addEventListener("click", () => signOut(auth));
$("#logout-admin-btn").addEventListener("click", () => signOut(auth));

/* AUTHENTICATION CHECK */

onAuthStateChanged(auth, async user => {
  cleanupListeners();

  currentUser = user;

  if (!user) {
    showView("#auth-view");
    resetTabs();
    return;
  }

  try {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      await signOut(auth);
      toast("Account profile not found.");
      return;
    }

    const profile = userSnap.data();

    if (user.email === ADMIN_EMAIL && profile.role === "admin") {
      showView("#admin-view");
      startAdminDashboard();
    } else if (profile.role === "customer") {
      showView("#customer-view");
      $("#customer-name").textContent = profile.name || "Customer";
      startCustomerDashboard(profile);
    } else {
      await signOut(auth);
      toast("Unauthorized account.");
    }

  } catch (error) {
    showView("#auth-view");
    toast("Unable to load account: " + error.message);
  }
});

/* LOAD PRODUCTS */

async function loadProducts() {
  const ref = doc(db, "settings", "products");
  const snap = await getDoc(ref);

  if (snap.exists()) {
    products = snap.data().items || DEFAULT_PRODUCTS;
  } else {
    products = DEFAULT_PRODUCTS;
  }

  renderProductSelect();
}

function renderProductSelect() {
  const select = $("#product-select");

  select.innerHTML = products.map(product => `
    <option value="${product.id}">
      ${product.name} - ₱${product.price}
    </option>
  `).join("");

  updateTotal();
}

function updateTotal() {
  const form = $("#order-form");
  if (!form) return;

  const productId = form.elements.product.value;
  const quantity = Number(form.elements.quantity.value) || 0;
  const product = products.find(p => p.id === productId);

  $("#order-total").textContent =
    "₱" + (product ? product.price * quantity : 0);
}

$("#order-form").addEventListener("input", updateTotal);
$("#order-form").addEventListener("change", updateTotal);

/* CUSTOMER DASHBOARD */

async function startCustomerDashboard(profile) {
  await loadProducts();

  const q = query(
    collection(db, "orders"),
    where("customerId", "==", currentUser.uid)
  );

  const unsubscribe = onSnapshot(q, snapshot => {
    orders = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));

    renderCustomerOrders();
    renderCustomerStats();
  }, error => {
    toast(error.message);
  });

  listeners.push(unsubscribe);

  $("#order-form").elements.address.value = profile.address || "";

  $("#order-form").addEventListener("submit", placeOrder);
}

async function placeOrder(event) {
  event.preventDefault();

  const form = event.target;
  const product = products.find(p => p.id === form.elements.product.value);
  const quantity = Number(form.elements.quantity.value);

  if (!product || quantity < 1) {
    toast("Please select a valid product and quantity.");
    return;
  }

  const orderType = form.elements.orderType.value;
  const payment = form.elements.payment.value;
  const address = form.elements.address.value.trim();

  if (orderType === "Delivery" && !address) {
    toast("Please enter your delivery address.");
    return;
  }

  try {
    await addDoc(collection(db, "orders"), {
      customerId: currentUser.uid,
      customerName: $("#customer-name").textContent,
      phone: "",
      productId: product.id,
      productName: product.name,
      quantity,
      orderType,
      payment,
      address,
      total: product.price * quantity,
      status: "Pending",
      createdAt: serverTimestamp()
    });

    toast("Order placed successfully!");
    form.elements.quantity.value = 1;
    updateTotal();

  } catch (error) {
    toast("Order failed: " + error.message);
  }
}

function renderCustomerOrders() {
  const container = $("#customer-orders");

  if (!orders.length) {
    container.innerHTML = "<p>No orders yet.</p>";
    return;
  }

  container.innerHTML = [...orders]
    .sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() || 0;
      const tb = b.createdAt?.toMillis?.() || 0;
      return tb - ta;
    })
    .map(order => `
      <div class="order-card panel">
        <h4>${order.productName || "Water"}</h4>
        <p>Quantity: ${order.quantity}</p>
        <p>Total: ₱${order.total}</p>
        <p>Type: ${order.orderType}</p>
        <p>Payment: ${order.payment}</p>
        <p class="status ${order.status?.replace(/\s/g, "")}">
          ${order.status}
        </p>
      </div>
    `).join("");
}

function renderCustomerStats() {
  const completed = orders.filter(o => o.status === "Completed").length;
  const pending = orders.filter(o => o.status === "Pending").length;

  $("#customer-stats").innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <h3>${orders.length}</h3>
        <p>Total Orders</p>
      </div>
      <div class="stat-card">
        <h3>${pending}</h3>
        <p>Pending</p>
      </div>
      <div class="stat-card">
        <h3>${completed}</h3>
        <p>Completed</p>
      </div>
    </div>
  `;
}

/* ADMIN DASHBOARD */

async function startAdminDashboard() {
  await loadProducts();

  const ordersUnsub = onSnapshot(collection(db, "orders"), snapshot => {
    orders = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));

    renderAdminOrders();
    renderAdminStats();
  }, error => toast(error.message));

  const usersUnsub = onSnapshot(collection(db, "users"), snapshot => {
    customers = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    })).filter(u => u.role === "customer");

    renderAdminCustomers();
  }, error => toast(error.message));

  listeners.push(ordersUnsub, usersUnsub);
}

function renderAdminOrders() {
  const container = $("#admin-orders");
  const search = $("#order-search").value.toLowerCase();
  const filter = $("#status-filter").value;

  const filtered = orders.filter(order => {
    const matchesSearch =
      (order.customerName || "").toLowerCase().includes(search) ||
      (order.productName || "").toLowerCase().includes(search);

    const matchesStatus = filter === "all" || order.status === filter;

    return matchesSearch && matchesStatus;
  });

  $("#empty-admin").classList.toggle("hidden", filtered.length > 0);

  container.innerHTML = filtered.map(order => `
    <div class="order-card panel">
      <h4>${order.customerName || "Customer"}</h4>
      <p>${order.productName}</p>
      <p>Quantity: ${order.quantity}</p>
      <p>Total: ₱${order.total}</p>
      <p>Address: ${order.address || "Pick-up"}</p>
      <p>Payment: ${order.payment}</p>
      <p class="status ${order.status?.replace(/\s/g, "")}">
        ${order.status}
      </p>

      <select onchange="window.updateOrderStatus('${order.id}', this.value)">
        ${["Pending", "Processing", "Out for delivery", "Completed", "Cancelled"]
          .map(status => `
            <option value="${status}" ${order.status === status ? "selected" : ""}>
              ${status}
            </option>
          `).join("")}
      </select>
    </div>
  `).join("");
}

window.updateOrderStatus = async (orderId, status) => {
  try {
    await updateDoc(doc(db, "orders", orderId), { status });
    toast("Order status updated.");
  } catch (error) {
    toast(error.message);
  }
};

$("#order-search").addEventListener("input", renderAdminOrders);
$("#status-filter").addEventListener("change", renderAdminOrders);

function renderAdminStats() {
  const pending = orders.filter(o => o.status === "Pending").length;
  const completed = orders.filter(o => o.status === "Completed").length;
  const revenue = orders
    .filter(o => o.status === "Completed")
    .reduce((sum, o) => sum + Number(o.total || 0), 0);

  $("#admin-stats").innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <h3>${orders.length}</h3>
        <p>Total Orders</p>
      </div>
      <div class="stat-card">
        <h3>${pending}</h3>
        <p>Pending Orders</p>
      </div>
      <div class="stat-card">
        <h3>${completed}</h3>
        <p>Completed</p>
      </div>
      <div class="stat-card">
        <h3>₱${revenue}</h3>
        <p>Revenue</p>
      </div>
    </div>
  `;
}

function renderAdminCustomers() {
  $("#customer-admin-list").innerHTML = customers.map(customer => `
    <div class="panel">
      <h4>${customer.name || "Customer"}</h4>
      <p>${customer.email || ""}</p>
      <p>${customer.phone || ""}</p>
      <p>${customer.address || ""}</p>
    </div>
  `).join("");
}
