// AQUATRACK - COMPLETE APP.JS
// Firebase Authentication + Firestore

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
  addDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

// FIREBASE CONFIG
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

// SETTINGS
const ADMIN_EMAIL = "abaoriccijane@gmail.com";

const REFILL_PRICE = 35;
const NEW_GALLON_PRICE = 200;

const DELIVERY_FEES = {
  Lagonglong: 35,
  Salay: 40,
  Balingasag: 40,
  Custom: null
};

// GLOBAL VARIABLES
let currentUser = null;
let currentProfile = null;
let customerOrderListener = null;
let adminOrderListener = null;
let customerListener = null;
let settingsListener = null;
let customDeliveryFee = 0;

// HELPER
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

function showToast(message) {
  const toast = $("#toast");

  if (!toast) {
    alert(message);
    return;
  }

  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
}

function peso(amount) {
  return "₱" + Number(amount || 0).toLocaleString("en-PH");
}

function showView(viewId) {
  ["auth-view", "customer-view", "admin-view"].forEach(id => {
    const element = document.getElementById(id);
    if (element) element.style.display = id === viewId ? "" : "none";
  });
}

function getInputValue(form, name) {
  return form.querySelector(`[name="${name}"]`)?.value?.trim() || "";
}

function safeText(value) {
  return String(value ?? "");
}

function dateText(timestamp) {
  if (!timestamp) return "Recently placed";

  try {
    const date = timestamp.toDate
      ? timestamp.toDate()
      : new Date(timestamp);

    return date.toLocaleString("en-PH");
  } catch {
    return "Recently placed";
  }
}

// ------------------------------------
// AUTHENTICATION
// ------------------------------------

async function registerUser(email, password, fullName, phone) {
  try {
    const credential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

    const role = email.toLowerCase() === ADMIN_EMAIL.toLowerCase()
      ? "admin"
      : "customer";

    await setDoc(doc(db, "users", credential.user.uid), {
      fullName,
      email,
      phone,
      role,
      createdAt: serverTimestamp()
    });

    showToast("Account successfully created!");
  } catch (error) {
    console.error(error);
    showToast(error.message);
  }
}

async function loginUser(email, password) {
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    console.error(error);
    showToast("Login failed. Please check your email and password.");
  }
}

// LOGOUT BUTTONS
$$("[id*='logout']").forEach(button => {
  button.addEventListener("click", async () => {
    await signOut(auth);
  });
});

// ------------------------------------
// CUSTOMER ORDER CALCULATOR
// ------------------------------------

function getOrderForm() {
  return $("#order-form");
}

function getOrderValues() {
  const form = getOrderForm();

  if (!form) {
    return {
      refillQty: 0,
      gallonQty: 0,
      orderType: "Delivery",
      area: "Lagonglong",
      address: "",
      payment: "Cash"
    };
  }

  return {
    refillQty: Math.max(0, Number(form.querySelector('[name="quantity"]')?.value || 0)),
    gallonQty: Math.max(0, Number(form.querySelector('[name="gallonQuantity"]')?.value || 0)),
    orderType: form.querySelector('[name="orderType"]')?.value || "Delivery",
    area: $("#delivery-area")?.value || "Lagonglong",
    address: form.querySelector('[name="address"]')?.value?.trim() || "",
    payment: form.querySelector('[name="payment"]')?.value || "Cash"
  };
}

