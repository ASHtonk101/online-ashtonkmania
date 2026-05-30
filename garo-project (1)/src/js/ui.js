export function $(id) { return document.getElementById(id); }
export function $$(sel) { return document.querySelectorAll(sel); }

let toastTimer;
export function toast(msg, kind = "") {
  const el = $("toast");
  el.textContent = msg;
  el.className = "toast " + kind;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 3000);
}

export function showView(name) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  $(name + "View").classList.add("active");
}

export function openModal(id) { $(id).classList.remove("hidden"); }
export function closeModal(id) { $(id).classList.add("hidden"); }

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

export function initials(name) {
  return (name || "?").trim().slice(0, 2).toUpperCase();
}
