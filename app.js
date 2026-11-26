
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
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

// AQUATRACK FIREBASE CONFIGURATION
const firebaseConfig = {
  apiKey: "AIzaSyB_obH4sPagwhRR39WfdrCqWI-iklx4Hu4",
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

let currentUser = null;
let currentProfile = null;
let products = [];
let orders = [];
let customers = [];
let unsubscribers = [];

const $ = selector => document.querySelector(selector);

const peso = amount =>
  "₱" + Number(amount || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  setTimeout(() => element.classList.remove("show"), 2600);
}

function showView(view) {
  ["auth-view", "customer-view", "admin-view"].forEach(id => {
    $("#" + id).classList.add("hidden");
  });

  $("#" + view).classList.remove("hidden");

  $("#header-user").innerHTML = currentUser
    ? `Signed in as <b>${escapeHTML(currentProfile?.name || currentUser.email)}</b> · <button id="logout" class="link-btn">Log out</button>`
    : "";

  if ($("#logout")) {
    $("#logout").onclick = logout;
  }
}

function switchTab(tab) {
  document.querySelectorAll(".tab").forEach(button => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });

  $("#login-form").classList.toggle("hidden", tab !== "login");
  $("#register-form").classList.toggle("hidden", tab !== "register");
}

document.querySelectorAll(".tab").forEach(button => {
  button.addEventListener("click", () => switchTab(button.dataset.tab));
});

function stopListeners() {
  unsubscribers.forEach(unsubscribe => unsubscribe());
  unsubscribers = [];
}

async function logout() {
  stopListeners();
  await signOut(auth);
  toast("Logged out successfully.");
}

function stat(icon, label, value) {
  return `<div class="stat-card">
    <span class="stat-icon">${icon}</span>
    <span class="stat-label">${label}</span>
    <strong>${value}</strong>
  </div>`;
}

function statusBadge(status) {
  return `<span class="status ${String(status).replaceAll(" ", "")}">${escapeHTML(status)}</span>`;
}

// LOAD PRODUCTS
async function loadProducts() {
  const snapshot = await getDoc(doc(db, "settings", "products"));

  if (!snapshot.exists()) {
    products = DEFAULT_PRODUCTS;
    return;
  }

  products = snapshot.data().items || DEFAULT_PRODUCTS;
}

async function initializeProducts() {
  const productRef = doc(db, "settings", "products");
  const snapshot = await getDoc(productRef);

  if (!snapshot.exists()) {
    await setDoc(productRef, {
      items: DEFAULT_PRODUCTS
    });
  }
}

// LOGIN
$("#login-form").addEventListener("submit", async event => {
  event.preventDefault();

  const form = new FormData(event.currentTarget);
  const email = form.get("email").trim().toLowerCase();
  const password = form.get("password");

  try {
    await signInWithEmailAndPassword(auth, email, password);
    event.currentTarget.reset();
  } catch (error) {
    toast(error.message);
  }
});

// REGISTER CUSTOMER
$("#register-form").addEventListener("submit", async event => {
  event.preventDefault();

  const form = new FormData(event.currentTarget);
  const name = form.get("name").trim();
  const email = form.get("email").trim().toLowerCase();
  const phone = form.get("phone").trim();
  const address = form.get("address").trim();
  const password = form.get("password");

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

    event.currentTarget.reset();
    toast("Account created successfully!");
  } catch (error) {
    toast(error.message);
  }
});

// CUSTOMER ORDER TOTAL
function updateTotal() {
  const product = products.find(item => item.id === $("#product-select").value);
  const quantity = Math.max(1, Number($("#order-form").quantity.value || 1));

  $("#order-total").textContent = product
    ? peso(product.price * quantity)
    : peso(0);
}

$("#product-select").addEventListener("change", updateTotal);
$("#order-form").quantity.addEventListener("input", updateTotal);