function calculateOrder() {
  const values = getOrderValues();

  const refillSubtotal = values.refillQty * REFILL_PRICE;
  const gallonSubtotal = values.gallonQty * NEW_GALLON_PRICE;
  const waterTotal = refillSubtotal + gallonSubtotal;

  let deliveryFee = 0;

  if (values.orderType === "Delivery") {
    if (values.area === "Custom") {
      deliveryFee = customDeliveryFee;
    } else {
      deliveryFee = DELIVERY_FEES[values.area] ?? 0;
    }
  }

  const total = waterTotal + deliveryFee;

  if ($("#water-total")) {
    $("#water-total").textContent = peso(waterTotal);
  }

  if ($("#delivery-total")) {
    $("#delivery-total").textContent =
      values.orderType === "Pickup"
        ? peso(0)
        : values.area === "Custom"
          ? (customDeliveryFee > 0 ? peso(customDeliveryFee) : "To be confirmed")
          : peso(deliveryFee);
  }

  if ($("#order-total")) {
    $("#order-total").textContent =
      values.area === "Custom" && values.orderType === "Delivery" && customDeliveryFee <= 0
        ? peso(waterTotal) + " + Delivery Fee"
        : peso(total);
  }

  return {
    ...values,
    refillSubtotal,
    gallonSubtotal,
    waterTotal,
    deliveryFee,
    total
  };
}

function setupOrderCalculator() {
  const form = getOrderForm();
  if (!form) return;

  form.addEventListener("input", calculateOrder);
  form.addEventListener("change", calculateOrder);

  calculateOrder();
}

// ------------------------------------
// CUSTOMER ORDER SUBMISSION
// ------------------------------------

async function submitOrder(event) {
  event.preventDefault();

  if (!currentUser) {
    showToast("Please log in first.");
    return;
  }

  const order = calculateOrder();

  if (order.refillQty === 0 && order.gallonQty === 0) {
    showToast("Please select at least one gallon.");
    return;
  }

  if (order.orderType === "Delivery" && !order.address) {
    showToast("Please enter your delivery address.");
    return;
  }

  if (order.orderType === "Delivery" && order.area === "Custom" && customDeliveryFee <= 0) {
    showToast("Your delivery fee must be confirmed first. Please contact the admin.");
    return;
  }

  const button = getOrderForm()?.querySelector('button[type="submit"]');
  if (button) button.disabled = true;

  try {
    await addDoc(collection(db, "orders"), {
      customerId: currentUser.uid,
      customerName: currentProfile?.fullName || currentUser.email,
      customerEmail: currentUser.email,

      refillQty: order.refillQty,
      gallonQty: order.gallonQty,

      refillPrice: REFILL_PRICE,
      gallonPrice: NEW_GALLON_PRICE,

      refillSubtotal: order.refillSubtotal,
      gallonSubtotal: order.gallonSubtotal,
      waterTotal: order.waterTotal,

      orderType: order.orderType,
      deliveryArea: order.area,
      address: order.orderType === "Delivery" ? order.address : "Store Pickup",

      payment: order.payment,

      deliveryFee: order.orderType === "Pickup" ? 0 : order.deliveryFee,
      total: order.total,

      status: "Pending",
      createdAt: serverTimestamp()
    });

    getOrderForm().reset();

    // Restore the quantity defaults after resetting.
    const refillField = getOrderForm().querySelector('[name="quantity"]');
    const gallonField = getOrderForm().querySelector('[name="gallonQuantity"]');

    if (refillField) refillField.value = 1;
    if (gallonField) gallonField.value = 0;

    customDeliveryFee = 0;
    calculateOrder();

    showToast("Order placed successfully!");
  } catch (error) {
    console.error(error);
    showToast("Unable to place order. Please try again.");
  } finally {
    if (button) button.disabled = false;
  }
}

// ------------------------------------
// CUSTOMER ORDERS
// ------------------------------------

function listenToCustomerOrders(uid) {
  if (customerOrderListener) {
    customerOrderListener();
  }

  const q = query(
    collection(db, "orders"),
    orderBy("createdAt", "desc")
  );

  customerOrderListener = onSnapshot(q, snapshot => {
    const orders = snapshot.docs
      .map(document => ({ id: document.id, ...document.data() }))
      .filter(order => order.customerId === uid);

    renderCustomerOrders(orders);
  }, error => {
    console.error(error);
  });
}

function renderCustomerOrders(orders) {
  const container = $("#customer-orders");
  if (!container) return;

  if (orders.length === 0) {
    container.innerHTML = "<p>You have no orders yet.</p>";
    return;
  }

  container.innerHTML = orders.map(order => `
    <div class="order-card">
      <h3>Order</h3>

      <p><strong>Refills:</strong> ${safeText(order.refillQty)} jug(s)</p>
      <p><strong>New Gallons:</strong> ${safeText(order.gallonQty)} jug(s)</p>

      <p><strong>Water Total:</strong> ${peso(order.waterTotal)}</p>
      <p><strong>Delivery Fee:</strong> ${peso(order.deliveryFee)}</p>
      <p><strong>Total:</strong> ${peso(order.total)}</p>

      <p><strong>Order Type:</strong> ${safeText(order.orderType)}</p>
      <p><strong>Address:</strong> ${safeText(order.address)}</p>
      <p><strong>Payment:</strong> ${safeText(order.payment)}</p>

      <p><strong>Status:</strong> ${safeText(order.status)}</p>

      ${
        order.status === "Out for Delivery"
          ? `<p class="delivery-message">Ready your gallon! Your water is on the way.</p>`
          : ""
      }

      <small>${dateText(order.createdAt)}</small>
    </div>
  `).join("");
}

// ------------------------------------
// ADMIN DASHBOARD
// ------------------------------------

function listenToAdminOrders() {
  if (adminOrderListener) {
    adminOrderListener();
  }

  const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));

  adminOrderListener = onSnapshot(q, snapshot => {
    const orders = snapshot.docs.map(document => ({
      id: document.id,
      ...document.data()
    }));

    renderAdminOrders(orders);
    updateAdminStats(orders);
  }, error => {
    console.error(error);
    showToast("Unable to load orders.");
  });
}

function updateAdminStats(orders) {
  const pending = orders.filter(order => order.status === "Pending").length;
  const active = orders.filter(order =>
    ["Accepted", "Preparing", "Out for Delivery"].includes(order.status)
  ).length;
  const delivered = orders.filter(order => order.status === "Delivered").length;

  const statElements = $$(".stat-card, .stat-box");

  // Also update known stat IDs if present.
  const pendingElement = $("#pending-count");
  const activeElement = $("#active-count");
  const deliveredElement = $("#delivered-count");
  const totalElement = $("#total-orders");

  if (pendingElement) pendingElement.textContent = pending;
  if (activeElement) activeElement.textContent = active;
  if (deliveredElement) deliveredElement.textContent = delivered;
  if (totalElement) totalElement.textContent = orders.length;
}