// SUBMIT ORDER
$("#order-form").addEventListener("submit", async event => {
  event.preventDefault();

  const form = new FormData(event.currentTarget);
  const product = products.find(item => item.id === form.get("product"));
  const quantity = Number(form.get("quantity"));
  const address = form.get("address").trim();

  if (!product || quantity < 1 || quantity > 100 || !address) {
    toast("Please check your order details.");
    return;
  }

  try {
    await addDoc(collection(db, "orders"), {
      customerId: currentUser.uid,
      customerName: currentProfile.name,
      phone: currentProfile.phone || "",
      productId: product.id,
      productName: product.name,
      quantity,
      orderType: form.get("orderType"),
      payment: form.get("payment"),
      address,
      total: product.price * quantity,
      status: "Pending",
      createdAt: serverTimestamp()
    });

    event.currentTarget.reset();
    $("#order-address").value = currentProfile.address || "";
    updateTotal();
    toast("Your order has been submitted!");
  } catch (error) {
    toast(error.message);
  }
});

// CUSTOMER DASHBOARD
function renderCustomer() {
  $("#customer-name").textContent =
    currentProfile.name.split(" ")[0];

  $("#order-address").value = currentProfile.address || "";

  $("#product-select").innerHTML = products.map(product =>
    `<option value="${escapeHTML(product.id)}">
      ${escapeHTML(product.name)} — ${peso(product.price)}
    </option>`
  ).join("");

  updateTotal();

  const myOrders = orders.filter(order =>
    order.customerId === currentUser.uid
  );

  $("#customer-stats").innerHTML =
    stat("📦", "Total orders", myOrders.length) +
    stat("⏳", "Pending", myOrders.filter(o => o.status === "Pending").length) +
    stat(
      "💰",
      "Completed value",
      peso(myOrders
        .filter(o => ["Delivered", "Completed"].includes(o.status))
        .reduce((sum, o) => sum + Number(o.total), 0))
    );

  $("#customer-orders").innerHTML = myOrders.length
    ? myOrders.map(order => `
      <div class="order-card">
        <div class="order-top">
          <div>
            <strong>${escapeHTML(order.productName)}</strong>
            <div class="order-id">${escapeHTML(order.id)}</div>
          </div>
          ${statusBadge(order.status)}
        </div>
        <div class="order-meta">
          ${order.quantity} gallon(s) · ${escapeHTML(order.orderType)} · ${escapeHTML(order.payment)}
          <br>Total: <b>${peso(order.total)}</b>
          <br>${escapeHTML(order.address)}
        </div>
      </div>
    `).join("")
    : `<div class="empty-state">You haven't placed an order yet.</div>`;
}