function renderAdminOrders(orders) {
  const container = $("#admin-orders");
  if (!container) return;

  const filter = $("#status-filter")?.value || "All";
  const search = $("#admin-search")?.value?.toLowerCase() || "";

  const filtered = orders.filter(order => {
    const matchesStatus = filter === "All" || order.status === filter;

    const searchText = [
      order.customerName,
      order.customerEmail,
      order.address,
      order.deliveryArea
    ].join(" ").toLowerCase();

    const matchesSearch = searchText.includes(search);

    return matchesStatus && matchesSearch;
  });

  if (filtered.length === 0) {
    container.innerHTML = "<p>No orders found.</p>";
    return;
  }

  container.innerHTML = filtered.map(order => `
    <div class="order-card admin-order-card">
      <h3>${safeText(order.customerName || order.customerEmail || "Customer")}</h3>

      <p><strong>Email:</strong> ${safeText(order.customerEmail)}</p>
      <p><strong>Refills:</strong> ${safeText(order.refillQty)} jug(s)</p>
      <p><strong>New Gallons:</strong> ${safeText(order.gallonQty)} jug(s)</p>

      <p><strong>Water Total:</strong> ${peso(order.waterTotal)}</p>
      <p><strong>Delivery Fee:</strong> ${peso(order.deliveryFee)}</p>
      <p><strong>Total:</strong> ${peso(order.total)}</p>

      <p><strong>Type:</strong> ${safeText(order.orderType)}</p>
      <p><strong>Area:</strong> ${safeText(order.deliveryArea)}</p>
      <p><strong>Address:</strong> ${safeText(order.address)}</p>
      <p><strong>Payment:</strong> ${safeText(order.payment)}</p>

      <p><strong>Status:</strong> ${safeText(order.status)}</p>
      <small>${dateText(order.createdAt)}</small>

      <div class="admin-actions">
        <label>Update Status:</label>

        <select class="status-update" data-order-id="${order.id}">
          ${["Pending", "Accepted", "Preparing", "Out for Delivery", "Delivered"]
            .map(status => `
              <option value="${status}" ${order.status === status ? "selected" : ""}>
                ${status}
              </option>
            `).join("")}
        </select>

        <button class="update-status-btn" data-order-id="${order.id}">
          Update Status
        </button>

        ${
          order.deliveryArea === "Custom" && order.orderType === "Delivery"
            ? `
              <div class="custom-fee-control">
                <label>Set Delivery Fee:</label>
                <input type="number" min="0" step="1"
                  class="custom-fee-input"
                  data-order-id="${order.id}"
                  value="${order.deliveryFee || 0}">
                <button class="set-fee-btn" data-order-id="${order.id}">
                  Save Delivery Fee
                </button>
              </div>
            `
            : ""
        }
      </div>
    </div>
  `).join("");

  // STATUS UPDATE BUTTONS
  $$(".update-status-btn").forEach(button => {
    button.addEventListener("click", async () => {
      const orderId = button.dataset.orderId;
      const select = document.querySelector(
        `.status-update[data-order-id="${orderId}"]`
      );

      if (!select) return;

      try {
        await updateDoc(doc(db, "orders", orderId), {
          status: select.value,
          updatedAt: serverTimestamp()
        });

        showToast("Order status updated!");
      } catch (error) {
        console.error(error);
        showToast("Failed to update status.");
      }
    });
  });

  // CUSTOM DELIVERY FEE
  $$(".set-fee-btn").forEach(button => {
    button.addEventListener("click", async () => {
      const orderId = button.dataset.orderId;

      const input = document.querySelector(
        `.custom-fee-input[data-order-id="${orderId}"]`
      );

      const fee = Number(input?.value);

      if (!Number.isFinite(fee) || fee < 0) {
        showToast("Invalid delivery fee.");
        return;
      }

      try {
        const orderRef = doc(db, "orders", orderId);
        const orderSnap = await getDoc(orderRef);

        if (!orderSnap.exists()) return;

        const orderData = orderSnap.data();

        await updateDoc(orderRef, {
          deliveryFee: fee,
          total: Number(orderData.waterTotal || 0) + fee,
          updatedAt: serverTimestamp()
        });

        showToast("Delivery fee saved!");
      } catch (error) {
        console.error(error);
        showToast("Failed to save delivery fee.");
      }
    });
  });
}

// ------------------------------------
// ADMIN CUSTOMER LIST
// ------------------------------------

function listenToCustomers() {
  if (customerListener) customerListener();

  customerListener = onSnapshot(collection(db, "users"), snapshot => {
    const customers = snapshot.docs
      .map(document => ({ id: document.id, ...document.data() }))
      .filter(user => user.role !== "admin");

    renderCustomers(customers);
  }, error => {
    console.error(error);
  });
}

function renderCustomers(customers) {
  const container = $("#admin-customers");
  if (!container) return;

  if (customers.length === 0) {
    container.innerHTML = "<p>No customers yet.</p>";
    return;
  }

  container.innerHTML = customers.map(customer => `
    <div class="customer-card">
      <p><strong>${safeText(customer.fullName || "Customer")}</strong></p>
      <p>${safeText(customer.email)}</p>
      <p>${safeText(customer.phone)}</p>
    </div>
  `).join("");
}

// ------------------------------------
// DELIVERY FEE SETTINGS
// ------------------------------------

function listenToSettings() {
  if (settingsListener) settingsListener();

  settingsListener = onSnapshot(doc(db, "settings", "delivery"), snapshot => {
    if (snapshot.exists()) {
      const data = snapshot.data();
      customDeliveryFee = Number(data.customFee || 0);
      calculateOrder();
    }
  }, error => {
    console.error(error);
  });
}

// ------------------------------------
// AUTH FORM CONNECTION
// ------------------------------------

function setupAuthForms() {
  const authView = $("#auth-view");
  if (!authView) return;

  // Try common login form IDs.
  const loginForm = $("#login-form");
  const registerForm = $("#register-form");

  if (loginForm) {
    loginForm.addEventListener("submit", async event => {
      event.preventDefault();

      const email = loginForm.querySelector('[type="email"]')?.value?.trim();
      const password = loginForm.querySelector('[type="password"]')?.value;

      if (!email || !password) {
        showToast("Please enter your email and password.");
        return;
      }

      await loginUser(email, password);
    });
  }

  if (registerForm) {
    registerForm.addEventListener("submit", async event => {
      event.preventDefault();

      const email = registerForm.querySelector('[type="email"]')?.value?.trim();
      const password = registerForm.querySelector('[type="password"]')?.value;

      const name =
        registerForm.querySelector('[name="fullName"]')?.value?.trim() ||
        registerForm.querySelector('[name="name"]')?.value?.trim() ||
        registerForm.querySelector('[name="fullname"]')?.value?.trim() ||
        "";

      const phone =
        registerForm.querySelector('[name="phone"]')?.value?.trim() || "";

      if (!email || !password || !name) {
        showToast("Please complete all required fields.");
        return;
      }

      await registerUser(email, password, name, phone);
    });
  }
}

// ------------------------------------
// FILTERS AND SEARCH
// ------------------------------------

function setupAdminFilters() {
  $("#status-filter")?.addEventListener("change", () => {
    if (adminOrderListener) {
      // Listener data is rendered again when Firestore updates.
      // A local render can be triggered by cached DOM only if needed.
    }
  });

  $("#admin-search")?.addEventListener("input", () => {
    // Search is applied on the next Firestore snapshot.
  });
}

// ------------------------------------
// AUTH STATE
// ------------------------------------

onAuthStateChanged(auth, async user => {
  currentUser = user;

  if (!user) {
    currentProfile = null;

    if (customerOrderListener) {
      customerOrderListener();
      customerOrderListener = null;
    }

    if (adminOrderListener) {
      adminOrderListener();
      adminOrderListener = null;
    }

    if (customerListener) {
      customerListener();
      customerListener = null;
    }

    showView("auth-view");
    return;
  }

  try {
    const userRef = doc(db, "users", user.uid);
    const profileSnap = await getDoc(userRef);

    if (!profileSnap.exists()) {
      const role = user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()
        ? "admin"
        : "customer";

      currentProfile = {
        fullName: user.displayName || "",
        email: user.email,
        role
      };

      await setDoc(userRef, currentProfile);
    } else {
      currentProfile = profileSnap.data();

      // Ensure the designated admin account has admin role.
      if (user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()
          && currentProfile.role !== "admin") {
        await updateDoc(userRef, { role: "admin" });
        currentProfile.role = "admin";
      }
    }

    if (currentProfile.role === "admin") {
      showView("admin-view");
      listenToAdminOrders();
      listenToCustomers();
    } else {
      showView("customer-view");
      listenToCustomerOrders(user.uid);
    }

    listenToSettings();
  } catch (error) {
    console.error(error);
    showToast("Unable to load account information.");
  }
});

// ------------------------------------
// START APP
// ------------------------------------

setupAuthForms();
setupOrderCalculator();
setupAdminFilters();

$("#order-form")?.addEventListener("submit", submitOrder);

console.log("AquaTrack loaded.");