// ADMIN DASHBOARD
function renderAdmin() {
  const sortedOrders = [...orders].sort((a, b) =>
    (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
  );

  $("#admin-stats").innerHTML =
    stat("🧾", "Total orders", sortedOrders.length) +
    stat("⏳", "Pending orders",
      sortedOrders.filter(o => o.status === "Pending").length) +
    stat(
      "💵",
      "Recorded completed sales",
      peso(sortedOrders
        .filter(o => ["Delivered", "Completed"].includes(o.status))
        .reduce((sum, o) => sum + Number(o.total), 0))
    );

  renderAdminOrders();

  $("#product-admin-list").innerHTML = products.map(product => `
    <div class="product-row">
      <span><b>${escapeHTML(product.name)}</b></span>
      <span>
        <input class="price-edit" type="number" min="1" step=".01"
          value="${product.price}" data-price="${escapeHTML(product.id)}">
        <button class="btn primary save-price"
          data-id="${escapeHTML(product.id)}"
          style="padding:8px 10px">Save</button>
      </span>
    </div>
  `).join("");

  $("#customer-admin-list").innerHTML = customers.length
    ? customers.map(customer => `
      <div class="customer-row">
        <span>
          <b>${escapeHTML(customer.name)}</b><br>
          <span class="muted">${escapeHTML(customer.email)}</span>
        </span>
        <span class="muted">${escapeHTML(customer.phone || "")}</span>
      </div>
    `).join("")
    : `<p class="muted">No registered customers yet.</p>`;

  document.querySelectorAll(".save-price").forEach(button => {
    button.onclick = async () => {
      const id = button.dataset.id;
      const value = Number(document.querySelector(
        `[data-price="${id}"]`
      ).value);

      if (value <= 0) {
        toast("Enter a valid price.");
        return;
      }

      try {
        const updated = products.map(product =>
          product.id === id
            ? { ...product, price: value }
            : product
        );

        await updateDoc(doc(db, "settings", "products"), {
          items: updated
        });

        toast("Product price updated.");
      } catch (error) {
        toast(error.message);
      }
    };
  });
}

function renderAdminOrders() {
  const search = $("#order-search").value.toLowerCase();
  const filter = $("#status-filter").value;

  const filteredOrders = [...orders]
    .sort((a, b) =>
      (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
    )
    .filter(order =>
      (filter === "All" || order.status === filter) &&
      [order.id, order.customerName, order.productName]
        .join(" ")
        .toLowerCase()
        .includes(search)
    );

  $("#admin-orders").innerHTML = filteredOrders.map(order => `
    <tr>
      <td><b>${escapeHTML(order.id)}</b></td>
      <td>
        <b>${escapeHTML(order.customerName)}</b><br>
        <span class="muted">${escapeHTML(order.phone || "")}</span>
      </td>
      <td>
        ${escapeHTML(order.productName)}<br>
        <span class="muted">${order.quantity} · ${escapeHTML(order.orderType)}</span>
      </td>
      <td>${escapeHTML(order.payment)}</td>
      <td><b>${peso(order.total)}</b></td>
      <td>${statusBadge(order.status)}</td>
      <td>
        <select class="small-select status-change" data-id="${escapeHTML(order.id)}">
          ${[
            "Pending", "Accepted", "Preparing",
            "Out for delivery", "Ready for pickup",
            "Delivered", "Completed", "Rejected"
          ].map(status => `
            <option ${order.status === status ? "selected" : ""}>${status}</option>
          `).join("")}
        </select>
      </td>
    </tr>
  `).join("");

  $("#empty-admin").classList.toggle("hidden", filteredOrders.length > 0);

  document.querySelectorAll(".status-change").forEach(select => {
    select.onchange = async () => {
      try {
        await updateDoc(doc(db, "orders", select.dataset.id), {
          status: select.value
        });

        toast("Order status updated.");
      } catch (error) {
        toast(error.message);
      }
    };
  });
}

$("#order-search").addEventListener("input", renderAdminOrders);
$("#status-filter").addEventListener("change", renderAdminOrders);

// REAL-TIME FIRESTORE LISTENERS
function startCustomerListeners() {
  const ordersQuery = query(
    collection(db, "orders"),
    where("customerId", "==", currentUser.uid)
  );

  unsubscribers.push(onSnapshot(ordersQuery, snapshot => {
    orders = snapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    }));

    renderCustomer();
  }, error => toast(error.message)));
}

function startAdminListeners() {
  unsubscribers.push(onSnapshot(collection(db, "orders"), snapshot => {
    orders = snapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    }));

    renderAdmin();
  }, error => toast(error.message)));

  unsubscribers.push(onSnapshot(collection(db, "users"), snapshot => {
    customers = snapshot.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .filter(user => user.role === "customer");

    renderAdmin();
  }, error => toast(error.message)));

  unsubscribers.push(onSnapshot(doc(db, "settings", "products"), snapshot => {
    products = snapshot.exists()
      ? snapshot.data().items || DEFAULT_PRODUCTS
      : DEFAULT_PRODUCTS;

    renderAdmin();
  }, error => toast(error.message)));
}

// AUTHENTICATION STATE
onAuthStateChanged(auth, async user => {
  stopListeners();
  currentUser = user;
  currentProfile = null;
  orders = [];
  customers = [];

  if (!user) {
    showView("auth-view");
    switchTab("login");
    return;
  }

  try {
    const profileSnapshot = await getDoc(doc(db, "users", user.uid));

    if (!profileSnapshot.exists()) {
      await signOut(auth);
      toast("User profile not found.");
      return;
    }

    currentProfile = profileSnapshot.data();

    // ADMIN ACCESS IS ALSO PROTECTED BY FIRESTORE SECURITY RULES
    const isAdmin = user.email?.toLowerCase() === ADMIN_EMAIL;

    if (isAdmin) {
      await initializeProducts();
      await loadProducts();
      showView("admin-view");
      startAdminListeners();
    } else {
      if (currentProfile.role !== "customer") {
        await signOut(auth);
        toast("Account access is not authorized.");
        return;
      }

      await loadProducts();
      showView("customer-view");
      renderCustomer();
      startCustomerListeners();
    }
  } catch (error) {
    console.error(error);
    toast(error.message);
  }
});
